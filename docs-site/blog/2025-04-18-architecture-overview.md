---
slug: architecture-overview
title: RAG Pipeline Architecture Overview
authors: [ali]
tags: [architecture, design, modular]
description: A deep dive into the architecture powering RAG Pipeline Utils — from plugin interfaces to flexible pipeline composition.
---

Welcome to the first post in our deep dive blog series on **RAG Pipeline Utils** — a fully modular, testable, and production-grade framework for building retrieval-augmented generation pipelines.

## Why Modular RAG?

Most RAG tools are tightly coupled or opinionated. We built this utility to empower dev teams with:

-  Swappable plugins for loaders, embedders, retrievers, LLMs
-  CLI tools for evaluation & schema validation
-  Docusaurus-based docs with versioned releases
-  Full CI/CD and automated NPM releases

## Architecture Highlights

- `PluginRegistry`: Registers and resolves all components.
- `validateSchema`: Enforces `.ragrc.json` format across all pipelines.
- `mocks/`: Local test doubles for every plugin interface.
- `__tests__/`: Dual-layer coverage — unit + integration.

## Try It Now

```bash
npm install @devilsdev/rag-pipeline-utils
npx rag-utils run --config .ragrc.json
```

Stay tuned for future posts including CI validation, RAG evaluation tooling, and how to build your own dashboard for prompt scoring.
