---
sidebar_position: 15
---

# API Reference

Comprehensive reference documentation for RAG Pipeline Utils v2.3.1.

## Core API

### createRagPipeline

Creates a RAG pipeline instance with the specified plugins.

**Behavior:** Factory function that initializes a complete RAG pipeline by composing loader, embedder, retriever, and LLM components. Supports both plugin instances and string references to registered plugins.

**Signature:**

```typescript
function createRagPipeline(config: PipelineConfig): Pipeline;
```

**Parameters:**

| Parameter          | Type                  | Required | Description                                           |
| ------------------ | --------------------- | -------- | ----------------------------------------------------- |
| `config`           | `PipelineConfig`      | Yes      | Pipeline configuration object                         |
| `config.registry`  | `PluginRegistry`      | No       | Custom plugin registry (uses default if not provided) |
| `config.loader`    | `Loader \| string`    | No       | Document loader plugin or plugin name                 |
| `config.embedder`  | `Embedder \| string`  | No       | Embedding generation plugin or plugin name            |
| `config.retriever` | `Retriever \| string` | No       | Document retrieval plugin or plugin name              |
| `config.llm`       | `LLM \| string`       | No       | Language model plugin or plugin name                  |
| `config.reranker`  | `Reranker \| string`  | No       | Result reranking plugin or plugin name                |

**Returns:** `Pipeline` - Pipeline instance with `run()` and `cleanup()` methods

**Example:**

```javascript
const { createRagPipeline } = require("@devilsdev/rag-pipeline-utils");

const pipeline = createRagPipeline({
  embedder: new OpenAIEmbedder({ apiKey: process.env.OPENAI_API_KEY }),
  retriever: new PineconeRetriever({ apiKey: process.env.PINECONE_API_KEY }),
  llm: new OpenAILLM({ model: "gpt-4" }),
});
```

**Aliases:**

- `createPipeline` - Backward compatibility alias (deprecated, use `createRagPipeline` instead)

---

### Pipeline Methods

#### pipeline.run()

Executes the RAG pipeline with the provided query.

**Behavior:** Processes queries through the complete RAG flow: embeds query (if embedder provided), retrieves relevant documents using the retriever, optionally reranks results, and generates a response using the LLM. Supports both standard and streaming response modes.

**Signature:**

```typescript
async run(options: RunOptions): Promise<RunResult>
```

**Parameters:**

| Parameter             | Type       | Required | Description                                  |
| --------------------- | ---------- | -------- | -------------------------------------------- |
| `options.query`       | `string`   | No       | Natural language query text                  |
| `options.queryVector` | `number[]` | No       | Pre-computed query embedding vector          |
| `options.topK`        | `number`   | No       | Number of documents to retrieve (default: 3) |
| `options.timeout`     | `number`   | No       | Timeout in milliseconds                      |
| `options.stream`      | `boolean`  | No       | Enable streaming response (default: false)   |

**Note:** Either `query` or `queryVector` must be provided.

**Returns:** `Promise<RunResult>`

```typescript
interface RunResult {
  success: boolean;
  query: string;
  results: Document[];
  error?: string; // Only present when success is false
}
```

**Example:**

```javascript
const result = await pipeline.run({
  query: "What is the vacation policy?",
  options: { topK: 5, timeout: 10000 },
});

if (result.success) {
  console.log("Query:", result.query);
  console.log("Results:", result.results);
}
```

**Streaming Example:**

```javascript
const stream = await pipeline.run({
  query: "Explain the benefits",
  options: { stream: true },
});

// Stream is an async generator
for await (const chunk of stream) {
  if (!chunk.done) {
    process.stdout.write(chunk.token);
  }
}
```

---

## Configuration

### loadConfig

Loads and validates RAG pipeline configuration from `.ragrc.json`.

**Signature:**

```typescript
function loadConfig(path?: string): Promise<RagConfig>;
```

**Parameters:**

| Parameter | Type     | Required | Description                                  |
| --------- | -------- | -------- | -------------------------------------------- |
| `path`    | `string` | No       | Path to config file (default: `.ragrc.json`) |

