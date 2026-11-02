#!/usr/bin/env node
/**
 * Generate TypeScript definitions from JSDoc
 * Creates dist/index.d.ts for TypeScript consumers
 */

const fs = require("fs");
const path = require("path");

const typeDefinitions = `/**
 * RAG Pipeline Utils - TypeScript Definitions
 * @module rag-pipeline-utils
 */

// =============================================================================
// Pipeline
// =============================================================================

/** Options for {@link createRagPipeline}. */
export interface RagPipelineConfig {
  /** Resolves plugin names given as strings; defaults to the shared {@link pluginRegistry}. */
  registry?: PluginRegistry;
  /** Called with no arguments at the start of every run; its result is ignored. */
  loader?: string | LoaderPlugin;
  /** Embeds the query when \`run()\` gets a \`query\` and no \`queryVector\`. */
  embedder?: string | EmbedderPlugin;
  /** Finds the documents for a query. Without one, every run retrieves nothing. */
  retriever?: string | RetrieverPlugin;
  /** Writes the answer. Without one the pipeline is retrieval-only and \`answer\` is null. */
  llm?: string | LLMPlugin;
  /** Reorders the retrieved documents before generation. */
  reranker?: string | RerankerPlugin;
  /**
   * Cache query embeddings, retrieval results and answers. \`true\` caches
   * all three in memory; a CacheBackend (MemoryCache, RedisCache, your own)
   * caches all three in it; or configure each layer.
   */
  cache?: boolean | CacheBackend | CacheOptions;
  /**
   * OpenTelemetry spans for every run and stage. \`true\` uses the global
   * tracer provider. Needs the optional peer dependency \`@opentelemetry/api\`.
   */
  telemetry?: boolean | TelemetryOptions;
  /** Other keys are ignored. */
  [key: string]: any;
}

/**
 * A tracer that can start active spans, such as an OpenTelemetry \`Tracer\`.
 * Declared here so the types don't depend on the optional peer dependency.
 */
export interface TelemetryTracer {
  startActiveSpan(...args: any[]): any;
}

/** The \`telemetry\` option of createRagPipeline. */
export interface TelemetryOptions {
  /** Default: \`trace.getTracer("@devilsdev/rag-pipeline-utils", version)\`. */
  tracer?: TelemetryTracer;
  /** The @opentelemetry/api module, for @devilsdev/rag-pipeline-utils/edge, which cannot load it itself. */
  api?: any;
  /** Also record the query text and the retrieved document ids and scores. Default false. */
  recordContent?: boolean;
}

/** A cache store: get / set / delete, optionally stats. */
export interface CacheBackend {
  /** Resolves the stored value, or undefined when the key is missing or expired. */
  get(key: string): Promise<unknown | undefined>;
  /** Stores a value, expiring it after \`ttlSeconds\` when given. */
  set(key: string, value: unknown, options?: { ttlSeconds?: number }): Promise<void>;
  /** Removes a key. */
  delete?(key: string): Promise<void>;
  /** Backend-specific counters, such as size or hits. */
  stats?(): Promise<Record<string, number>>;
}

/** Per-layer cache settings: \`true\` for memory, a CacheBackend, or false/omitted for none. */
export interface CacheOptions {
  embeddings?: boolean | CacheBackend;
  retrieval?: boolean | CacheBackend;
  generation?: boolean | CacheBackend;
  /** Defaults: embeddings 30 days, retrieval 1 hour, generation 24 hours. */
  ttlSeconds?: { embeddings?: number; retrieval?: number; generation?: number };
}

/** What a cache layer did for one run: served it, stored it, or was not used. */
export type CacheOutcome = "hit" | "miss" | "skip";

/** Counts for one cache layer since the pipeline was created. */
export interface CacheLayerStats {
  hits: number;
  misses: number;
  skipped: number;
}

/** The argument of {@link Pipeline.run}. Give a \`query\`, a \`queryVector\`, or both. */
export interface PipelineRunOptions {
  /** The question. Embedded by the embedder unless \`queryVector\` is given. */
  query?: string;
  /** A precomputed query embedding; skips the embedder. */
  queryVector?: number[];
  /** Per-run options. The whole object is also passed to \`llm.generate\`. */
  options?: {
    /** Documents to retrieve. Default 3. */
    topK?: number;
    /** Abort the run after this many milliseconds; it resolves \`{ success: false, error: "Execution timeout" }\`. */
    timeout?: number;
    /** Cancel the run; it resolves \`{ success: false, error: "Execution aborted" }\`. */
    signal?: AbortSignal;
    /** Resolve to an async iterable of {@link StreamChunk} instead of a result. */
    stream?: boolean;
    /** Attribute the answer's sentences to the retrieved documents (see CitationTracker). */
    citations?: boolean;
    citationOptions?: Record<string, any>;
    /** Score the run (see PipelineEvaluator). */
    evaluate?: boolean;
    evaluateOptions?: Record<string, any>;
    /** Ground-truth answer, used by evaluation for context recall. */
    referenceAnswer?: string;
    /** Filter or transform the retrieved documents before reranking. */
    filterResults?: (docs: SearchResult[]) => SearchResult[] | Promise<SearchResult[]>;
    /**
     * Fit the documents the LLM sees into this many tokens (see packContext).
     * \`results\` is then the packed list, and \`packing\` says what was cut.
     */
    maxContextTokens?: number;
    /** Token counter for \`maxContextTokens\` (default: about four characters per token). */
    countTokens?: (text: string) => number;
    [key: string]: any;
  };
}

/**
 * What {@link Pipeline.run} resolves to without streaming. A failed, timed-out
 * or aborted run resolves \`{ success: false, error }\`; \`run\` never rejects.
 */
export interface PipelineRunResult {
  success: boolean;
  query?: string;
  /** The retrieved (filtered, reranked) documents; with \`maxContextTokens\`, the packed ones the LLM saw. */
  results?: SearchResult[];
  /** The LLM's answer; null when the pipeline has no llm. */
  answer?: string | null;
  /** Present when \`options.citations\` was set and there is an answer. */
  citations?: any;
  /** Present when \`options.evaluate\` was set. */
  evaluation?: any;
  /** The error message when \`success\` is false. */
  error?: string;
  /** Per-layer cache outcome; present when the pipeline has a cache. */
  cache?: {
    embeddings?: CacheOutcome;
    retrieval?: CacheOutcome;
    generation?: CacheOutcome;
  };
  /** What \`maxContextTokens\` kept and cut; present when it was set. */
  packing?: ContextPacking;
  /** How long the run took, from the start of run(); on successful results. */
  timing?: { totalMs: number };
  /** The model router's decision, when the llm is a createModelRouter() and was called. */
  route?: RouteDecision;
}

/** Which model a createModelRouter() chose for a run. */
export interface RouteDecision {
  /** The query class from the router's classifier. */
  class: string;
  /** The model that answered. */
  model: string;
  /** Estimated cost in USD of the chosen model for this query. */
  estimatedCost: number;
  /** Models that failed before \`model\` answered (with \`fallback: true\`). */
  fallbackFrom?: string[];
}

/** When a streamed answer started and finished, from the start of run(). */
export interface StreamTiming {
  /** When the first non-empty token arrived; null when none did. */
  firstTokenMs: number | null;
  totalMs: number;
}

/** How the documents were fitted into \`maxContextTokens\`. */
export interface ContextPacking {
  /** Tokens used by the kept documents, wrappers included. */
  tokens: number;
  maxTokens: number;
  /** Ids (or positions) of the documents passed to the LLM, in order. */
  kept: Array<string | number>;
  /** Ids of the documents left out because they didn't fit. */
  dropped: Array<string | number>;
  /** Ids of documents cut to fit (marked \`metadata.truncated\`). */
  truncated: Array<string | number>;
}

/**
 * One chunk of a streamed answer. The last chunk has \`done: true\` and, when
 * requested, the run's \`citations\` and \`evaluation\`. Without an llm the
 * stream is a single done chunk carrying \`results\`.
 */
export interface StreamChunk {
  token: string;
  done: boolean;
  results?: SearchResult[];
  citations?: any;
  evaluation?: any;
  /** On the last chunk, when \`maxContextTokens\` was set. */
  packing?: ContextPacking;
  /** On the last chunk: time to first token and total time. */
  timing?: StreamTiming;
  /** On the last chunk, when the llm is a createModelRouter(). */
  route?: RouteDecision;
}

/** A pipeline returned by {@link createRagPipeline}. */
export interface Pipeline {
  /**
   * Answer one query: (embed) → retrieve → (filter) → (rerank) → generate →
   * (citations, evaluation). Resolves a {@link PipelineRunResult}, or with
   * \`options.stream\` an async iterable of {@link StreamChunk}.
   */
  run(options: PipelineRunOptions & { options: { stream: true } }): Promise<PipelineRunResult | AsyncIterable<StreamChunk>>;
  /** Answer one query; see the streaming overload above. */
  run(options?: PipelineRunOptions & { options?: { stream?: false } }): Promise<PipelineRunResult>;
  /** Answer one query; with \`options.stream\` it may resolve a stream. */
  run(options?: PipelineRunOptions): Promise<PipelineRunResult | AsyncIterable<StreamChunk>>;
  /** Does nothing; kept for compatibility. */
  cleanup(): void;
  /** Hits, misses and skips per cache layer; null without a cache. */
  cacheStats(): {
    embeddings?: CacheLayerStats;
    retrieval?: CacheLayerStats;
    generation?: CacheLayerStats;
  } | null;
}

// =============================================================================
// Documents and results
// =============================================================================

/** A document as stored in a retriever. */
export interface Document {
  id: string;
  content: string;
  metadata?: Record<string, any>;
  /** The document's embedding (the built-in stores call it \`vector\`). */
  vector?: number[];
}

/** A retrieved document, as the built-in retrievers return it. */
export interface SearchResult {
  id: string;
  /** Similarity; higher is closer. */
  score: number;
  content?: string;
  metadata?: Record<string, any>;
  [key: string]: any;
}

/** What the pipeline passes to {@link RetrieverPlugin.retrieve}. */
export interface RetrieveOptions {
  query?: string;
  queryVector?: number[];
  topK: number;
  signal?: AbortSignal;
}

// =============================================================================
// Plugin contracts: what createRagPipeline calls on each component
// =============================================================================

/** A loader. To register it with pluginRegistry it needs \`metadata: { name, version, type: "loader" }\`. */
export interface LoaderPlugin {
  /** The pipeline calls \`load()\` with no arguments at the start of each run and ignores the result. */
  load(source?: string, options?: any): unknown;
}

/** An embedding returned by an embedder: a vector, a batch whose first vector is used, or \`[{ values | vector | embedding }]\`. */
export type EmbeddingOutput =
  | number[]
  | number[][]
  | Array<{ values?: number[]; vector?: number[]; embedding?: number[] }>;

/** An embedder. To register it with pluginRegistry it needs \`metadata: { name, version, type: "embedder" }\`. */
export interface EmbedderPlugin {
  /** Embeds one text. Used for the query when \`embedQuery\` is absent. */
  embed(text: string, options?: { signal?: AbortSignal; [key: string]: any }): EmbeddingOutput | Promise<EmbeddingOutput>;
  /** Embeds a query; preferred over \`embed\` when present. */
  embedQuery?(text: string, options?: { signal?: AbortSignal; [key: string]: any }): EmbeddingOutput | Promise<EmbeddingOutput>;
}

/** A retriever. To register it with pluginRegistry it needs \`store()\` and \`metadata: { name, version, type: "retriever" }\`. */
export interface RetrieverPlugin {
  /** Returns up to \`topK\` documents for the query, closest first. */
  retrieve(options: RetrieveOptions): SearchResult[] | Promise<SearchResult[]>;
  /** Adds documents with their embeddings. Not called by the pipeline; required by pluginRegistry and the CLI. */
  store?(documents: Array<Document & { vector: number[] }>): unknown;
}

/** An LLM. To register it with pluginRegistry it needs \`metadata: { name, version, type: "llm" }\`. */
export interface LLMPlugin {
  /**
   * Answers the query from the retrieved documents. Must resolve to the
   * answer text: the pipeline converts the result with \`String()\`.
   * \`options\` is the run's \`options\` plus its AbortSignal.
   */
  generate(query: string, documents: SearchResult[], options?: { signal?: AbortSignal; [key: string]: any }): string | Promise<string>;
  /** Streams the answer; used with \`options.stream\` when present, otherwise \`generate\` is yielded as one chunk. */
  generateStream?(query: string, documents: SearchResult[], options?: { signal?: AbortSignal; [key: string]: any }): AsyncIterable<string | { token: string; done?: boolean }>;
}

/** A reranker. To register it with pluginRegistry it needs \`metadata: { name, version, type: "reranker" }\`. */
export interface RerankerPlugin {
  /** Reorders (and may trim) the retrieved documents for the query. */
  rerank(query: string, documents: SearchResult[], options?: { topK?: number; signal?: AbortSignal }): SearchResult[] | Promise<SearchResult[]>;
}

/** The interface of {@link pluginRegistry}. */
export interface PluginRegistry {
  /**
   * Registers a plugin after checking it against its type's contract and,
   * when signature verification is enabled, its signed manifest.
   * Types: loader, embedder, retriever, reranker, llm, evaluator.
   */
  register(type: string, name: string, implementation: any, manifest?: any, options?: { content?: any }): Promise<PluginRegistry>;
  /** Returns a registered plugin; throws when it is not registered. */
  get(type: string, name: string): any;
  /** The names registered for a type. */
  list(type: string): string[];
}

/** The interface of the \`logger\` export's methods and of \`logger.logger\`. */
export interface Logger {
  /** Logs at info level; \`meta\` may be an object, an Error or a value. */
  info(message: string, meta?: any): void;
  /** Logs at error level. */
  error(message: string, meta?: any): void;
  /** Logs at warn level. */
  warn(message: string, meta?: any): void;
  /** Logs at debug level. */
  debug(message: string, meta?: any): void;
}

/** An error created by {@link createError} or {@link wrapError}. */
export interface EnhancedError extends Error {
  code: string;
  context: Record<string, any>;
  suggestions: string[];
  documentation?: string;
  originalError?: Error | null;
  timestamp: string;
}

// =============================================================================
// Pipeline factory and errors
// =============================================================================

/**
 * Creates a RAG pipeline from components: plugin objects, or names
 * registered in the registry. A name that is not registered throws here.
 */
export function createRagPipeline(config?: RagPipelineConfig): Pipeline;
export { createRagPipeline as createPipeline };

/**
 * Creates an error whose message and suggestions come from the code's
 * template, with \`{placeholders}\` filled from \`context\`.
 * @param code - One of {@link ERROR_CODES}
 * @param context - Values for the message template's placeholders
 * @param originalError - The underlying error, kept as \`originalError\`
 */
export function createError(code: string, context?: Record<string, any>, originalError?: Error | null): EnhancedError;

/**
 * Wraps an error in an EnhancedError with the given code, keeping the
 * original as \`originalError\` and its message as \`context.originalMessage\`.
 * @param error - The error to wrap
 * @param code - One of {@link ERROR_CODES}
 * @param context - Values for the message template's placeholders
 */
export function wrapError(error: Error, code: string, context?: Record<string, any>): EnhancedError;

/** The error codes {@link createError} accepts; each key equals its value. */
export const ERROR_CODES: Record<string, string>;

/** The DAG class under its older name. */
export { DAG as DAGEngine } from "./types/dag/dag-engine";

/** The same function as loadRagConfig. */
export { loadRagConfig as loadConfig } from "./types/config/load-config";

`;

