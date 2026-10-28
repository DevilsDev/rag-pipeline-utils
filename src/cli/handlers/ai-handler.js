"use strict";

/**
 * Handlers for `rag-pipeline ai ...`. Everything printed here is computed from
 * the configured pipeline, the index or the given files; failures set
 * process.exitCode = 1 and explain why on stderr.
 */

const fs = require("fs");
const path = require("path");
const fg = require("fast-glob");

const { loadCliConfig } = require("../shared/config-context.js");
const {
  retrain,
  retrieve,
  loadComponents,
} = require("../services/rag-service.js");
const { runBenchmark } = require("../services/benchmark.js");
const {
  feedbackPath,
  loadFeedback,
  addFeedback,
  applyFeedback,
} = require("../services/feedback.js");
const { readDocuments } = require("../../loader/document-reader.js");

function fail(prefix, error) {
  console.error(`${prefix}: ${error.message}`);
  process.exitCode = 1;
}

const fmt = (ms) => `${ms.toFixed(2)} ms`;
const signed = (x) => `${x >= 0 ? "+" : "-"}${Math.abs(x).toFixed(3)}`;

/**
 * `ai train embedding [path]`
 */
async function handleTrainEmbedding(globalOptions, inputPath) {
  try {
    const { config, configDir } = loadCliConfig(globalOptions);
    if (globalOptions.dryRun) {
      console.log(
        `Dry run: would fit the local embedder on ${inputPath || "the indexed chunks"} ` +
          "and re-embed the index.",
      );
      return;
    }
    const r = await retrain({ config, configDir, inputPath });
    const source =
      r.trainedOn === "index"
        ? `${r.trainingDocuments} indexed chunk(s)`
        : `${r.trainingDocuments} chunk(s) read from ${r.trainedOn}`;
    console.log(`Trained the local TF-IDF embedder on ${source}.`);
    console.log(
      `Vocabulary: ${r.vocabularySize} term(s)` +
        (r.previousVocabularySize !== null
          ? ` (previously ${r.previousVocabularySize})`
          : ""),
    );
    console.log(
      `Re-embedded ${r.reembedded} indexed chunk(s) with the new model.`,
    );
    if (r.zeroVectors > 0) {
      console.log(
        `Warning: ${r.zeroVectors} indexed chunk(s) share no term with the new ` +
          "vocabulary and can no longer be retrieved.",
      );
    }
    if (r.trainedOn !== "index") {
      console.log(
        "Note: the next `ingest` refits the embedder on the indexed chunks.",
      );
    }
  } catch (error) {
    fail("Training failed", error);
  }
}

/**
 * `ai benchmark`
 */
async function handleBenchmark(globalOptions, options = {}) {
  try {
    const { config, configDir } = loadCliConfig(globalOptions);
    const report = await runBenchmark({
      config,
      configDir,
      queriesFile: options.queries,
      runs: options.runs || 3,
      topK: options.topK || 3,
    });

    if (options.json) {
      console.log(JSON.stringify(report, null, 2));
      return;
    }

    const env = report.environment;
    const n = report.queries.length;
    console.log(
      `Benchmark: ${n} quer${n === 1 ? "y" : "ies"} (${report.queriesSource}) ` +
        `x ${report.runs} run(s), top-k ${report.topK}`,
    );
    console.log(
      `Environment: Node ${env.node} (${env.platform}), ${env.chunks} indexed chunk(s), ` +
        `embedder ${env.embedder}` +
        (env.dimensions ? ` (${env.dimensions} dims)` : "") +
        `, retriever ${env.retriever}, reranker ${env.reranker || "none"}, ` +
        `llm ${env.llm || "none"}`,
    );
    console.log(`Setup (load config and index): ${fmt(report.setupMs)}`);
    console.log(`Warm-up query (excluded): ${fmt(report.warmupMs)}`);
    console.log("");
    const labels = {
      embed: "embed query",
      retrieve: "retrieve",
      rerank: "rerank",
      endToEnd: report.includesGeneration
        ? "end-to-end (incl. llm)"
        : "end-to-end",
    };
    const header = ["stage", "samples", "p50", "p95", "mean", "max"];
    const rows = Object.entries(report.stages).map(([stage, s]) => [
      labels[stage],
      String(s.count),
      fmt(s.p50),
      fmt(s.p95),
      fmt(s.mean),
      fmt(s.max),
    ]);
    const widths = header.map((h, i) =>
      Math.max(h.length, ...rows.map((r) => r[i].length)),
    );
    const line = (cells) =>
      cells
        .map((c, i) => c.padEnd(widths[i]))
        .join("  ")
        .trimEnd();
    console.log(line(header));
    rows.forEach((r) => console.log(line(r)));
    console.log("");
    console.log(
      `Results per query: ${report.results.min === report.results.max ? report.results.min : `${report.results.min}-${report.results.max}`}`,
    );
    console.log("Percentiles are nearest-rank over the measured samples.");
  } catch (error) {
    fail("Benchmark failed", error);
  }
}