**Returns:** `Promise<RagConfig>`

**Example:**

```javascript
const { loadConfig } = require("@devilsdev/rag-pipeline-utils");

const config = await loadConfig("./config/.ragrc.json");
```

### validateRagrc

Validates RAG configuration against schema.

**Signature:**

```typescript
function validateRagrc(config: unknown): ValidationResult;
```

**Returns:** `ValidationResult` with `valid: boolean` and `errors: string[]`

### normalizeConfig

Normalizes and applies defaults to configuration.

**Signature:**

```typescript
function normalizeConfig(config: Partial<RagConfig>): RagConfig;
```

---

## Security

:::warning Not Available in Public API
The security utilities `JWTValidator` and `InputSanitizer` exist in the codebase but are **not exported** in the public API (src/index.js). They are available only through CLI commands or by directly requiring internal modules. If you need these features, please open an issue requesting they be added to the public API.
:::

### JWTValidator

Enterprise-grade JWT validation with replay protection (CLI/Internal use only).

**Behavior:** Provides cryptographically secure JWT signing and verification with built-in replay attack detection, algorithm confusion prevention, and race condition mitigation. Supports both self-signed (reusable) and external (single-use) token validation.

**Constructor:**

```typescript
new JWTValidator(options: JWTValidatorOptions)
```

**Options:**

| Parameter           | Type               | Required | Description                                |
| ------------------- | ------------------ | -------- | ------------------------------------------ |
| `secret`            | `string`           | Yes      | JWT signing secret                         |
| `algorithm`         | `string`           | No       | Algorithm (default: 'HS256')               |
| `issuer`            | `string`           | No       | Expected issuer                            |
| `audience`          | `string`           | No       | Expected audience                          |
| `expiresIn`         | `string \| number` | No       | Token expiration (default: '1h')           |
| `strictValidation`  | `boolean`          | No       | Enforce iss/aud validation (default: true) |
| `enableJtiTracking` | `boolean`          | No       | Enable replay protection (default: false)  |
| `jtiCacheSize`      | `number`           | No       | Max tracked JTIs (default: 10000)          |

**Methods:**

#### sign()

Signs a JWT token.

```typescript
sign(payload: object, options?: SignOptions): string
```

**Example:**

```javascript
const { JWTValidator } = require("@devilsdev/rag-pipeline-utils");

const validator = new JWTValidator({
  secret: process.env.JWT_SECRET,
  algorithm: "HS256",
  issuer: "my-app",
  audience: "api-users",
  strictValidation: true,
  enableJtiTracking: true, // Replay protection
});

const token = validator.sign({
  sub: "user-123",
  role: "admin",
});
```

#### verify()

Verifies and decodes a JWT token.

```typescript
verify(token: string, options?: VerifyOptions): Promise<JWTPayload>
```

**Throws:**

- `JsonWebTokenError` - Invalid token signature
- `TokenExpiredError` - Token has expired
- `Error` - Replay attack detected (if enableJtiTracking: true)

**Example:**

```javascript
try {
  const payload = await validator.verify(token);
  console.log("User:", payload.sub);
} catch (error) {
  if (error.message.includes("replay")) {
    console.error("Replay attack detected");
  }
}
```

**Security Features:**

- Self-signed tokens are reusable (for refresh flows)
- External tokens are single-use only (replay protection)
- Race condition mitigation with optimized check-then-set pattern
- Algorithm confusion attack prevention

---

### InputSanitizer

Multi-layer input sanitization with path traversal defense (CLI/Internal use only).

**Behavior:** Protects against XSS, SQL injection, command injection, and path traversal attacks through multi-layer validation. Uses iterative URL decoding (up to 5 iterations) to detect sophisticated encoding-based attacks.

**Constructor:**

```typescript
new InputSanitizer(options?: SanitizerOptions)
```

**Options:**

