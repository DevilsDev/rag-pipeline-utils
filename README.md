<p align="center">
  <img src="https://cdn.jsdelivr.net/gh/DevilsDev/rag-pipeline-utils@main/assets/banner.svg" alt="rag-pipeline-utils: composable RAG for Node.js with grounded citations, evaluation, guardrails and a working CLI" width="100%">
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@devilsdev/rag-pipeline-utils"><img src="https://img.shields.io/npm/v/@devilsdev/rag-pipeline-utils.svg" alt="npm version"></a>
  <a href="https://github.com/DevilsDev/rag-pipeline-utils/actions/workflows/ci.yml"><img src="https://github.com/DevilsDev/rag-pipeline-utils/actions/workflows/ci.yml/badge.svg?branch=main" alt="CI"></a>
  <a href="https://www.npmjs.com/package/@devilsdev/rag-pipeline-utils"><img src="https://img.shields.io/npm/dm/@devilsdev/rag-pipeline-utils.svg" alt="Downloads"></a>
  <a href="https://www.npmjs.com/package/@devilsdev/rag-pipeline-utils"><img src="https://img.shields.io/npm/types/@devilsdev/rag-pipeline-utils.svg" alt="TypeScript types"></a>
  <a href="https://nodejs.org/"><img src="https://img.shields.io/node/v/@devilsdev/rag-pipeline-utils.svg" alt="Node.js version"></a>
  <a href="https://github.com/DevilsDev/rag-pipeline-utils/blob/main/LICENSE"><img src="https://img.shields.io/badge/License-MIT-yellow.svg" alt="License: MIT"></a>
</p>

<p align="center">
  <a href="#quick-start">Quick start</a> ·
  <a href="#use-cases">Use cases</a> ·
  <a href="#how-it-compares">How it compares</a> ·
  <a href="https://devilsdev.github.io/rag-pipeline-utils/">Documentation</a> ·
  <a href="https://github.com/DevilsDev/rag-pipeline-utils/tree/main/examples">Examples</a>
</p>

# rag-pipeline-utils

`rag-pipeline-utils` gives you the building blocks of a RAG system as small, replaceable parts: an embedder, a retriever, an optional reranker and an LLM, wired together by one `createRagPipeline()` call. Evaluation, per-sentence citations, guardrails and agentic retrieval are opt-in layers on top. Every part follows a plain JavaScript contract, so you can swap a built-in connector for your own code without touching the rest.

- **Grounded by default.** Answers come back with the passages they were built from, sentence-level citations and a groundedness score, including a check that numbers in the answer appear in the sources.
- **Provider-neutral.** OpenAI, Anthropic, Cohere and Ollama connectors are built in, plus an offline TF-IDF embedder. Anything with an `embed()` or `generate()` method works too.
- **Production behaviour.** AbortSignal cancellation and timeouts, retries only on transient errors, ACL filtering before generation, PII redaction, typed exports for ESM, CommonJS and TypeScript.
- **A CLI that does real work.** `init`, `ingest`, `query` and `serve` run against a persistent local index, fully offline if you want.

## Contents

