# Usage Guide

This guide covers how to use **@devilsdev/rag-pipeline-utils** programmatically via the JavaScript/TypeScript API and through the command-line interface.

---

## Installation

### **NPM Installation**

```bash
# Install as a project dependency
npm install @devilsdev/rag-pipeline-utils

# Or install globally for CLI usage
npm install -g @devilsdev/rag-pipeline-utils

# Using Yarn
yarn add @devilsdev/rag-pipeline-utils

# Using pnpm
pnpm add @devilsdev/rag-pipeline-utils
```

### **System Requirements**

- **Node.js**: >= 18.0.0
- **Memory**: depends on corpus size; the in-memory and file-based retrievers keep the index in memory while running
- **Storage**: varies with the vector store and document size

### **Environment Setup**

The built-in connectors read their API key from the environment when they are constructed (or from an `apiKey` option). Calls without a key fail fast with `MISSING_API_KEY`.

```bash
# OpenAI (OpenAIConnector)
OPENAI_API_KEY=your_openai_api_key_here

# Anthropic (AnthropicConnector, optional)
ANTHROPIC_API_KEY=your_anthropic_api_key

# Cohere (CohereConnector, optional)
COHERE_API_KEY=your_cohere_api_key
```

`OllamaConnector` and `LocalEmbedder` need no API key.

---

## Programmatic API Usage

### **Basic Pipeline Setup**

`createRagPipeline` takes component instances (or names registered on `pluginRegistry`) for the stages `loader`, `embedder`, `retriever`, `llm` and `reranker`, plus an optional `registry`. It returns `{ run, cleanup }`.

```javascript
const {
  createRagPipeline,
  OpenAIConnector,
  MemoryRetriever,
} = require("@devilsdev/rag-pipeline-utils");

const openai = new OpenAIConnector({
  model: "gpt-4o-mini",
  embeddingModel: "text-embedding-3-small",
  temperature: 0.1,
});
const retriever = new MemoryRetriever();

// Index a few documents (vectors must come from the same embedder)
const docs = [
  {
    id: "1",
    content: "Plugins implement one stage method, such as generate().",
  },
  { id: "2", content: "Register plugins with pluginRegistry.register()." },
];
await retriever.store(
  await Promise.all(
    docs.map(async (d) => ({ ...d, vector: await openai.embed(d.content) })),
  ),
);

// The embedder turns each query into a queryVector for the retriever
const pipeline = createRagPipeline({
  embedder: openai,
  retriever,
  llm: openai,
});

const response = await pipeline.run({
  query: "How do I implement custom plugins in the RAG pipeline?",
});

if (response.success) {
  console.log("Answer:", response.answer);
  console.log("Sources:", response.results.length);
} else {
  console.error("Pipeline error:", response.error);
}
```

`run()` resolves `{ success: false, error }` instead of throwing when a stage fails, times out or is aborted.

### **Advanced Configuration Examples**

#### **Multi-Provider Setup**

```javascript
const {
  createRagPipeline,
  OpenAIConnector,
  AnthropicConnector,
  CohereConnector,
  MemoryRetriever,
} = require("@devilsdev/rag-pipeline-utils");

const pipeline = createRagPipeline({
  embedder: new OpenAIConnector({ embeddingModel: "text-embedding-3-large" }),
  retriever: new MemoryRetriever(),
  reranker: new CohereConnector({ rerankModel: "rerank-english-v3.0" }),
  llm: new AnthropicConnector({ maxTokens: 4096 }),
});
```

#### **Local-First Setup**

```javascript no-run
const {
  createRagPipeline,
  LocalEmbedder,
  MemoryRetriever,
  OllamaConnector,
} = require("@devilsdev/rag-pipeline-utils");

const embedder = new LocalEmbedder(); // TF-IDF, no network
embedder.train(corpus); // array of strings or { content } objects

const pipeline = createRagPipeline({
  embedder,
  retriever: new MemoryRetriever(),
  llm: new OllamaConnector({
    baseURL: "http://localhost:11434",
    model: "llama3",
    temperature: 0.2,
  }),
});
```

For an index that persists to disk, use `FileVectorStore` as the retriever (see the [API Reference](./API-Reference.md)).

---

## Pipeline Methods & Operations

### **Indexing Documents**

