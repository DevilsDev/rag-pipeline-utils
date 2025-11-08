# Plugin Development Guide

The **@DevilsDev/rag-pipeline-utils** toolkit is built on a fully modular plugin architecture that enables seamless extension and customization. This comprehensive guide covers plugin development, architecture patterns, contracts, and best practices for building production-ready plugins.

---

## **Plugin Architecture Overview**

The plugin system follows SOLID principles with a registry-based architecture that supports:

- **Type Safety**: Strict TypeScript interfaces for all plugin contracts
- **Runtime Validation**: Contract enforcement at registration and execution
- **Hot Swapping**: Dynamic plugin loading and replacement
- **Dependency Injection**: Clean separation of concerns
- **Extensibility**: Support for custom plugin types and middleware

### **Core Plugin Types**

```javascript
import { PluginRegistry } from "@DevilsDev/rag-pipeline-utils";

const registry = new PluginRegistry();

// Register plugins by type
registry.register("loader", "my-custom-loader", new MyLoader());
registry.register("embedder", "my-embedder", new MyEmbedder());
registry.register("retriever", "my-retriever", new MyRetriever());
registry.register("llm", "my-llm", new MyLLM());
registry.register("reranker", "my-reranker", new MyReranker());

// Retrieve and use plugins
const loader = registry.get("loader", "my-custom-loader");
const result = await loader.load("./document.pdf");
```

**Supported Plugin Types**:

- **`loader`**: Document ingestion and parsing
- **`embedder`**: Text-to-vector embedding generation
- **`retriever`**: Vector similarity search and retrieval
- **`llm`**: Language model inference and generation
- **`reranker`**: Context reordering and relevance scoring

---

## **Plugin Contracts & Interfaces**

### **1. Loader Plugin Contract**

```typescript
interface LoaderPlugin {
  name: string;
  version: string;
  supportedFormats: string[];

  load(filePath: string, options?: LoaderOptions): Promise<Document[]>;
  loadBatch(filePaths: string[], options?: LoaderOptions): Promise<Document[]>;
  validate(filePath: string): Promise<boolean>;
}

interface Document {
  id: string;
  content: string;
  metadata: Record<string, any>;
  chunks?: TextChunk[];
}

interface TextChunk {
  id: string;
  content: string;
  startIndex: number;
  endIndex: number;
  metadata: Record<string, any>;
}
```

**Example Implementation**:

```javascript
import { BaseLoader } from "@DevilsDev/rag-pipeline-utils";
import fs from "fs/promises";
import path from "path";

class CustomMarkdownLoader extends BaseLoader {
  constructor() {
    super();
    this.name = "custom-markdown";
    this.version = "1.0.0";
    this.supportedFormats = [".md", ".markdown", ".txt"];
  }

  async load(filePath, options = {}) {
    const content = await fs.readFile(filePath, "utf-8");
    const metadata = {
      filename: path.basename(filePath),
      size: content.length,
      lastModified: (await fs.stat(filePath)).mtime,
    };

    const chunks = this.chunkText(content, {
      chunkSize: options.chunkSize || 1000,
      overlap: options.overlap || 200,
    });

    return [
      {
        id: this.generateId(filePath),
        content,
        metadata,
        chunks,
      },
    ];
  }

  async validate(filePath) {
    const ext = path.extname(filePath).toLowerCase();
    return this.supportedFormats.includes(ext);
  }

  chunkText(text, options) {
    // Custom chunking logic
    const chunks = [];
    const sentences = text.split(/[.!?]+/);
    let currentChunk = "";
    let chunkIndex = 0;

    for (const sentence of sentences) {
      if (currentChunk.length + sentence.length > options.chunkSize) {
        if (currentChunk) {
          chunks.push({
            id: `chunk-${chunkIndex++}`,
            content: currentChunk.trim(),
            startIndex: text.indexOf(currentChunk),
            endIndex: text.indexOf(currentChunk) + currentChunk.length,
            metadata: { chunkIndex, wordCount: currentChunk.split(" ").length },
          });
        }
        currentChunk = sentence;
      } else {
        currentChunk += sentence;
      }
    }

    if (currentChunk) {
      chunks.push({
        id: `chunk-${chunkIndex}`,
        content: currentChunk.trim(),
        startIndex: text.lastIndexOf(currentChunk),
        endIndex: text.lastIndexOf(currentChunk) + currentChunk.length,
        metadata: { chunkIndex, wordCount: currentChunk.split(" ").length },
      });
    }

    return chunks;
  }
}
```

### **2. Embedder Plugin Contract**

```typescript
interface EmbedderPlugin {
  name: string;
  version: string;
  dimensions: number;
  maxTokens: number;

  embed(text: string, options?: EmbedderOptions): Promise<number[]>;
  embedBatch(texts: string[], options?: EmbedderOptions): Promise<number[][]>;
  getTokenCount(text: string): number;
}
```

**Example Implementation**:

