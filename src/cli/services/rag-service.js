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
 * Embed entries with the (already trained/restored) embedder, store them and
 * record the embedder metadata and state with the index.
 *
 * @returns {Promise<Array<{id: string, vector: number[]}>>} The stored vectors
 */
async function embedAndStore({
  embedder,
  embedderName,
  store,
  entries,
  previous,
}) {
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
  return vectors;
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

  const vectors = await embedAndStore({
    embedder,
    embedderName,
    store,
    entries,
    previous,
  });

  return {
    files: documents.length,
    chunks: documents.reduce((n, d) => n + d.chunks.length, 0),
    totalChunks: store.size?.() ?? vectors.length,
    sources: documents.map((d) => d.source),
  };
}

/**
 * Refit a corpus-trained embedder (only the built-in `local` TF-IDF embedder)
 * and re-embed every stored chunk with the new model.
 *
 * Without `inputPath` the embedder is fitted on the indexed chunks. With it,
 * the embedder is fitted on the documents read from that path only (they are
 * not added to the index); indexed chunks that share no term with the new
 * vocabulary embed to all-zero vectors and are counted in `zeroVectors`.
 *
 * @param {object} params
 * @param {object} params.config
 * @param {string} params.configDir
 * @param {string} [params.inputPath] - Optional training corpus
 * @returns {Promise<{trainedOn: string, trainingDocuments: number, vocabularySize: number,
 *   previousVocabularySize: number|null, reembedded: number, zeroVectors: number}>}
 */
async function retrain({ config, configDir, inputPath }) {
  // Check the configured name before building components, so a hosted
  // embedder without credentials still gets this explanation.
  const entry = (config.pipeline || []).find((e) => e.stage === "embedder");
  if (!entry) {
    throw new Error(
      'No embedder configured. Add { "stage": "embedder", "name": "local" } to the pipeline in .ragrc.json.',
    );
  }
  if (entry.name !== "local") {
    throw new Error(
      `Training is only supported for the built-in "local" (TF-IDF) embedder; ` +
        `this pipeline uses "${entry.name}". Hosted embedders (openai, cohere, ollama) ` +
        "use fixed pre-trained models and cannot be fitted to your corpus.",
    );
  }

  const components = buildComponents(config, { configDir });
  const embedderName = components.names.embedder;
  const embedder = requireStage(components, "embedder");
  const store = requireStage(components, "retriever");
  if (typeof store.list !== "function" || typeof store.save !== "function") {
    throw new Error(
      `Retriever "${components.names.retriever}" does not persist an index. Use "file-store".`,
    );
  }

  const stored = store.list();
  if (stored.length === 0) {
    throw new Error(
      "The index is empty. Run `rag-pipeline ingest <path>` first.",
    );
  }
  const previous = store.getEmbedderInfo?.();
  if (previous && previous.name !== embedderName) {
    throw new Error(
      `The index was built with embedder "${previous.name}". ` +
        "Re-run `rag-pipeline ingest <path> --rebuild` with the local embedder first.",
    );
  }

  let corpus = stored.map((e) => e.content);
  let trainedOn = "index";
  if (inputPath) {
    const documents = await readDocuments(inputPath, { baseDir: configDir });
    corpus = documents.flatMap((d) => d.chunks);
    if (corpus.length === 0) {
      throw new Error(`No text found to train on in ${inputPath}`);
    }
    trainedOn = inputPath;
  }

  embedder.train(corpus);
  const vectors = await embedAndStore({
    embedder,
    embedderName,
    store,
    entries: stored,
    previous,
  });

  return {
    trainedOn,
    trainingDocuments: corpus.length,
    vocabularySize: embedder.getVocabularySize?.() ?? embedder.dimensions,
    previousVocabularySize: previous?.dimensions ?? null,
    reembedded: vectors.length,
    zeroVectors: vectors.filter((v) => v.vector.every((x) => x === 0)).length,
  };
}

/**
 * Build the configured components once and restore the embedder state saved
 * with the index, so they can be reused across several retrieve()/query()
 * calls (e.g. by `ai benchmark`).
 *
 * @returns {object} Components as returned by buildComponents()
 */
function loadComponents({ config, configDir }) {
  const components = buildComponents(config, { configDir });
  const embedder = requireStage(components, "embedder");
  const retriever = requireStage(components, "retriever");
  if (retriever.size && retriever.size() === 0) {
    throw new Error(
      "The index is empty. Run `rag-pipeline ingest <path>` first.",
    );
  }
  restoreEmbedder(embedder, retriever);
  return components;
}

/**
 * Retrieval only (no llm): embed the question, retrieve and, if configured,
 * rerank.
 *
 * @param {object} params
 * @param {object} [params.components] - Prebuilt components (loadComponents)
 * @param {object} [params.config]
 * @param {string} [params.configDir]
 * @param {string} params.question
 * @param {number} [params.topK=3]
 * @returns {Promise<Array<{id: string, score: number, content: string, metadata: object}>>}
 */
async function retrieve({ components, config, configDir, question, topK = 3 }) {
  const c = components || loadComponents({ config, configDir });
  const queryVector = await embedQuery(c.embedder, question);
  let results = await c.retriever.retrieve({
    query: question,
    queryVector,
    topK,
  });
  if (c.reranker) {
    results = await c.reranker.rerank(question, results, { topK });
  }
  return results;
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
 * @param {object} [params.components] - Prebuilt components (loadComponents)
 * @returns {Promise<{answer: string|null, results: Array, citations?: object}>}
 */
async function query({ config, configDir, question, topK = 3, components }) {
  const c = components || loadComponents({ config, configDir });

  if (!c.llm) {
    const results = await retrieve({ components: c, question, topK });
    return { answer: null, results };
  }

  const pipeline = createRagPipeline({
    embedder: c.embedder,
    retriever: c.retriever,
    llm: c.llm,
    reranker: c.reranker,
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

module.exports = {
  ingest,
  retrain,
  query,
  retrieve,
  loadComponents,
  restoreEmbedder,
};
