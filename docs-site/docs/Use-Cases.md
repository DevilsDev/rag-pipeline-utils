---
id: Use-Cases
title: Real-World Use Cases
sidebar_position: 5
---

## Real-World Applications of RAG Pipeline Utils

This project goes beyond traditional RAG tools — it’s a **developer-focused modular framework**. Here's how it’s used:

---

### 1. Customizable LLM Workflows

**Use Case:** A team wants to compare LLM providers (or embedders and retrievers) on the same documents.

Components are chosen in `.ragrc.json`, so keep one config per variant and
select it with `--config`:

```bash
rag-pipeline --config configs/openai.json run --ingest ./docs --query "How does this work?"
rag-pipeline --config configs/anthropic.json run --ingest ./docs --query "How does this work?"
```

---

### 2. Plugin-Based Evaluation Benchmarks

**Use Case:** You want to run BLEU/ROUGE scoring across prompt templates or documents. Evaluation is a library API (there is no CLI command for it):

```js no-run
const { scoreAnswer } = require("@devilsdev/rag-pipeline-utils");

// cases: [{ "prompt": "...", "expected": "..." }, ...]
for (const { prompt, expected } of cases) {
  const { answer } = await pipeline.run({ query: prompt });
  console.log(prompt, scoreAnswer(answer ?? "", expected)); // { bleu, rouge }
}
```

---

### 3. Internal LLM System for SaaS

**Use Case:** Embed RAG processing into a backend:

```js no-run
const {
  createRagPipeline,
  OpenAIConnector,
  FileVectorStore,
} = require("@devilsdev/rag-pipeline-utils");

// Index built earlier with `rag-pipeline ingest` from a config created by
// `rag-pipeline init --template openai`; query vectors must come from the
// same embedder that built the index
const store = new FileVectorStore({ path: ".rag/index.json" });

const openai = new OpenAIConnector();
const pipeline = createRagPipeline({
  embedder: openai,
  retriever: store,
  llm: openai,
});

app.post("/ask", async (req, res) => {
  const controller = new AbortController();
  req.on("close", () => controller.abort()); // stop work if the client leaves
  const output = await pipeline.run({
    query: req.body.question,
    options: { signal: controller.signal, citations: true },
  });
  res.json(output);
});
```

For a quick local HTTP API without writing a server, use `rag-pipeline serve` (binds 127.0.0.1, `GET /health`, `POST /query`).

---

### 4. Installing and Checking Third-Party Plugins

**Use Case:** You want to use a community plugin, but only after checking it.

```bash
# Install from a local directory, .tgz, single .js file or npm:<package>
rag-pipeline hub install npm:some-rag-plugin

# Score a local plugin against the automated certification thresholds
rag-pipeline hub certify check ./my-plugin
```

`hub install` runs a static security scan (high-risk findings block unless `--allow-risky`), checks the stage contract in a separate process, and registers the plugin in `.ragrc.json`. See the [CLI Reference](./CLI.md).

---

### Benefits

- **Pluggable** components via clean interfaces
- **CLI + programmatic** access for flexible DX
- **CI-validated** plugin contract enforcement
- **Docs-first** developer onboarding
- **Production-ready** for real ML teams

---

> Want to contribute your use case? PRs welcome on [GitHub](https://github.com/DevilsDev/rag-pipeline-utils).
