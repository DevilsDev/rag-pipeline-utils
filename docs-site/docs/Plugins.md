# Plugin Development Guide

Every stage of a **@devilsdev/rag-pipeline-utils** pipeline is a plugin: a plain object or class instance with the method(s) its stage requires. There is no base class to extend and nothing to inherit. This guide covers the stage contracts, the three ways to make a plugin available to a pipeline, cancellation, signatures, and the `rag-pipeline hub` commands.

---

## **Plugin Model**

A pipeline has five stages. Only `retriever` is needed for retrieval; `llm` is needed for answers.

| Stage       | Required methods                             | Called by `createRagPipeline` as                           |
| ----------- | -------------------------------------------- | ---------------------------------------------------------- |
| `loader`    | `load()`                                     | `loader.load()` before each run                            |
| `embedder`  | `embed()` (optionally `embedQuery()`)        | `embedder.embedQuery(query, { signal })` or `embed(...)`   |
| `retriever` | `store()` and `retrieve()`                   | `retriever.retrieve({ query, queryVector, topK, signal })` |
| `reranker`  | `rerank()`                                   | `reranker.rerank(query, docs, { topK, signal })`           |
| `llm`       | `generate()` (optionally `generateStream()`) | `llm.generate(query, docs, { ...options, signal })`        |

