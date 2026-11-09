<p align="center">
  <img src="https://cdn.jsdelivr.net/gh/DevilsDev/rag-pipeline-utils@main/assets/banner.svg" alt="rag-pipeline-utils: RAG for Node.js that tells you when your LLM is making things up" width="100%">
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@devilsdev/rag-pipeline-utils"><img src="https://img.shields.io/npm/v/@devilsdev/rag-pipeline-utils.svg" alt="npm version"></a>
  <a href="https://github.com/DevilsDev/rag-pipeline-utils/actions/workflows/ci.yml"><img src="https://github.com/DevilsDev/rag-pipeline-utils/actions/workflows/ci.yml/badge.svg?branch=main" alt="CI"></a>
  <a href="https://www.npmjs.com/package/@devilsdev/rag-pipeline-utils"><img src="https://img.shields.io/npm/types/@devilsdev/rag-pipeline-utils.svg" alt="TypeScript types"></a>
  <a href="https://nodejs.org/"><img src="https://img.shields.io/node/v/@devilsdev/rag-pipeline-utils.svg" alt="Node.js version"></a>
  <a href="https://github.com/DevilsDev/rag-pipeline-utils/blob/main/LICENSE"><img src="https://img.shields.io/badge/License-MIT-yellow.svg" alt="License: MIT"></a>
</p>

# rag-pipeline-utils

**RAG for Node.js that tells you when your LLM is making things up.**

Your chatbot just told someone they get _thirty_ vacation days. The handbook says twenty. This library catches that: it checks every sentence of an answer against the sources it was given, numbers, "not"s and conditions included, with no extra model calls. It also builds the pipeline for you, if you want one.

```bash
npm install @devilsdev/rag-pipeline-utils
```

Node.js 22+. CommonJS, ESM and TypeScript types out of the box.

## Catch the made-up bits

Bring an answer from anywhere: this library, LangChain, Mastra, the AI SDK or LlamaIndex. Pass it in with the sources it was given:

```js
import { checkAnswer } from "@devilsdev/rag-pipeline-utils";

const check = await checkAnswer({
  answer:
    "Full-time employees receive thirty days of paid vacation per year. " +
    "Remote work is allowed two days per week.",
  sources: [
    {
      pageContent:
        "Full-time employees receive twenty days of paid vacation per year.",
    },
    {
      pageContent:
        "Remote work is allowed two days per week with manager approval.",
    },
  ],
});

console.log(check.grounded); // false
console.log(check.groundedness); // 0
console.log(check.unsupported); // ["Full-time employees receive thirty days of paid vacation per year.", "Remote work is allowed two days per week."]
```

