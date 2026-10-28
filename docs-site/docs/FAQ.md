# FAQ

### Can I use this with my own vector database?

Yes. Write a retriever plugin that implements `store(docs)` and `retrieve({ query, queryVector, topK, signal })`, then either pass an instance to `createRagPipeline({ retriever })` or register it by name. Registered plugins need a `metadata` object:

```js
const { pluginRegistry } = require("@devilsdev/rag-pipeline-utils");

await pluginRegistry.register("retriever", "mydb", {
  metadata: { name: "mydb", version: "1.0.0", type: "retriever" },
  async store(docs) {
    /* write to your database */
  },
  async retrieve({ queryVector, topK = 5 }) {
    /* return [{ id, content, score, metadata }] */
  },
});
```

For the CLI, list the module under `plugins` in `.ragrc.json` (see [Plugins](./Plugins.md)), or install it with `rag-pipeline hub install`.

---

### Is streaming LLM response supported?

Yes. Pass `options: { stream: true }` to `run()` to get an async iterable of `{ token, done }` chunks. LLMs that implement `generateStream()` (the OpenAI, Anthropic and Ollama connectors do) stream token by token; others fall back to one chunk from `generate()`. With `citations` or `evaluate`, the stream ends with a `{ token: '', done: true, citations, evaluation }` chunk.

---

### Can I cancel a running query?

Yes. Pass an `AbortSignal` as `options.signal`, or set `options.timeout` in milliseconds. Every component receives the run's signal, and no later stage starts after an abort. The run resolves `{ success: false, error: 'Execution aborted' }` (or `'Execution timeout'`).

---

### How do I evaluate performance?

Evaluation is a library API, not a CLI command. Use `PipelineEvaluator` (or `run({ query, options: { evaluate: true } })`) to score individual pipeline results, and `evaluateRagDataset(datasetPath, pipelineConfig)` for a `{ prompt, expected }[]` dataset with BLEU/ROUGE. Context recall is only computed when you pass a `referenceAnswer`. `DashboardGenerator` renders metrics as a standalone HTML page. For latency, `rag-pipeline ai benchmark` reports p50/p95/mean per stage. See [Evaluation](./Evaluation.md).

---

### What file types can I ingest?

The CLI's built-in `auto` loader (`rag-pipeline ingest <path>`) reads:

- `.md`, `.markdown`
- `.html`, `.htm`
- `.csv`
- `.txt`
- Whole directories of these files

PDF and other formats need a custom loader plugin.

---

### Can I rerank results using a local model?

Yes. `EmbeddingReranker` reranks with any embedder, including the offline `LocalEmbedder` or a local model via `OllamaConnector`:

```js
const {
  EmbeddingReranker,
  OllamaConnector,
} = require("@devilsdev/rag-pipeline-utils");

const reranker = new EmbeddingReranker(new OllamaConnector());
const pipeline = createRagPipeline({ embedder, retriever, reranker, llm });
```

`ScoringReranker` (lexical scoring) needs no model at all, and `CascadeReranker` chains several rerankers.

---

### How do I contribute?

Fork the repo → add your plugin or CLI feature → test → submit PR.

---

Still stuck? Open an issue at [GitHub](https://github.com/DevilsDev/rag-pipeline-utils/issues).

---

Next → [Back to Introduction](./Introduction.md)
