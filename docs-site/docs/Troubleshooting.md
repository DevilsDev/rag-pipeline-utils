# Troubleshooting Guide

This comprehensive troubleshooting guide helps you diagnose and resolve common issues with **@devilsdev/rag-pipeline-utils**. From installation problems to performance optimization, this guide provides step-by-step solutions and debugging strategies.

---

## **Installation & Setup Issues**

### **1. Package Installation Failures**

**Problem**: `npm install @devilsdev/rag-pipeline-utils` fails with dependency errors.

**Solutions**:

```bash
# Clear npm cache
npm cache clean --force

# Use a supported Node.js version (18+ required)
nvm use 18
npm install @devilsdev/rag-pipeline-utils
```

**Common Dependency Problems**:

- **`husky: not found`** (on Windows, `'husky' is not recognized as an internal or external command`): versions 2.2.1 to 2.6.1 ran `husky install`, a development hook, when the package was installed, so `npm install` failed wherever husky wasn't installed globally, including CI runners. Upgrade to 2.6.2 or later: `npm install @devilsdev/rag-pipeline-utils@latest`. If you can't upgrade yet, `npm install --ignore-scripts @devilsdev/rag-pipeline-utils@2.6.1` skips the hook; the package needs no install scripts.
- **Node.js version**: Node.js 22 or newer is required (`engines.node >= 22`) from 3.0.0; 2.x needs Node.js 18 or newer.
- **`Cannot find module 'isolated-vm'`**: importing 2.4.5 failed in clean installs with this error. Upgrade to 2.5.0, where `isolated-vm` is an optional peer dependency loaded only when the experimental `PluginSandbox` runs. Install it yourself only if you use `PluginSandbox`.
- **`pino-pretty`** is an optional peer dependency as well; install it only for pretty-printed logs.
- **OpenAI SDK**: the package uses the `openai` 4.x SDK.

### **2. Configuration File Issues**

**Problem**: `.ragrc.json` configuration not being loaded or invalid format.

**Diagnostic Commands**:

```bash
# Validate configuration and resolve every component
rag-pipeline validate

# Show the current configuration
rag-pipeline config show

# Recreate the default configuration (overwrites .ragrc.json)
rag-pipeline init --no-interactive --force
```

**Common Configuration Errors**:

```jsonc
// Invalid: Missing required fields
{
  "embedder": "openai"
}

// Valid: stages are listed under "pipeline"
{
  "pipeline": [
    { "stage": "loader", "name": "auto" },
    { "stage": "embedder", "name": "openai" },
    {
      "stage": "retriever",
      "name": "file-store",
      "config": { "path": ".rag/index.json" }
    }
  ]
}
```

### **3. Environment Variable Issues**

**Problem**: API keys and environment variables not being recognized.

**Debug Steps**:

```bash
# Check that the variable is set in the shell that runs the CLI
echo $OPENAI_API_KEY

# Report missing keys for the configured providers
rag-pipeline doctor --category environment
```

**Environment Variable Precedence**:

1. `config.apiKey` on the pipeline entry in `.ragrc.json`
2. Environment variables (`OPENAI_API_KEY`, `ANTHROPIC_API_KEY`,
   `COHERE_API_KEY`)

API keys are read when a connector is constructed. A call without a key
fails fast with a `MISSING_API_KEY` error, so set the variable before
creating the pipeline. The package does not load `.env` files itself; export
the variables in your shell or load them in your application.

The CLI has no `--api-key` option.

---

## **Plugin & Integration Issues**

### **1. Plugin Loading Failures**

**Problem**: Custom plugins not loading or throwing runtime errors.

**Diagnostic Commands**:

```bash
# List built-in components and custom plugins
rag-pipeline info --plugins

# Check that every module under "plugins" exists and loads
rag-pipeline doctor --category plugins

# Resolve every pipeline component
rag-pipeline validate
```

**Common Plugin Issues**:

