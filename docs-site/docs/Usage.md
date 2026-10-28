# Usage Guide

This comprehensive guide covers how to use **@DevilsDev/rag-pipeline-utils** programmatically via the JavaScript/TypeScript API and through the command-line interface. Whether you're building a simple Q&A system or a complex enterprise RAG application, this guide provides practical examples and best practices.

---

## Installation

### **NPM Installation**

```bash
# Install as a project dependency
npm install @DevilsDev/rag-pipeline-utils

# Or install globally for CLI usage
npm install -g @DevilsDev/rag-pipeline-utils

# Using Yarn
yarn add @DevilsDev/rag-pipeline-utils

# Using pnpm
pnpm add @DevilsDev/rag-pipeline-utils
```

### **System Requirements**

- **Node.js**: >= 18.0.0
- **TypeScript**: >= 4.5.0 (for TypeScript projects)
- **Memory**: Minimum 2GB RAM (4GB+ recommended for large documents)
- **Storage**: Varies based on vector store and document size

### **Environment Setup**

Create a `.env` file in your project root:

```bash
# OpenAI Configuration
OPENAI_API_KEY=your_openai_api_key_here
OPENAI_ORG_ID=your_org_id_here

# Pinecone Configuration
PINCONE_API_KEY=your_pinecone_api_key
PINCONE_ENVIRONMENT=us-west1-gcp
PINCONE_INDEX_NAME=rag-documents

# Cohere Configuration (optional)
COHERE_API_KEY=your_cohere_api_key

# Anthropic Configuration (optional)
ANTHROPIC_API_KEY=your_anthropic_api_key
```

---

## Programmatic API Usage

### **Basic Pipeline Setup**

Here's a complete example showing how to create and use a RAG pipeline:

```typescript
import {
  createRagPipeline,
  PipelineConfig,
} from "@DevilsDev/rag-pipeline-utils";
import dotenv from "dotenv";

// Load environment variables
dotenv.config();

// Define pipeline configuration
const config: PipelineConfig = {
  loader: "markdown",
  embedder: "openai",
  retriever: "pinecone",
  llm: "openai-gpt-4",
  useReranker: true,

  // Plugin-specific configuration
  config: {
    openai: {
      apiKey: process.env.OPENAI_API_KEY,
      model: "text-embedding-3-large",
      maxTokens: 4000,
      temperature: 0.1,
    },
    pinecone: {
      apiKey: process.env.PINECONE_API_KEY,
      environment: process.env.PINECONE_ENVIRONMENT,
      indexName: process.env.PINECONE_INDEX_NAME,
      topK: 5,
    },
  },

  // Pipeline-level configuration
  pipelineConfig: {
    chunkSize: 1000,
    chunkOverlap: 200,
    maxConcurrency: 3,
    enableCaching: true,
  },
};

// Create the pipeline
const pipeline = createRagPipeline(config);

// Use the pipeline
async function main() {
  try {
    // Documents are loaded via the loader plugin configured in createRagPipeline()

    // Query the pipeline
    console.log("Querying pipeline...");
    const response = await pipeline.run({
      query: "How do I implement custom plugins in the RAG pipeline?",
    });

    console.log("Success:", response.success);
    console.log("Query:", response.query);
    console.log("Results:", response.results.length);
  } catch (error) {
    console.error("Pipeline error:", error);
  } finally {
    // Clean up resources
    await pipeline.cleanup();
  }
}

main();
```

### **Advanced Configuration Examples**

#### **Multi-Model Setup**

```typescript
// Use different models for different purposes
const advancedConfig: PipelineConfig = {
  loader: "pdf",
  embedder: "openai",
  retriever: "chroma",
  llm: "anthropic-claude",
  useReranker: true,
  reranker: "cohere-rerank",

  config: {
    openai: {
      apiKey: process.env.OPENAI_API_KEY,
      model: "text-embedding-3-large",
    },
    anthropic: {
      apiKey: process.env.ANTHROPIC_API_KEY,
      model: "claude-3-sonnet-20240229",
      maxTokens: 8000,
    },
    chroma: {
      host: "localhost",
      port: 8000,
      collection: "documents",
    },
    cohere: {
      apiKey: process.env.COHERE_API_KEY,
      model: "rerank-english-v2.0",
    },
  },
};
```

#### **Local-First Setup**

```typescript
// Use local models for privacy-sensitive applications
const localConfig: PipelineConfig = {
  loader: "markdown",
  embedder: "sentence-transformers",
  retriever: "chroma",
  llm: "ollama",

  config: {
    sentenceTransformers: {
      model: "all-MiniLM-L6-v2",
      device: "cpu",
    },
    ollama: {
      baseUrl: "http://localhost:11434",
      model: "llama2:7b",
      temperature: 0.2,
    },
    chroma: {
      path: "./vector_store",
      collection: "local_docs",
    },
  },
};
```

---

## Pipeline Methods & Operations

### **Document Loading**

Document loading is handled automatically by the loader plugin configured in `createRagPipeline()`. There is no separate `ingest()` method. Configure your loader when creating the pipeline:

