# Usage

This guide covers how to use `@yourorg/rag-pipeline-utils` programmatically via API and through the CLI.

---

## 📦 Installation

```bash
npm install @yourorg/rag-pipeline-utils
```

---

## 🔧 Programmatic API

Import and instantiate a RAG pipeline:

```js
import { createRagPipeline } from '@yourorg/rag-pipeline-utils';

const pipeline = createRagPipeline({
  loader: 'markdown',
  embedder: 'openai',
  retriever: 'pinecone',
  llm: 'openai-gpt-4',
  useReranker: true
});

const answer = await pipeline.query("What is retrieval-augmented generation?");
console.log(answer);
```

---

## 🔁 Pipeline Methods

- `pipeline.ingest(path: string)` → Load, chunk, embed, and store vectors
- `pipeline.query(prompt: string)` → Retrieve context, rerank (optional), and call LLM

---

## 🧩 Plugin Configuration

You can customize the pipeline by registering plugins:

```js
registry.register('loader', 'custom', new MyCustomLoader());
registry.register('retriever', 'opensearch', new MyOpenSearchRetriever());
```

---

## ⚙️ Configuration via `.ragrc.json`

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
