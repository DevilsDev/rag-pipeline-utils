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
    // Ingest documents
    console.log("Ingesting documents...");
    await pipeline.ingest("./docs/**/*.md");

    // Query the pipeline
    console.log("Querying pipeline...");
    const response = await pipeline.query(
      "How do I implement custom plugins in the RAG pipeline?",
    );

    console.log("Answer:", response.answer);
    console.log("Sources:", response.sources.length);
    console.log("Confidence:", response.confidence);
  } catch (error) {
    console.error("Pipeline error:", error);
  } finally {
    // Clean up resources
    await pipeline.destroy();
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

### **Document Ingestion**

```typescript
// Single file ingestion
await pipeline.ingest("./document.pdf");

// Multiple files with glob patterns
await pipeline.ingest("./docs/**/*.{md,txt,pdf}");

// Batch ingestion with progress tracking
const files = ["doc1.pdf", "doc2.md", "doc3.txt"];
for (const file of files) {
  console.log(`Processing ${file}...`);
  await pipeline.ingest(file);
}

// Ingestion with custom options
await pipeline.ingest("./docs", {
  chunkSize: 1500,
  chunkOverlap: 300,
  metadata: {
    source: "documentation",
    version: "2.1.8",
    category: "technical",
  },
});
```

### **Querying & Response Generation**

```typescript
// Basic query
const response = await pipeline.query("What is RAG?");
console.log(response.answer);

// Query with options
const detailedResponse = await pipeline.query(
  "Explain the plugin architecture",
  {
    maxTokens: 2000,
    temperature: 0.3,
    includeMetadata: true,
    minConfidence: 0.7,
  },
);

console.log("Answer:", detailedResponse.answer);
console.log("Sources:", detailedResponse.sources);
console.log("Metadata:", detailedResponse.metadata);
console.log("Processing time:", detailedResponse.processingTime);

// Streaming responses
const stream = pipeline.queryStream("How do I optimize performance?");
for await (const chunk of stream) {
  process.stdout.write(chunk.token);

  // Access metadata during streaming
  if (chunk.metadata) {
    console.log("\nSources found:", chunk.metadata.sources.length);
  }
}
```

### **Batch Processing**

```typescript
// Process multiple queries efficiently
const queries = [
  "What is the plugin system?",
  "How do I configure embeddings?",
  "What are the supported vector stores?",
];

const responses = await pipeline.batchQuery(queries, {
  maxConcurrency: 3,
  includeMetadata: true,
});

responses.forEach((response, index) => {
  console.log(`Query ${index + 1}:`, queries[index]);
  console.log(`Answer:`, response.answer);
  console.log(`Confidence:`, response.confidence);
  console.log("---");
});
```

### **Pipeline Management**

```typescript
// Get pipeline statistics
const stats = await pipeline.getStats();
console.log("Documents indexed:", stats.documentsCount);
console.log("Total chunks:", stats.chunksCount);
console.log("Index size:", stats.indexSize);
console.log("Last updated:", stats.lastUpdated);

// Clear the vector store
await pipeline.clear();

// Rebuild the index
await pipeline.rebuild();

// Export pipeline data
const exportData = await pipeline.export();
fs.writeFileSync("./pipeline-backup.json", JSON.stringify(exportData));

// Import pipeline data
const importData = JSON.parse(
  fs.readFileSync("./pipeline-backup.json", "utf8"),
);
await pipeline.import(importData);
```

---

## Command Line Interface (CLI)

### **Global CLI Installation**

```bash
# Install globally
npm install -g @DevilsDev/rag-pipeline-utils

# Verify installation
rag-pipeline --version
rag-pipeline --help
```

### **Project Initialization**

```bash
# Create a new RAG project
rag-pipeline init my-rag-project
cd my-rag-project

# Initialize in existing directory
rag-pipeline init .

# Initialize with template
rag-pipeline init my-project --template enterprise
```

### **Configuration Management**

```bash
# Create default configuration
rag-pipeline config init

# Set configuration values
rag-pipeline config set openai.apiKey sk-your-key-here
rag-pipeline config set pinecone.environment us-west1-gcp

# View current configuration
rag-pipeline config show

# Validate configuration
rag-pipeline config validate
```

### **Document Ingestion via CLI**

```bash
# Ingest single file
rag-pipeline ingest ./document.pdf --loader pdf

# Ingest directory with specific loader
rag-pipeline ingest ./docs --loader markdown --recursive

# Ingest with custom settings
rag-pipeline ingest ./docs \
  --loader markdown \
  --embedder openai \
  --chunk-size 1500 \
  --chunk-overlap 300

# Batch ingest with progress
rag-pipeline ingest ./large-docs \
  --loader pdf \
  --batch-size 10 \
  --progress
```

### **Querying via CLI**

```bash
# Simple query
rag-pipeline query "What is the plugin architecture?"

# Query with specific LLM
rag-pipeline query "Explain embeddings" --llm openai-gpt-4

# Query with options
rag-pipeline query "How to optimize performance?" \
  --max-tokens 2000 \
  --temperature 0.3 \
  --include-sources

# Interactive query mode
rag-pipeline query --interactive
```

### **Evaluation and Testing**

```bash
# Run evaluation on test set
rag-pipeline evaluate ./test-queries.json --output results.csv

# Evaluate with specific metrics
rag-pipeline evaluate ./queries.json \
  --metrics bleu,rouge,bertscore \
  --output detailed-results.json

# Start evaluation dashboard
rag-pipeline dashboard --port 3000 --host 0.0.0.0
```

### **Pipeline Management via CLI**

```bash
# View pipeline status
rag-pipeline status

# Clear vector store
rag-pipeline clear --confirm

# Rebuild index
rag-pipeline rebuild --force

# Export pipeline data
rag-pipeline export --output backup.json

# Import pipeline data
rag-pipeline import backup.json
```

### **Plugin Management**

```bash
# List available plugins
rag-pipeline plugins list

# Install custom plugin
rag-pipeline plugins install ./my-custom-plugin

# Create plugin template
rag-pipeline plugins create my-loader --type loader

# Validate plugin
rag-pipeline plugins validate ./my-plugin
```

---

## Configuration File (.ragrc.json)

Create a `.ragrc.json` file in your project root for persistent configuration:

```json
{
  "version": "2.1.8",
  "pipeline": {
    "loader": "markdown",
    "embedder": "openai",
    "retriever": "pinecone",
    "llm": "openai-gpt-4",
    "useReranker": true,
    "reranker": "cohere-rerank"
  },
  "config": {
    "openai": {
      "model": "text-embedding-3-large",
      "maxTokens": 4000,
      "temperature": 0.1
    },
    "pinecone": {
      "environment": "us-west1-gcp",
      "indexName": "rag-documents",
      "topK": 5
    }
  },
  "pipelineConfig": {
    "chunkSize": 1000,
    "chunkOverlap": 200,
    "maxConcurrency": 3,
    "enableCaching": true
  },
  "logging": {
    "level": "info",
    "format": "json",
    "outputs": ["console", "file"]
  },
  "plugins": {
    "custom": ["./plugins/my-custom-loader.js", "@company/rag-plugin-suite"]
  }
}
```

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
  const response = await pipeline.query("Complex query");
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

## Configuration via `.ragrc.json`

Create a JSON file at your root:

```json
{
  "loader": "directory",
  "embedder": "openai",
  "retriever": "pinecone",
  "llm": "openai-gpt-4",
  "useReranker": true
}
```

Used automatically when no CLI args are passed.

---

Next → [CLI](./CLI.md)
