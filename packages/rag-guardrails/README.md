# @devilsdev/rag-guardrails

Guardrails for RAG: prompt-injection detection and pre-retrieval, retrieval and post-generation guards.

Part of [@devilsdev/rag-pipeline-utils](https://www.npmjs.com/package/@devilsdev/rag-pipeline-utils), split into packages so you install only what you use. The objects are the same ones the full package exports; versions move in lockstep.

```bash
npm install @devilsdev/rag-guardrails
```

Exports: `PreRetrievalGuard`, `detectInjection`, `RetrievalGuard`, `PostGenerationGuard`, `GuardrailsPipeline`.

Documentation: https://devilsdev.github.io/rag-pipeline-utils/

The other packages:

- [`@devilsdev/rag-core`](https://www.npmjs.com/package/@devilsdev/rag-core)
- [`@devilsdev/rag-connectors`](https://www.npmjs.com/package/@devilsdev/rag-connectors)
- [`@devilsdev/rag-eval`](https://www.npmjs.com/package/@devilsdev/rag-eval)
