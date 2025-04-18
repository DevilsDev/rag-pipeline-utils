---
sidebar_position: 1
---

# Introduction

Welcome to **@DevilsDev/rag-pipeline-utils**, a modular Node.js toolkit for building scalable, pluggable Retrieval-Augmented Generation (RAG) systems.

---

##  What is RAG?

RAG combines information retrieval with large language models to enhance generation with factual grounding. It typically involves:

1. **Retrieving** relevant context (documents, chunks) from a vector store
2. **Generating** answers using an LLM, augmented by that context

This project provides all the composable parts to build your own RAG pipeline.

---

##  Why Use This Toolkit?

- **Plugin-based**: Swap in your own loaders, retrievers, LLMs
- **Streaming-ready**: Async-friendly, token-by-token output
- **CLI & API**: Use from terminal or integrate programmatically
- **Evaluation built-in**: BLEU, ROUGE, dashboard UI
- **Enterprise-quality**: SOLID, tested, typed, and CI-ready

---

## Architecture

Each RAG pipeline includes:

- `loader`: Document loader (e.g., PDF, Markdown, HTML)
- `embedder`: Embedding model interface (OpenAI, Cohere, local)
- `retriever`: Vector store adapter (e.g., Pinecone, Chroma)
- `llm`: Language model runner (OpenAI, Ollama, GPT-4-V)
- `reranker`: (Optional) Context re-ranking module via LLM

The pipeline can be used via code or via CLI commands.

---

## Status

This project is:
- Production-ready
- Covered by unit/integration tests
- Compatible with Node.js `>=18`
- Published to npm under `DevilsDev`

---

Let’s get started!

Next → [Usage](./Usage.md)
