<p align="center">
  <img src="https://cdn.jsdelivr.net/gh/DevilsDev/rag-pipeline-utils@main/assets/banner.svg" alt="rag-pipeline-utils: composable RAG for Node.js with grounded citations, evaluation, guardrails and a working CLI" width="100%">
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@devilsdev/rag-pipeline-utils"><img src="https://img.shields.io/npm/v/@devilsdev/rag-pipeline-utils.svg" alt="npm version"></a>
  <a href="https://github.com/DevilsDev/rag-pipeline-utils/actions/workflows/ci.yml"><img src="https://github.com/DevilsDev/rag-pipeline-utils/actions/workflows/ci.yml/badge.svg?branch=main" alt="CI"></a>
  <a href="https://www.npmjs.com/package/@devilsdev/rag-pipeline-utils"><img src="https://img.shields.io/npm/types/@devilsdev/rag-pipeline-utils.svg" alt="TypeScript types"></a>
  <a href="https://nodejs.org/"><img src="https://img.shields.io/node/v/@devilsdev/rag-pipeline-utils.svg" alt="Node.js version"></a>
  <a href="https://github.com/DevilsDev/rag-pipeline-utils/blob/main/LICENSE"><img src="https://img.shields.io/badge/License-MIT-yellow.svg" alt="License: MIT"></a>
</p>

# rag-pipeline-utils

**Retrieval-augmented generation for Node.js, with answers you can check.** Build a pipeline in one call, then check every answer against its sources: which sentences are supported, with numbers and negation checked, and no model calls needed.

```bash
npm install @devilsdev/rag-pipeline-utils
```

Node.js 22 or later. CommonJS, ESM and TypeScript declarations included.

## Check an answer

From this library's pipeline, or from LangChain, Mastra, the AI SDK or LlamaIndex: pass the answer and the sources it was given.

```js
import { checkAnswer } from "@devilsdev/rag-pipeline-utils";

const check = await checkAnswer({
  answer: "Full-time employees receive thirty days of paid vacation per year.",
  sources: [
    {
      pageContent:
        "Full-time employees receive twenty days of paid vacation per year.",
      metadata: { source: "handbook.md" },
    },
  ],
});

console.log(check.grounded); // false
console.log(check.unsupported.length); // 1
```

[Try it on StackBlitz](https://stackblitz.com/github/DevilsDev/rag-pipeline-utils/tree/main/examples/use-cases?file=check-your-answer.js) with an answer of your own. No install or API key.

## Build a pipeline

This runs offline, with the built-in TF-IDF embedder and an in-memory store. Add an LLM, such as `OpenAIConnector` or any AI SDK model, to generate answers.

```js
import {
  createRagPipeline,
  LocalEmbedder,
  MemoryRetriever,
} from "@devilsdev/rag-pipeline-utils";

const docs = [
  {
    id: "vacation",
    content:
      "Full-time employees receive twenty days of paid vacation per year.",
  },
  {
    id: "remote",
    content: "Remote work is allowed two days per week with manager approval.",
  },
];

const embedder = new LocalEmbedder();
embedder.train(docs.map((doc) => doc.content));
const retriever = new MemoryRetriever();
await retriever.store(
  docs.map((doc) => ({ ...doc, vector: embedder.embed(doc.content) })),
);

const pipeline = createRagPipeline({ embedder, retriever });
const result = await pipeline.run({
  query: "How many vacation days do I get?",
});

console.log(result.results[0].id); // "vacation"
```

## What's in it

- **Citations and grounding:** per-sentence sources and a groundedness score, with numeric and negation checks. An optional LLM judge rules on paraphrases, and `verifyCitations()` checks the citations Claude and OpenAI return.
- **Evaluation in CI:** `rag-pipeline eval` scores a test set and fails the build when answers regress; [rag-eval-action](https://github.com/DevilsDev/rag-eval-action) comments on pull requests.
- **Framework integrations:** grounding middleware for any Vercel AI SDK model, Mastra scorers and guardrails, and test matchers for Jest and Vitest.
- **Guardrails:** prompt-injection detection and PII redaction, with your own detectors and [published precision and recall](https://devilsdev.github.io/rag-pipeline-utils/docs/Benchmarks#guardrail-accuracy), and ACL filtering before generation.
- **Production behaviour:** hybrid search, reranking, token budgets, timeouts and cancellation, retries, caching, and OpenTelemetry spans with evaluation scores as events (or Langfuse scores).
- **Connectors:** OpenAI, Anthropic, Cohere, Ollama, pgvector and Qdrant; anything with `embed()` or `generate()` works too.
- **A CLI:** `init`, `ingest`, `query`, `eval` and `serve` against a local index, offline if you want.

## Packages

| Package                                                                                        | What it is                                               |
| ---------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| [`@devilsdev/rag-pipeline-utils`](https://www.npmjs.com/package/@devilsdev/rag-pipeline-utils) | Everything, including the CLI                            |
| [`@devilsdev/rag-core`](https://www.npmjs.com/package/@devilsdev/rag-core)                     | The pipeline, retrievers and checks                      |
| [`@devilsdev/rag-connectors`](https://www.npmjs.com/package/@devilsdev/rag-connectors)         | Model and vector store connectors                        |
| [`@devilsdev/rag-eval`](https://www.npmjs.com/package/@devilsdev/rag-eval)                     | Evaluation and answer checks, about 6 MB installed       |
| [`@devilsdev/rag-guardrails`](https://www.npmjs.com/package/@devilsdev/rag-guardrails)         | Injection detection, ACL filtering and PII redaction     |
| [`@devilsdev/rag-mcp-server`](https://www.npmjs.com/package/@devilsdev/rag-mcp-server)         | Search and check a folder of documents from Claude (MCP) |

## Learn more

- [Use cases with runnable code](https://github.com/DevilsDev/rag-pipeline-utils#use-cases), most of them on StackBlitz
- [Documentation](https://devilsdev.github.io/rag-pipeline-utils/): guides, API reference and the [CLI](https://devilsdev.github.io/rag-pipeline-utils/docs/CLI)
- [How it compares](https://devilsdev.github.io/rag-pipeline-utils/docs/Comparison) with LangChain.js, Mastra and the AI SDK
- [Examples](https://github.com/DevilsDev/rag-pipeline-utils/tree/main/examples) and [changelog](https://github.com/DevilsDev/rag-pipeline-utils/blob/main/CHANGELOG.md)

Published from GitHub Actions with npm provenance. Report vulnerabilities as described in [SECURITY.md](https://github.com/DevilsDev/rag-pipeline-utils/blob/main/SECURITY.md). [MIT](https://github.com/DevilsDev/rag-pipeline-utils/blob/main/LICENSE) licensed.