/**
 * `ai feedback <question> <docId> --rating up|down`
 */
async function handleFeedback(globalOptions, question, docId, options = {}) {
  try {
    const { config, configDir } = loadCliConfig(globalOptions);
    const components = loadComponents({ config, configDir });
    const { retriever } = components;
    if (typeof retriever.list !== "function") {
      throw new Error(
        `Retriever "${components.names.retriever}" cannot list documents. Use "file-store".`,
      );
    }
    if (!retriever.list().some((doc) => doc.id === docId)) {
      throw new Error(
        `No indexed chunk with id "${docId}". Ids are shown by \`rag-pipeline ai search\`.`,
      );
    }
    const file = feedbackPath(retriever, configDir);
    if (globalOptions.dryRun) {
      console.log(
        `Dry run: would record a "${options.rating}" vote for ${docId} in ${file}`,
      );
      return;
    }
    const { total } = addFeedback(file, {
      question,
      docId,
      rating: options.rating,
    });
    console.log(
      `Recorded "${options.rating}" for ${docId} on "${question}" ` +
        `(${total} vote(s) in ${path.relative(process.cwd(), file) || file}).`,
    );
  } catch (error) {
    fail("Feedback failed", error);
  }
}

/**
 * `ai search <question>`: retrieval re-scored with stored feedback.
 */
async function handleSearch(globalOptions, question, options = {}) {
  try {
    const { config, configDir } = loadCliConfig(globalOptions);
    const topK = options.topK || 3;
    const components = loadComponents({ config, configDir });
    const { retriever } = components;
    const size = retriever.size ? retriever.size() : topK;
    // Re-score a larger pool so a boosted chunk can move into the top-k.
    const pool = Math.min(size, Math.max(topK * 4, topK + 10));
    const results = await retrieve({ components, question, topK: pool });
    const file = feedbackPath(retriever, configDir);
    const { entries } = loadFeedback(file);
    const ranked = applyFeedback(results, entries, question)
      .filter((r) => r.baseScore > 0)
      .slice(0, topK);

    if (options.json) {
      console.log(JSON.stringify({ question, results: ranked }, null, 2));
      return;
    }
    console.log(
      `${entries.length} stored feedback vote(s); retrieval only (no llm).`,
    );
    if (ranked.length === 0) {
      console.log("No matching passages found.");
      return;
    }
    ranked.forEach((r, i) => {
      console.log(
        `\n[${i + 1}] ${r.id}  score ${r.finalScore.toFixed(3)} = ` +
          `${r.baseScore.toFixed(3)} retrieval ${signed(r.adjustment)} feedback`,
      );
      for (const reason of r.reasons) {
        console.log(
          `    ${reason.rating} vote on "${reason.question}" ` +
            `(term overlap ${reason.similarity.toFixed(2)}): ${signed(reason.contribution)}`,
        );
      }
      console.log(r.content);
    });
  } catch (error) {
    fail("Search failed", error);
  }
}

