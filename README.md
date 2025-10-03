# @devilsdev/rag-pipeline-utils

[![CI](https://github.com/DevilsDev/rag-pipeline-utils/actions/workflows/ci.yml/badge.svg)](https://github.com/DevilsDev/rag-pipeline-utils/actions)
[![npm version](https://badge.fury.io/js/%40devilsdev%2Frag-pipeline-utils.svg)](https://badge.fury.io/js/%40devilsdev%2Frag-pipeline-utils)
[![Node.js Version](https://img.shields.io/node/v/@devilsdev/rag-pipeline-utils.svg)](https://nodejs.org/)
[![License](https://img.shields.io/npm/l/@devilsdev/rag-pipeline-utils.svg)](https://github.com/DevilsDev/rag-pipeline-utils/blob/main/LICENSE)
[![Downloads](https://img.shields.io/npm/dm/@devilsdev/rag-pipeline-utils.svg)](https://www.npmjs.com/package/@devilsdev/rag-pipeline-utils)

Enterprise-grade toolkit for building Retrieval-Augmented Generation (RAG) pipelines in Node.js with modular plugin architecture, streaming support, and observability.

## Installation

```bash
npm install @devilsdev/rag-pipeline-utils
```

**Requirements:** Node.js >= 18.0.0

## Quick Start

### Basic Pipeline

```javascript
const { createRagPipeline } = require("@devilsdev/rag-pipeline-utils");

// Initialize pipeline with plugins
const pipeline = createRagPipeline({
  loader: new PDFLoader(),
  embedder: new OpenAIEmbedder({
    apiKey: process.env.OPENAI_API_KEY,
    model: "text-embedding-ada-002",
  }),
  retriever: new ChromaRetriever({
    url: "http://localhost:8000",
    collection: "documents",
  }),
  llm: new OpenAILLM({
    apiKey: process.env.OPENAI_API_KEY,
    model: "gpt-4",
  }),
});

// Ingest documents
await pipeline.ingest("./documents/whitepaper.pdf");

// Query
const result = await pipeline.query("What is the main conclusion?");
console.log(result.answer);
```

### Streaming Responses

```javascript
// Stream tokens in real-time
const stream = await pipeline.query("Explain the methodology", {
  stream: true,
});

for await (const chunk of stream) {
  process.stdout.write(chunk);
}
```

### Batch Processing

```javascript
// Process multiple documents concurrently
const results = await pipeline.ingestBatch(
  ["./docs/paper1.pdf", "./docs/paper2.pdf", "./docs/paper3.pdf"],
  {
    parallel: true,
    maxConcurrency: 5,
  },
);
```

## Core API

### createRagPipeline(config)

Creates a pipeline instance with the specified plugins.

**Parameters:**

- `config.loader` - Document loader plugin
- `config.embedder` - Text embedding plugin
- `config.retriever` - Vector storage and retrieval plugin
- `config.llm` - Language model plugin
- `config.reranker` (optional) - Result reranking plugin

**Returns:** Pipeline instance

### Pipeline Methods

#### `pipeline.ingest(filePath, options)`

Ingest a document into the pipeline.

```javascript
await pipeline.ingest("./document.pdf", {
  chunkSize: 1000,
  chunkOverlap: 200,
  metadata: { source: "research", year: 2024 },
});
```

#### `pipeline.query(question, options)`

Query the pipeline.

```javascript
const result = await pipeline.query("What is RAG?", {
  topK: 5,
  similarityThreshold: 0.7,
  stream: false,
});
```

**Result structure:**

```javascript
{
  answer: string,
  sources: Array<{
    content: string,
    metadata: object,
    score: number
  }>,
  metrics: {
    retrievalTime: number,
    generationTime: number,
    totalTime: number
  }
}
```

#### `pipeline.ingestBatch(files, options)`

Batch ingest multiple documents.

```javascript
await pipeline.ingestBatch(["file1.pdf", "file2.pdf"], {
  parallel: true,
  maxConcurrency: 3,
});
```

## Plugin System

### Plugin Contracts

All plugins implement standardized interfaces for interoperability.

#### Loader Plugin

```javascript
class CustomLoader {
  async load(filePath) {
    // Return array of document chunks
    return [{ content: string, metadata: object }];
  }
}
```

#### Embedder Plugin

```javascript
class CustomEmbedder {
  async embed(texts) {
    // Return array of vectors
    return [[0.1, 0.2, ...], [0.3, 0.4, ...]];
  }

  async embedQuery(query) {
    // Return single vector
    return [0.5, 0.6, ...];
  }

  getDimensions() {
    return 1536; // Vector dimensions
  }
}
```

#### Retriever Plugin

```javascript
class CustomRetriever {
  async store(vectors, metadata) {
    // Store vectors with metadata
  }

  async retrieve(queryVector, options = {}) {
    const { topK = 5, threshold = 0.7 } = options;
    // Return similar documents
    return [{ content: string, metadata: object, score: number }];
  }
}
```

#### LLM Plugin

```javascript
class CustomLLM {
  async generate(prompt, options = {}) {
    // Return generated text
    return { text: string, usage: object };
  }

  async stream(prompt, options = {}) {
    // Return async iterable
    async function* generate() {
      yield chunk1;
      yield chunk2;
    }
    return generate();
  }
}
```

#### Reranker Plugin (Optional)

```javascript
class CustomReranker {
  async rerank(query, documents, options = {}) {
    // Return reranked documents
    return documents.map((doc) => ({
      ...doc,
      score: newScore,
    }));
  }
}
```

## Configuration

### Environment Variables

```bash
# OpenAI
OPENAI_API_KEY=sk-...
OPENAI_MODEL=gpt-4

# Pinecone
PINECONE_API_KEY=...
PINECONE_ENVIRONMENT=us-east-1

# ChromaDB
CHROMA_URL=http://localhost:8000

# Performance
RAG_MAX_CONCURRENCY=5
RAG_BATCH_SIZE=10
```

### Configuration File

Create `.ragrc.json`:

```json
{
  "loader": {
    "pdf": "@devilsdev/pdf-loader",
    "markdown": "@devilsdev/markdown-loader"
  },
  "embedder": {
    "openai": "@devilsdev/openai-embedder"
  },
  "retriever": {
    "chroma": "@devilsdev/chroma-retriever"
  },
  "llm": {
    "openai": "@devilsdev/openai-llm"
  },
  "pipeline": {
    "loader": "pdf",
    "embedder": "openai",
    "retriever": "chroma",
    "llm": "openai"
  },
  "performance": {
    "maxConcurrency": 5,
    "enableStreaming": true
  }
}
```

Load configuration:

```javascript
const { loadConfig } = require("@devilsdev/rag-pipeline-utils");
const config = await loadConfig(".ragrc.json");
```

## Advanced Usage

### Custom Pipeline Components

```javascript
const {
  createRagPipeline,
  pluginRegistry,
} = require("@devilsdev/rag-pipeline-utils");

// Register custom plugin
pluginRegistry.register("my-embedder", MyCustomEmbedder);

// Use in pipeline
const pipeline = createRagPipeline({
  loader: new PDFLoader(),
  embedder: pluginRegistry.get("my-embedder"),
  retriever: new ChromaRetriever({ url: "http://localhost:8000" }),
  llm: new OpenAILLM({ model: "gpt-4" }),
});
```

### DAG Workflows

Build complex multi-step pipelines using the DAG engine:

```javascript
const { DAGEngine } = require("@devilsdev/rag-pipeline-utils");

const dag = new DAGEngine({
  nodes: [
    {
      id: "load",
      type: "loader",
      config: { source: "./docs" },
    },
    {
      id: "embed",
      type: "embedder",
      dependencies: ["load"],
      config: { model: "text-embedding-ada-002" },
    },
    {
      id: "store",
      type: "retriever",
      dependencies: ["embed"],
      config: { collection: "documents" },
    },
  ],
});

await dag.execute();
```

### Observability

Enable monitoring and tracing:

```javascript
const { eventLogger, metrics } = require("@devilsdev/rag-pipeline-utils");

// Configure logging
eventLogger.configure({
  level: "info",
  format: "json",
});

// Access metrics
const pipelineMetrics = metrics.getMetrics();
console.log(pipelineMetrics.queries.total);
console.log(pipelineMetrics.queries.avgLatency);
```

### Error Handling

```javascript
try {
  const result = await pipeline.query("What is AI?");
} catch (error) {
  if (error.code === "RETRIEVAL_ERROR") {
    console.error("Vector search failed:", error.message);
  } else if (error.code === "LLM_ERROR") {
    console.error("Generation failed:", error.message);
  }
}
```

## CLI Usage

The package includes a CLI for common operations:

```bash
# Initialize configuration
npx rag-pipeline init

# Ingest documents
npx rag-pipeline ingest ./docs --loader pdf

# Query interactively
npx rag-pipeline query "Your question here"

# Run health check
npx rag-pipeline doctor
```

## Use Cases

### Document Q&A Systems

Build question-answering systems over proprietary documents:

```javascript
const pipeline = createRagPipeline({
  /* config */
});

// Ingest company documentation
await pipeline.ingestBatch([
  "./docs/handbook.pdf",
  "./docs/policies.pdf",
  "./docs/procedures.pdf",
]);

// Answer questions
const answer = await pipeline.query("What is the vacation policy?");
```

### Semantic Search

Implement semantic search over large document collections:

```javascript
const results = await pipeline.query("machine learning papers", {
  topK: 10,
  similarityThreshold: 0.75,
  returnSources: true,
});

results.sources.forEach((source) => {
  console.log(`${source.metadata.title} (score: ${source.score})`);
});
```

### Knowledge Base Integration

Integrate with existing knowledge bases:

```javascript
// Custom retriever for your database
class PostgresRetriever {
  constructor(connectionString) {
    this.db = new PostgresClient(connectionString);
  }

  async store(vectors, metadata) {
    await this.db.query(
      "INSERT INTO embeddings (vector, metadata) VALUES ($1, $2)",
      [vectors, metadata],
    );
  }

  async retrieve(queryVector, options) {
    const results = await this.db.query(
      "SELECT * FROM embeddings ORDER BY vector <-> $1 LIMIT $2",
      [queryVector, options.topK],
    );
    return results.rows;
  }
}

const pipeline = createRagPipeline({
  loader: new PDFLoader(),
  embedder: new OpenAIEmbedder({ apiKey: process.env.OPENAI_API_KEY }),
  retriever: new PostgresRetriever("postgresql://localhost/kb"),
  llm: new OpenAILLM({ model: "gpt-4" }),
});
```

### Multi-Source Aggregation

Combine data from multiple sources:

```javascript
const sources = [
  { type: "pdf", path: "./research/*.pdf" },
  { type: "markdown", path: "./docs/*.md" },
  { type: "api", url: "https://api.example.com/docs" },
];

for (const source of sources) {
  const loader = getLoaderForType(source.type);
  await pipeline.ingest(source.path || source.url, {
    loader,
    metadata: { source: source.type },
  });
}
```

## Performance Optimization

### Chunking Strategies

```javascript
await pipeline.ingest("./large-document.pdf", {
  chunkSize: 1000, // Characters per chunk
  chunkOverlap: 200, // Overlap between chunks
  chunkStrategy: "sentence", // 'sentence' | 'paragraph' | 'fixed'
});
```

### Concurrent Processing

```javascript
await pipeline.ingestBatch(files, {
  parallel: true,
  maxConcurrency: 5, // Parallel operations
  batchSize: 10, // Embeddings per batch
});
```

### Caching

```javascript
const pipeline = createRagPipeline({
  loader: new PDFLoader(),
  embedder: new OpenAIEmbedder({
    apiKey: process.env.OPENAI_API_KEY,
    cache: true, // Cache embeddings
    cacheTTL: 3600, // Cache lifetime in seconds
  }),
  retriever: new ChromaRetriever({ url: "http://localhost:8000" }),
  llm: new OpenAILLM({ model: "gpt-4" }),
});
```

## TypeScript Support

Full TypeScript definitions included:

```typescript
import {
  createRagPipeline,
  Pipeline,
  LoaderPlugin,
  EmbedderPlugin,
  RetrieverPlugin,
  LLMPlugin,
} from "@devilsdev/rag-pipeline-utils";

const pipeline: Pipeline = createRagPipeline({
  loader: new PDFLoader(),
  embedder: new OpenAIEmbedder({ apiKey: string }),
  retriever: new ChromaRetriever({ url: string }),
  llm: new OpenAILLM({ model: string }),
});

interface QueryResult {
  answer: string;
  sources: Source[];
  metrics: Metrics;
}

const result: QueryResult = await pipeline.query("question");
```

## API Reference

### Exported Modules

```javascript
const {
  // Core
  createRagPipeline,
  loadConfig,

  // Plugin System
  pluginRegistry,

  // Workflow Engine
  DAGEngine,

  // Observability
  eventLogger,
  metrics,

  // Utilities
  logger,
} = require("@devilsdev/rag-pipeline-utils");
```

### Plugin Registry API

```javascript
// Register plugin
pluginRegistry.register("name", PluginClass);

// Get plugin
const Plugin = pluginRegistry.get("name");

// List plugins
const plugins = pluginRegistry.list();

// Check if plugin exists
const exists = pluginRegistry.has("name");
```

## Troubleshooting

### Common Issues

**Error: Module not found**

```bash
npm install --save @devilsdev/rag-pipeline-utils
```

**Error: Invalid API key**

```javascript
// Ensure environment variables are set
require("dotenv").config();
const embedder = new OpenAIEmbedder({
  apiKey: process.env.OPENAI_API_KEY,
});
```

**Error: Connection refused (ChromaDB)**

```bash
# Start ChromaDB server
docker run -p 8000:8000 chromadb/chroma
```

### Debug Mode

Enable verbose logging:

```javascript
const { logger } = require("@devilsdev/rag-pipeline-utils");

logger.setLevel("debug");
```

## Examples

See the [examples directory](https://github.com/DevilsDev/rag-pipeline-utils/tree/main/examples) for complete working examples:

- Basic RAG pipeline
- Streaming responses
- Custom plugins
- DAG workflows
- Multi-source ingestion

## Contributing

Contributions welcome. Please read the [contribution guidelines](https://github.com/DevilsDev/rag-pipeline-utils/blob/main/docs/CONTRIBUTING.md) and [plugin developer guide](https://github.com/DevilsDev/rag-pipeline-utils/blob/main/docs/PLUGIN_DEVELOPER_GUIDE.md).

## License

GPL-3.0 - See [LICENSE](https://github.com/DevilsDev/rag-pipeline-utils/blob/main/LICENSE) for details.

## Support

- Documentation: https://devilsdev.github.io/rag-pipeline-utils/
- Issues: https://github.com/DevilsDev/rag-pipeline-utils/issues
- Discussions: https://github.com/DevilsDev/rag-pipeline-utils/discussionsDo
