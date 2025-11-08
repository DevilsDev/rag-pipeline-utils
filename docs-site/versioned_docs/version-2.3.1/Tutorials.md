---
id: Tutorials
title: Tutorials & Onboarding
sidebar_label: Tutorials
---

Welcome to the **RAG Pipeline Utils** tutorial section. These guides will help developers quickly onboard, integrate, and extend the modular RAG system.

---

## 1. Install the Package

```bash
npm install @devilsdev/rag-pipeline-utils
```

---

## 2. Ingest Documents Using CLI

This CLI command loads PDFs, embeds them, and stores the vectors.

```bash
npx rag-utils ingest ./sample.pdf --config .ragrc.json
```

Ensure you have a valid `.ragrc.json` config:

```json
{
  "loader": { "pdf": "./src/mocks/pdf-loader.js" },
  "embedder": { "openai": "./src/mocks/openai-embedder.js" },
  "retriever": { "pinecone": "./src/mocks/pinecone-retriever.js" },
  "llm": { "openai": "./src/mocks/openai-llm.js" },
  "namespace": "docs-example",
  "pipeline": ["loader", "embedder", "retriever"]
}
```

---

## 3. Run a Query Using CLI

```bash
npx rag-utils query "What is this document about?" --config .ragrc.json
```

---

## 4. Register a Custom Plugin

You can create your own loader/retriever/LLM:

```js
// src/plugins/my-custom-llm.js
export default class MyCustomLLM {
  ask(prompt) {
    return `Custom response to: ${prompt}`;
  }
}
```

Then reference it in `.ragrc.json`:

```json
"llm": {
  "custom": "./src/plugins/my-custom-llm.js"
}
```

---

## 5. Validate Plugin Mocks

Ensure all mocks meet contract interfaces before commit:

```bash
npm run validate-fixtures
```

---

## 6. Run All Tests + Coverage

```bash
npm run ci
```

This runs:

- Linting
- Fixture validation
- Unit/integration tests
- Coverage reporting

---

## Next Steps

- Explore `/src/core/plugin-registry.js` for plugin orchestration
- Browse `/scripts/` for CI and release utilities
- View `/__tests__/` for end-to-end RAG validation flows

---

Looking to build on top of this? Check out [Use Cases](./Use-Cases.md) for advanced scenarios.