| Parameter        | Type       | Required | Description                                 |
| ---------------- | ---------- | -------- | ------------------------------------------- |
| `throwOnInvalid` | `boolean`  | No       | Throw on validation failure (default: true) |
| `maxLength`      | `number`   | No       | Maximum input length (default: 10000)       |
| `allowedTags`    | `string[]` | No       | Allowed HTML tags (default: [])             |

**Methods:**

#### sanitize()

Sanitizes general text input against XSS, SQL injection, command injection.

```typescript
sanitize(input: string): string
```

**Example:**

```javascript
const { InputSanitizer } = require("@devilsdev/rag-pipeline-utils");

const sanitizer = new InputSanitizer({
  throwOnInvalid: true,
  maxLength: 5000,
});

const safe = sanitizer.sanitize(userInput);
```

#### sanitizePath()

Sanitizes file paths with iterative URL decoding to prevent path traversal.

```typescript
sanitizePath(path: string): string
```

**Throws:** `Error` - Path traversal attempt detected (always throws, even with `throwOnInvalid: false`)

**Example:**

```javascript
try {
  const safePath = sanitizer.sanitizePath(userProvidedPath);
  // Use safePath
} catch (error) {
  console.error("Path traversal blocked:", error.message);
}
```

**Protection Against:**

- Standard traversal: `../../../etc/passwd`
- Windows paths: `..\\..\\windows\\system32`
- URL encoded: `%2e%2e%2f`, `%2e%2e%5c`
- Double encoded: `%252e%252e%252f`
- Multi-level encoding (up to 5 iterations)

---

## AI/ML Capabilities

### MultiModalProcessor

Process text, images, audio, and video content with unified embedding pipelines.

**Behavior:** Handles multi-modal content (text, images, audio, video) through unified embedding generation. Automatically selects appropriate models based on content type and normalizes embeddings for cross-modal retrieval.

**Constructor:**

```typescript
new MultiModalProcessor(options: MultiModalOptions)
```

**Methods:**

```typescript
async process(content: MultiModalContent): Promise<ProcessedContent>
```

**Example:**

```javascript
const { MultiModalProcessor } = require("@devilsdev/rag-pipeline-utils");

const processor = new MultiModalProcessor({
  textModel: "text-embedding-ada-002",
  imageModel: "clip-vit-base",
});

const result = await processor.process({
  type: "image",
  data: imageBuffer,
});
```

### AdaptiveRetrievalEngine

Learning-based relevance optimization using reinforcement learning.

**Constructor:**

```typescript
new AdaptiveRetrievalEngine(options: AdaptiveRetrievalOptions)
```

**Methods:**

```typescript
async retrieve(query: string, options?: RetrievalOptions): Promise<Document[]>
async learn(feedback: RelevanceFeedback): Promise<void>
```

**Example:**

```javascript
const { AdaptiveRetrievalEngine } = require("@devilsdev/rag-pipeline-utils");

const engine = new AdaptiveRetrievalEngine({
  baseRetriever: myRetriever,
  learningRate: 0.01,
});

const docs = await engine.retrieve("machine learning basics");

// Provide feedback for learning
await engine.learn({
  query: "machine learning basics",
  relevantDocs: [docs[0].id, docs[2].id],
  irrelevantDocs: [docs[3].id],
});
```

---

## Workflow Engine

### DAGEngine

Execute complex RAG workflows as directed acyclic graphs.

**Behavior:** Orchestrates complex multi-step workflows as directed acyclic graphs with automatic dependency resolution, parallel execution of independent tasks, and comprehensive error handling with retry logic.

**Constructor:**

```typescript
new DAGEngine(options?: DAGOptions)
```

**Methods:**

#### addNode()

```typescript
addNode(id: string, task: TaskFunction): void
```

#### addEdge()

```typescript
addEdge(from: string, to: string): void
```

#### execute()

```typescript
async execute(input?: any): Promise<DAGResult>
```

**Example:**

