# @devilsdev/rag-pipeline-utils

[![CI](https://github.com/DevilsDev/rag-pipeline-utils/actions/workflows/ci.yml/badge.svg)](https://github.com/DevilsDev/rag-pipeline-utils/actions)
[![npm version](https://badge.fury.io/js/%40devilsdev%2Frag-pipeline-utils.svg)](https://badge.fury.io/js/%40devilsdev%2Frag-pipeline-utils)
[![Node.js Version](https://img.shields.io/node/v/@devilsdev/rag-pipeline-utils.svg)](https://nodejs.org/)
[![License](https://img.shields.io/npm/l/@devilsdev/rag-pipeline-utils.svg)](https://github.com/DevilsDev/rag-pipeline-utils/blob/main/LICENSE)
[![Downloads](https://img.shields.io/npm/dm/@devilsdev/rag-pipeline-utils.svg)](https://www.npmjs.com/package/@devilsdev/rag-pipeline-utils)

Enterprise-grade toolkit for building Retrieval-Augmented Generation (RAG) pipelines in Node.js with modular plugin architecture, streaming support, and observability.

## 🎉 What's New in v2.2.0

### Major Improvements

**✅ Fixed ESM Build (Critical)**

- Implemented CJS→ESM interop pattern for proper module compatibility
- All 15 exports now working correctly in both CommonJS and ES Modules
- Verified compatibility with Node.js 18.x, 20.x, and 22.x

**📦 50% Smaller Install Size**

- Reduced from ~30MB to ~15MB by optimizing dependencies
- Moved CLI-only tools to devDependencies
- Zero production vulnerabilities (npm audit clean)

**📝 Enhanced TypeScript Support**

- Added 5 complete plugin contract interfaces:
  - `LoaderPlugin` - Document loading interface
  - `EmbedderPlugin` - Text embedding interface
  - `RetrieverPlugin` - Vector search interface
  - `LLMPlugin` - Language model interface
  - `RerankerPlugin` - Result reranking interface
- Added 4 helper types: `Document`, `SearchResult`, `RetrieveOptions`, `LLMResponse`
- 236 lines of comprehensive type definitions
- Full IDE autocomplete and type checking support

**🔧 Real-World Example**

- Complete OpenAI + Pinecone integration example in `examples/openai-pinecone/`
- Mock mode for testing without API keys
- Production-ready error handling and cost estimation guidance
- See [OpenAI + Pinecone Example](#openai--pinecone-example) below

**📚 Documentation Enhancements**

- Platform compatibility matrix (Linux, macOS, Windows, Docker)
- Module system examples (CommonJS + ES Modules)
- Docker usage examples
- Troubleshooting guides

### Migration from v2.1.x

**No breaking changes!** v2.2.0 is fully backward compatible. Simply update:

```bash
npm install @devilsdev/rag-pipeline-utils@latest
```

All existing code will continue to work without modifications.

---

## Installation

```bash
npm install @devilsdev/rag-pipeline-utils
```

**Requirements:** Node.js >= 18.0.0

## Compatibility

### Platform Support

| Platform    | Status             | Notes                                                         |
| ----------- | ------------------ | ------------------------------------------------------------- |
| **Linux**   | ✅ Fully Supported | Tested on Ubuntu 20.04+, Debian 11+, RHEL 8+                  |
| **macOS**   | ✅ Fully Supported | Tested on macOS 12+ (Intel & Apple Silicon)                   |
| **Windows** | ✅ Fully Supported | Tested on Windows 10/11, WSL2 recommended for best experience |
| **Docker**  | ✅ Fully Supported | Alpine & Debian-based images available                        |

### Module Systems

This package supports both CommonJS and ES Modules:

**CommonJS (require)**

```javascript
const {
  createRagPipeline,
  DAGEngine,
} = require("@devilsdev/rag-pipeline-utils");

const pipeline = createRagPipeline({
  /* config */
});
const dag = new DAGEngine();
```

**ES Modules (import)**

```javascript
import { createRagPipeline, DAGEngine } from "@devilsdev/rag-pipeline-utils";

const pipeline = createRagPipeline({
  /* config */
});
const dag = new DAGEngine();
```

### TypeScript Support

**New in v2.2.0:** Complete plugin contract interfaces with 236 lines of type definitions:

```typescript
import {
  createRagPipeline,
  DAGEngine,
  RagPipelineConfig,
  // Plugin contract interfaces (NEW in v2.2.0)
  LoaderPlugin,
  EmbedderPlugin,
  RetrieverPlugin,
  LLMPlugin,
  RerankerPlugin,
  // Helper types (NEW in v2.2.0)
  Document,
  SearchResult,
  RetrieveOptions,
  LLMResponse,
} from "@devilsdev/rag-pipeline-utils";

// Type-safe plugin implementation
class MyLoader implements LoaderPlugin {
  async load(source: string, options?: any): Promise<Document[]> {
    // Your implementation with full type checking
    return [
      {
        id: "doc-1",
        content: "Document content",
        metadata: { source },
      },
    ];
  }
}

const config: RagPipelineConfig = {
  loader: new MyLoader(),
  embedder: "my-embedder",
};

const pipeline = createRagPipeline(config);
```

### Package Size & Dependencies

- **Package size**: 244KB (gzipped), 1.1MB (unpacked)
- **Runtime dependencies**: Only 11 production dependencies
- **Total install size**: ~15MB (including dependencies) - **50% smaller than v2.1.x**
- **Tree-shakeable**: ES module exports support tree-shaking
- **Zero vulnerabilities**: npm audit clean (production dependencies)

### Docker Usage

**Basic Docker setup:**

```dockerfile
FROM node:18-alpine

WORKDIR /app
COPY package*.json ./
RUN npm ci --production
COPY . .

CMD ["node", "index.js"]
```

**Docker Compose example:**

```yaml
version: "3.8"
services:
  rag-pipeline:
    image: node:18-alpine
    working_dir: /app
    volumes:
      - ./:/app
    environment:
      - NODE_ENV=production
    command: npm start
```

## Quick Start

### Basic Pipeline Setup

```javascript
const { createRagPipeline } = require("@devilsdev/rag-pipeline-utils");

// Create pipeline with your plugin implementations
const pipeline = createRagPipeline({
  loader: yourLoaderPlugin,
  embedder: yourEmbedderPlugin,
  retriever: yourRetrieverPlugin,
  llm: yourLLMPlugin,
});

// Use the pipeline
await pipeline.ingest("./document.pdf");
const result = await pipeline.query("What is this document about?");
console.log(result);
```

### Using Configuration File

Create `.ragrc.json`:

```json
{
  "loader": {
    "pdf": "your-pdf-loader-plugin"
  },
  "embedder": {
    "default": "your-embedder-plugin"
  },
  "retriever": {
    "default": "your-vector-db-plugin"
  },
  "llm": {
    "default": "your-llm-plugin"
  }
}
```

Load and use configuration:

```javascript
const {
  loadConfig,
  createRagPipeline,
} = require("@devilsdev/rag-pipeline-utils");

const config = await loadConfig(".ragrc.json");
const pipeline = createRagPipeline(config);
```

## Core API

### Exported Modules

```javascript
const {
  // Core pipeline
  createRagPipeline,

  // Configuration
  loadConfig,
  validateRagrc,
  normalizeConfig,

  // Plugin system
  pluginRegistry,

  // DAG workflow engine
  DAGEngine,

  // Observability
  eventLogger,
  metrics,

  // Performance
  ParallelProcessor,

  // AI/ML
  MultiModalProcessor,
  AdaptiveRetrievalEngine,

  // Enterprise
  AuditLogger,
  DataGovernance,

  // Utilities
  logger,
} = require("@devilsdev/rag-pipeline-utils");
```

### createRagPipeline(config)

Creates a RAG pipeline instance.

**Parameters:**

- `config.loader` - Document loader plugin
- `config.embedder` - Text embedding plugin
- `config.retriever` - Vector storage and retrieval plugin
- `config.llm` - Language model plugin
- `config.reranker` (optional) - Result reranking plugin

**Returns:** Pipeline instance with `ingest()` and `query()` methods

### Configuration Management

```javascript
// Load configuration from file
const config = await loadConfig(".ragrc.json");

// Validate configuration
const isValid = validateRagrc(config);

// Normalize configuration
const normalized = normalizeConfig(config);
```

### Plugin Registry

```javascript
const { pluginRegistry } = require("@devilsdev/rag-pipeline-utils");

// Register a plugin
pluginRegistry.register("my-plugin", MyPluginClass);

// Get a plugin
const Plugin = pluginRegistry.get("my-plugin");

// List all plugins
const plugins = pluginRegistry.list();

// Check if plugin exists
const exists = pluginRegistry.has("my-plugin");
```

### DAG Workflow Engine

Build complex multi-step workflows:

```javascript
const { DAGEngine } = require("@devilsdev/rag-pipeline-utils");

const dag = new DAGEngine({
  nodes: [
    {
      id: "load",
      type: "loader",
      config: {
        /* loader config */
      },
    },
    {
      id: "embed",
      type: "embedder",
      dependencies: ["load"],
      config: {
        /* embedder config */
      },
    },
    {
      id: "store",
      type: "retriever",
      dependencies: ["embed"],
      config: {
        /* retriever config */
      },
    },
  ],
});

await dag.execute();
```

### Observability

```javascript
const { eventLogger, metrics } = require("@devilsdev/rag-pipeline-utils");

// Configure event logging
eventLogger.configure({
  level: "info",
  format: "json",
});

// Log events
eventLogger.log("info", "Pipeline started", { pipelineId: "abc123" });

// Access metrics
const pipelineMetrics = metrics.getMetrics();
console.log(pipelineMetrics);
```

### Parallel Processing

```javascript
const { ParallelProcessor } = require("@devilsdev/rag-pipeline-utils");

const processor = new ParallelProcessor({
  maxConcurrency: 5,
});

await processor.process(items, async (item) => {
  // Process each item
  return processItem(item);
});
```

## Plugin Development

This package provides a plugin-based architecture. You need to implement plugins for your specific use case.

### Plugin Contracts

**New in v2.2.0:** TypeScript interfaces for all plugin contracts. See [TypeScript Support](#typescript-support) for full type definitions.

#### Loader Plugin

```javascript
/**
 * Loader plugin interface (NEW TypeScript interface in v2.2.0)
 * Implements: LoaderPlugin
 */
class MyLoader {
  async load(source, options) {
    // Load and parse document
    // Return array of Document objects
    return [
      {
        id: "doc-1",
        content: "Document text...",
        metadata: { page: 1, source },
        // embedding: optional pre-computed embedding
      },
    ];
  }
}
```

#### Embedder Plugin

```javascript
/**
 * Embedder plugin interface (NEW TypeScript interface in v2.2.0)
 * Implements: EmbedderPlugin
 */
class MyEmbedder {
  async embed(text, options) {
    // Generate embedding for a single text string
    // Return: Promise<number[]> - embedding vector
    return [0.1, 0.2, 0.3 /* ... 1536 dimensions for OpenAI */];
  }

  // Optional batch embedding method
  async embedBatch(texts) {
    // Generate embeddings for multiple texts
    return texts.map((text) => this.embed(text));
  }
}
```

#### Retriever Plugin

```javascript
/**
 * Retriever plugin interface (NEW TypeScript interface in v2.2.0)
 * Implements: RetrieverPlugin
 */
class MyRetriever {
  async retrieve(query, options) {
    // query can be:
    // - string: search by text
    // - { embedding: number[] }: search by vector
    const { topK = 5, minScore = 0.7, filter } = options || {};

    // Search for similar vectors
    // Return: Promise<SearchResult[]>
    return [
      {
        id: "result-1",
        score: 0.95,
        document: {
          id: "doc-1",
          content: "Document text...",
          metadata: { source: "file.pdf" },
        },
        metadata: {
          /* additional search metadata */
        },
      },
    ];
  }
}
```

#### LLM Plugin

```javascript
/**
 * LLM plugin interface (NEW TypeScript interface in v2.2.0)
 * Implements: LLMPlugin
 */
class MyLLM {
  async generate(prompt, options) {
    // Generate text from prompt
    // Return: Promise<LLMResponse>
    return {
      text: "Generated response...",
      usage: {
        promptTokens: 100,
        completionTokens: 50,
        totalTokens: 150,
      },
      metadata: {
        model: "gpt-4",
        finishReason: "stop",
      },
    };
  }

  // Optional streaming support
  async *stream(prompt, options) {
    // Stream response chunks
    yield "Generated ";
    yield "response ";
    yield "chunks...";
  }
}
```

#### Reranker Plugin (Optional)

```javascript
/**
 * Reranker plugin interface (NEW TypeScript interface in v2.2.0)
 * Implements: RerankerPlugin
 */
class MyReranker {
  async rerank(results, query, options) {
    // Rerank search results based on relevance to query
    // Return: Promise<SearchResult[]> - reranked results
    return results
      .map((result) => ({
        ...result,
        score: calculateRelevanceScore(query, result),
      }))
      .sort((a, b) => b.score - a.score);
  }
}
```

## Environment Configuration

```bash
# Example environment variables for your plugins
OPENAI_API_KEY=your_api_key
PINECONE_API_KEY=your_api_key
PINECONE_ENVIRONMENT=us-east-1
CHROMA_URL=http://localhost:8000

# Performance settings
RAG_MAX_CONCURRENCY=5
RAG_BATCH_SIZE=10
```

## Advanced Features

### Multi-Modal Processing

```javascript
const { MultiModalProcessor } = require("@devilsdev/rag-pipeline-utils");

const processor = new MultiModalProcessor({
  // Configuration for processing text, images, audio, etc.
});

await processor.process(multiModalData);
```

### Adaptive Retrieval

```javascript
const { AdaptiveRetrievalEngine } = require("@devilsdev/rag-pipeline-utils");

const retriever = new AdaptiveRetrievalEngine({
  // Configuration for adaptive retrieval strategies
});

const results = await retriever.retrieve(query, context);
```

### Enterprise Audit Logging

```javascript
const { AuditLogger } = require("@devilsdev/rag-pipeline-utils");

const auditLogger = new AuditLogger({
  destination: "./audit-logs",
});

auditLogger.log("query", {
  user: "user@example.com",
  query: "sensitive query",
  timestamp: new Date(),
});
```

### Data Governance

```javascript
const { DataGovernance } = require("@devilsdev/rag-pipeline-utils");

const governance = new DataGovernance({
  policies: {
    retention: "90d",
    encryption: true,
  },
});

await governance.enforce(data);
```

## CLI Usage

The package includes a CLI tool for pipeline operations:

```bash
# Initialize configuration
npx rag-pipeline init

# Run pipeline operations (requires plugin implementation)
npx rag-pipeline ingest ./documents
npx rag-pipeline query "Your question"

# Run system diagnostics
npx rag-pipeline doctor
```

## Error Handling

```javascript
try {
  const result = await pipeline.query("What is AI?");
} catch (error) {
  if (error.code === "PLUGIN_NOT_FOUND") {
    console.error("Required plugin not found:", error.message);
  } else if (error.code === "INVALID_CONFIG") {
    console.error("Invalid configuration:", error.message);
  } else {
    console.error("Pipeline error:", error.message);
  }
}
```

## Use Cases

### Document Q&A System

```javascript
// Implement your plugins
const loader = new PDFLoaderPlugin();
const embedder = new OpenAIEmbedderPlugin({
  apiKey: process.env.OPENAI_API_KEY,
});
const retriever = new ChromaRetrieverPlugin({ url: "http://localhost:8000" });
const llm = new OpenAILLMPlugin({ model: "gpt-4" });

// Create pipeline
const pipeline = createRagPipeline({
  loader,
  embedder,
  retriever,
  llm,
});

// Ingest documents
await pipeline.ingest("./company-handbook.pdf");

// Query
const answer = await pipeline.query("What is the vacation policy?");
console.log(answer);
```

### Knowledge Base Search

```javascript
// Use your custom database retriever
class PostgresRetriever {
  constructor(connectionString) {
    this.db = new PostgresClient(connectionString);
  }

  async retrieve(queryVector, options) {
    const results = await this.db.query(
      "SELECT content, metadata, vector <-> $1 as score FROM embeddings ORDER BY score LIMIT $2",
      [queryVector, options.topK],
    );
    return results.rows;
  }
}

const pipeline = createRagPipeline({
  loader: yourLoader,
  embedder: yourEmbedder,
  retriever: new PostgresRetriever("postgresql://localhost/kb"),
  llm: yourLLM,
});
```

## Performance Tips

### Batch Processing

```javascript
const { ParallelProcessor } = require("@devilsdev/rag-pipeline-utils");

const processor = new ParallelProcessor({
  maxConcurrency: 5,
  batchSize: 10,
});

// Process documents in parallel
await processor.process(documents, async (doc) => {
  return await pipeline.ingest(doc);
});
```

### Logging and Monitoring

```javascript
const { logger, metrics } = require("@devilsdev/rag-pipeline-utils");

// Set log level
logger.setLevel("debug");

// Monitor performance
const stats = metrics.getMetrics();
console.log("Total queries:", stats.queries?.total || 0);
console.log("Average latency:", stats.queries?.avgLatency || 0);
```

## Common Integration Examples

### OpenAI + Pinecone Example

**New in v2.2.0:** Complete working example with OpenAI embeddings and Pinecone vector database.

See the full example in [`examples/openai-pinecone/`](examples/openai-pinecone/) with:

- ✅ Complete plugin implementations
- ✅ Mock mode (no API keys required for testing)
- ✅ Real OpenAI integration
- ✅ Real Pinecone integration
- ✅ Error handling and cost estimation
- ✅ Comprehensive documentation

**Quick start:**

```bash
cd examples/openai-pinecone
npm install

# Test with mock mode (no API keys needed)
USE_MOCK_MODE=true npm start

# Run with real APIs (requires API keys in .env)
npm start
```

### With OpenAI

You need to implement OpenAI plugin wrappers:

```javascript
class OpenAIEmbedder {
  constructor({ apiKey, model = "text-embedding-ada-002" }) {
    this.client = new OpenAI({ apiKey });
    this.model = model;
  }

  async embed(texts) {
    const response = await this.client.embeddings.create({
      model: this.model,
      input: texts,
    });
    return response.data.map((d) => d.embedding);
  }
}

class OpenAILLM {
  constructor({ apiKey, model = "gpt-4" }) {
    this.client = new OpenAI({ apiKey });
    this.model = model;
  }

  async generate(prompt) {
    const response = await this.client.chat.completions.create({
      model: this.model,
      messages: [{ role: "user", content: prompt }],
    });
    return { text: response.choices[0].message.content };
  }
}
```

### With ChromaDB

```javascript
class ChromaRetriever {
  constructor({ url, collection }) {
    this.client = new ChromaClient({ path: url });
    this.collectionName = collection;
  }

  async store(vectors, metadata) {
    const collection = await this.client.getOrCreateCollection({
      name: this.collectionName,
    });

    await collection.add({
      embeddings: vectors,
      metadatas: metadata,
      ids: metadata.map((_, i) => `doc_${i}`),
    });
  }

  async retrieve(queryVector, options) {
    const collection = await this.client.getCollection({
      name: this.collectionName,
    });

    const results = await collection.query({
      queryEmbeddings: [queryVector],
      nResults: options.topK || 5,
    });

    return results.metadatas[0].map((meta, i) => ({
      content: results.documents[0][i],
      metadata: meta,
      score: 1 - results.distances[0][i],
    }));
  }
}
```

## Troubleshooting

### Common Issues

**Error: Cannot find module**

```bash
npm install @devilsdev/rag-pipeline-utils
```

**Error: Plugin not registered**

```javascript
// Make sure to register your plugins
pluginRegistry.register("my-embedder", MyEmbedderClass);
```

**Error: Invalid configuration**

```javascript
// Validate your configuration
const { validateRagrc } = require("@devilsdev/rag-pipeline-utils");
const isValid = validateRagrc(config);
if (!isValid) {
  console.error("Configuration is invalid");
}
```

### Debug Mode

```javascript
const { logger } = require("@devilsdev/rag-pipeline-utils");

// Enable debug logging
logger.setLevel("debug");
```

## Examples

### Real-World Integration Examples

**[OpenAI + Pinecone Example](examples/openai-pinecone/)** (NEW in v2.2.0)

- Complete RAG pipeline implementation
- OpenAI embeddings (text-embedding-3-small)
- Pinecone vector database integration
- Mock mode for testing without API keys
- Production-ready with error handling

**Basic Pipeline Example**

- See `examples/basic-pipeline/` for minimal setup
- Simple in-memory implementation
- Perfect for learning and prototyping

## Documentation

- [GitHub Repository](https://github.com/DevilsDev/rag-pipeline-utils)
- [Issue Tracker](https://github.com/DevilsDev/rag-pipeline-utils/issues)
- [Discussions](https://github.com/DevilsDev/rag-pipeline-utils/discussions)
- [OpenAI + Pinecone Example](examples/openai-pinecone/) (NEW)
- [Release Notes](https://github.com/DevilsDev/rag-pipeline-utils/releases)
- [CHANGELOG](CHANGELOG.md)

## Contributing

Contributions are welcome. Please see the [contribution guidelines](https://github.com/DevilsDev/rag-pipeline-utils/blob/main/docs/CONTRIBUTING.md).

## License

GPL-3.0 - See [LICENSE](https://github.com/DevilsDev/rag-pipeline-utils/blob/main/LICENSE) for details.

## Support

- Issues: https://github.com/DevilsDev/rag-pipeline-utils/issues
- Discussions: https://github.com/DevilsDev/rag-pipeline-utils/discussions
