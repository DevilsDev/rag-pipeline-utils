#!/usr/bin/env node
/**
 * Generate TypeScript definitions from JSDoc
 * Creates dist/index.d.ts for TypeScript consumers
 */

const fs = require("fs");
const path = require("path");

const typeDefinitions = `/**
 * RAG Pipeline Utils - TypeScript Definitions
 * @module @devilsdev/rag-pipeline-utils
 */

// =============================================================================
// Core Configuration Types
// =============================================================================

export interface RagPipelineConfig {
  loader?: string | LoaderPlugin;
  embedder?: string | EmbedderPlugin;
  retriever?: string | RetrieverPlugin;
  llm?: string | LLMPlugin;
  reranker?: string | RerankerPlugin;
  [key: string]: any;
}

export interface LoadConfigOptions {
  configPath?: string;
  validate?: boolean;
}

export interface PipelineExecuteOptions {
  query?: string;
  documents?: string[];
  [key: string]: any;
}

// =============================================================================
// Document and Search Types
// =============================================================================

export interface Document {
  id: string;
  content: string;
  metadata?: Record<string, any>;
  embedding?: number[];
}

export interface SearchResult {
  id: string;
  score: number;
  document?: Document;
  metadata?: Record<string, any>;
}

export interface RetrieveOptions {
  topK?: number;
  minScore?: number;
  includeMetadata?: boolean;
  filter?: Record<string, any>;
}

export interface LLMResponse {
  text: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  metadata?: Record<string, any>;
}

// =============================================================================
// Plugin Contract Interfaces
// =============================================================================

/**
 * Loader plugin interface for loading documents from various sources
 */
export interface LoaderPlugin {
  /**
   * Load documents from a source
   * @param source - Path or identifier of the source
   * @param options - Optional loading parameters
   * @returns Promise resolving to array of documents
   */
  load(source: string, options?: any): Promise<Document[]>;
}

/**
 * Embedder plugin interface for generating vector embeddings
 */
export interface EmbedderPlugin {
  /**
   * Generate embedding vector for text
   * @param text - Input text to embed
   * @param options - Optional embedding parameters
   * @returns Promise resolving to embedding vector
   */
  embed(text: string, options?: any): Promise<number[]>;
}

/**
 * Retriever plugin interface for vector search and document retrieval
 */
export interface RetrieverPlugin {
  /**
   * Retrieve relevant documents based on query
   * @param query - Search query (text or embedding)
   * @param options - Retrieval options (topK, filters, etc.)
   * @returns Promise resolving to search results
   */
  retrieve(query: string | { embedding: number[] }, options?: RetrieveOptions): Promise<SearchResult[]>;
}

/**
 * LLM plugin interface for text generation
 */
export interface LLMPlugin {
  /**
   * Generate text response based on prompt
   * @param prompt - Input prompt for generation
   * @param options - Generation parameters (temperature, maxTokens, etc.)
   * @returns Promise resolving to LLM response
   */
  generate(prompt: string, options?: any): Promise<LLMResponse>;
}

/**
 * Reranker plugin interface for improving retrieval relevance
 */
export interface RerankerPlugin {
  /**
   * Rerank search results based on query
   * @param results - Initial search results
   * @param query - Original query
   * @param options - Reranking parameters
   * @returns Promise resolving to reranked results
   */
  rerank(results: SearchResult[], query: string, options?: any): Promise<SearchResult[]>;
}

// =============================================================================
// DAG Engine Types
// =============================================================================

export interface DAGNode {
  id: string;
  run: (input: any) => Promise<any>;
  inputs?: string[];
  outputs?: string[];
  optional?: boolean;
  maxRetries?: number;
  retryDelay?: number;
}

export interface DAGOptions {
  timeout?: number;
  concurrency?: number;
  continueOnError?: boolean;
  gracefulDegradation?: boolean;
  requiredNodes?: string[];
  retryFailedNodes?: boolean;
  maxRetries?: number;
}

// =============================================================================
// Utility Types
// =============================================================================

export interface PluginRegistry {
  register(type: string, name: string, implementation: any): void;
  get(type: string, name: string): any;
  has(type: string, name: string): boolean;
  list(type: string): any[];
}

export interface Logger {
  info(message: string, meta?: any): void;
  error(message: string, meta?: any): void;
  warn(message: string, meta?: any): void;
  debug(message: string, meta?: any): void;
}

// Core API
export function createRagPipeline(config: RagPipelineConfig): any;
export { createRagPipeline as createPipeline };

// Configuration
export function loadConfig(options?: LoadConfigOptions): Promise<RagPipelineConfig>;
export function validateRagrc(config: any): boolean;
export function normalizeConfig(config: any): RagPipelineConfig;

// Plugin system
export const pluginRegistry: PluginRegistry;

// Utilities
export const logger: Logger;

// DAG Engine
export class DAGEngine {
  constructor(options?: DAGOptions);
  addNode(id: string, fn: (input: any) => Promise<any>, options?: Partial<DAGNode>): void;
  connect(fromId: string, toId: string): void;
  execute(seed?: any, options?: DAGOptions): Promise<Map<string, any>>;
  validate(): void;
}

// AI/ML
export class MultiModalProcessor {
  constructor(options?: any);
  process(input: any): Promise<any>;
}

export class AdaptiveRetrievalEngine {
  constructor(options?: any);
  retrieve(query: string, options?: any): Promise<any>;
}

// Performance
export class ParallelProcessor {
  constructor(options?: any);
  process(items: any[], handler: (item: any) => Promise<any>): Promise<any[]>;
}

// Observability
export const eventLogger: {
  log(event: string, data?: any): void;
};

export const metrics: {
  counter(name: string): { inc(): void };
  timer(name: string): { end(): void };
};

// Enterprise
export class AuditLogger {
  constructor(options?: any);
  log(event: string, data?: any): void;
}

export class DataGovernance {
  constructor(options?: any);
  enforce(policy: any): void;
}
`;

const distDir = path.join(__dirname, "..", "dist");
const outputPath = path.join(distDir, "index.d.ts");

// Ensure dist directory exists
if (!fs.existsSync(distDir)) {
  fs.mkdirSync(distDir, { recursive: true });
}

fs.writeFileSync(outputPath, typeDefinitions.trim());
console.log("✅ TypeScript definitions generated: dist/index.d.ts");
