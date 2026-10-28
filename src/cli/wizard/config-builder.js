"use strict";

/**
 * Builds the .ragrc.json written by `rag-pipeline init` (both the
 * non-interactive template path and the setup wizard).
 */

const { validateRagrc } = require("../../config/enhanced-ragrc-schema.js");

const DEFAULT_INDEX_PATH = ".rag/index.json";

/**
 * A stage selection is either a built-in name (string) or
 * `{ name, config?, module? }`, where `module` is a custom plugin path
 * (relative to the config file) written to `plugins.<stage>.<name>`.
 */
function toSelection(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === "string") return { name: value };
  return value;
}

/**
 * @param {object} choice
 * @param {string|object} choice.embedder - Embedder selection
 * @param {string|object|null} [choice.llm] - LLM selection (null = none)
 * @param {string|object} [choice.retriever='file-store'] - Retriever selection
 * @param {string|object|null} [choice.reranker] - Reranker selection
 * @param {string} [choice.indexPath='.rag/index.json'] - file-store path when
 *   the retriever selection carries no config of its own
 * @returns {object} Normalized, validated configuration
 */
function buildInitConfig({
  embedder,
  llm = null,
  retriever = "file-store",
  reranker = null,
  indexPath = DEFAULT_INDEX_PATH,
}) {
  const retrieverSel = toSelection(retriever);
  if (retrieverSel.name === "file-store" && !retrieverSel.module) {
    retrieverSel.config = { path: indexPath, ...(retrieverSel.config || {}) };
  }

  const stages = [
    ["loader", { name: "auto" }],
    ["embedder", toSelection(embedder)],
    ["retriever", retrieverSel],
    ["reranker", toSelection(reranker)],
    ["llm", toSelection(llm)],
  ];

  const pipeline = [];
  const plugins = {};
  for (const [stage, sel] of stages) {
    if (!sel) continue;
    const entry = { stage, name: sel.name };
    if (sel.config && Object.keys(sel.config).length > 0) {
      entry.config = sel.config;
    }
    pipeline.push(entry);
    if (sel.module) {
      plugins[stage] = { ...(plugins[stage] || {}), [sel.name]: sel.module };
    }
  }

  const result = validateRagrc({
    namespace: "default",
    metadata: { name: "rag-pipeline", createdAt: new Date().toISOString() },
    pipeline,
    ...(Object.keys(plugins).length > 0 && { plugins }),
  });
  if (!result.valid) {
    throw new Error(
      `Generated configuration is invalid: ${JSON.stringify(result.errors)}`,
    );
  }
  return result.normalized;
}

module.exports = { buildInitConfig, DEFAULT_INDEX_PATH };