- **Missing exports**: Ensure plugin exports required methods
- **Contract violations**: Plugin doesn't implement required interface
- **Dependency conflicts**: Plugin dependencies conflict with core

**Plugin Debugging**:

```javascript
// Add logging to a custom loader plugin
class MyPlugin {
  async load(filePath) {
    console.log(`Loading file: ${filePath}`);
    try {
      const result = await this.processFile(filePath);
      console.log(`Successfully loaded: ${result.length} chunks`);
      return result;
    } catch (error) {
      console.error(`Plugin error: ${error.message}`);
      throw error;
    }
  }
}
```

### **2. API Integration Problems**

**Problem**: Calls to a provider (OpenAI, Anthropic, Cohere, Ollama) fail.

**OpenAI API Issues**:

```bash
# Test API connectivity
curl -H "Authorization: Bearer $OPENAI_API_KEY" \
  https://api.openai.com/v1/models

# Run a query with extra output (the model is set in .ragrc.json)
rag-pipeline query "test" --verbose

# Check API keys for the configured providers
rag-pipeline doctor --category environment
```

**Retries**: built-in connectors retry only transient failures (network
errors and HTTP 408/409/425/429/5xx) with exponential backoff, jitter and
`Retry-After`, up to `maxRetries` (default 3). Other errors fail immediately.

**Common API Error Codes**:

- **401 Unauthorized**: Invalid API key (not retried)
- **400 Bad Request**: Invalid request format (not retried)
- **429 Rate Limited**: Too many requests (retried with backoff)
- **503 Service Unavailable**: API service down (retried with backoff)

---

## **Performance & Memory Issues**

### **1. Slow Embedding Generation**

**Problem**: Embedding generation taking too long or timing out.

**Performance Optimization**:

`createRagPipeline` takes component instances (or registered names), not
inline config objects. Configure the connector itself, and bound each run
with `options.timeout` or an `AbortSignal`:

```javascript
const {
  createRagPipeline,
  OpenAIConnector,
  FileVectorStore,
} = require("@devilsdev/rag-pipeline-utils");

const openai = new OpenAIConnector({ maxRetries: 3, retryDelay: 1000 });
const pipeline = createRagPipeline({
  embedder: openai,
  retriever: new FileVectorStore({ path: ".rag/index.json" }),
  llm: openai,
});

// The run resolves { success: false, error: 'Execution timeout' } after 30 s
// and the abort signal is passed to every component call.
const result = await pipeline.run({
  query: "What is RAG?",
  options: { timeout: 30000 },
});
```

**Batch Processing Strategy**:

```bash
# Ingest a large directory and list each file as it is read
# (chunking and batching are not CLI flags)
rag-pipeline ingest ./large-docs --verbose
```

### **2. Memory Usage Issues**

**Problem**: High memory consumption or out-of-memory errors.

**Memory Optimization**:

There is no pipeline-level memory limit option. Bound memory with the
components you choose:

- `MemoryRetriever` keeps every vector in memory. It enforces `maxDocuments`
  (default 100000) and throws when full, or drops the oldest documents with
  `eviction: "fifo"`.
