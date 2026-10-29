"use strict";

const path = require("path");
const pluginRegistry = require("../core/plugin-registry.js");

/**
 * Built-in components a .ragrc.json pipeline entry can name. Each factory
 * receives the entry's `config` object and the directory of the config file.
 * Requires are lazy so naming one provider does not load the others.
 */
const BUILT_INS = {
  // "auto" picks a loader per file extension (see loader/document-reader).
  loader: {
    auto: () => require("../loader/document-reader"),
  },
  embedder: {
    local: (cfg) =>
      new (require("../connectors/local-embedder").LocalEmbedder)(cfg),
    openai: (cfg) =>
      new (require("../connectors/openai-connector").OpenAIConnector)(cfg),
    ollama: (cfg) =>
      new (require("../connectors/ollama-connector").OllamaConnector)(cfg),
    cohere: (cfg) =>
      new (require("../connectors/cohere-connector").CohereConnector)(cfg),
  },
  retriever: {
    "file-store": (cfg, configDir) =>
      new (require("../retrieval/file-vector-store").FileVectorStore)({
        path: path.resolve(configDir, cfg.path || ".rag/index.json"),
      }),
    memory: (cfg) =>
      new (require("../connectors/memory-retriever").MemoryRetriever)(cfg),
    // The connection string comes from the environment, never the config
    // file: `connectionStringEnv` names the variable (default DATABASE_URL).
    pgvector: (cfg) => {
      const variable = cfg.connectionStringEnv || "DATABASE_URL";
      const connectionString = process.env[variable];
      if (!connectionString) {
        throw new Error(
          `The pgvector retriever reads its connection string from ${variable}, which is not set`,
        );
      }
      const { PgVectorRetriever } = require("../retrieval/pgvector-retriever");
      return new PgVectorRetriever({
        connectionString,
        table: cfg.table,
        dimensions: cfg.dimensions,
        createTable: cfg.createTable,
        index: cfg.index,
        cacheKey: cfg.cacheKey,
      });
    },
  },
  llm: {
    openai: (cfg) =>
      new (require("../connectors/openai-connector").OpenAIConnector)(cfg),
    anthropic: (cfg) =>
      new (require("../connectors/anthropic-connector").AnthropicConnector)(
        cfg,
      ),
    ollama: (cfg) =>
      new (require("../connectors/ollama-connector").OllamaConnector)(cfg),
  },
  reranker: {
    scoring: (cfg) =>
      new (require("../reranker/scoring-reranker").ScoringReranker)(cfg),
  },
};

const STAGES = ["loader", "embedder", "retriever", "reranker", "llm"];

/**
 * Instantiate a custom plugin from `plugins.<stage>.<name>` in the config.
 * The module may export a class (constructed with the entry config), an
 * instance, or either of those as `default`.
 */
function loadPluginModule(modulePath, entryConfig, configDir) {
  const resolved = path.resolve(configDir, modulePath);
  const mod = require(resolved);
  const exported = mod && mod.default ? mod.default : mod;
  if (typeof exported === "function") {
    return /^class\s/.test(Function.prototype.toString.call(exported))
      ? new exported(entryConfig)
      : exported(entryConfig);
  }
  if (exported && typeof exported === "object") return exported;
  throw new Error(`Plugin module ${modulePath} must export a class or object`);
}

/**
 * Turn a normalized .ragrc.json config into component instances.
 *
 * Each `pipeline` entry `{ stage, name, config }` is resolved in order:
 *   1. a built-in name (see BUILT_INS),
 *   2. a custom module path under `plugins.<stage>.<name>`,
 *   3. a plugin registered on the shared pluginRegistry.
 *
 * @param {object} config - Output of loadRagConfig()/validateRagrc().normalized
 * @param {object} [options]
 * @param {string} [options.configDir=process.cwd()] - Paths resolve relative to this
 * @returns {{embedder?: object, retriever?: object, llm?: object, reranker?: object, loader?: object, names: object}}
 */
function buildComponents(config, options = {}) {
  const configDir = options.configDir || process.cwd();
  const components = { names: {} };

  for (const entry of config.pipeline || []) {
    if (!STAGES.includes(entry.stage)) {
      throw new Error(
        `Unknown pipeline stage "${entry.stage}". Expected one of: ${STAGES.join(", ")}`,
      );
    }
    components[entry.stage] = resolveComponent(entry, config, configDir);
    components.names[entry.stage] = entry.name;
  }
  return components;
}

function resolveComponent(entry, config, configDir) {
  const { stage, name } = entry;
  const entryConfig = entry.config || {};

  const builtIn = BUILT_INS[stage]?.[name];
  if (builtIn) return builtIn(entryConfig, configDir);

  const modulePath = config.plugins?.[stage]?.[name];
  if (typeof modulePath === "string") {
    return loadPluginModule(modulePath, entryConfig, configDir);
  }

  try {
    return pluginRegistry.get(stage, name);
  } catch {
    const builtIns = Object.keys(BUILT_INS[stage] || {});
    throw new Error(
      `Unknown ${stage} "${name}". ` +
        (builtIns.length
          ? `Built-in ${stage}s: ${builtIns.join(", ")}. `
          : "") +
        `For a custom plugin add "plugins": { "${stage}": { "${name}": "./path/to/module.js" } }.`,
    );
  }
}

module.exports = { buildComponents, loadPluginModule, BUILT_INS, STAGES };