- [Installation](#installation)
- [Quick start](#quick-start)
- [Command line](#command-line)
- [Use cases](#use-cases)
- [How it works](#how-it-works)
- [Capabilities](#capabilities)
- [How it compares](#how-it-compares)
- [Connectors and plugins](#connectors-and-plugins)
- [Experimental modules](#experimental-modules)
- [Compatibility](#compatibility)
- [Documentation](#documentation)
- [Security](#security)
- [Contributing](#contributing)

## Installation

```bash
npm install @devilsdev/rag-pipeline-utils
```

Requires Node.js 22 or later (2.x runs on Node.js 18 and later). The package ships CommonJS, ESM and TypeScript declarations.

To use `OpenAIConnector`, install the OpenAI SDK as well. It is an optional peer dependency, so installs that don't use OpenAI skip it:

```bash
npm install @devilsdev/rag-pipeline-utils openai
```

Upgrading from 2.x? The [3.0 migration guide](https://devilsdev.github.io/rag-pipeline-utils/docs/Migration#upgrading-to-v300) lists the changes to make.

> **`npm install` failed with `husky: not found`?** Versions 2.0.0 to 2.6.1 ran a development hook on install. Install 2.6.2 or later: `npm install @devilsdev/rag-pipeline-utils@latest`.

## Quick start

This example runs offline: it uses the built-in TF-IDF embedder and an in-memory vector store.

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

// 1. Fit the embedder to your corpus and index the documents.
const embedder = new LocalEmbedder();
embedder.train(docs.map((doc) => doc.content));

const retriever = new MemoryRetriever();
await retriever.store(
  docs.map((doc) => ({ ...doc, vector: embedder.embed(doc.content) })),
);

// 2. Build the pipeline and ask a question.
const pipeline = createRagPipeline({ embedder, retriever });
const result = await pipeline.run({
  query: "How many vacation days do I get?",
});

console.log(result.results[0].id); // "vacation"
console.log(result.answer); // null: no LLM configured, so retrieval only
```

To generate answers, add an LLM. The same connector can also embed:

```js
import {
  createRagPipeline,
  OpenAIConnector,
  MemoryRetriever,
} from "@devilsdev/rag-pipeline-utils";

const openai = new OpenAIConnector({ apiKey: process.env.OPENAI_API_KEY });

const retriever = new MemoryRetriever();
const policy =
  "Full-time employees receive twenty days of paid vacation per year.";
await retriever.store([
  { id: "vacation", content: policy, vector: await openai.embed(policy) },
]);

const pipeline = createRagPipeline({
  embedder: openai,
  retriever,
  llm: openai,
});
const result = await pipeline.run({
  query: "How many vacation days do I get?",
  options: { citations: true, evaluate: true },
});

console.log(result.answer);
console.log(result.citations.groundednessScore); // 0..1, share of grounded sentences
console.log(result.evaluation.scores); // { faithfulness, relevance, contextPrecision, groundedness }
```

## Command line

The `rag-pipeline` CLI builds a local index from your files and answers questions against it.

<p align="center">
  <img src="https://cdn.jsdelivr.net/gh/DevilsDev/rag-pipeline-utils@main/assets/demo.gif" alt="Terminal recording: rag-pipeline init, ingest ./docs, then a query that returns the vacation policy as the top passage" width="720">
</p>

```bash
npx rag-pipeline init                      # writes .ragrc.json (interactive in a terminal)
npx rag-pipeline ingest ./docs             # indexes .md, .html, .csv and .txt files
npx rag-pipeline query "What is the remote work policy?"
npx rag-pipeline serve --port 3000         # local HTTP API: GET /health, POST /query
npx rag-pipeline doctor                    # checks config, API keys, plugins and the index
npx rag-pipeline generate-dataset --output tests.json     # drafts a test set from the index with your llm
npx rag-pipeline eval tests.json --min faithfulness=0.8   # scores a test set; exits 1 on failure
```

The default `local` template needs no API keys. Use `init --template openai`, `anthropic` or `ollama` to generate answers with a model. Other commands include `validate`, `hub install` for plugins and `ai benchmark` for measured latency.

`query` can also show its work: `--explain` lists each passage's score and which passages support each sentence, `--trace` times each stage, `--stats` estimates tokens and cost, and `--streaming` prints the answer as it is generated:

```bash
npx rag-pipeline query "How many vacation days do I get?" --explain --trace
```

See the [CLI reference](https://devilsdev.github.io/rag-pipeline-utils/docs/CLI).

## Use cases

### Answer questions with sources your users can check

Citations map every sentence of the answer to the passages that support it. A sentence whose facts or numbers are missing from the sources is reported as ungrounded.

```js
import { CitationTracker } from "@devilsdev/rag-pipeline-utils";

const sources = [
  {
    id: "policy",
    content: "Employees receive twenty days of paid vacation per year.",
  },
];
const tracker = new CitationTracker();

const good = tracker.track(
  "Employees receive twenty days of paid vacation per year.",
  sources,
);
const wrong = tracker.track(
  "Employees receive thirty days of paid vacation per year.",
  sources,
);

console.log(good.groundednessScore); // 1
console.log(wrong.groundednessScore); // 0: the number does not match the source
```

### Measure answer quality in CI

`PipelineEvaluator` scores faithfulness, relevance, context precision and, when you supply a reference answer, context recall. Run it over a fixed question set and fail the build when scores drop.

```js
import { PipelineEvaluator } from "@devilsdev/rag-pipeline-utils";

const evaluator = new PipelineEvaluator();
const report = evaluator.evaluate(
  {
    query: "How many vacation days do employees get?",
    answer: "Employees receive twenty days of paid vacation per year.",
    results: [
      { content: "Employees receive twenty days of paid vacation per year." },
    ],
  },
  { referenceAnswer: "Twenty days of paid vacation per year." },
);

console.log(report.scores); // includes contextRecall because a reference was given
if (report.scores.faithfulness < 0.8) process.exitCode = 1;
```

From the command line, `rag-pipeline eval` runs the whole set, saves a report and fails the job when scores fall below a minimum or drop from a saved baseline:

<p align="center">
  <img src="https://cdn.jsdelivr.net/gh/DevilsDev/rag-pipeline-utils@main/assets/eval-demo.gif" alt="Terminal recording: rag-pipeline eval passes three test cases with faithfulness 1.0 and saves main.json; after a change makes answers stop using the documents, the same eval with --baseline main.json lists the regressed metrics and cases, prints Evaluation failed and exits 1" width="720">
</p>

```bash
npx rag-pipeline eval tests.json --min faithfulness=0.8 --output main.json   # on main
npx rag-pipeline eval tests.json --baseline main.json                        # on a pull request
```

The recording runs offline with the local embedder and a stand-in LLM; its files are in [`assets/eval-demo`](https://github.com/DevilsDev/rag-pipeline-utils/tree/main/assets/eval-demo).

Keep the question set in a JSON file of `{ prompt, expected, sourceIds }` cases; `generateSyntheticDataset` (or `rag-pipeline generate-dataset`) drafts one from your documents for you to review. `validateDataset` checks it before a run and reports every malformed case, with its index and field; `runEvaluation` runs it and saves a JSON report, which `renderEvaluationReport` turns into Markdown or HTML; and `compareConfigurations` compares two pipelines, or a pipeline against the report saved from your main branch, and lists the cases that got worse. See the [dataset format](https://devilsdev.github.io/rag-pipeline-utils/docs/Evaluation#dataset-format).

On GitHub, [`DevilsDev/rag-eval-action`](https://github.com/DevilsDev/rag-eval-action) runs this on every pull request, compares it with your main branch and posts the summary as a comment.

### Check answers from another framework

Already on LangChain, LlamaIndex, Mastra or the AI SDK? `checkAnswer` checks the answer your chain produced against the sources it was given, in the shape your framework returns them:

```js
import { checkAnswer } from "@devilsdev/rag-pipeline-utils";

const check = await checkAnswer({
  question: "How many vacation days do I get?",
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

### Test your RAG code offline

`@devilsdev/rag-pipeline-utils/testing` has a deterministic embedder, an LLM that echoes the top passage and records its calls, and fixture documents, so tests need no network or API keys:

```js
import { createTestPipeline } from "@devilsdev/rag-pipeline-utils/testing";

const { pipeline, llm } = await createTestPipeline();
const result = await pipeline.run({
  query: "How many vacation days do I get?",
});

console.log(result.results[0].id); // "vacation"
console.log(llm.calls.length); // 1
```

### Protect an internal assistant

`GuardrailsPipeline` wraps any pipeline. Access control runs before the LLM sees a document, prompt-injection detection runs on the query, and PII is redacted from the answer, its citations and its evaluation details.

```js
import {
  createRagPipeline,
  GuardrailsPipeline,
  OpenAIConnector,
} from "@devilsdev/rag-pipeline-utils";

const openai = new OpenAIConnector({ apiKey: process.env.OPENAI_API_KEY });
const retriever = {
  // Any object with retrieve() works; requiredRole drives access control.
  async retrieve() {
    return [
      {
        id: "handbook",
        content: "The handbook covers vacation.",
        metadata: {},
      },
      {
        id: "salaries",
        content: "Executive salaries ...",
        metadata: { requiredRole: "exec" },
      },
    ];
  },
};

const assistant = new GuardrailsPipeline(
  createRagPipeline({ retriever, llm: openai }),
  {
    preRetrieval: { enableInjectionDetection: true },
    retrieval: { enforceACL: true },
    postGeneration: { enablePIIDetection: true },
    strict: true, // block instead of warn
  },
);

const result = await assistant.run({
  query: "What does the handbook cover?",
  context: { userPermissions: ["employee"] }, // "salaries" never reaches the LLM
});
console.log(result.guardrails.retrieval.removed); // [{ id: "salaries" }]
```

### Combine keyword and vector search

`HybridRetriever` merges any retrievers with Reciprocal Rank Fusion. BM25 finds exact terms such as product codes; vectors find paraphrases.

```js
import {
  BM25Search,
  HybridRetriever,
  LocalEmbedder,
  MemoryRetriever,
} from "@devilsdev/rag-pipeline-utils";

const docs = [
  {
    id: "err-4012",
    content: "Error E4012 means the API token expired. Generate a new token.",
  },
  {
    id: "billing",
    content: "Invoices are emailed on the first business day of each month.",
  },
];

const bm25 = new BM25Search();
bm25.index(docs);

const embedder = new LocalEmbedder();
embedder.train(docs.map((doc) => doc.content));
const vectors = new MemoryRetriever();
await vectors.store(
  docs.map((doc) => ({ ...doc, vector: embedder.embed(doc.content) })),
);

const hybrid = new HybridRetriever([
  { retriever: bm25, weight: 1, name: "bm25" },
  { retriever: vectors, weight: 1, name: "vectors" },
]);
const results = await hybrid.retrieve({
  query: "what does E4012 mean",
  queryVector: embedder.embed("what does E4012 mean"),
  topK: 2,
});
console.log(results[0].id); // "err-4012"
```

On the BEIR SciFact benchmark, `BM25Search` alone matches the published BM25 baseline (nDCG@10 0.665); fusion helps when the vector side is a strong embedder, so weight the retrievers to suit. See [retrieval quality](https://devilsdev.github.io/rag-pipeline-utils/docs/Benchmarks#retrieval-quality).

### Answer multi-part questions

`AgenticPipeline` splits compound questions into sub-queries, retrieves for each, and self-checks the answer against the sources before returning it.

```js
import {
  AgenticPipeline,
  MemoryRetriever,
  OpenAIConnector,
} from "@devilsdev/rag-pipeline-utils";

const openai = new OpenAIConnector({ apiKey: process.env.OPENAI_API_KEY });
const retriever = new MemoryRetriever();
const policies = [
  "Full-time employees receive twenty days of paid vacation per year.",
  "Remote work is allowed two days per week with manager approval.",
];
await retriever.store(
  await Promise.all(
    policies.map(async (content, i) => ({
      id: `p${i}`,
      content,
      vector: await openai.embed(content),
    })),
  ),
);

const agent = new AgenticPipeline();
const result = await agent.run({
  query: "How much vacation do I get, and can I work from home?",
  retriever,
  llm: openai,
  embedder: openai, // each sub-query gets its own embedding
});
console.log(result.subQueries.map((q) => q.subQuery));
console.log(result.answer);
```

### Keep request latency bounded

Every run accepts a timeout and an `AbortSignal`. The signal is passed to the embedder, retriever, reranker and LLM, so cancelled work stops instead of running in the background.

```js
import {
  createRagPipeline,
  OpenAIConnector,
  MemoryRetriever,
} from "@devilsdev/rag-pipeline-utils";

const openai = new OpenAIConnector({ apiKey: process.env.OPENAI_API_KEY });
const pipeline = createRagPipeline({
  embedder: openai,
  retriever: new MemoryRetriever(),
  llm: openai,
});

const controller = new AbortController(); // e.g. aborted when the HTTP client disconnects
const result = await pipeline.run({
  query: "Summarise the travel policy",
  options: { timeout: 10_000, signal: controller.signal },
});
if (!result.success) console.error(result.error); // "Execution timeout" or "Execution aborted"
```

### Cache repeated questions

`cache: true` caches query embeddings, retrieval results and answers in memory, so a repeated question makes no model calls. Use `RedisCache` to share the cache between processes. Cached results are not reused when the index, embedder, model or its settings change, and access-control filtering still runs on every request:

```js
import { createRagPipeline } from "@devilsdev/rag-pipeline-utils";
import {
  createTestPipeline,
  EchoLLM,
} from "@devilsdev/rag-pipeline-utils/testing";

const { embedder, retriever } = await createTestPipeline();
const llm = new EchoLLM();
const pipeline = createRagPipeline({ embedder, retriever, llm, cache: true });

await pipeline.run({ query: "How many vacation days do I get?" });
const again = await pipeline.run({ query: "How many vacation days do I get?" });

console.log(again.cache.generation); // "hit"
console.log(llm.calls.length); // 1
```

Answers are cached only at temperature 0. See [Caching](https://devilsdev.github.io/rag-pipeline-utils/docs/Caching).

### Run fully local

Pair the `LocalEmbedder` or Ollama embeddings with an Ollama model and `FileVectorStore` for a private, offline setup. The CLI's `local` and `ollama` templates set this up for you:

```bash
npx rag-pipeline init --no-interactive --template ollama
npx rag-pipeline ingest ./docs
npx rag-pipeline serve
```

## How it works

```
             ┌──────────────── GuardrailsPipeline (optional) ─────────────────┐
query ──▶    │ injection check ─▶ embed ─▶ retrieve ─▶ ACL / relevance filter │
             │   ─▶ rerank ─▶ LLM ─▶ citations ─▶ evaluation ─▶ PII redaction │ ──▶ result
             └────────────────────────────────────────────────────────────────┘
```

`createRagPipeline()` runs embed → retrieve → rerank → generate, then citations and evaluation when requested. Each stage receives the run's `AbortSignal`, and a timeout or abort stops the remaining stages. `GuardrailsPipeline`, `AgenticPipeline` and `HybridRetriever` compose around or inside it; they are not hidden steps of the default pipeline.

The result of `run()` is:

```ts
{
  success: boolean;
  query: string;
  results: Array<{ id; content; score; metadata }>;
  answer: string | null;            // null when no LLM is configured
  citations?: { citations; groundednessScore; hallucinationReport };
  evaluation?: { scores; details; metadata };
  error?: string;                   // set when success is false
}
```

## Capabilities

| Area             | What you get                                                                                                                                                                                                                                                                   |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Chunking**     | `ChunkingEngine` with sentence, fixed-size, recursive, semantic and structure-aware strategies                                                                                                                                                                                 |
| **Retrieval**    | `MemoryRetriever`, persistent `FileVectorStore`, `PgVectorRetriever` (PostgreSQL), `QdrantRetriever`, `BM25Search`, `HybridRetriever` (Reciprocal Rank Fusion)                                                                                                                 |
| **Reranking**    | `ScoringReranker`, `EmbeddingReranker` (cached), `CascadeReranker`                                                                                                                                                                                                             |
| **Citations**    | Per-sentence source mapping, hallucination report, numeric-consistency check                                                                                                                                                                                                   |
| **Evaluation**   | Faithfulness, relevance, context precision, context recall (with a reference), groundedness, BLEU/ROUGE, semantic similarity with any embedder; test sets with `validateDataset`, `runEvaluation`, `compareConfigurations`, `generateSyntheticDataset` and `rag-pipeline eval` |
| **Integrations** | `checkAnswer` for answers from LangChain, LlamaIndex, Mastra or the AI SDK; `createAiSdkAdapter`                                                                                                                                                                               |
| **Caching**      | Opt-in caches for query embeddings, retrieval and answers, in memory (`MemoryCache`) or Redis (`RedisCache`)                                                                                                                                                                   |
| **Testing**      | `/testing` entry: offline `HashEmbedder`, `EchoLLM`, fixtures, `createTestPipeline()`; `validatePlugin` for plugin tests                                                                                                                                                       |
| **Guardrails**   | Injection detection with input normalisation, ACL and relevance filtering before generation, PII redaction                                                                                                                                                                     |
| **Agentic**      | `QueryPlanner`, `IterativeRetriever`, `SelfCritiqueChecker`, `AgenticPipeline`                                                                                                                                                                                                 |
| **GraphRAG**     | `KnowledgeGraph`, `EntityExtractor`, `GraphRetriever`                                                                                                                                                                                                                          |
| **Streaming**    | Token streaming with a final chunk carrying citations and evaluation; `SSEAdapter`, `WebSocketAdapter`                                                                                                                                                                         |
| **Cost**         | `CostTracker`, `TokenBudget`, `CostCalculator` with sourced, overridable pricing                                                                                                                                                                                               |
| **Operations**   | `DevServer` HTTP API, `ExecutionTracer`, `metrics` (counters, gauges, histograms), `eventLogger`, coded errors with suggestions (`createError`), `AuditLogger`, MCP tool server (`MCPServer`)                                                                                  |

## How it compares

A short summary of the [comparison page](https://devilsdev.github.io/rag-pipeline-utils/docs/Comparison) (competitor details as of April 2026). The other libraries are broader frameworks; this one is narrower on purpose.

|                  | rag-pipeline-utils                                      | LangChain.js                          | LlamaIndex.TS                        |
| ---------------- | ------------------------------------------------------- | ------------------------------------- | ------------------------------------ |
| Focus            | RAG pipelines for Node.js services                      | General-purpose LLM orchestration     | Indexing-first RAG                   |
| Evaluation       | Built in: faithfulness, relevance, context P/R          | Via LangSmith (separate, paid option) | Some metrics, evolving               |
| Citations        | Built in: per-sentence, with groundedness score         | Possible, wired up by hand            | Possible, wired up by hand           |
| Guardrails       | Built in: pre-retrieval, retrieval, post-generation     | Via integrations (Guardrails AI etc.) | Via integrations                     |
| Vector stores    | Memory and file-backed, plus a plugin contract          | 50+ integrations                      | Many integrations and native indexes |
| LLM providers    | OpenAI, Anthropic, Cohere, Ollama, plus plugins         | Largest ecosystem                     | Large ecosystem                      |
| Agents and tools | Query planning and iterative retrieval                  | Mature agent framework                | Agent framework                      |
| Packaging        | One package, dual ESM and CommonJS                      | Many packages, mostly ESM             | One package, mostly ESM              |
| Stability        | Documented [SEMVER policy](SEMVER.md) with deprecations | Versioned per package                 | Versioned                            |

Choose LangChain.js for the widest integration catalogue or work that goes well beyond RAG, and LlamaIndex.TS for rich index types and structured data sources. Choose this library when evaluation, citations and guardrails are requirements and you want a small surface to review.

## Connectors and plugins

| Connector            | Embeddings | Generation | Notes                                                                                                                |
| -------------------- | :--------: | :--------: | -------------------------------------------------------------------------------------------------------------------- |
| `OpenAIConnector`    |     ✓      |     ✓      | `OPENAI_API_KEY`; `baseURL` for OpenAI-compatible APIs (Groq, Together, vLLM, LM Studio); needs `npm install openai` |
| `AnthropicConnector` |            |     ✓      | `ANTHROPIC_API_KEY`                                                                                                  |
| `CohereConnector`    |     ✓      |            | Embeddings and reranking, `COHERE_API_KEY`                                                                           |
| `OllamaConnector`    |     ✓      |     ✓      | Local models, no key                                                                                                 |
| `LocalEmbedder`      |     ✓      |            | Offline TF-IDF, fitted to your corpus                                                                                |

`PgVectorRetriever` and `QdrantRetriever` store and search documents in PostgreSQL with pgvector and in Qdrant ([vector stores](https://devilsdev.github.io/rag-pipeline-utils/docs/Concepts-Connectors#postgresql-with-pgvector)); `efSearch` trades pgvector query speed for recall. Their ingest speed, query latency and recall, measured in CI, are on the [Benchmarks page](https://devilsdev.github.io/rag-pipeline-utils/docs/Benchmarks).

Vercel AI SDK models (any provider it supports) work as the embedder and LLM through `createAiSdkAdapter`; see [Use with other frameworks](https://devilsdev.github.io/rag-pipeline-utils/docs/Integrations).

Connectors read API keys when they are created, retry only transient failures (network errors, 429, 5xx) with backoff, and send retrieved documents to the model as clearly delimited, untrusted reference data rather than as instructions.

A plugin is any object with the method its stage needs: `embed()`, `retrieve()`/`store()`, `generate()`, `rerank()` or `load()`. Reference your own modules from `.ragrc.json`, or install packaged plugins with checksum verification and a static security scan:

```bash
npx rag-pipeline hub install ./my-llm-plugin        # also .tgz files, npm:<package> or a registry
npx rag-pipeline hub certify check ./my-llm-plugin   # scores contract, security, tests and docs
```

## Experimental modules

Simulated or incomplete modules live under a separate entry point and are not covered by the stability guarantees in [SEMVER.md](SEMVER.md): model training, federated learning, multimodal processing, adaptive retrieval, SSO providers, multi-tenancy, data governance, the plugin sandbox and the plugin certification class.

```js
import { TenantManager } from "@devilsdev/rag-pipeline-utils/experimental";
```

They are exported only from `/experimental`, not from the main entry (2.x also exported them there, with a deprecation warning). Do not use them for authentication, tenant isolation or compliance. The [Experimental modules](https://devilsdev.github.io/rag-pipeline-utils/docs/Experimental) page describes what each one really does.

## Compatibility

|                |                                                                                                                                                    |
| -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Node.js        | 22 and 24                                                                                                                                          |
| Module formats | CommonJS (`require`) and ESM (`import`)                                                                                                            |
| Optional peers | `openai` for `OpenAIConnector`, `pg` for `PgVectorRetriever`, `isolated-vm` 6+ for the experimental `PluginSandbox`, `pino-pretty` for pretty logs |
| TypeScript     | Declarations for every export, including `/experimental`, compiled and run against the package in CI                                               |
| Versioning     | Semantic versioning with a deprecation window, see [SEMVER.md](SEMVER.md)                                                                          |
| Supply chain   | Published from GitHub Actions with npm provenance                                                                                                  |

## Documentation

- [Documentation site](https://devilsdev.github.io/rag-pipeline-utils/): guides, API reference and deployment
- [CLI reference](https://devilsdev.github.io/rag-pipeline-utils/docs/CLI)
- [API reference](https://devilsdev.github.io/rag-pipeline-utils/docs/API-Reference)
- [Generated API reference](https://devilsdev.github.io/rag-pipeline-utils/docs/api): every export, with its methods, options and types
- [Evaluation guide](https://devilsdev.github.io/rag-pipeline-utils/docs/Evaluation)
- [Examples](examples/): basic pipeline, OpenAI with Pinecone, and a deployable Fastify service ([run the basic pipeline in your browser](https://stackblitz.com/github/DevilsDev/rag-pipeline-utils/tree/main/examples/basic-pipeline))
- [Changelog](CHANGELOG.md), [benchmark results](https://devilsdev.github.io/rag-pipeline-utils/docs/Benchmarks) and [methodology](BENCHMARKS.md)

## Security

Report vulnerabilities privately as described in [SECURITY.md](SECURITY.md). The [security capability matrix](https://devilsdev.github.io/rag-pipeline-utils/docs/Security-Capabilities) lists what is hardened, what is recommended configuration, and what is an example only.

## Contributing

Issues and pull requests are welcome. Start with the [contributing guide](docs/CONTRIBUTING.md), and use [GitHub Discussions](https://github.com/DevilsDev/rag-pipeline-utils/discussions) for questions and ideas. Run `npm test` and `npm run lint` before opening a pull request.

## License

[MIT](LICENSE)
