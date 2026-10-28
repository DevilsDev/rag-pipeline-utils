"use strict";

/**
 * Ingest and query operations shared by the `ingest`, `query` and `run` CLI
 * commands (and the dev server). Components come from the .ragrc.json
 * pipeline via buildComponents(); the retriever must persist between
 * processes for ingest and query to be separate commands (file-store does).
 */

const { buildComponents } = require("../../config/component-factory");
const { readDocuments } = require("../../loader/document-reader");
const { embedQuery } = require("../../utils/embed-query");
const { createRagPipeline } = require("../../core/create-pipeline");

function requireStage(components, stage) {
  if (!components[stage]) {
    throw new Error(
      `No ${stage} configured. Add a { "stage": "${stage}", ... } entry to the pipeline in .ragrc.json.`,
    );
  }
  return components[stage];
}

/** Embed document text with embed() (not embedQuery), normalizing the shape. */
function embedDocument(embedder, text) {
  return embedQuery({ embed: (t) => embedder.embed(t) }, text);
}

/**
 * Restore embedder state saved with the index (e.g. LocalEmbedder's
 * vocabulary), so queries embed into the same vector space as ingestion.
 */
function restoreEmbedder(embedder, retriever) {
  const info = retriever.getEmbedderInfo?.();
  if (info?.state && typeof embedder.setState === "function") {
    embedder.setState(info.state);
  }
}

/**
 * Load documents from a file or directory, embed their chunks and store them.
 * Re-ingesting a source replaces its previous chunks.
 *
 * @param {object} params
 * @param {object} params.config - Normalized config
 * @param {string} params.configDir - Directory of the config file
 * @param {string} params.inputPath - File or directory to ingest
 * @param {boolean} [params.rebuild=false] - Discard the existing index first
 * @returns {Promise<{files: number, chunks: number, totalChunks: number, sources: string[]}>}
 */
async function ingest({ config, configDir, inputPath, rebuild = false }) {
  const components = buildComponents(config, { configDir });
  const embedder = requireStage(components, "embedder");
  const store = requireStage(components, "retriever");
  if (typeof store.store !== "function") {
    throw new Error(
      `Retriever "${components.names.retriever}" cannot store documents. Use "file-store".`,
    );
  }

  const embedderName = components.names.embedder;
  if (rebuild) store.clear?.();
  const previous = store.getEmbedderInfo?.();
  if (previous && previous.name !== embedderName && store.size() > 0) {
    throw new Error(
      `The index was built with embedder "${previous.name}" but the config now uses ` +
        `"${embedderName}". Re-run with --rebuild to re-index everything.`,
    );
  }

  const documents = await readDocuments(inputPath, { baseDir: configDir });
  for (const { source } of documents) store.removeBySource?.(source);

  let entries = documents.flatMap(({ source, chunks }) =>
    chunks.map((content, i) => ({
      id: `${source}#${i}`,
      content,
      metadata: { source, chunk: i },
    })),
  );

  // Corpus-fitted embedders (LocalEmbedder) must be retrained on everything
  // stored, and every stored chunk re-embedded into the new vector space.
  if (typeof embedder.train === "function") {
    entries = [...(store.list?.() || []), ...entries];
    embedder.train(entries.map((e) => e.content));
  } else {
    restoreEmbedder(embedder, store);
  }

  const vectors = [];
  for (const entry of entries) {
    vectors.push({
      ...entry,
      vector: await embedDocument(embedder, entry.content),
    });
  }
  const dimensions = vectors[0]?.vector?.length ?? previous?.dimensions ?? 0;
  if (vectors.some((v) => v.vector.length !== dimensions)) {
    throw new Error("Embedder returned vectors of inconsistent dimensions");
  }

  await store.store(vectors);
  store.setEmbedderInfo?.({
    name: embedderName,
    dimensions,
    ...(typeof embedder.getState === "function" && {
      state: embedder.getState(),
    }),
  });
  store.save?.();

  return {
    files: documents.length,
    chunks: documents.reduce((n, d) => n + d.chunks.length, 0),
    totalChunks: store.size?.() ?? vectors.length,
    sources: documents.map((d) => d.source),
  };
}

/**
 * Answer a question from the index. Without an llm stage this returns the
 * retrieved passages only (answer: null) instead of a placeholder answer.
 *
 * @param {object} params
 * @param {object} params.config
 * @param {string} params.configDir
 * @param {string} params.question
 * @param {number} [params.topK=3]
 * @returns {Promise<{answer: string|null, results: Array, citations?: object}>}
 */
async function query({ config, configDir, question, topK = 3 }) {
  const components = buildComponents(config, { configDir });
  const embedder = requireStage(components, "embedder");
  const retriever = requireStage(components, "retriever");

  if (retriever.size && retriever.size() === 0) {
    throw new Error(
      "The index is empty. Run `rag-pipeline ingest <path>` first.",
    );
  }
  restoreEmbedder(embedder, retriever);

  if (!components.llm) {
    const queryVector = await embedQuery(embedder, question);
    let results = await retriever.retrieve({
      query: question,
      queryVector,
      topK,
    });
    if (components.reranker) {
      results = await components.reranker.rerank(question, results, { topK });
    }
    return { answer: null, results };
  }

  const pipeline = createRagPipeline({
    embedder,
    retriever,
    llm: components.llm,
    reranker: components.reranker,
  });
  const result = await pipeline.run({
    query: question,
    options: { topK, citations: true },
  });
  if (!result.success) throw new Error(result.error);
  return {
    answer: result.answer,
    results: result.results,
    citations: result.citations,
  };
}

module.exports = { ingest, query };
