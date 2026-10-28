# Troubleshooting Guide

This comprehensive troubleshooting guide helps you diagnose and resolve common issues with **@DevilsDev/rag-pipeline-utils**. From installation problems to performance optimization, this guide provides step-by-step solutions and debugging strategies.

---

## **Installation & Setup Issues**

### **1. Package Installation Failures**

**Problem**: `npm install @DevilsDev/rag-pipeline-utils` fails with dependency errors.

**Solutions**:

```bash
# Clear npm cache
npm cache clean --force

# Use specific Node.js version (18+ required)
nvm use 18
npm install @DevilsDev/rag-pipeline-utils

# Install with legacy peer deps
npm install @DevilsDev/rag-pipeline-utils --legacy-peer-deps

# Force resolution of conflicting dependencies
npm install @DevilsDev/rag-pipeline-utils --force
```

**Common Dependency Conflicts**:

- **OpenAI SDK version mismatch**: Ensure OpenAI SDK v4+ is installed
- **Node.js version**: Requires Node.js 18+ for ES modules support
- **Python dependencies**: Some embedders require Python 3.8+ for native modules

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

```json
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
# Check environment variables
echo $OPENAI_API_KEY
echo $PINECONE_API_KEY

# Test environment loading
node -e "console.log(process.env.OPENAI_API_KEY)"

# Use dotenv for local development
npm install dotenv
echo "OPENAI_API_KEY=your-key-here" > .env
```

**Environment Variable Precedence**:

1. `config.apiKey` on the pipeline entry in `.ragrc.json`
2. Environment variables (`OPENAI_API_KEY`, `ANTHROPIC_API_KEY`,
   `COHERE_API_KEY`)

The CLI has no `--api-key` option. `rag-pipeline doctor --category
environment` reports missing keys for the configured providers.

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
// Enable plugin debugging
process.env.DEBUG = "rag-pipeline:plugins";

// Add logging to plugin
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

**Problem**: External API calls failing (OpenAI, Pinecone, etc.).

**OpenAI API Issues**:

```bash
# Test API connectivity
curl -H "Authorization: Bearer $OPENAI_API_KEY" \
  https://api.openai.com/v1/models

# Run a query with extra output (the model is set in .ragrc.json)
rag-pipeline query "test" --verbose
```

**Pinecone API Issues**:

```bash
# Test Pinecone connection
curl -H "Api-Key: $PINECONE_API_KEY" \
  https://controller.pinecone.io/databases

# Check API keys and whether the local index has been built
rag-pipeline doctor --category environment
```

**Common API Error Codes**:

- **401 Unauthorized**: Invalid API key
- **429 Rate Limited**: Too many requests
- **503 Service Unavailable**: API service down
- **400 Bad Request**: Invalid request format

---

## **Performance & Memory Issues**

### **1. Slow Embedding Generation**

**Problem**: Embedding generation taking too long or timing out.

**Performance Optimization**:

```javascript
// Enable parallel processing
const pipeline = createRagPipeline({
  embedder: {
    name: "openai",
    config: {
      batchSize: 100, // Process in batches
      maxConcurrency: 5, // Parallel requests
      timeout: 30000, // 30 second timeout
    },
  },
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

```javascript
// Enable streaming for large documents
const pipeline = createRagPipeline({
  streaming: true,
  memoryLimit: "2GB",
  chunkSize: 1000,
  batchSize: 10,
});

// Monitor memory usage
process.on("warning", (warning) => {
  console.warn("Memory warning:", warning);
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

```json
{
  "retriever": {
    "name": "pinecone",
    "config": {
      "topK": 5,
      "minScore": 0.75,
      "includeMetadata": true,
      "filter": {
        "category": "technical"
      }
    }
  }
}
```

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

```javascript
// Custom prompt template
const pipeline = createRagPipeline({
  llm: {
    name: "openai-gpt-4",
    config: {
      systemPrompt: `You are a helpful assistant. Use the provided context to answer questions accurately and concisely.`,
      temperature: 0.3,
      maxTokens: 1500,
    },
  },
});
```

---

## **Evaluation & Testing Issues**

### **1. Evaluation Metric Failures**

**Problem**: Evaluation metrics returning NaN or unexpected values.

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

```javascript
// Ensure proper test data format
const testData = [
  {
    id: "test-001",
    prompt: "What is RAG?",
    groundTruth: "RAG stands for Retrieval-Augmented Generation...",
    category: "definition",
  },
];

// Validate before evaluation
import { validateDataset } from "@DevilsDev/rag-pipeline-utils";
const validation = await validateDataset(testData);
if (!validation.isValid) {
  console.error("Invalid test data:", validation.errors);
}
```

### **2. Dashboard Connection Issues**

**Problem**: Generated dashboard is empty or missing data.

The CLI has no `dashboard` command. Dashboards are HTML files
produced by `DashboardGenerator.generate(snapshot)`; if one is empty, check
that metrics were recorded on the `MetricsAggregator` before calling
`getSnapshot()`. See [Evaluation](./Evaluation.md#dashboard-visualization).

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

```javascript
import { createLogger } from "@DevilsDev/rag-pipeline-utils";

const logger = createLogger({
  level: "debug",
  format: "json",
  transports: [
    { type: "console" },
    { type: "file", filename: "rag-pipeline.log" },
  ],
});

// Use custom logger
const pipeline = createRagPipeline({
  logger,
  logLevel: "debug",
});
```

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
- **Documentation**: [Complete documentation](https://docs.rag-pipeline-utils.dev)
- **Discord**: [Join our community](https://discord.gg/rag-pipeline-utils)
- **Stack Overflow**: Tag questions with `rag-pipeline-utils`

### **Professional Support**

For enterprise support and consulting:

- **Email**: support@devilsdev.com
- **Enterprise Portal**: [enterprise.rag-pipeline-utils.dev](https://enterprise.rag-pipeline-utils.dev)

---

_This troubleshooting guide covers the most common issues encountered with @DevilsDev/rag-pipeline-utils. For additional help, consult the [FAQ](./FAQ.md) or reach out to our community support channels._