const TEXT_TYPES = {
  ".md": "markdown",
  ".markdown": "markdown",
  ".html": "html",
  ".htm": "html",
  ".csv": "csv",
  ".txt": "text",
};
const IMAGE_EXTENSIONS = new Set([
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".webp",
  ".bmp",
  ".tif",
  ".tiff",
]);

function configuredLlm(globalOptions) {
  try {
    const { config } = loadCliConfig(globalOptions);
    const entry = (config.pipeline || []).find((e) => e.stage === "llm");
    return entry ? entry.name : "none";
  } catch {
    return "none (no readable config)";
  }
}

function imageUnsupportedMessage(globalOptions) {
  return (
    "Image processing needs a vision-capable model, and none is available: the " +
    "built-in llm connectors (openai, anthropic, ollama) only send text prompts. " +
    `Configured llm: ${configuredLlm(globalOptions)}.`
  );
}

async function describeTextFile(file, baseDir) {
  const [doc] = await readDocuments(file, { baseDir });
  return {
    source: doc.source,
    type: TEXT_TYPES[path.extname(file).toLowerCase()],
    characters: fs.readFileSync(file, "utf8").length,
    extractedCharacters: doc.chunks.reduce((n, c) => n + c.length, 0),
    chunks: doc.chunks.length,
  };
}

/**
 * `ai multimodal process <path>`: report what the loaders extract. Does not
 * modify the index.
 */
async function handleMultimodalProcess(globalOptions, inputPath, options = {}) {
  try {
    const absolute = path.resolve(inputPath);
    if (!fs.existsSync(absolute))
      throw new Error(`Path not found: ${inputPath}`);

    const files = fs.statSync(absolute).isDirectory()
      ? (
          await fg("**/*", {
            cwd: absolute,
            absolute: true,
            ignore: ["**/node_modules/**", "**/.git/**"],
          })
        ).sort()
      : [absolute];

    const processed = [];
    const skipped = [];
    for (const file of files) {
      const ext = path.extname(file).toLowerCase();
      const rel = path.relative(process.cwd(), file).split(path.sep).join("/");
      if (TEXT_TYPES[ext]) {
        processed.push(await describeTextFile(file, process.cwd()));
      } else if (IMAGE_EXTENSIONS.has(ext)) {
        if (files.length === 1)
          throw new Error(imageUnsupportedMessage(globalOptions));
        skipped.push({
          source: rel,
          reason: "image (needs a vision-capable model)",
        });
      } else {
        if (files.length === 1) {
          throw new Error(
            `Unsupported file type "${ext}". Supported text types: ${Object.keys(TEXT_TYPES).join(", ")}`,
          );
        }
        skipped.push({ source: rel, reason: `unsupported type "${ext}"` });
      }
    }

    if (options.json) {
      console.log(JSON.stringify({ processed, skipped }, null, 2));
    } else {
      for (const p of processed) {
        console.log(
          `${p.source}: ${p.type}, ${p.characters} characters, ` +
            `${p.chunks} chunk(s) (${p.extractedCharacters} characters extracted)`,
        );
      }
      for (const s of skipped) console.log(`skipped ${s.source}: ${s.reason}`);
      console.log(
        `Processed ${processed.length} file(s), skipped ${skipped.length}. ` +
          "The index was not modified; use `rag-pipeline ingest` to add files.",
      );
    }
    if (processed.length === 0) {
      throw new Error(
        skipped.some((s) => s.reason.startsWith("image"))
          ? imageUnsupportedMessage(globalOptions)
          : "No supported text files found.",
      );
    }
  } catch (error) {
    fail("Processing failed", error);
  }
}

module.exports = {
  handleTrainEmbedding,
  handleBenchmark,
  handleFeedback,
  handleSearch,
  handleMultimodalProcess,
};