```javascript
const { DAGEngine } = require("@devilsdev/rag-pipeline-utils");

const dag = new DAGEngine();

dag.addNode("load", async () => await loadDocuments());
dag.addNode("embed", async (docs) => await embedDocuments(docs));
dag.addNode("store", async (embeddings) => await storeEmbeddings(embeddings));

dag.addEdge("load", "embed");
dag.addEdge("embed", "store");

const result = await dag.execute();
```

---

## Observability

### metrics

Global metrics collection for monitoring pipeline performance.

**Methods:**

```typescript
metrics.counter(name: string, value?: number, tags?: object): void
metrics.gauge(name: string, value: number, tags?: object): void
metrics.histogram(name: string, value: number, tags?: object): void
metrics.timing(name: string, duration: number, tags?: object): void
```

**Example:**

```javascript
const { metrics } = require("@devilsdev/rag-pipeline-utils");

metrics.counter("pipeline.queries");
metrics.timing("retrieval.latency", 150);
metrics.gauge("cache.hit_rate", 0.85);
```

### eventLogger

Structured event logging for audit trails.

**Methods:**

```typescript
eventLogger.log(event: Event): void
eventLogger.query(filters: EventFilters): Promise<Event[]>
```

**Example:**

```javascript
const { eventLogger } = require("@devilsdev/rag-pipeline-utils");

eventLogger.log({
  type: "security.jwt_validation",
  level: "warn",
  message: "Token replay detected",
  metadata: { jti: "abc123", userId: "user-456" },
});
```

---

## Enterprise Features

### AuditLogger

Immutable audit logging for compliance requirements.

**Constructor:**

```typescript
new AuditLogger(options: AuditLoggerOptions)
```

**Example:**

```javascript
const { AuditLogger } = require("@devilsdev/rag-pipeline-utils");

const auditLogger = new AuditLogger({
  backend: "s3",
  bucket: "compliance-logs",
  encryption: true,
});

await auditLogger.log({
  action: "document.access",
  actor: "user-123",
  resource: "confidential-doc-456",
  timestamp: new Date().toISOString(),
});
```

### DataGovernance

Multi-tenant data isolation and resource quotas.

**Constructor:**

```typescript
new DataGovernance(options: DataGovernanceOptions)
```

**Example:**

```javascript
const { DataGovernance } = require("@devilsdev/rag-pipeline-utils");

const governance = new DataGovernance({
  tenantIdField: "orgId",
  quotas: {
    "org-123": { maxDocuments: 10000, maxStorage: "5GB" },
  },
});
```

---

## Development Tools

### HotReloadManager

Enable hot module reloading during development.

**Constructor:**

```typescript
new HotReloadManager(options: HotReloadOptions)
```

**Example:**

```javascript
const { createHotReloadManager } = require("@devilsdev/rag-pipeline-utils");

const hotReload = createHotReloadManager({
  watchPaths: ["./plugins/**/*.js"],
  onReload: (module) => console.log("Reloaded:", module),
});

await hotReload.start();
```

### DevServer

Development server with real-time debugging.

**Constructor:**

```typescript
new DevServer(options: DevServerOptions)
```

**Example:**

```javascript
const { createDevServer } = require("@devilsdev/rag-pipeline-utils");

const server = createDevServer({
  port: 3000,
  pipeline: myPipeline,
  enableDebugger: true,
});

await server.start();
// Access dashboard at http://localhost:3000
```

---

## Utilities

### logger

Structured logging utility with multiple transport support.

**Methods:**

```typescript
logger.debug(message: string, meta?: object): void
logger.info(message: string, meta?: object): void
logger.warn(message: string, meta?: object): void
logger.error(message: string, meta?: object): void
```

**Example:**

```javascript
const { logger } = require("@devilsdev/rag-pipeline-utils");

logger.info("Pipeline initialized", {
  plugins: ["loader", "embedder", "retriever"],
});
```

### Error Handling

**createError:**

```typescript
createError(
  code: ErrorCode,
  message: string,
  details?: object
): RagError
```

**wrapError:**

```typescript
wrapError(
  error: Error,
  context: string
): RagError
```

**ERROR_CODES:**