const distDir = path.join(__dirname, "..", "dist");
const outputPath = path.join(distDir, "index.d.ts");

// Ensure dist directory exists
if (!fs.existsSync(distDir)) {
  fs.mkdirSync(distDir, { recursive: true });
}

fs.writeFileSync(outputPath, typeDefinitions.trim() + "\n");
appendGeneratedDeclarations();
fs.writeFileSync(
  path.join(distDir, "experimental.d.ts"),
  'export * from "./types/experimental";\n',
);
fs.writeFileSync(
  path.join(distDir, "testing.d.ts"),
  'export * from "./types/testing";\n',
);
// ./edge exports a subset of the main entry, the same declarations.
const edgeNames = Object.keys(require("../src/edge.js"));
fs.writeFileSync(
  path.join(distDir, "edge.d.ts"),
  `export { ${edgeNames.join(", ")} } from "./index";\n`,
);
console.log("TypeScript definitions generated: dist/index.d.ts");

/**
 * The template above only covers the original API. For every other export of
 * src/index.js, emit declarations from the module's JSDoc with tsc into
 * dist/types/ and re-export them from dist/index.d.ts, so new exports get
 * types without being hand-written here.
 */
function appendGeneratedDeclarations() {
  const { execFileSync } = require("child_process");
  const srcDir = path.join(__dirname, "..", "src");
  const indexSource = fs.readFileSync(path.join(srcDir, "index.js"), "utf8");

  // const { A, B: C } = require('./dir/module');
  const exportSources = new Map();
  const requirePattern =
    /const\s*\{([^}]+)\}\s*=\s*require\(\s*['"](\.\/[^'"]+)['"]\s*\)/g;
  for (const [, names, modulePath] of indexSource.matchAll(requirePattern)) {
    for (const part of names.split(",")) {
      const [imported, local] = part.split(":").map((n) => n.trim());
      if (imported) {
        exportSources.set(local || imported, {
          imported,
          modulePath: modulePath.replace(/\.js$/, ""),
        });
      }
    }
  }
  // const name = require('./dir/module'); exports the whole module.exports
  const wholeModulePattern =
    /const\s+([\w$]+)\s*=\s*require\(\s*['"](\.\/[^'"]+)['"]\s*\)/g;
  for (const [, name, modulePath] of indexSource.matchAll(wholeModulePattern)) {
    exportSources.set(name, {
      imported: null,
      modulePath: modulePath.replace(/\.js$/, ""),
    });
  }

  const template = fs.readFileSync(outputPath, "utf8");
  const declared = new Set(
    [
      ...template.matchAll(
        /export\s+(?:declare\s+)?(?:const|let|function|class)\s+([\w$]+)/g,
      ),
    ].map((m) => m[1]),
  );
  // export { a, b as c } — the exported name is the alias when present
  for (const [, list] of template.matchAll(/export\s*\{([^}]*)\}/g)) {
    for (const part of list.split(",")) {
      const name = part
        .trim()
        .split(/\s+as\s+/)
        .pop();
      if (name) declared.add(name);
    }
  }
  const runtimeExports = Object.keys(require(path.join(distDir, "index.cjs")));
  const missing = runtimeExports.filter(
    (name) => !declared.has(name) && exportSources.has(name),
  );
  const modules = [
    ...new Set(missing.map((n) => exportSources.get(n).modulePath)),
  ];
  const typesDir = path.join(distDir, "types");
  fs.rmSync(typesDir, { recursive: true, force: true });
  const tscBin = require.resolve("typescript/bin/tsc");
  execFileSync(
    process.execPath,
    [
      tscBin,
      ...modules.map((m) => path.join(srcDir, `${m}.js`)),
      // the ./experimental and ./testing entries are declared from their
      // source modules
      path.join(srcDir, "experimental.js"),
      path.join(srcDir, "testing.js"),
      "--allowJs",
      "--declaration",
      "--emitDeclarationOnly",
      "--skipLibCheck",
      "--rootDir",
      srcDir,
      "--outDir",
      typesDir,
    ],
    { stdio: "inherit" },
  );

  const lines = missing.map((name) => {
    const { imported, modulePath } = exportSources.get(name);
    const from = `./types/${modulePath.replace(/^\.\//, "")}`;
    if (imported === null) {
      return `import ${name} = require("${from}");\nexport { ${name} };`;
    }
    const spec = imported === name ? name : `${imported} as ${name}`;
    return `export { ${spec} } from "${from}";`;
  });
  fs.appendFileSync(
    outputPath,
    [
      "",
      "// =============================================================================",
      "// Declarations generated from JSDoc (scripts/generate-types.js)",
      "// =============================================================================",
      ...lines,
      "",
    ].join("\n"),
  );
}