The pipeline object only exposes `run()` and `cleanup()`; there is no separate ingest method. Index documents by embedding them and calling your retriever's `store()` (as in the example above), or use the CLI's `rag-pipeline ingest <path>`, which loads, embeds and stores files into a local `FileVectorStore` index.

### **Querying & Response Generation**

```javascript
// Basic query
const response = await pipeline.run({ query: "What is RAG?" });
console.log(response.answer);

// Query with options
const detailed = await pipeline.run({
  query: "Explain the plugin architecture",
  options: {
    topK: 5,
    timeout: 10000, // resolves { success: false, error: 'Execution timeout' }
    citations: true,
    evaluate: true,
  },
});

console.log(detailed.answer, detailed.citations, detailed.evaluation);

// Streaming responses (resolves to an async iterable when stream: true)
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

With `citations` or `evaluate` in stream mode, the stream ends with one `{ token: '', done: true, citations, evaluation }` chunk.

Without an `llm`, the pipeline runs retrieval only and returns `answer: null`.

### **Cancellation**

Pass an `AbortSignal` as `options.signal`. Every component receives the run's signal, and no later stage starts after an abort.

```javascript
const controller = new AbortController();
setTimeout(() => controller.abort(), 2000);

const result = await pipeline.run({
  query: "Summarise the release notes",
  options: { signal: controller.signal },
});
// On abort: { success: false, error: 'Execution aborted' }
```

### **Pipeline Cleanup**

```javascript
pipeline.cleanup();
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

`run()` does not throw for stage failures: check `success` and `error`. For your own code, `createError(code, context)` and `wrapError(error, code, context)` create errors with a `code` from `ERROR_CODES`, a formatted message and suggestions.

```javascript no-run
const {
  createError,
  wrapError,
  ERROR_CODES,
} = require("@devilsdev/rag-pipeline-utils");

const response = await pipeline.run({ query: "Complex query" });
if (!response.success) {
  throw createError(ERROR_CODES.PIPELINE_EXECUTION_FAILED, {
    reason: response.error,
  });
}

try {
  await loadMyDocuments();
} catch (err) {
  throw wrapError(err, ERROR_CODES.PLUGIN_EXECUTION_FAILED, {
    plugin: "my-loader",
  });
}
```

### **Tracing Runs**

The pipeline object does not emit events. To record what each run did, wrap it with `ExecutionTracer`:

```javascript no-run
const { ExecutionTracer } = require("@devilsdev/rag-pipeline-utils");

const tracer = new ExecutionTracer();
const traced = tracer.trace(pipeline);

tracer.on("traced", (trace) => {
  console.log(`Run ${trace.id} took ${trace.totalDurationMs}ms`);
});

const result = await traced.run({ query: "What is RAG?" });
console.log(result.trace.metadata.resultCount);
```

### **Wrapping a Pipeline**

There is no middleware API. Because a pipeline is just an object with `run()`, you can wrap it yourself; `GuardrailsPipeline`, `CostTracker.wrap()` and `ExecutionTracer.trace()` all work this way.

```javascript
function withTiming(pipeline) {
  return {
    ...pipeline,
    async run(input) {
      const start = Date.now();
      const result = await pipeline.run(input);
      console.log(`Query completed in ${Date.now() - start}ms`);
      return result;
    },
  };
}

const timed = withTiming(pipeline);
```

---

## Plugin Configuration

You can register plugins by name on the exported `pluginRegistry` and then refer to them by name in `createRagPipeline` or `.ragrc.json`. `register()` is asynchronous. Each plugin needs a `metadata` object with `name`, `version` and `type` (the stage), plus the stage's methods (a retriever needs both `store()` and `retrieve()`).

```javascript no-run
const {
  pluginRegistry,
  createRagPipeline,
} = require("@devilsdev/rag-pipeline-utils");

class MyCustomLoader {
  metadata = { name: "custom", version: "1.0.0", type: "loader" };
  async load() {
    /* ... */
  }
}

await pluginRegistry.register("loader", "custom", new MyCustomLoader());
await pluginRegistry.register(
  "retriever",
  "opensearch",
  new MyOpenSearchRetriever(), // metadata.type === "retriever"
);

const pipeline = createRagPipeline({
  loader: "custom",
  retriever: "opensearch",
  embedder,
  llm,
});
```

See [Plugins](./Plugins.md) for the stage contracts. For more use cases, see the [Tutorials](./Tutorials.md).

---

Next → [CLI](./CLI.md)