```typescript
const pipeline = createRagPipeline({
  loader: new PDFLoader({ source: "./docs" }),
  // ... other plugins
});
```

### **Querying & Response Generation**

```typescript
// Basic query
const response = await pipeline.run({ query: "What is RAG?" });
console.log(response.results);

// Query with options
const detailedResponse = await pipeline.run({
  query: "Explain the plugin architecture",
  options: {
    topK: 5,
    timeout: 10000,
  },
});

console.log("Success:", detailedResponse.success);
console.log("Query:", detailedResponse.query);
console.log("Results:", detailedResponse.results);

// Streaming responses (returns async generator when stream: true)
const stream = await pipeline.run({
  query: "How do I optimize performance?",
  options: { stream: true },
});

for await (const chunk of stream) {
  if (!chunk.done) {
    process.stdout.write(chunk.token);
  }
}
```

### **Pipeline Cleanup**

```typescript
// Clean up resources when done
await pipeline.cleanup();
```

---

## Command Line Interface (CLI)

```bash
npm install -g @devilsdev/rag-pipeline-utils

rag-pipeline init                      # writes .ragrc.json
rag-pipeline ingest ./docs             # builds the local index
rag-pipeline query "What is the plugin architecture?"
rag-pipeline serve --port 3000         # local HTTP API (GET /health, POST /query)
rag-pipeline doctor                    # diagnose config, plugins and environment
```

See the [CLI Reference](./CLI.md) for every command and option.

---

## Configuration File (.ragrc.json)

The CLI reads its pipeline from `.ragrc.json`. Each entry names a built-in component or a custom plugin, with optional constructor `config`:

```json
{
  "namespace": "default",
  "pipeline": [
    { "stage": "loader", "name": "auto" },
    {
      "stage": "embedder",
      "name": "openai",
      "config": { "embeddingModel": "text-embedding-3-small" }
    },
    {
      "stage": "retriever",
      "name": "file-store",
      "config": { "path": ".rag/index.json" }
    },
    { "stage": "llm", "name": "my-llm", "config": { "temperature": 0.1 } }
  ],
  "plugins": {
    "llm": { "my-llm": "./plugins/my-llm.js" }
  }
}
```

Run `rag-pipeline info --plugins` to list the built-in names, and `rag-pipeline validate` to check that every entry resolves.

---

## Advanced Usage Patterns

### **Error Handling & Resilience**

```typescript
import {
  RagError,
  PluginError,
  ConfigurationError,
} from "@DevilsDev/rag-pipeline-utils";

try {
  const response = await pipeline.run({ query: "Complex query" });
} catch (error) {
  if (error instanceof PluginError) {
    console.error("Plugin error:", error.pluginName, error.message);
    // Handle plugin-specific errors
  } else if (error instanceof ConfigurationError) {
    console.error("Configuration error:", error.message);
    // Handle configuration issues
  } else if (error instanceof RagError) {
    console.error("RAG pipeline error:", error.message);
    // Handle general pipeline errors
  } else {
    console.error("Unexpected error:", error);
  }
}
```

### **Event Monitoring**

```typescript
// Listen to pipeline events
pipeline.on("document:loaded", (event) => {
  console.log(`Loaded ${event.chunks} chunks from ${event.source}`);
});

pipeline.on("embedding:completed", (event) => {
  console.log(
    `Generated ${event.embeddings} embeddings in ${event.duration}ms`,
  );
});

pipeline.on("generation:token", (event) => {
  process.stdout.write(event.token);
});

pipeline.on("error:handled", (event) => {
  console.warn(`Handled error in ${event.context}:`, event.error.message);
});
```

### **Custom Middleware**

```typescript
import { Middleware } from "@DevilsDev/rag-pipeline-utils";

// Create custom logging middleware
class CustomLoggingMiddleware implements Middleware {
  name = "custom-logger";
  priority = 100;

  async beforeQuery(context: QueryContext): Promise<QueryContext> {
    console.log(
      `[${new Date().toISOString()}] Query started: ${context.query}`,
    );
    context.startTime = Date.now();
    return context;
  }

  async afterQuery(
    context: QueryContext,
    result: QueryResult,
  ): Promise<QueryResult> {
    const duration = Date.now() - context.startTime;
    console.log(
      `[${new Date().toISOString()}] Query completed in ${duration}ms`,
    );
    return result;
  }
}

// Add middleware to pipeline
const config: PipelineConfig = {
  // ... other config
  middleware: [
    new CustomLoggingMiddleware(),
    // ... other middleware
  ],
};
```

---

_This comprehensive usage guide covers the most common patterns and advanced features of @DevilsDev/rag-pipeline-utils. For more specific use cases, check out our [Tutorials](./Tutorials.md) section, or explore the [CLI Reference](./CLI.md) for detailed command documentation._

---

## Plugin Configuration

You can customize the pipeline by registering plugins:

```js
registry.register("loader", "custom", new MyCustomLoader());
registry.register("retriever", "opensearch", new MyOpenSearchRetriever());
```

---

Next → [CLI](./CLI.md)