The required methods come from the contract files in [`contracts/`](https://github.com/DevilsDev/rag-pipeline-utils/tree/main/contracts). `pluginRegistry.register()` rejects a plugin that is missing one (or its `metadata`, see below), and `rag-pipeline hub install` checks the same methods in a separate process. Instances passed directly to `createRagPipeline()` and modules referenced from `.ragrc.json` are not validated up front.

Documents passed between stages are objects such as `{ id, content, score, metadata }`.

---

## **Stage Contracts**

### **Embedder**

`embed(text, options)` returns a vector (`number[]`). The pipeline also accepts a list of vectors or `[{ values | vector | embedding }]` and uses the first entry. If `embedQuery()` exists it is preferred for queries.

```javascript
class HashEmbedder {
  constructor(config = {}) {
    this.dimensions = config.dimensions || 64;
  }

  async embed(text, { signal } = {}) {
    signal?.throwIfAborted();
    const vector = new Array(this.dimensions).fill(0);
    for (const word of String(text).toLowerCase().split(/\W+/)) {
      if (!word) continue;
      let h = 0;
      for (const ch of word) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
      vector[h % this.dimensions] += 1;
    }
    return vector;
  }
}

module.exports = HashEmbedder;
```

### **Retriever**

`store(docs)` receives `[{ id, vector, content, metadata }]`. `retrieve(request)` receives `{ query, queryVector, topK, signal }` and returns documents sorted by relevance, each with a `score`. The built-in `MemoryRetriever` and `FileVectorStore` implement this contract and are good references.

For the CLI's `ingest`, `generate-dataset` and `ai` commands, a retriever can also have `list()`, `size()`, `clear()` and `removeBySource(source)`; re-ingesting a file calls `removeBySource` to replace its chunks. Any of these may return a Promise, as a remote store's would. The CLI's `local` embedder is fitted to your documents and needs a store that saves its state (`getEmbedderInfo()` and `setEmbedderInfo()`, as `FileVectorStore` does); with any other store, use an embedder such as `openai`, `ollama` or `cohere`.

```javascript
class ArrayRetriever {
  constructor() {
    this.docs = [];
  }

  async store(docs) {
    this.docs.push(...docs);
  }

  async retrieve({ queryVector, topK = 3, signal } = {}) {
    signal?.throwIfAborted();
    const dot = (a, b) => a.reduce((sum, v, i) => sum + v * (b[i] || 0), 0);
    return this.docs
      .map((d) => ({ ...d, score: dot(queryVector, d.vector) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, topK);
  }
}
```

### **Reranker**

`rerank(query, docs, { topK, signal })` returns the documents in a new order (and may cut the list to `topK`).

### **LLM**

`generate(query, docs, options)` returns the answer string. `options` contains the run options plus `signal`. An optional `generateStream(query, docs, options)` is an async generator of `{ token, done }` chunks used when `run()` is called with `options.stream: true`; without it the pipeline streams the result of `generate()` as one chunk.

```javascript
const echoLlm = {
  async generate(query, docs, { signal } = {}) {
    signal?.throwIfAborted();
    const sources = docs.map((d) => d.content).join(" ");
    return `Q: ${query}\nContext: ${sources}`;
  },
};

module.exports = echoLlm;
```

The built-in connectors put retrieved documents in the user message as delimited, untrusted reference data, never in the system role. Do the same in your own LLM plugins.

### **Loader**

`load()` is called with no arguments at the start of every `createRagPipeline` run. The CLI `ingest` command reads `.md`, `.html`, `.csv` and `.txt` files itself, so most projects do not need a custom loader.

---

## **Cancellation (AbortSignal)**

Each run creates an `AbortController`. Its signal is passed to every component call, as shown in the table above. It aborts when the run's `timeout` expires or when the caller's `options.signal` aborts:

```javascript
const controller = new AbortController();
const pending = pipeline.run({
  query: "What is RAG?",
  options: { signal: controller.signal, timeout: 10000 },
});
controller.abort();
const result = await pending; // { success: false, error: "Execution aborted" }
```

Plugins that ignore the signal still work: the run settles on abort anyway and no later stage starts. But the plugin's own work (an HTTP request, for example) keeps running until it finishes. Pass `signal` to `fetch()` or your SDK so the work actually stops. All built-in connectors and rerankers honour it.

---

## **Making a Plugin Available**

### **1. Pass instances directly**

```javascript no-run
const {
  createRagPipeline,
  MemoryRetriever,
} = require("@devilsdev/rag-pipeline-utils");
const HashEmbedder = require("./plugins/hash-embedder");
const echoLlm = require("./plugins/echo-llm");

const embedder = new HashEmbedder();
const retriever = new MemoryRetriever();
await retriever.store([
  {
    id: "1",
    content: "RAG combines retrieval with generation.",
    vector: await embedder.embed("RAG combines retrieval with generation."),
  },
]);

const pipeline = createRagPipeline({ embedder, retriever, llm: echoLlm });
const result = await pipeline.run({ query: "What is RAG?" });
console.log(result.answer);
```

### **2. Register on `pluginRegistry`**

`register(category, name, impl, manifest?, options?)` is asynchronous: await it before building the pipeline. Names are resolved when the pipeline is created. The registry validates the plugin against its stage contract, which also requires a `metadata` object with `name`, `version` and `type` (the stage):

```javascript no-run
const {
  createRagPipeline,
  pluginRegistry,
} = require("@devilsdev/rag-pipeline-utils");

echoLlm.metadata = { name: "echo", version: "1.0.0", type: "llm" };
await pluginRegistry.register("llm", "echo", echoLlm);
console.log(pluginRegistry.list("llm")); // ["echo"]

const pipeline = createRagPipeline({
  embedder,
  retriever,
  llm: "echo", // resolved with pluginRegistry.get("llm", "echo")
});
```

### **3. Reference a module in `.ragrc.json`**

Each `pipeline` entry is `{ "stage", "name", "config"? }`. Names resolve to a built-in component, then to a module under `plugins` (a path relative to the config file), then to a plugin registered on `pluginRegistry`. A module may export a class (constructed with the entry's `config`), a factory function (called with `config`) or an object, optionally as `default`.

```json
{
  "pipeline": [
    { "stage": "loader", "name": "auto" },
    {
      "stage": "embedder",
      "name": "hash",
      "config": { "dimensions": 128 }
    },
    {
      "stage": "retriever",
      "name": "file-store",
      "config": { "path": ".rag/index.json" }
    },
    { "stage": "llm", "name": "openai", "config": { "model": "gpt-4o-mini" } }
  ],
  "plugins": {
    "embedder": { "hash": "./plugins/hash-embedder.js" }
  }
}
```

Built-in names are listed by `rag-pipeline info --plugins`; see the [CLI Reference](./CLI.md#configuration-ragrcjson) for the full table.

---

## **CLI Tools**

The CLI has no scaffolding or test generator. Write the module yourself and use the CLI to check, install and score it.

### **Checking a plugin**

```bash
# Check the config and resolve every component, including custom plugins
rag-pipeline validate

# Check that each module under "plugins" exists and loads
rag-pipeline doctor --category plugins

# List built-in components and the custom plugins in the config
rag-pipeline info --plugins
```

### **Testing a plugin in code**

`validatePlugin(stage, plugin)` checks that an object can be used as a stage, without throwing, so you can assert on it in your plugin's own tests. By default it checks what `createRagPipeline()` calls. With `{ registry: true }` it also applies the rules `pluginRegistry.register()` enforces: `metadata` with a string `name` and `version`, a `type` equal to the stage, and the methods in the stage's contract.

```javascript
import { validatePlugin } from "@devilsdev/rag-pipeline-utils";

const echoLlm = {
  metadata: { name: "echo-llm", version: "1.0.0", type: "llm" },
  async generate(query, docs) {
    return docs.length ? docs[0].content : "No information found.";
  },
};

const result = validatePlugin("llm", echoLlm, { registry: true });
console.log(result.valid); // true
console.log(result.errors); // []

// An embedder without embed(): usable for queries, but `ingest` would fail.
const queryOnly = validatePlugin("embedder", { embedQuery: async () => [0.1] });
console.log(queryOnly.valid); // true
console.log(queryOnly.warnings.length); // 1
```

### **Installing a plugin**

```bash
rag-pipeline hub install ./my-llm                     # local directory
rag-pipeline hub install ./my-llm-1.0.0.tgz           # npm pack output
rag-pipeline hub install ./plugins/echo.js --stage llm --name echo
rag-pipeline hub install npm:@acme/rag-llm-echo@1.2.0 # from npm
rag-pipeline hub list                                 # plugins in the config
```

`hub install` unpacks the plugin into `.rag/plugins/<stage>-<name>/`, statically scans it for risky capabilities (high-risk findings block the install unless you pass `--allow-risky`), checks the stage methods in a separate process and adds it under `plugins` in `.ragrc.json`. Add a `{ "stage", "name" }` entry to `pipeline` to use it. Stage and name come from `package.json` (`"ragPipeline": { "stage": "llm", "name": "echo" }`) or from `--stage` and `--name`. Install scripts are never run.

The scan is not a sandbox: an installed plugin runs in-process with your permissions.

### **Scoring a plugin**

```bash
rag-pipeline hub certify check ./my-llm
```

The score is computed from the plugin's files: contract (35), security scan (30), tests (15) and documentation (20). Automated thresholds are BASIC 60, VERIFIED 80 and ENTERPRISE 95. VERIFIED and ENTERPRISE also need a manual review. The report is local and no certificate is issued. See [`hub certify`](./CLI.md) for the details.

### **Registries**

There is no public plugin registry. Registry commands (`search`, `info`, `publish`, registry installs) need `--registry <url>` or the `RAG_PLUGIN_REGISTRY` environment variable. To share a plugin, publish it to npm with `npm publish` and install it with `hub install npm:<package>`.

---

## **Plugin Signatures**

Plugins can be registered with a signed manifest. `register()` verifies it before importing anything:

```javascript
await pluginRegistry.register("llm", "echo", echoLlm, manifest, {
  content: { files: ["index.js"], baseDir: "/path/to/plugin" },
});
```

- The manifest must carry `signature` (Ed25519, base64) and `signerId`. Signers come from a trusted-keys file; the trust store is empty by default.
- A signed `contentDigest` in the manifest binds the plugin code. When it is present, it is always checked against `options.content` (`{ files, baseDir, contents }`).
- The exported `pluginRegistry` verifies signatures only when `NODE_ENV` is `production`. Registries constructed with `requireSignedPlugins: true` (`new pluginRegistry.PluginRegistry({ verifySignatures: true, requireSignedPlugins: true })`) refuse plugins that have no signed manifest. With `requireContentDigest: true` they also refuse manifests that have no `contentDigest`.
- `PluginSignatureVerifier` is exported for verifying manifests yourself (`verifyPluginSignature(manifest, signature, signerId, content?)`).

---

## **Best Practices**

- **Honour `signal`.** Pass it to network calls so a timeout or a caller abort stops the work.
- **Throw on failure.** `run()` catches errors and resolves `{ success: false, error }`; do not return placeholder results.
- **Check vector dimensions.** `MemoryRetriever` and `FileVectorStore` reject query vectors of the wrong length. Use one embedder for both ingest and query.
- **Read secrets from the environment** at construction time, and fail fast when they are missing (as the built-in connectors do with `MISSING_API_KEY`).
- **Test against the contract.** Instantiate the plugin, call its stage method with the arguments shown above, and run it once through `createRagPipeline`.

---

## **Built-in Connectors**

The built-in connectors implement the same contracts and can be passed directly to `createRagPipeline()`:

```javascript
const {
  OpenAIConnector,
  AnthropicConnector,
  CohereConnector,
  OllamaConnector,
  LocalEmbedder,
  MemoryRetriever,
} = require("@devilsdev/rag-pipeline-utils");

const ollama = new OllamaConnector({
  model: "llama3",
  baseURL: "http://localhost:11434",
});
const openai = new OpenAIConnector({ apiKey: process.env.OPENAI_API_KEY });
const anthropic = new AnthropicConnector({
  apiKey: process.env.ANTHROPIC_API_KEY,
});
const cohere = new CohereConnector({ apiKey: process.env.COHERE_API_KEY });
```

| Connector            | Stages             | Notes                                                                                            |
| -------------------- | ------------------ | ------------------------------------------------------------------------------------------------ |
| `OpenAIConnector`    | llm, embedder      | Needs `npm install openai`; default models `gpt-4o-mini` and `text-embedding-3-small`; streaming |
| `AnthropicConnector` | llm                | Default model `claude-sonnet-5-5` (since 3.0.1); streaming                                       |
| `CohereConnector`    | embedder, reranker | `embed-english-v3.0`, `rerank-english-v3.0`                                                      |
| `OllamaConnector`    | llm, embedder      | Local server; defaults `llama3` and `nomic-embed-text`; streaming                                |
| `LocalEmbedder`      | embedder           | Offline TF-IDF; call `train(documents)` first                                                    |
| `MemoryRetriever`    | retriever          | In-memory cosine similarity; `maxDocuments`, `eviction: 'fifo'`                                  |
| `FileVectorStore`    | retriever          | JSON-file index used by the CLI (`file-store`)                                                   |

API keys are read when the connector is constructed (from `apiKey` or `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `COHERE_API_KEY`). Transient failures (network errors, 408/409/425/429/5xx) are retried with exponential backoff and jitter, and `Retry-After` is honoured.

---

_For running pipelines see the [Usage Guide](./Usage.md); for plugin management commands see the [CLI Reference](./CLI.md)._