- `FileVectorStore` (the CLI's `file-store` retriever) persists the index to
  a JSON file; vectors that are mostly zero are stored sparsely.
- `EmbeddingReranker` caches document embeddings; limit it with `cacheSize`.

```javascript
const { MemoryRetriever } = require("@devilsdev/rag-pipeline-utils");

const retriever = new MemoryRetriever({
  maxDocuments: 50000,
  eviction: "fifo", // default "error"
});
```

**Memory Monitoring**:

```bash
# Check memory use and other performance diagnostics
rag-pipeline doctor --category performance

# Raise the Node.js heap limit for a large ingest
node --max-old-space-size=4096 \
  node_modules/@devilsdev/rag-pipeline-utils/bin/cli.js ingest ./large-dataset
```

### **3. Vector Store Performance**

**Problem**: Slow retrieval or indexing performance.

**Index Optimization**:

```bash
# Discard the index and rebuild it from source documents
rag-pipeline ingest ./docs --rebuild
```

---

## **Query & Retrieval Issues**

### **1. Poor Retrieval Quality**

**Problem**: Retrieved context not relevant to queries.

**Debugging Steps**:

```bash
# Print the answer, retrieved passages and citations as JSON
rag-pipeline query "your question" --json

# Retrieve more passages to inspect their scores
rag-pipeline query "test query" --top-k 10 --json
```

**Retrieval Tuning**:

- Retrieve more candidates with `--top-k` (CLI) or `options.topK` (library),
  then add a reranker (`{ "stage": "reranker", "name": "scoring" }` in
  `.ragrc.json`, or `EmbeddingReranker` / `CascadeReranker` in code).
- Drop low-scoring documents before generation with `RetrievalGuard`
  (`minRelevanceScore`), applied through `GuardrailsPipeline`.
- If you switch embedders, rebuild the index
  (`rag-pipeline ingest <path> --rebuild`): vectors from different embedders are not comparable, and
  `MemoryRetriever` / `FileVectorStore` reject query vectors whose dimension
  does not match the stored ones.
- With the `local` TF-IDF embedder, `rag-pipeline ai train embedding` refits
  it on your corpus and re-embeds the index.

### **2. LLM Generation Issues**

**Problem**: Generated responses are poor quality or inconsistent.

**Response Quality Debugging**:

The model and its parameters are set on the `llm` entry in `.ragrc.json`, not
as `query` flags. Change the entry, then compare answers:

```bash
rag-pipeline config show --section pipeline
rag-pipeline query "test" --json
```

**Prompt Engineering**:

```javascript no-run
const {
  createRagPipeline,
  OpenAIConnector,
} = require("@devilsdev/rag-pipeline-utils");

const llm = new OpenAIConnector({
  model: "gpt-4o-mini", // default
  systemPrompt:
    "You are a helpful assistant. Answer only from the reference data.",
  temperature: 0.3,
  maxTokens: 1500,
});

const pipeline = createRagPipeline({ embedder: llm, retriever, llm });
```

Since 2.5.0 the built-in connectors put retrieved context in the user message
as delimited, untrusted reference data, with a system prompt telling the model
to treat it as data. Answers may differ from earlier versions.

---

## **Evaluation & Testing Issues**

### **1. Evaluation Metric Failures**

**Problem**: Evaluation metrics returning unexpected values.

**Scores changed after upgrading to 2.5.0**: grounding metrics now measure
content-word coverage per sentence (scores for grounded answers are
noticeably higher), the default per-sentence threshold is `0.5` (was `0.3`),
and sentences whose numbers are not in the source are not grounded. Context
recall is only computed when you pass a `referenceAnswer`; without one it is
missing from `scores` and listed in `metadata.metricsSkipped`. See
[Evaluation](./Evaluation.md#how-grounding-is-measured-250).

**Metric Debugging**:

Evaluation runs through the library, not the CLI. Score a single pair to
isolate a metric:

```javascript
const { scoreAnswer } = require("@devilsdev/rag-pipeline-utils");

console.log(
  scoreAnswer("RAG retrieves context", "RAG retrieves context first"),
);
// { bleu: <number>, rouge: <number> }
```

**Data Format Validation**:

The package has no dataset validator. Check the fields your evaluation loop
reads before running it:

```javascript
const testData = [
  {
    id: "test-001",
    prompt: "What is RAG?",
    expected: "RAG stands for Retrieval-Augmented Generation...",
  },
];

const invalid = testData.filter(
  (c) => typeof c.prompt !== "string" || typeof c.expected !== "string",
);
if (invalid.length) {
  console.error(
    "Invalid test cases:",
    invalid.map((c) => c.id),
  );
}
```

`PipelineEvaluator.evaluate()` expects `{ query, answer, results }`, where
`results` is an array of `{ content }` documents.

### **2. Dashboard Connection Issues**

**Problem**: Generated dashboard is empty or missing data.

The CLI has no `dashboard` command. Dashboards are HTML files
produced by `DashboardGenerator.generate(snapshot)`; if one is empty, check
that metrics were recorded on the `MetricsAggregator` before calling
`getSnapshot()`. See [Evaluation](./Evaluation.md#dashboards).

---

## **CLI & Command Issues**

### **1. Command Not Found**

**Problem**: `rag-pipeline` command not recognized.

**Solutions**:

```bash
# Global installation
npm install -g @devilsdev/rag-pipeline-utils

# Use npx for a local installation
npx rag-pipeline --help

# Check PATH
echo $PATH | grep node_modules

# Reinstall CLI
npm uninstall -g @devilsdev/rag-pipeline-utils
npm install -g @devilsdev/rag-pipeline-utils
```

### **2. Permission Errors**

**Problem**: Permission denied when running CLI commands.

**Solutions**:

```bash
# Fix npm permissions
sudo chown -R $(whoami) ~/.npm

# Use a project-local install instead of a global one
npm install --save-dev @devilsdev/rag-pipeline-utils
npx rag-pipeline init
```

---

## **Logging & Debugging**

### **Enable Debug Logging**

```bash
# Extra output (for example, the files ingest reads)
rag-pipeline ingest ./docs --verbose

# Save output to a file
rag-pipeline query "test" --verbose > debug.log 2>&1
```

### **Custom Logging Configuration**

The library logs JSON lines through pino. Set the level with the `LOG_LEVEL`
environment variable (`trace`, `debug`, `info`, `warn`, `error`, `fatal`,
`silent`; default `info`, or `silent` when `NODE_ENV=test`):

```bash
LOG_LEVEL=debug node app.js > rag-pipeline.log
```

The `logger` export is the logging module. Use its `logger` instance, or
`createLogger(correlationId, context)` for a child logger that tags every
line:

```javascript
const { logger } = require("@devilsdev/rag-pipeline-utils");

logger.logger.info("Pipeline initialized", { stage: "startup" });

const requestLog = logger.createLogger("req-123", { tenant: "acme" });
requestLog.debug("Running query", { topK: 5 });
```

`createRagPipeline` does not take a logger option.

---

## **Recovery & Maintenance**

### **Reset Pipeline State**

```bash
# Reset configuration (overwrites .ragrc.json)
rag-pipeline init --no-interactive --force

# Discard the index and rebuild it from source documents
rag-pipeline ingest ./docs --rebuild
```

### **Backup & Restore**

The index is a JSON file (the `file-store` retriever's `config.path`,
`.rag/index.json` by default), so back it up by copying it:

```bash
# Back up the index
cp .rag/index.json index-backup-$(date +%Y%m%d).json

# Restore it
cp index-backup-20241201.json .rag/index.json

# Verify the config, plugins and environment
rag-pipeline doctor
```

---

## **Getting Help**

### **Built-in Diagnostics**

```bash
# Run comprehensive health check
rag-pipeline doctor

# Get the version
rag-pipeline --version

# Show system, configuration and component information
rag-pipeline info
```

### **Community Support**

- **GitHub Issues**: [Report bugs and feature requests](https://github.com/DevilsDev/rag-pipeline-utils/issues)
- **Discussions**: [GitHub Discussions](https://github.com/DevilsDev/rag-pipeline-utils/discussions)
- **Security issues**: report privately as described in [SECURITY.md](https://github.com/DevilsDev/rag-pipeline-utils/blob/main/SECURITY.md)

---

_This troubleshooting guide covers the most common issues encountered with @devilsdev/rag-pipeline-utils. For additional help, consult the [FAQ](./FAQ.md) or reach out to our community support channels._