```javascript
import { BaseEmbedder } from "@DevilsDev/rag-pipeline-utils";
import OpenAI from "openai";

class CustomOpenAIEmbedder extends BaseEmbedder {
  constructor(apiKey, options = {}) {
    super();
    this.name = "custom-openai";
    this.version = "1.0.0";
    this.dimensions = 1536;
    this.maxTokens = 8191;
    this.client = new OpenAI({ apiKey });
    this.model = options.model || "text-embedding-ada-002";
  }

  async embed(text, options = {}) {
    try {
      const response = await this.client.embeddings.create({
        model: this.model,
        input: text,
        encoding_format: "float",
      });

      return response.data[0].embedding;
    } catch (error) {
      throw new Error(`Embedding failed: ${error.message}`);
    }
  }

  async embedBatch(texts, options = {}) {
    const batchSize = options.batchSize || 100;
    const results = [];

    for (let i = 0; i < texts.length; i += batchSize) {
      const batch = texts.slice(i, i + batchSize);
      const response = await this.client.embeddings.create({
        model: this.model,
        input: batch,
        encoding_format: "float",
      });

      results.push(...response.data.map((item) => item.embedding));
    }

    return results;
  }

  getTokenCount(text) {
    // Approximate token count (actual implementation would use tiktoken)
    return Math.ceil(text.length / 4);
  }
}
```

### **3. Retriever Plugin Contract**

```typescript
interface RetrieverPlugin {
  name: string;
  version: string;

  retrieve(
    query: string,
    options?: RetrievalOptions,
  ): Promise<RetrievalResult[]>;
  index(documents: Document[], options?: IndexOptions): Promise<void>;
  delete(documentIds: string[]): Promise<void>;
  getStats(): Promise<RetrievalStats>;
}

interface RetrievalResult {
  id: string;
  content: string;
  score: number;
  metadata: Record<string, any>;
}
```

### **4. LLM Plugin Contract**

```typescript
interface LLMPlugin {
  name: string;
  version: string;
  maxTokens: number;

  generate(prompt: string, options?: GenerationOptions): Promise<string>;
  generateStream(
    prompt: string,
    options?: GenerationOptions,
  ): AsyncIterableIterator<string>;
  getTokenCount(text: string): number;
}
```

**Example Implementation**:

```javascript
import { BaseLLM } from "@DevilsDev/rag-pipeline-utils";
import OpenAI from "openai";

class CustomOpenAILLM extends BaseLLM {
  constructor(apiKey, options = {}) {
    super();
    this.name = "custom-openai-llm";
    this.version = "1.0.0";
    this.maxTokens = 4096;
    this.client = new OpenAI({ apiKey });
    this.model = options.model || "gpt-3.5-turbo";
  }

  async generate(prompt, options = {}) {
    const response = await this.client.chat.completions.create({
      model: this.model,
      messages: [{ role: "user", content: prompt }],
      max_tokens: options.maxTokens || 1000,
      temperature: options.temperature || 0.7,
      top_p: options.topP || 1.0,
    });

    return response.choices[0].message.content;
  }

  async *generateStream(prompt, options = {}) {
    const stream = await this.client.chat.completions.create({
      model: this.model,
      messages: [{ role: "user", content: prompt }],
      max_tokens: options.maxTokens || 1000,
      temperature: options.temperature || 0.7,
      stream: true,
    });

    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content;
      if (content) {
        yield content;
      }
    }
  }

  getTokenCount(text) {
    // Approximate token count
    return Math.ceil(text.length / 4);
  }
}
```

---

## **Plugin Registration & Management**

### **Dynamic Plugin Loading**

```javascript
import { PluginManager } from "@DevilsDev/rag-pipeline-utils";

const pluginManager = new PluginManager();

// Load plugin from file
await pluginManager.loadPlugin("./plugins/my-custom-loader.js");

// Load plugin from npm package
await pluginManager.loadPlugin("@company/rag-plugin-suite");

// Load plugin from URL
await pluginManager.loadPlugin("https://github.com/user/plugin.git");

// Register plugin instance directly
pluginManager.register("loader", "my-loader", new MyCustomLoader());

// List available plugins
const plugins = pluginManager.listPlugins();
console.log("Available plugins:", plugins);
```

### **Plugin Metadata & Validation**

```javascript
// Plugin metadata export
export const metadata = {
  name: "custom-pdf-loader",
  version: "2.1.0",
  description: "Advanced PDF loader with OCR support",
  author: "Your Name <email@example.com>",
  license: "MIT",
  keywords: ["pdf", "ocr", "loader"],
  dependencies: {
    "pdf-parse": "^1.1.1",
    "tesseract.js": "^4.0.0",
  },
  config: {
    ocrEnabled: { type: "boolean", default: false },
    language: { type: "string", default: "eng" },
    quality: { type: "number", min: 1, max: 5, default: 3 },
  },
};

// Plugin validation
import { validatePlugin } from "@DevilsDev/rag-pipeline-utils";

const validation = await validatePlugin(MyCustomLoader, {
  strictMode: true,
  checkDependencies: true,
  validateContract: true,
});

if (!validation.isValid) {
  console.error("Plugin validation failed:", validation.errors);
}
```

---

## **CLI Plugin Development Tools**

### **Plugin Scaffolding**

