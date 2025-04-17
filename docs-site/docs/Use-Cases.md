---
id: Use-Cases
title: Real-World Use Cases
sidebar_position: 5
---

##  Real-World Applications of RAG Pipeline Utils

This project goes beyond traditional RAG tools — it’s a **developer-focused modular framework**. Here's how it’s used:

---

### 1. Customizable LLM Workflows

**Use Case:** A team wants to test three different retrievers (Pinecone, Weaviate, Redis) and switch LLMs dynamically during eval.

```bash
rag-utils ingest sample.pdf --retriever pinecone --llm openai
```

---

### 2. Plugin-Based Evaluation Benchmarks

**Use Case:** You want to run BLEU/ROUGE scoring across prompt templates or documents using CLI:

```bash
rag-utils evaluate --dataset tests/eval.json --llm anthropic
```

---

### 3. Internal LLM System for SaaS

**Use Case:** Embed RAG processing into a backend:

```js
import { PluginRegistry, runPipeline } from 'rag-pipeline-utils';

const registry = new PluginRegistry();
registry.register('embedder', 'openai', new OpenAIEmbedder());

const output = await runPipeline({
  loader: 'pdf',
  retriever: 'pinecone',
  llm: 'openai',
  query: 'How does this work?'
});
```

---

### 4. GitHub + NPM Automation for ML Pipelines

**Use Case:** You want a release blog post + versioned package published automatically:

- Commit code
- Push to `main`
- GitHub Action triggers:
  - Semantic release
  - CHANGELOG update
  - Blog post generation
  - NPM publish

---

###  Benefits

- **Pluggable** components via clean interfaces
- **CLI + programmatic** access for flexible DX
- **CI-validated** plugin contract enforcement
- **Docs-first** developer onboarding
- **Production-ready** for real ML teams

---

> Want to contribute your use case? PRs welcome on [GitHub](https://github.com/DevilsDev/rag-pipeline-utils).