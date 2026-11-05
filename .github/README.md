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
  <a href="#rag-pipeline-utils">Quick start</a> ·
  <a href="#why-this-library">Why this library</a> ·
  <a href="#use-cases">Use cases</a> ·
  <a href="#how-it-compares">How it compares</a> ·
  <a href="https://devilsdev.github.io/rag-pipeline-utils/">Documentation</a> ·
  <a href="https://github.com/DevilsDev/rag-pipeline-utils/tree/main/examples">Examples</a>
</p>

# rag-pipeline-utils

**Retrieval-augmented generation for Node.js, with answers you can check.** One `createRagPipeline()` call wires an embedder, a retriever, an optional reranker and an LLM. Citations, evaluation, guardrails and token budgets are opt-in layers on top, and every part is a plain JavaScript contract you can replace with your own code.

```bash
npm install @devilsdev/rag-pipeline-utils
```

This runs offline, with the built-in TF-IDF embedder and an in-memory vector store:

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

## Why this library

- **Grounded by default.** Answers come back with the passages they were built from, sentence-level citations and a groundedness score, including checks that numbers in the answer appear in the sources and that it doesn't negate them.
- **Checks the model's own citations.** `verifyCitations()` tells you whether each passage Claude or OpenAI file search cites actually supports the sentence citing it, including numbers and negation (3.5.0).
- **Scores where you look at traces.** With `telemetry: true`, evaluation scores become OpenTelemetry `gen_ai.evaluation.result` events on the spans they judge, and `toLangfuseScores(result)` sends them to Langfuse (3.5.0).
- **Measured, not guessed.** `rag-pipeline eval` scores a test set and fails CI when answers regress; [`rag-eval-action`](https://github.com/DevilsDev/rag-eval-action) posts the result on every pull request. Retrieval is [benchmarked](https://devilsdev.github.io/rag-pipeline-utils/docs/Benchmarks) on BEIR SciFact, and the guardrails' precision and recall on public labelled sets.
- **Provider-neutral.** OpenAI, Anthropic, Cohere and Ollama connectors; PostgreSQL with pgvector, Qdrant and Pinecone stores; an offline TF-IDF embedder. Anything with an `embed()` or `generate()` method works too, including Vercel AI SDK models.
- **Production behaviour.** Cancellation and timeouts on every stage, retries only on transient errors, ACL filtering before generation, PII redaction, caching, and a token budget for the context sent to the model.
- **Built to extend.** Each stage is a small contract, and `runContractTests()` tests your own plugin against what the pipeline relies on.
- **A CLI that does real work.** `init`, `ingest`, `query`, `eval` and `serve` run against a persistent local index, fully offline if you want.

## Contents

- [Installation](#installation)
- [Quick start with an LLM](#quick-start-with-an-llm)
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

Requires Node.js 22 or later (2.x runs on Node.js 18 and later). The package ships CommonJS, ESM and TypeScript declarations. It also runs on [Cloudflare Workers](https://devilsdev.github.io/rag-pipeline-utils/docs/Deployment-Cloudflare-Workers) with the `nodejs_compat` flag, and `@devilsdev/rag-pipeline-utils/edge` runs without Node.js APIs, on Vercel Edge Functions, Workers without the flag, Deno and Netlify Edge ([Edge runtimes](https://devilsdev.github.io/rag-pipeline-utils/docs/Deployment-Edge)).

You can also install only the parts you use: `@devilsdev/rag-core` (the pipeline), `@devilsdev/rag-connectors`, `@devilsdev/rag-eval` and `@devilsdev/rag-guardrails`. They are the full package's own parts, the same objects; `rag-eval` alone installs about 6 MB, against 33 MB for the full package. See [Packages](https://devilsdev.github.io/rag-pipeline-utils/docs/Packages).

Optional peer dependencies, installed only by projects that use them:

| Package              | Needed for                                    |
| -------------------- | --------------------------------------------- |
| `openai`             | `OpenAIConnector`                             |
| `pg`                 | `PgVectorRetriever`                           |
| `isolated-vm`        | the experimental `PluginSandbox` (version 6+) |
| `pino-pretty`        | pretty-printed logs                           |
| `@opentelemetry/api` | OpenTelemetry spans (`telemetry`)             |

Upgrading from 2.x? The [3.0 migration guide](https://devilsdev.github.io/rag-pipeline-utils/docs/Migration#upgrading-to-v300) lists the changes to make.

> **`npm install` failed with `husky: not found`?** Versions 2.0.0 to 2.6.1 ran a development hook on install. Install 2.6.2 or later: `npm install @devilsdev/rag-pipeline-utils@latest`.

## Quick start with an LLM

To generate answers, add an LLM. With Claude, `AnthropicConnector` needs no extra package; Anthropic has no embeddings API, so pair it with the offline `LocalEmbedder` (or any embedder):

```js
import {
  createRagPipeline,
  AnthropicConnector,
  LocalEmbedder,
  MemoryRetriever,
} from "@devilsdev/rag-pipeline-utils";

const docs = [
  {
    id: "vacation",
    content:
      "Full-time employees receive twenty days of paid vacation per year.",
  },
  { id: "remote", content: "Remote work is allowed two days per week." },
];
const embedder = new LocalEmbedder();
embedder.train(docs.map((doc) => doc.content));
const retriever = new MemoryRetriever();
await retriever.store(
  docs.map((doc) => ({ ...doc, vector: embedder.embed(doc.content) })),
);

const pipeline = createRagPipeline({
  embedder,
  retriever,
  // Reads ANTHROPIC_API_KEY; the default model is claude-sonnet-5-5
  llm: new AnthropicConnector({ apiKey: process.env.ANTHROPIC_API_KEY }),
});
const result = await pipeline.run({
  query: "How many vacation days do I get?",
  options: { citations: true },
});
console.log(result.answer);
console.log(result.citations.groundednessScore); // 0..1, share of grounded sentences
```

With OpenAI (`npm install openai`), the same connector can also embed:

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

Citations map every sentence of the answer to the passages that support it. A sentence whose facts or numbers are missing from the sources is reported as ungrounded, and so is one that negates its source ("employees never receive paid vacation" against "employees receive twenty days").

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

[Run it on StackBlitz](https://stackblitz.com/github/DevilsDev/rag-pipeline-utils/tree/main/examples/use-cases?file=citations.js&startScript=citations), no install or API key.

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

[Run it on StackBlitz](https://stackblitz.com/github/DevilsDev/rag-pipeline-utils/tree/main/examples/use-cases?file=evaluate.js&startScript=evaluate), no install or API key.

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

Already on LangChain, Mastra, the AI SDK or LlamaIndex? `checkAnswer` checks the answer your chain produced against the sources it was given, in the shape your framework returns them:

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

[Run it on StackBlitz](https://stackblitz.com/github/DevilsDev/rag-pipeline-utils/tree/main/examples/use-cases?file=check-answer.js&startScript=check-answer), or [paste an answer of your own](https://stackblitz.com/github/DevilsDev/rag-pipeline-utils/tree/main/examples/use-cases?file=check-your-answer.js) and its sources to see which sentences they don't support. No install or API key.

The check compares words, numbers and negation, so a correct paraphrase ("Staff working full time get 20 days of paid leave annually") is reported unsupported too. From 3.4.0, pass any LLM as `judge` and it rules on the sentences that failed for lack of word overlap, in one call per answer:

```ts
const check = await checkAnswer({ answer, sources, judge: openai }); // any llm with generate()
check.judge.verdicts; // [{ sentence, verdict, sourceId, reason, lexicalReason, decidedBy }]
```

It never overturns a sentence that failed for a wrong number or a negation, a "supported" verdict must name a source whose numbers and negation match, and output it can't parse keeps the sentence unsupported. Without `judge` nothing changes and no model is called. See [the LLM judge](https://devilsdev.github.io/rag-pipeline-utils/docs/Evaluation#paraphrases-the-optional-llm-judge).

On Mastra, `createMastraScorer({ createScorer })` runs the same check as an agent scorer, with no model calls, and `createMastraGuardrails()` adds injection detection and PII redaction as a processor ([Mastra docs](https://devilsdev.github.io/rag-pipeline-utils/docs/Integrations#mastra)).

### Ground an AI SDK app

Already using the Vercel AI SDK? `groundingMiddleware` adds retrieval, answer checks and guardrails to any AI SDK model, and your `generateText` and `streamText` calls stay as they are:

```ts
import { generateText, wrapLanguageModel } from "ai";
import { openai } from "@ai-sdk/openai";
import { groundingMiddleware } from "@devilsdev/rag-pipeline-utils";

const model = wrapLanguageModel({
  model: openai("gpt-4o-mini"),
  middleware: groundingMiddleware({ retriever, embedder }),
});

const { text, sources, providerMetadata } = await generateText({
  model,
  prompt: "How many vacation days do I get?",
});
console.log(providerMetadata.ragPipeline.grounded); // false if a sentence is unsupported
```

[Run it on StackBlitz](https://stackblitz.com/github/DevilsDev/rag-pipeline-utils/tree/main/examples/use-cases?file=ai-sdk.js&startScript=ai-sdk), offline, with the AI SDK's mock model in place of OpenAI.

Each call retrieves passages for the last user message, gives them to the model as untrusted reference data, checks the answer against them, and returns them as `sources`. The ACL, injection and PII guards are options, and from 3.4.0 a `judge` LLM can rule on paraphrases. See [the middleware docs](https://devilsdev.github.io/rag-pipeline-utils/docs/Integrations#ground-an-ai-sdk-app-with-middleware).

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

[Run it on StackBlitz](https://stackblitz.com/github/DevilsDev/rag-pipeline-utils/tree/main/examples/use-cases?file=testing.js&startScript=testing), no install or API key.

`expect.extend(ragMatchers)` adds `toBeGroundedIn`, `toCite` and `toContainNoPII` to Jest and Vitest, so `expect(result).toBeGroundedIn()` fails a test when an answer says something its sources don't ([matchers](https://devilsdev.github.io/rag-pipeline-utils/docs/Testing#matchers-for-answers)).

Writing your own plugin? `runContractTests("retriever", () => new MyRetriever())` from the same entry registers tests for the behaviour the pipeline relies on, in Jest, Vitest, Mocha or `node:test` ([contract tests](https://devilsdev.github.io/rag-pipeline-utils/docs/Testing#contract-tests-for-your-plugins)).

### Protect an internal assistant

`GuardrailsPipeline` wraps any pipeline. Access control runs before the LLM sees a document, prompt-injection detection runs on the query and, with `detectInjection`, on the retrieved documents too (indirect injection: instructions planted in a page or file you index), and PII is redacted from the answer, its citations and its evaluation details. With `strict: true`, as below, a flagged query or answer is blocked instead (`success: false`, and `error` says why).

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
    retrieval: { enforceACL: true, detectInjection: true },
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

[Run it on StackBlitz](https://stackblitz.com/github/DevilsDev/rag-pipeline-utils/tree/main/examples/use-cases?file=guardrails.js&startScript=guardrails), offline, with a stand-in LLM in place of OpenAI.

The built-in checks are patterns. From 3.5.0, each guard also takes `detectors`: an injection classifier or a PII service that finds what patterns miss, such as a person's name, alongside the patterns or instead of them. See [Plug in your own detectors](https://devilsdev.github.io/rag-pipeline-utils/docs/Concepts-Guardrails#plug-in-your-own-detectors).

How well the patterns work is measured: on public test sets they rarely raise a false alarm and miss most injections, and they find emails and SSNs but not names or addresses ([guardrail accuracy](https://devilsdev.github.io/rag-pipeline-utils/docs/Benchmarks#guardrail-accuracy), with a prompt-injection classifier for comparison). From 3.5.0, `rag-pipeline eval-guardrails cases.jsonl` measures your own detectors on cases you label, and fails CI below a `--min`.

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

[Run it on StackBlitz](https://stackblitz.com/github/DevilsDev/rag-pipeline-utils/tree/main/examples/use-cases?file=hybrid-search.js&startScript=hybrid-search), no install or API key.

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

### Fit retrieved context into a token budget

`maxContextTokens` keeps the documents sent to the LLM within a budget: it keeps the best-ranked ones that fit, cuts the top one at a word boundary when it alone is too long, and reports what it left out.

```js
const result = await pipeline.run({
  query: "How many vacation days do employees get?",
  options: { topK: 10, maxContextTokens: 2000 },
});

console.log(result.packing); // { tokens, maxTokens: 2000, kept, dropped, truncated }
```

[Run it on StackBlitz](https://stackblitz.com/github/DevilsDev/rag-pipeline-utils/tree/main/examples/use-cases?file=token-budget.js&startScript=token-budget), offline, on the test pipeline.

`packContext(documents, { maxTokens, countTokens })` does the same outside a run; pass your model's tokenizer as `countTokens` for exact counts.

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

[Run it on StackBlitz](https://stackblitz.com/github/DevilsDev/rag-pipeline-utils/tree/main/examples/use-cases?file=timeout.js&startScript=timeout), offline, with a slow stand-in LLM so the timeout fires.

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

[Run it on StackBlitz](https://stackblitz.com/github/DevilsDev/rag-pipeline-utils/tree/main/examples/use-cases?file=cache.js&startScript=cache), no install or API key.

Answers are cached only at temperature 0. See [Caching](https://devilsdev.github.io/rag-pipeline-utils/docs/Caching).

### Run fully local

Pair the `LocalEmbedder` or Ollama embeddings with an Ollama model and `FileVectorStore` for a private, offline setup. The CLI's `local` and `ollama` templates set this up for you:

```bash
npx rag-pipeline init --no-interactive --template ollama
npx rag-pipeline ingest ./docs
npx rag-pipeline serve
```

### Search your documents from Claude (MCP)

[`@devilsdev/rag-mcp-server`](https://github.com/DevilsDev/rag-pipeline-utils/tree/main/packages/rag-mcp-server) (new in 3.4.0) is an MCP server for a folder of documents. It indexes the folder offline when it starts and gives Claude, or any MCP client, two tools: `search_documents` returns the best passages with their source files, and `check_answer` checks an answer against them, sentence by sentence. No API key, no database, and the MCP SDK stays out of this package's install:

```bash
claude mcp add docs -- npx -y @devilsdev/rag-mcp-server /absolute/path/to/docs
```

To build your own server, with another embedder or a vector database, start from the [MCP server example](https://github.com/DevilsDev/rag-pipeline-utils/tree/main/examples/mcp-server).

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
  packing?: { tokens; maxTokens; kept; dropped; truncated }; // with maxContextTokens
  cache?: { embeddings; retrieval; generation };             // with a cache
  route?: { class; model; estimatedCost };                   // with createModelRouter
  timing?: { totalMs };                                      // ms since run() was called
  error?: string;                   // set when success is false
}
```

## Capabilities

| Area             | What you get                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Chunking**     | `ChunkingEngine` with sentence, fixed-size, recursive, semantic and structure-aware strategies                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| **Retrieval**    | `MemoryRetriever`, persistent `FileVectorStore`, `PgVectorRetriever` (PostgreSQL), `QdrantRetriever`, `PineconeRetriever`, `BM25Search`, `HybridRetriever` (Reciprocal Rank Fusion)                                                                                                                                                                                                                                                                                                                                                             |
| **Reranking**    | `ScoringReranker`, `EmbeddingReranker` (cached), `CascadeReranker`                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| **Citations**    | Per-sentence source mapping, hallucination report, numeric and negation checks                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| **Evaluation**   | Faithfulness, relevance, context precision, context recall (with a reference), groundedness, BLEU/ROUGE, semantic similarity with any embedder; test sets with `validateDataset`, `runEvaluation`, `compareConfigurations`, `generateSyntheticDataset` and `rag-pipeline eval`                                                                                                                                                                                                                                                                  |
| **Integrations** | `groundingMiddleware` for any AI SDK model and Mastra scorers and guardrails; `checkAnswer` for answers from LangChain, LlamaIndex, Mastra or the AI SDK; `createAiSdkAdapter`                                                                                                                                                                                                                                                                                                                                                                  |
| **Caching**      | Opt-in caches for query embeddings, retrieval and answers, in memory (`MemoryCache`) or Redis (`RedisCache`)                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| **Testing**      | `/testing` entry: offline `HashEmbedder`, `EchoLLM`, fixtures, `createTestPipeline()`; contract tests for your plugins with `runContractTests()` and `checkContract()`                                                                                                                                                                                                                                                                                                                                                                          |
| **Guardrails**   | Injection detection on queries and retrieved documents, with input normalisation; ACL and relevance filtering before generation; PII redaction                                                                                                                                                                                                                                                                                                                                                                                                  |
| **Agentic**      | `QueryPlanner`, `IterativeRetriever`, `SelfCritiqueChecker`, `AgenticPipeline`                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| **GraphRAG**     | `KnowledgeGraph`, `EntityExtractor`, `GraphRetriever`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| **Streaming**    | Token streaming with a final chunk carrying citations, evaluation and the time to first token; `SSEAdapter`, `WebSocketAdapter`                                                                                                                                                                                                                                                                                                                                                                                                                 |
| **Cost**         | `CostTracker`, `TokenBudget`, `CostCalculator` with sourced, overridable pricing; `packContext()` and `maxContextTokens` fit retrieved documents into a token budget; `createModelRouter` sends each query to the cheapest model suited to it                                                                                                                                                                                                                                                                                                   |
| **Operations**   | `DevServer` HTTP API, `ExecutionTracer`, `metrics` (counters, gauges, histograms), `eventLogger`, coded errors with suggestions (`createError`), `AuditLogger`, MCP tool definitions (`MCPServer`), an installable MCP server ([`@devilsdev/rag-mcp-server`](https://github.com/DevilsDev/rag-pipeline-utils/tree/main/packages/rag-mcp-server), 3.4.0) and an [MCP server example](https://github.com/DevilsDev/rag-pipeline-utils/tree/main/examples/mcp-server) for Claude and other MCP clients; OpenTelemetry spans with `telemetry: true` |

## How it compares

A short summary of the [comparison page](https://devilsdev.github.io/rag-pipeline-utils/docs/Comparison) (as of November 2026). Mastra and the AI SDK are often used together with this library rather than instead of it.

|               | rag-pipeline-utils                                                                       | LangChain.js                       | Mastra                               | Vercel AI SDK                           |
| ------------- | ---------------------------------------------------------------------------------------- | ---------------------------------- | ------------------------------------ | --------------------------------------- |
| Focus         | RAG with grounding, evaluation and guardrails                                            | General-purpose LLM orchestration  | Agents and workflows                 | Model calls, streaming, tools, UI hooks |
| Evaluation    | Deterministic metrics, no model calls; CLI and GitHub Action that fail CI on regressions | `openevals` (LLM judge), LangSmith | LLM-judge scorers in `@mastra/evals` | None built in                           |
| Citations     | Per sentence, with a groundedness score and number and negation checks                   | Wired up by hand                   | Wired up by hand                     | Passes provider citations through       |
| Guardrails    | ACL before generation, injection detection (pattern-based), PII redaction                | Via integrations                   | Model-based processors               | Middleware you write                    |
| Vector stores | Memory, file, pgvector, Qdrant and Pinecone, plus a plugin contract                      | 50+ integrations                   | Many integrations                    | Bring your own                          |
| Agents        | Query planning and iterative retrieval                                                   | Mature agent framework             | Agents, workflows, memory            | Tool calling and agent loops            |

Choose LangChain.js for the widest integration catalogue, Mastra for agents and workflows with LLM-judge evals, and the AI SDK as the model layer; use this library for the retrieval, grounding and evaluation parts, on its own or under any of them. **LlamaIndex.TS is deprecated** (its repository is archived); see [Coming from LlamaIndex.TS](https://devilsdev.github.io/rag-pipeline-utils/docs/Migration-LlamaIndex).

## Connectors and plugins

| Connector            | Embeddings | Generation | Notes                                                                                                                |
| -------------------- | :--------: | :--------: | -------------------------------------------------------------------------------------------------------------------- |
| `OpenAIConnector`    |     ✓      |     ✓      | `OPENAI_API_KEY`; `baseURL` for OpenAI-compatible APIs (Groq, Together, vLLM, LM Studio); needs `npm install openai` |
| `AnthropicConnector` |            |     ✓      | `ANTHROPIC_API_KEY`                                                                                                  |
| `CohereConnector`    |     ✓      |            | Embeddings and reranking, `COHERE_API_KEY`                                                                           |
| `OllamaConnector`    |     ✓      |     ✓      | Local models, no key                                                                                                 |
| `LocalEmbedder`      |     ✓      |            | Offline TF-IDF, fitted to your corpus                                                                                |

`PgVectorRetriever`, `QdrantRetriever` and `PineconeRetriever` (coming in 3.6.0) store and search documents in PostgreSQL with pgvector, Qdrant and Pinecone ([vector stores](https://devilsdev.github.io/rag-pipeline-utils/docs/Concepts-Connectors#postgresql-with-pgvector)); `efSearch` trades pgvector query speed for recall. Their ingest speed, query latency and recall, measured in CI, are on the [Benchmarks page](https://devilsdev.github.io/rag-pipeline-utils/docs/Benchmarks).

Vercel AI SDK models (any provider it supports) work as the embedder and LLM through `createAiSdkAdapter`; see [Use with other frameworks](https://devilsdev.github.io/rag-pipeline-utils/docs/Integrations).

Connectors read API keys when they are created, retry only transient failures (network errors, 429, 5xx) with backoff, and send retrieved documents to the model as clearly delimited, untrusted reference data rather than as instructions.

A plugin is any object with the method its stage needs: `embed()`, `retrieve()`/`store()`, `generate()`, `rerank()` or `load()`. Reference your own modules from `.ragrc.json`, or install packaged plugins with checksum verification and a static security scan:

```bash
npx rag-pipeline hub install ./my-llm-plugin        # also .tgz files, npm:<package> or a registry
npx rag-pipeline hub certify check ./my-llm-plugin   # scores contract, security, tests and docs
```

## Experimental modules

Simulated or incomplete modules live under a separate entry point and are not covered by the stability guarantees in [SEMVER.md](https://github.com/DevilsDev/rag-pipeline-utils/blob/main/SEMVER.md): model training, federated learning, multimodal processing, adaptive retrieval, SSO providers, multi-tenancy, data governance, the plugin sandbox and the plugin certification class.

```js
import { TenantManager } from "@devilsdev/rag-pipeline-utils/experimental";
```

They are exported only from `/experimental`, not from the main entry (2.x also exported them there, with a deprecation warning). Do not use them for authentication, tenant isolation or compliance. The [Experimental modules](https://devilsdev.github.io/rag-pipeline-utils/docs/Experimental) page describes what each one really does.

## Compatibility

|                |                                                                                                                                     |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| Node.js        | 22 and 24                                                                                                                           |
| Module formats | CommonJS (`require`) and ESM (`import`)                                                                                             |
| TypeScript     | Declarations for every export, including `/experimental`, compiled and run against the package in CI                                |
| Versioning     | Semantic versioning with a deprecation window, see [SEMVER.md](https://github.com/DevilsDev/rag-pipeline-utils/blob/main/SEMVER.md) |
| Supply chain   | Published from GitHub Actions with npm provenance                                                                                   |

## Documentation

- [Documentation site](https://devilsdev.github.io/rag-pipeline-utils/): guides, API reference and deployment
- [CLI reference](https://devilsdev.github.io/rag-pipeline-utils/docs/CLI)
- [API reference](https://devilsdev.github.io/rag-pipeline-utils/docs/API-Reference)
- [Generated API reference](https://devilsdev.github.io/rag-pipeline-utils/docs/api): every export, with its methods, options and types
- [Evaluation guide](https://devilsdev.github.io/rag-pipeline-utils/docs/Evaluation)
- [Examples](https://github.com/DevilsDev/rag-pipeline-utils/tree/main/examples): basic pipeline, OpenAI with Pinecone, a deployable Fastify service, a Cloudflare Worker and an MCP server for Claude and other MCP clients ([run the basic pipeline in your browser](https://stackblitz.com/github/DevilsDev/rag-pipeline-utils/tree/main/examples/basic-pipeline))
- [Changelog](https://github.com/DevilsDev/rag-pipeline-utils/blob/main/CHANGELOG.md), [benchmark results](https://devilsdev.github.io/rag-pipeline-utils/docs/Benchmarks) and [methodology](https://github.com/DevilsDev/rag-pipeline-utils/blob/main/BENCHMARKS.md)

## Security

Report vulnerabilities privately as described in [SECURITY.md](https://github.com/DevilsDev/rag-pipeline-utils/blob/main/SECURITY.md). The [security capability matrix](https://devilsdev.github.io/rag-pipeline-utils/docs/Security-Capabilities) lists what is hardened, what is recommended configuration, and what is an example only.

## Contributing

Issues and pull requests are welcome. Start with the [contributing guide](https://github.com/DevilsDev/rag-pipeline-utils/blob/main/docs/CONTRIBUTING.md), and use [GitHub Discussions](https://github.com/DevilsDev/rag-pipeline-utils/discussions) for questions and ideas. Run `npm test` and `npm run lint` before opening a pull request.

## License

[MIT](https://github.com/DevilsDev/rag-pipeline-utils/blob/main/LICENSE)