Both sentences are caught: the first states the wrong number, and the second drops the "with manager approval" its source requires, which makes it claim more than the handbook says. That runs locally, with no API key and nothing sent anywhere. Worried about paraphrases? Add `judge` and your LLM gets asked about the sentences that failed on wording alone, and nothing else. [Try it on StackBlitz](https://stackblitz.com/github/DevilsDev/rag-pipeline-utils/tree/main/examples/use-cases?file=check-your-answer.js) with an answer of your own.

## A pipeline in a dozen lines

No API key needed for this one either: a built-in TF-IDF embedder and an in-memory store. Swap in OpenAI, Anthropic, Ollama or any AI SDK model when you're ready.

```js
import {
  createRagPipeline,
  LocalEmbedder,
  MemoryRetriever,
} from "@devilsdev/rag-pipeline-utils";

const docs = [
  { id: "vacation", content: "Full-time employees get twenty vacation days." },
  { id: "remote", content: "Remote work is allowed two days per week." },
];

const embedder = new LocalEmbedder();
embedder.train(docs.map((doc) => doc.content));
const retriever = new MemoryRetriever();
await retriever.store(
  docs.map((doc) => ({ ...doc, vector: embedder.embed(doc.content) })),
);

const pipeline = createRagPipeline({ embedder, retriever });
const result = await pipeline.run({ query: "How many vacation days?" });

console.log(result.results[0].id); // "vacation"
```

Rather start from a working app? `npm create rag-pipeline@latest` scaffolds one for Next.js with the AI SDK, Mastra, or Cloudflare Workers.

## Why people reach for it

- **Grounding you can see.** Per-sentence citations and a groundedness score, with numbers, units, dates and negation actually checked. `verifyCitations()` double-checks the citations Claude and OpenAI hand back.
- **Regressions fail the build.** `rag-pipeline eval` scores a test set in CI and goes red when answers get worse. [rag-eval-action](https://github.com/DevilsDev/rag-eval-action) posts the results on your pull request.
- **Plays well with your stack.** Grounding middleware for any Vercel AI SDK model, Mastra scorers and guardrails, Jest and Vitest matchers.
- **Guardrails with receipts.** Prompt-injection detection and PII redaction with [published precision and recall](https://devilsdev.github.io/rag-pipeline-utils/docs/Benchmarks#guardrail-accuracy), plus ACL filtering before anything reaches the model.
- **Ready for production.** Hybrid search, reranking, token budgets, timeouts and cancellation, retries, caching, and OpenTelemetry (or Langfuse) traces with the scores attached.
- **Connectors included.** OpenAI, Anthropic, Cohere, Ollama, pgvector, Qdrant, Pinecone and Weaviate. Anything with an `embed()` or `generate()` method works too.
- **A real CLI.** `init`, `ingest`, `query`, `eval` and `serve`, against a local index, offline if you like.
- **Runs at the edge.** A `/edge` build for Cloudflare Workers, Vercel Edge and Deno.
- **Talk to it from Claude.** `@devilsdev/rag-mcp-server` lets Claude search a folder of your docs and check its own answers.

## Take only what you need

The main package has everything. The smaller ones are there if install size matters:

| Package                                                                                        | What you get                                             | Installed   |
| ---------------------------------------------------------------------------------------------- | -------------------------------------------------------- | ----------- |
| [`@devilsdev/rag-pipeline-utils`](https://www.npmjs.com/package/@devilsdev/rag-pipeline-utils) | Everything, including the CLI                            | about 34 MB |
| [`@devilsdev/rag-core`](https://www.npmjs.com/package/@devilsdev/rag-core)                     | The pipeline, retrieval, caching and cost tracking       | about 6 MB  |
| [`@devilsdev/rag-connectors`](https://www.npmjs.com/package/@devilsdev/rag-connectors)         | Model and vector store connectors                        | about 10 MB |
| [`@devilsdev/rag-eval`](https://www.npmjs.com/package/@devilsdev/rag-eval)                     | Evaluation and answer checks                             | about 6 MB  |
| [`@devilsdev/rag-guardrails`](https://www.npmjs.com/package/@devilsdev/rag-guardrails)         | Injection detection, ACL filtering and PII redaction     | about 6 MB  |
| [`@devilsdev/rag-mcp-server`](https://www.npmjs.com/package/@devilsdev/rag-mcp-server)         | Search and check a folder of documents from Claude (MCP) | about 34 MB |
| [`create-rag-pipeline`](https://www.npmjs.com/package/create-rag-pipeline)                     | `npm create rag-pipeline`: Next.js, Mastra or Workers    | under 1 MB  |

## Go further

- [Use cases with runnable code](https://github.com/DevilsDev/rag-pipeline-utils#use-cases), most of them one click away on StackBlitz
- [Docs](https://devilsdev.github.io/rag-pipeline-utils/): guides, the API reference and the [CLI](https://devilsdev.github.io/rag-pipeline-utils/docs/CLI)
- [How it compares](https://devilsdev.github.io/rag-pipeline-utils/docs/Comparison) with LangChain.js, Mastra and the AI SDK
- [Examples](https://github.com/DevilsDev/rag-pipeline-utils/tree/main/examples) and the [changelog](https://github.com/DevilsDev/rag-pipeline-utils/blob/main/CHANGELOG.md)

Found a bug or have an idea? [Open an issue](https://github.com/DevilsDev/rag-pipeline-utils/issues). A star on [GitHub](https://github.com/DevilsDev/rag-pipeline-utils) helps other devs find it.

Published from GitHub Actions with npm provenance. Security reports: see [SECURITY.md](https://github.com/DevilsDev/rag-pipeline-utils/blob/main/SECURITY.md). [MIT](https://github.com/DevilsDev/rag-pipeline-utils/blob/main/LICENSE) licensed.