- `PLUGIN_NOT_FOUND`
- `INVALID_CONFIG`
- `VALIDATION_ERROR`
- `NETWORK_ERROR`
- `TIMEOUT_ERROR`
- `SECURITY_ERROR`

**Example:**

```javascript
const {
  createError,
  wrapError,
  ERROR_CODES,
} = require("@devilsdev/rag-pipeline-utils");

throw createError(
  ERROR_CODES.PLUGIN_NOT_FOUND,
  "Embedder plugin not registered",
  { pluginName: "custom-embedder" },
);

try {
  await riskyOperation();
} catch (err) {
  throw wrapError(err, "Pipeline execution");
}
```

---

## Plugin System

### pluginRegistry

Global plugin registry for managing pipeline components.

**Methods:**

#### register()

```typescript
register(
  type: PluginType,
  name: string,
  plugin: Plugin
): void
```

#### get()

```typescript
get(
  type: PluginType,
  name: string
): Plugin
```

#### list()

```typescript
list(type?: PluginType): string[]
```

**Plugin Types:**

- `'loader'` - Document loaders
- `'embedder'` - Embedding generators
- `'retriever'` - Document retrievers
- `'llm'` - Language models
- `'reranker'` - Result rerankers

**Example:**

```javascript
const { pluginRegistry } = require("@devilsdev/rag-pipeline-utils");

pluginRegistry.register("embedder", "my-embedder", new MyEmbedder());

const embedder = pluginRegistry.get("embedder", "my-embedder");

console.log(pluginRegistry.list("embedder"));
// ['my-embedder', 'openai', 'cohere', ...]
```

---

## Performance

### ParallelProcessor

Process documents in parallel with configurable concurrency.

**Constructor:**

```typescript
new ParallelProcessor(options: ParallelProcessorOptions)
```

**Methods:**

```typescript
async process(
  items: T[],
  handler: (item: T) => Promise<R>
): Promise<R[]>
```

**Example:**

```javascript
const { ParallelProcessor } = require("@devilsdev/rag-pipeline-utils");

const processor = new ParallelProcessor({
  concurrency: 10,
  retryAttempts: 3,
});

const results = await processor.process(
  documents,
  async (doc) => await embedDocument(doc),
);
```

---

## Type Definitions

### Plugin Contracts

**Loader:**

```typescript
interface Loader {
  load(source: string): Promise<Document[]>;
}
```

**Embedder:**

```typescript
interface Embedder {
  embed(text: string): Promise<number[]>;
  embedBatch?(texts: string[]): Promise<number[][]>;
}
```

**Retriever:**

```typescript
interface Retriever {
  retrieve(options: RetrieveOptions): Promise<Document[]>;

  interface RetrieveOptions {
    query?: string;
    queryVector?: number[];
    topK?: number;
  }
}
```

**LLM:**

```typescript
interface LLM {
  generate(
    query: string,
    context: Document[],
    options?: GenerateOptions,
  ): Promise<string>;

  generateStream?(
    query: string,
    context: Document[],
    options?: GenerateOptions,
  ): AsyncIterable<StreamChunk>;
}
```

**Reranker:**

```typescript
interface Reranker {
  rerank(
    query: string,
    documents: Document[],
    options?: RerankOptions,
  ): Promise<Document[]>;
}
```

### Common Types

**Document:**

```typescript
interface Document {
  id: string;
  content: string;
  metadata?: Record<string, any>;
  score?: number;
}
```

**StreamChunk:**

```typescript
interface StreamChunk {
  token: string;
  done: boolean;
  metadata?: Record<string, any>;
}
```

---

## Version Information

Current version: **2.3.1**

Supported Node.js versions:

- Node.js 18.x
- Node.js 20.x
- Node.js 22.x

## Further Reading

- [Getting Started Guide](/docs/Introduction)
- [Security Best Practices](/docs/Security)
- [Performance Optimization](/docs/Performance)
- [Plugin Development](/docs/Plugins)
- [Enterprise Features](/docs/Enterprise)
