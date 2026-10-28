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

This CLI command loads a file or directory (`.md`, `.markdown`, `.html`,
`.htm`, `.csv`, `.txt`), embeds the chunks, and stores them in the index.

```bash
npx rag-pipeline init --no-interactive
npx rag-pipeline ingest ./docs
```

`init` writes a valid `.ragrc.json` like this (offline `local` template):

```json
{
  "namespace": "default",
  "pipeline": [
    { "stage": "loader", "name": "auto" },
    { "stage": "embedder", "name": "local" },
    {
      "stage": "retriever",
      "name": "file-store",
      "config": { "path": ".rag/index.json" }
    }
  ]
}
```

---

## 3. Run a Query Using CLI

```bash
npx rag-pipeline query "What is this document about?"
```

Without an `llm` stage, `query` prints the best-matching passages. See the
[CLI Reference](./CLI.md) for all commands and options.

---

## 4. Register a Custom Plugin

You can create your own loader/retriever/LLM:

```js
// src/plugins/my-custom-llm.js (CommonJS; loaded with require())
module.exports = class MyCustomLLM {
  constructor(config = {}) {
    this.config = config; // the entry's "config" from .ragrc.json
  }

  // query: the user's question; docs: retrieved passages ({ content, metadata })
  async generate(query, docs) {
    return `Custom answer to "${query}" from ${docs.length} passage(s)`;
  }
};
```

Then reference it in `.ragrc.json`:

```json
{
  "pipeline": [
    { "stage": "loader", "name": "auto" },
    { "stage": "embedder", "name": "local" },
    {
      "stage": "retriever",
      "name": "file-store",
      "config": { "path": ".rag/index.json" }
    },
    { "stage": "llm", "name": "custom" }
  ],
  "plugins": {
    "llm": { "custom": "./src/plugins/my-custom-llm.js" }
  }
}
```

---

## 5. Check the Configuration

Confirm every pipeline entry resolves and your custom plugin loads:

```bash
npx rag-pipeline validate
npx rag-pipeline doctor --category configuration plugins
```

---

## 6. Run the Project's Checks (Contributors)

In a clone of the repository:

```bash
npm run lint          # ESLint
npm run format:check  # Prettier
npm test              # Jest (parallel); npm run test:serial runs in band
npm run smoke:pack    # pack the tarball and import it in a clean project
```

---

## Next Steps

- Explore `src/core/plugin-registry.js` for plugin registration
- Browse `scripts/` for build and release utilities
- View `__tests__/` for end-to-end RAG validation flows

---

Looking to build on top of this? Check out [Use Cases](./Use-Cases.md) for advanced scenarios.