```bash
# Create new plugin
rag-pipeline plugins create my-loader --type loader
rag-pipeline plugins create my-embedder --type embedder --template typescript

# Plugin templates available:
# - javascript (default)
# - typescript
# - minimal
# - advanced
```

### **Plugin Testing & Validation**

```bash
# Validate plugin
rag-pipeline plugins validate ./my-plugin
rag-pipeline plugins validate ./my-plugin --strict

# Test plugin
rag-pipeline plugins test ./my-plugin --test-data ./test-cases.json

# Benchmark plugin
rag-pipeline plugins benchmark ./my-plugin --iterations 1000
```

### **Plugin Publishing**

```bash
# Package plugin
rag-pipeline plugins package ./my-plugin --output my-plugin-v1.0.0.tgz

# Publish to npm
rag-pipeline plugins publish ./my-plugin --registry npm

# Publish to private registry
rag-pipeline plugins publish ./my-plugin --registry https://my-registry.com
```

---

## **Configuration & Runtime**

### **Plugin Configuration in .ragrc.json**

```json
{
  "plugins": {
    "loader": {
      "name": "custom-pdf-loader",
      "version": "^2.1.0",
      "config": {
        "ocrEnabled": true,
        "language": "eng",
        "quality": 4
      }
    },
    "embedder": {
      "name": "custom-openai",
      "config": {
        "model": "text-embedding-ada-002",
        "batchSize": 100
      }
    },
    "retriever": {
      "name": "pinecone",
      "config": {
        "environment": "us-west1-gcp",
        "indexName": "my-index"
      }
    },
    "llm": {
      "name": "openai-gpt-4",
      "config": {
        "temperature": 0.7,
        "maxTokens": 2000
      }
    }
  }
}
```

### **Environment-Specific Overrides**

```javascript
// Development environment
process.env.NODE_ENV = "development";
const devConfig = {
  plugins: {
    llm: {
      name: "mock-llm", // Use mock for testing
      config: { responses: ["Test response"] },
    },
  },
};

// Production environment
process.env.NODE_ENV = "production";
const prodConfig = {
  plugins: {
    llm: {
      name: "openai-gpt-4",
      config: {
        temperature: 0.3, // Lower temperature for consistency
        maxTokens: 1500,
      },
    },
  },
};
```

---

## **Best Practices**

### **1. Error Handling**

```javascript
class RobustPlugin extends BaseLoader {
  async load(filePath, options = {}) {
    try {
      // Validate inputs
      if (!filePath || typeof filePath !== "string") {
        throw new Error("Invalid file path provided");
      }

      // Check file existence
      if (!(await this.fileExists(filePath))) {
        throw new Error(`File not found: ${filePath}`);
      }

      // Implement retry logic
      return await this.withRetry(() => this.processFile(filePath), {
        maxRetries: 3,
        backoff: "exponential",
      });
    } catch (error) {
      // Log error with context
      this.logger.error("Load operation failed", {
        filePath,
        error: error.message,
        stack: error.stack,
      });

      // Re-throw with enhanced context
      throw new Error(`Failed to load ${filePath}: ${error.message}`);
    }
  }
}
```

### **2. Performance Optimization**

```javascript
class OptimizedEmbedder extends BaseEmbedder {
  constructor(options = {}) {
    super();
    this.cache = new LRUCache({ max: 1000 });
    this.batchSize = options.batchSize || 50;
    this.concurrency = options.concurrency || 3;
  }

  async embedBatch(texts, options = {}) {
    // Check cache first
    const uncachedTexts = texts.filter((text) => !this.cache.has(text));

    if (uncachedTexts.length === 0) {
      return texts.map((text) => this.cache.get(text));
    }

    // Process in parallel batches
    const batches = this.createBatches(uncachedTexts, this.batchSize);
    const results = await Promise.allSettled(
      batches.map((batch) => this.processBatch(batch)),
    );

    // Cache results
    results.forEach((result, index) => {
      if (result.status === "fulfilled") {
        result.value.forEach((embedding, i) => {
          this.cache.set(uncachedTexts[index * this.batchSize + i], embedding);
        });
      }
    });

    return texts.map((text) => this.cache.get(text));
  }
}
```

### **3. Testing & Quality Assurance**

```javascript
// Plugin test suite
import { PluginTester } from "@DevilsDev/rag-pipeline-utils";

const tester = new PluginTester(MyCustomLoader);

// Contract compliance tests
await tester.testContract();

// Performance benchmarks
const benchmarks = await tester.benchmark({
  testData: "./test-documents/",
  iterations: 100,
  metrics: ["latency", "throughput", "memory"],
});

// Integration tests
await tester.testIntegration({
  pipeline: myRagPipeline,
  testCases: "./integration-tests.json",
});

// Generate test report
const report = tester.generateReport();
console.log("Plugin test results:", report);
```

---

_This comprehensive plugin development guide enables you to build production-ready extensions for @DevilsDev/rag-pipeline-utils. For usage examples, see the [Usage Guide](./Usage.md), or explore [CLI Reference](./CLI.md) for plugin management commands._
