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
  registry?: PluginRegistry;
  [key: string]: any;
}

export interface PipelineRunOptions {
  query?: string;
  queryVector?: number[];
  options?: {
    timeout?: number;
    stream?: boolean;
    topK?: number;
    [key: string]: any;
  };
}

export interface PipelineRunResult {
  success: boolean;
  query?: string;
  results?: any;
  error?: string;
}

export interface Pipeline {
  run(options: PipelineRunOptions): Promise<PipelineRunResult>;
  cleanup(): void;
}

export interface LoadConfigOptions {
  configPath?: string;
  validate?: boolean;
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

export interface LoaderPlugin {
  load(source: string, options?: any): Promise<Document[]>;
}

export interface EmbedderPlugin {
  embed(text: string, options?: any): Promise<number[]>;
}

export interface RetrieverPlugin {
  retrieve(query: string | { embedding: number[] }, options?: RetrieveOptions): Promise<SearchResult[]>;
}

export interface LLMPlugin {
  generate(prompt: string, options?: any): Promise<LLMResponse>;
}

export interface RerankerPlugin {
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
  register(type: string, name: string, implementation: any, contract?: any): void;
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

export interface ErrorFormatter {
  formatError(error: Error): string;
  createError(code: string, message: string, details?: any): Error;
  wrapError(error: Error, context: string): Error;
  ERROR_CODES: Record<string, string>;
}

// =============================================================================
// Evaluation Types
// =============================================================================

export interface EvalResult {
  question: string;
  expected: string;
  actual: string;
  score: number;
  bleu?: number;
  rouge?: number;
}

// =============================================================================
// Core API
// =============================================================================

export function createRagPipeline(config: RagPipelineConfig): Pipeline;
export { createRagPipeline as createPipeline };

// Configuration
export function loadConfig(options?: LoadConfigOptions): Promise<RagPipelineConfig>;
export { loadConfig as loadRagConfig };
export function validateRagrc(config: any): boolean;
export function normalizeConfig(config: any): RagPipelineConfig;

// Plugin system
export const pluginRegistry: PluginRegistry;

// Utilities
export const logger: Logger;
export const errorFormatter: ErrorFormatter;
export function createError(code: string, message: string, details?: any): Error;
export function wrapError(error: Error, context: string): Error;
export const ERROR_CODES: Record<string, string>;

// =============================================================================
// Utility Classes
// =============================================================================

export class BatchProcessor {
  constructor(options?: {
    batchSize?: number;
    maxConcurrent?: number;
    retryAttempts?: number;
    onProgress?: (progress: any) => void;
    [key: string]: any;
  });
  process(items: any[], handler: (batch: any[]) => Promise<any[]>): Promise<any[]>;
  cancel(): void;
}

export class RateLimiter {
  constructor(options?: {
    maxRequests?: number;
    windowMs?: number;
    [key: string]: any;
  });
  tryAcquire(identifier?: string): boolean;
  reset(identifier?: string): void;
}

export function retry<T>(fn: () => Promise<T>, options?: {
  maxAttempts?: number;
  delay?: number;
  backoff?: number;
  retryIf?: (error: Error) => boolean;
}): Promise<T>;

export function withRetry<T>(fn: () => Promise<T>, options?: {
  maxAttempts?: number;
  delay?: number;
  backoff?: number;
}): Promise<T>;

export class ConnectionPoolManager {
  constructor(options?: {
    maxSockets?: number;
    maxFreeSockets?: number;
    timeout?: number;
    [key: string]: any;
  });
  getPool(hostname: string): any;
  getMetrics(): any;
  destroy(): void;
}

// =============================================================================
// Security
// =============================================================================

export class JWTValidator {
  constructor(options?: {
    secret?: string;
    algorithms?: string[];
    issuer?: string;
    audience?: string;
    clockTolerance?: number;
    maxAge?: string;
    [key: string]: any;
  });
  sign(payload: any, options?: any): string;
  verify(token: string, options?: any): any;
}

export class PluginSandbox {
  constructor(options?: {
    memoryLimit?: number;
    timeout?: number;
    permissions?: string[];
    [key: string]: any;
  });
  execute(code: string, context?: any): Promise<any>;
}

export class PluginSignatureVerifier {
  constructor(options?: {
    trustedKeysPath?: string;
    failClosed?: boolean;
    [key: string]: any;
  });
  verify(pluginPath: string): Promise<boolean>;
}

export function validateInput(input: string, options?: any): { valid: boolean; errors?: string[] };

// =============================================================================
// AI/ML
// =============================================================================

export class MultiModalProcessor {
  constructor(options?: any);
  processContent(tenantId: string, content: any): Promise<any>;
  generateEmbeddings(tenantId: string, content: any): Promise<any>;
  crossModalSearch(tenantId: string, query: any): Promise<any>;
}

export class AdaptiveRetrievalEngine {
  constructor(options?: any);
  retrieveDocuments(tenantId: string, query: string, options?: any): Promise<any>;
  optimizeRetrieval(tenantId: string, performanceData: any): Promise<any>;
}

export class FederatedLearningCoordinator {
  constructor(options?: any);
  createSession(config: any): Promise<any>;
  submitUpdate(sessionId: string, update: any): Promise<any>;
  aggregate(sessionId: string): Promise<any>;
}

export class ModelTrainingOrchestrator {
  constructor(options?: any);
  createTrainingJob(tenantId: string, config: any): Promise<any>;
  getJobStatus(jobId: string): Promise<any>;
  optimizeModel(config: any): Promise<any>;
  deployModel(jobId: string, deployConfig: any): Promise<any>;
}

// =============================================================================
// Workflow Engine
// =============================================================================

export class DAGEngine {
  constructor(options?: DAGOptions);
  addNode(id: string, fn: (input: any) => Promise<any>, options?: Partial<DAGNode>): void;
  connect(fromId: string, toId: string): void;
  execute(seed?: any, options?: DAGOptions): Promise<Map<string, any>>;
  validate(): void;
}

export { DAGEngine as DAG };

// =============================================================================
// Evaluation
// =============================================================================

export function evaluateRagDataset(dataset: Array<{
  question: string;
  expected: string;
  actual: string;
}>): EvalResult[];

export function scoreAnswer(expected: string, actual: string): number;
export function computeBLEU(reference: string, hypothesis: string): number;
export function computeROUGE(reference: string, hypothesis: string): number;

// =============================================================================
// Performance & Observability
// =============================================================================

export class ParallelProcessor {
  constructor(options?: any);
  process(items: any[], handler: (item: any) => Promise<any>): Promise<any[]>;
}

export const eventLogger: {
  log(event: string, data?: any): void;
  info(event: string, data?: any): void;
  error(event: string, data?: any): void;
};

export const metrics: {
  counter(name: string): { inc(): void };
  timer(name: string): { end(): void };
};

// =============================================================================
// Enterprise
// =============================================================================

export class AuditLogger {
  constructor(options?: any);
  logAuthentication(event: any): Promise<void>;
  logDataAccess(event: any): Promise<void>;
  logDataModification(event: any): Promise<void>;
}

export class DataGovernance {
  constructor(options?: any);
  classifyData(data: any): any;
  enforceRetention(policy: any): Promise<void>;
}

export { DataGovernance as DataGovernanceManager };

export class TenantManager {
  constructor(options?: any);
  createTenant(config: any): Promise<any>;
  getTenant(tenantId: string): any;
  deleteTenant(tenantId: string): Promise<void>;
}

export class ResourceMonitor {
  constructor(options?: any);
  getUsage(tenantId: string): any;
  checkQuota(tenantId: string): boolean;
}

export class SSOManager {
  constructor(options?: any);
  authenticate(provider: string, credentials: any): Promise<any>;
  getSession(sessionId: string): any;
}

export class SAMLProvider {
  constructor(options?: any);
  authenticate(request: any): Promise<any>;
}

export class OAuth2Provider {
  constructor(options?: any);
  authenticate(request: any): Promise<any>;
}

export class ActiveDirectoryProvider {
  constructor(options?: any);
  authenticate(request: any): Promise<any>;
}

export class OIDCProvider {
  constructor(options?: any);
  authenticate(request: any): Promise<any>;
}

// =============================================================================
// Ecosystem
// =============================================================================

export class PluginHub {
  constructor(options?: any);
  search(query: string, options?: any): Promise<any[]>;
  install(pluginName: string, options?: any): Promise<any>;
  publish(pluginPath: string, options?: any): Promise<any>;
}

export class PluginAnalytics {
  constructor(options?: any);
  trackDownload(pluginName: string): void;
  getStats(pluginName: string): any;
}

export class PluginCertification {
  constructor(options?: any);
  certify(pluginName: string): Promise<any>;
  verify(pluginName: string): Promise<boolean>;
}

export class PluginAnalyticsDashboard {
  constructor(options?: any);
  generateReport(options?: any): Promise<any>;
  getMetrics(): any;
}

// =============================================================================
// Development Tools
// =============================================================================

export class HotReloadManager {
  constructor(options?: any);
  watch(paths: string[]): void;
  stop(): void;
}

export function createHotReloadManager(options?: any): HotReloadManager;

export class DevServer {
  constructor(options?: any);
  start(port?: number): Promise<void>;
  stop(): Promise<void>;
}

export function createDevServer(options?: any): DevServer;
`;

const distDir = path.join(__dirname, "..", "dist");
const outputPath = path.join(distDir, "index.d.ts");

// Ensure dist directory exists
if (!fs.existsSync(distDir)) {
  fs.mkdirSync(distDir, { recursive: true });
}

fs.writeFileSync(outputPath, typeDefinitions.trim());
console.log("TypeScript definitions generated: dist/index.d.ts");
