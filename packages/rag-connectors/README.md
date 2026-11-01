# @devilsdev/rag-connectors

Embedders, LLMs and vector stores for @devilsdev/rag-core: OpenAI, Anthropic, Cohere, Ollama, the AI SDK, Qdrant and pgvector.

Part of [@devilsdev/rag-pipeline-utils](https://www.npmjs.com/package/@devilsdev/rag-pipeline-utils), split into packages so you install only what you use. The objects are the same ones the full package exports; versions move in lockstep.

```bash
npm install @devilsdev/rag-connectors
```

Exports: `OpenAIConnector`, `AnthropicConnector`, `CohereConnector`, `OllamaConnector`, `LocalEmbedder`, `QdrantRetriever`, `PgVectorRetriever`, `createAiSdkAdapter`.

Documentation: https://devilsdev.github.io/rag-pipeline-utils/

The other packages:

- [`@devilsdev/rag-core`](https://www.npmjs.com/package/@devilsdev/rag-core)
- [`@devilsdev/rag-eval`](https://www.npmjs.com/package/@devilsdev/rag-eval)
- [`@devilsdev/rag-guardrails`](https://www.npmjs.com/package/@devilsdev/rag-guardrails)
