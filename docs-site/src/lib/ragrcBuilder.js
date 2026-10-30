/**
 * Builds a .ragrc.json the same way `rag-pipeline init` does
 * (src/cli/wizard/config-builder.js), so the docs-site config builder and
 * the CLI cannot drift: __tests__/docs/ragrc-builder.test.js compares the
 * two for every combination and validates the result against
 * .ragrc.schema.json.
 *
 * CommonJS so the root Jest suite can require it directly.
 */

const SCHEMA_URL =
  "https://raw.githubusercontent.com/DevilsDev/rag-pipeline-utils/main/.ragrc.schema.json";

const DEFAULT_INDEX_PATH = ".rag/index.json";

/** Built-in choices per stage, in the order the CLI wizard offers them. */
const STAGES = {
  embedder: [
    { value: "local", label: "local", note: "TF-IDF, offline, no API key" },
    { value: "openai", label: "openai", note: "OPENAI_API_KEY" },
    { value: "ollama", label: "ollama", note: "local Ollama server" },
    { value: "cohere", label: "cohere", note: "COHERE_API_KEY" },
  ],
  retriever: [
    { value: "file-store", label: "file-store", note: "JSON index on disk" },
    { value: "memory", label: "memory", note: "in-process only" },
  ],
  reranker: [
    { value: null, label: "none", note: "" },
    { value: "scoring", label: "scoring", note: "BM25 re-scoring, offline" },
  ],
  llm: [
    { value: null, label: "none", note: "query prints the passages" },
    { value: "openai", label: "openai", note: "OPENAI_API_KEY" },
    { value: "anthropic", label: "anthropic", note: "ANTHROPIC_API_KEY" },
    { value: "ollama", label: "ollama", note: "local Ollama server" },
  ],
};

/**
 * Connector options the wizard asks for, with each connector's default
 * (DEFAULT_CONFIG in src/connectors/*-connector.js). Empty input means
 * "use the connector default", which keeps the option out of the file.
 */
const OPTIONS = {
  embedder: {
    openai: { embeddingModel: "text-embedding-3-small" },
    ollama: {
      baseURL: "http://localhost:11434",
      embeddingModel: "nomic-embed-text",
    },
    cohere: { embeddingModel: "embed-english-v3.0" },
  },
  llm: {
    openai: { model: "gpt-4o-mini" },
    anthropic: { model: "claude-sonnet-5-5" },
    ollama: { baseURL: "http://localhost:11434", model: "llama3" },
  },
};

/** `rag-pipeline init --template <name>` presets (init-handler.js). */
const TEMPLATES = {
  local: { embedder: "local", llm: null },
  openai: { embedder: "openai", llm: "openai" },
  ollama: { embedder: "ollama", llm: "ollama" },
  anthropic: { embedder: "local", llm: "anthropic" },
};

/** Environment variables a selection needs at run time. */
const API_KEY_ENV = {
  openai: "OPENAI_API_KEY",
  anthropic: "ANTHROPIC_API_KEY",
  cohere: "COHERE_API_KEY",
};

function compact(config) {
  const out = {};
  for (const [key, value] of Object.entries(config || {})) {
    if (typeof value === "string" && value.trim() !== "")
      out[key] = value.trim();
  }
  return out;
}

/**
 * @param {object} choice
 * @param {string} choice.embedder
 * @param {string} [choice.retriever='file-store']
 * @param {string|null} [choice.reranker=null]
 * @param {string|null} [choice.llm=null]
 * @param {object} [choice.embedderConfig] - e.g. { embeddingModel }
 * @param {object} [choice.llmConfig] - e.g. { model, baseURL }
 * @param {string} [choice.indexPath='.rag/index.json']
 * @param {boolean} [choice.includeSchema=true] - add "$schema" for editors
 * @param {string} [choice.createdAt] - ISO time; defaults to now
 */
function buildRagrc({
  embedder,
  retriever = "file-store",
  reranker = null,
  llm = null,
  embedderConfig = {},
  llmConfig = {},
  indexPath = DEFAULT_INDEX_PATH,
  includeSchema = true,
  createdAt = new Date().toISOString(),
}) {
  const stages = [
    ["loader", "auto", {}],
    ["embedder", embedder, compact(embedderConfig)],
    [
      "retriever",
      retriever,
      retriever === "file-store"
        ? { path: indexPath || DEFAULT_INDEX_PATH }
        : {},
    ],
    ["reranker", reranker, {}],
    ["llm", llm, compact(llmConfig)],
  ];

  const pipeline = [];
  for (const [stage, name, config] of stages) {
    if (!name) continue;
    const entry = { stage, name };
    if (Object.keys(config).length > 0) entry.config = config;
    pipeline.push(entry);
  }

  return {
    ...(includeSchema && { $schema: SCHEMA_URL }),
    namespace: "default",
    metadata: { name: "rag-pipeline", createdAt },
    pipeline,
  };
}

/** The init template that produces this selection, if any. */
function matchingTemplate({ embedder, llm = null, retriever, reranker }) {
  if (retriever !== "file-store" || reranker) return null;
  const hit = Object.entries(TEMPLATES).find(
    ([, t]) => t.embedder === embedder && t.llm === llm,
  );
  return hit ? hit[0] : null;
}

/** API keys the selection needs, as environment variable names. */
function requiredEnv({ embedder, llm }) {
  return [
    ...new Set([API_KEY_ENV[embedder], API_KEY_ENV[llm]].filter(Boolean)),
  ];
}

module.exports = {
  SCHEMA_URL,
  DEFAULT_INDEX_PATH,
  STAGES,
  OPTIONS,
  TEMPLATES,
  buildRagrc,
  matchingTemplate,
  requiredEnv,
};
