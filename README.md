# @DevilsDev/rag-pipeline-utils

[![CI](https://github.com/DevilsDev/rag-pipeline-utils/actions/workflows/ci.yml/badge.svg)](https://github.com/DevilsDev/rag-pipeline-utils/actions)
[![codecov](https://codecov.io/gh/DevilsDev/rag-pipeline-utils/branch/main/graph/badge.svg)](https://codecov.io/gh/DevilsDev/rag-pipeline-utils)

**A modular Node.js toolkit for building RAG (Retrieval-Augmented Generation) pipelines with clean abstractions, pluggable components, and scalable architecture.**

---

## Features

- ✅ Plugin-based architecture for RAG pipelines
- ✅ Embedding + retrieval abstraction
- ✅ Vector DB integrations (e.g., Pinecone)
- ✅ Modular document loaders (PDF, HTML, Markdown, CSV, Directory)
- ✅ CLI with `.ragrc.json` config fallback
- ✅ Retry, backoff, and logging built-in
- ✅ Reranker support and evaluation tooling
- ✅ React dashboard for evaluation results

---

## Installation

```bash
npm install @yourorg/rag-pipeline-utils
```

---

## Usage

```js
import { createRagPipeline } from '@yourorg/rag-pipeline-utils';

const rag = createRagPipeline({
  loader: 'markdown',
  embedder: 'openai',
  retriever: 'pinecone',
  llm: 'openai-gpt-4',
  useReranker: true
});

const answer = await rag.query('What is a vector database?');
console.log(answer);
```

---

## Testing

```bash
npm test
```

---

## CLI

```bash
rag-pipeline ingest ./docs/my.pdf --loader pdf
rag-pipeline query "Explain RAG pipelines" --llm openai-gpt-4
rag-pipeline evaluate ./fixtures/sample-eval-dataset.json
rag-pipeline rerank "Explain embeddings" --retriever pinecone
```

Supports `.ragrc.json` fallback configuration:

```json
{
  "loader": "directory",
  "embedder": "openai",
  "retriever": "pinecone",
  "llm": "openai-gpt-4",
  "useReranker": true
}
```

---

## Project Structure

```
/src
  ├── core/           # Pipeline + registry
  ├── loader/         # Loaders for md, html, csv, dir
  ├── reranker/       # LLM-based context reranker
  ├── evaluate/       # Scoring, batch QA evaluation
  ├── utils/          # Logger, retry, schema
/bin/cli.js           # CLI entrypoint
/__tests__/           # Unit, integration, snapshot tests
/public/              # Evaluation dashboard (React)
.github/workflows/ci.yml # CI config
```

---

## Evaluation Dashboard

```bash
node server.js
```

Visit: [http://localhost:3000](http://localhost:3000) → Visualizes metrics, BLEU/ROUGE, pass rate.

---

## License

Apache-2.0

---

## 👤 Author

Ali Kahwaji — [@DevilsDev](https://github.com/DevilsDev)
