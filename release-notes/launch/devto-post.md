---
title: "A benchmark found my RAG library ignoring most words. Now my answers get tested in CI"
published: false
description: How a retrieval benchmark caught a bug that made most queries embed to zeros, and how to put RAG answer quality in your Node.js CI with rag-pipeline-utils 3.2.
tags: node, ai, rag, testing
series:
canonical_url:
---

# A benchmark found my RAG library ignoring most words. Now my answers get tested in CI

I maintain [`@devilsdev/rag-pipeline-utils`](https://www.npmjs.com/package/@devilsdev/rag-pipeline-utils), a retrieval-augmented generation library for Node.js. Its unit tests were green: thousands of them. Then I ran its offline retriever against a public benchmark, BEIR SciFact, and it scored **0.12 nDCG@10**. Plain BM25 scores 0.665 on the same data.

The bug was one line of intent turned around. When a corpus had more distinct words than the vocabulary limit (10,000), the TF-IDF embedder kept the _rarest_ words, mostly ones that appear in a single document. So most queries contained no word the embedder knew, and embedded to a vector of zeros. Every small test corpus fit under the limit, so no unit test ever hit it. After the fix the score went to **0.47**.

The same benchmark run found two more problems in two brand-new vector stores before they were released: Qdrant requests stalled about 40 ms each on compressed responses, and pgvector silently returned at most 40 rows whatever `topK` you asked for.

None of these were exceptions or failing assertions. They were answers that got quietly worse. That is the normal way RAG breaks: someone changes the chunk size, the prompt, the model or the embedder, everything still runs, and the answers drift. Unit tests can't see it. So I built the library around measuring it.

## The pipeline, in short

```bash
npm install @devilsdev/rag-pipeline-utils
```

`createRagPipeline()` wires an embedder, a retriever, an optional reranker and an LLM. Each stage is a small JavaScript contract (`embed()`, `retrieve()`, `generate()`...), so a Vercel AI SDK model, your own vector store or a test double all plug in the same way. It ships connectors for OpenAI, Anthropic, Cohere and Ollama, stores for pgvector and Qdrant, and an offline TF-IDF embedder with an in-memory store, so everything below runs without an API key.

## 1. Check every answer against its sources

An answer that sounds right and cites nothing is the failure users notice. `CitationTracker` maps each sentence of an answer to the passages that support it, and it checks that the numbers in the answer appear in the sources:

```js
import { CitationTracker } from "@devilsdev/rag-pipeline-utils";

const sources = [
  {
    id: "policy",
    content: "Employees receive twenty days of paid vacation per year.",
  },
];
const tracker = new CitationTracker();

tracker.track(
  "Employees receive twenty days of paid vacation per year.",
  sources,
).groundednessScore; // 1
tracker.track(
  "Employees receive thirty days of paid vacation per year.",
  sources,
).groundednessScore; // 0: the number does not match the source
```

Already on LangChain, LlamaIndex, Mastra or the AI SDK? You don't have to switch. `checkAnswer` takes the answer and the documents in the shape your framework returns them (`pageContent` and `metadata` included):

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

check.grounded; // false
check.unsupported.length; // 1
```

If that's all you need, `npm install @devilsdev/rag-eval` gets just the evaluation part, about 6 MB.

## 2. Score a test set, and fail the build when it drops

Set up a project with `npx rag-pipeline init --template openai` (or `ollama`, `anthropic`) and `npx rag-pipeline ingest docs/`. Then keep a JSON file of questions, with the expected answer and the documents that should be found:

```json
[
  {
    "prompt": "How many vacation days do I get?",
    "expected": "Twenty days of paid vacation per year.",
    "sourceIds": ["docs/vacation.md"]
  }
]
```

No test set yet? `rag-pipeline generate-dataset` drafts one from your documents for you to review. Then:

```bash
# on main: score the set and save it as the baseline
npx rag-pipeline eval tests.json --min faithfulness=0.8 --output main.json

# on a pull request: fail if any metric or case got worse than main
npx rag-pipeline eval tests.json --baseline main.json
```

It scores faithfulness, relevance, context precision and, with a reference answer, context recall, plus whether the expected documents were retrieved at all. With the offline `local` template there is no LLM, so only retrieval is scored. The report lists which cases got worse and why, and can be written as Markdown or HTML.

On GitHub, [`rag-eval-action`](https://github.com/marketplace/actions/rag-pipeline-eval) does the main-versus-PR comparison for you and posts the result as a comment on every pull request. A prompt tweak that makes answers stop using the documents now fails review the same way a broken test does.

## 3. Test RAG code without a network

Tests that call a real model are slow, cost money and flake. `/testing` has a deterministic embedder, an LLM that echoes the top passage and records every call, and fixture documents:

```js
import { createTestPipeline } from "@devilsdev/rag-pipeline-utils/testing";

const { pipeline, llm } = await createTestPipeline();
const result = await pipeline.run({
  query: "How many vacation days do I get?",
});

result.results[0].id; // "vacation"
llm.calls.length; // 1
```

If you write your own retriever or LLM wrapper, `runContractTests("retriever", () => new MyRetriever())` registers tests for everything the pipeline relies on (sorted scores, `topK`, cancellation...), in Jest, Vitest, Mocha or `node:test`.

## What 3.2 and 3.3 added

[3.3.0](https://devilsdev.github.io/rag-pipeline-utils/blog/v3-3-release) brings the checks to the tools you already use:

- **AI SDK middleware.** `wrapLanguageModel({ model, middleware: groundingMiddleware({ retriever }) })` adds retrieval, answer checks and guardrails to any Vercel AI SDK model; `generateText` and `streamText` stay as they are, and the passages come back as `sources`.
- **Matchers.** `expect(result).toBeGroundedIn()`, `toCite("vacation")` and `toContainNoPII()` for Jest and Vitest.
- **Mastra.** Scorers that make no model calls, and a guardrails processor.
- **Negation.** The grounding check now catches answers that contradict their source.

[3.2.0](https://devilsdev.github.io/rag-pipeline-utils/blog/v3-2-release), the week before:

- **Install only what you use.** Four packages, `@devilsdev/rag-core`, `rag-connectors`, `rag-eval` and `rag-guardrails`, and the main package re-exports all of them. The full install went from 48 MB to 33 MB.
- **Cheaper model per query.** `createModelRouter` classifies each question and sends lookups to a small model and harder questions to a large one, with the estimated cost of each choice on the result.
- **OpenTelemetry.** `telemetry: true` records each run as spans that follow the GenAI semantic conventions, so your tracing backend shows the model, tokens and timings per stage. Prompts aren't recorded unless you opt in.
- **Time to first token.** Streamed answers report `firstTokenMs`, measured from the start of the run, so retrieval time is included.
- **Edge runtimes.** The pipeline runs in Cloudflare Workers, tested in workerd in CI, and an `/edge` entry runs where there are no Node.js APIs at all.
- **An MCP server example**, so Claude Desktop and other MCP clients can search your indexed documents.

## What it isn't

The grounding check is deterministic: it compares the words and numbers in each sentence with the sources, with no model involved, so it costs nothing and gives the same result every run. Since 3.3 it also catches negation: "employees never receive paid vacation" no longer matches a source that says they get twenty days. The price is that it misses paraphrases; an optional LLM-judge mode for the cases words can't settle is planned.

It also isn't an agent framework, and it doesn't host anything or ship its own vector database. If you need a large integration catalogue or agents, LangChain.js and Mastra are better choices, and the [comparison page](https://devilsdev.github.io/rag-pipeline-utils/docs/Comparison) says where each one wins. This library aims to be the grounding, evaluation and guardrails layer, used on its own or next to those.

## The lesson

Benchmark what your users experience, not just what your functions return. My unit tests checked that `train()` built a vocabulary; they never asked whether the vocabulary was any good. One public dataset and one number answered that.

If you run RAG in production, how do you catch quality regressions today: an offline test set in CI, sampling live traffic, or user reports? I'd like to hear what works.

---

- npm: [@devilsdev/rag-pipeline-utils](https://www.npmjs.com/package/@devilsdev/rag-pipeline-utils)
- GitHub: [DevilsDev/rag-pipeline-utils](https://github.com/DevilsDev/rag-pipeline-utils)
- Docs: [devilsdev.github.io/rag-pipeline-utils](https://devilsdev.github.io/rag-pipeline-utils/)
- Benchmarks and method: [Benchmarks](https://devilsdev.github.io/rag-pipeline-utils/docs/Benchmarks)
- GitHub Action: [rag-eval-action](https://github.com/DevilsDev/rag-eval-action)
