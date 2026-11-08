---
id: Comparison
title: Comparison vs Other Frameworks
sidebar_label: Comparison
description: Honest comparison of @devilsdev/rag-pipeline-utils with LangChain.js, Mastra and the Vercel AI SDK, including where we lose, and what to do now that LlamaIndex.TS is deprecated.
---

# Comparison vs Other Frameworks

This page exists to give you a decision framework, not to sell you on
this package. Where the alternatives win, we say so. Two of them,
Mastra and the Vercel AI SDK, are as often used **together with** this
library as instead of it, so the page says how they combine too.

> **Currency**: this comparison reflects each project as of
> **November 2026** (3.2.0; Mastra `@mastra/core` 1.81, AI SDK 7.0). The
> JS AI ecosystem moves fast; if you read this months later, check the
> points where each project has likely improved.

:::note[LlamaIndex.TS is deprecated]
LlamaIndex.TS (`llamaindex` on npm) was deprecated by its maintainers and
its repository archived in 2026; the last release is 0.12.1 (December
2025). LlamaIndex for Python is unaffected. If you are moving off it, see
[Coming from LlamaIndex.TS](./Migration-LlamaIndex).
:::

## At a glance

| Dimension                 | `@devilsdev/rag-pipeline-utils`                                                                                                      | LangChain.js                                      | Mastra                                                                                            | Vercel AI SDK                                                               |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------- | ------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| **Primary focus**         | RAG pipelines with grounding, evaluation and guardrails                                                                              | General-purpose LLM orchestration                 | TypeScript framework for agents and workflows                                                     | Provider-neutral model calls, streaming, tools and UI hooks                 |
| **License**               | MIT                                                                                                                                  | MIT                                               | Apache-2.0                                                                                        | Apache-2.0                                                                  |
| **RAG pipeline**          | ✅ `createRagPipeline`: embed, retrieve, rerank, pack context, generate                                                              | ✅ Retrievers and chains                          | ✅ `@mastra/rag`: chunking, vector query tool, reranking, GraphRAG                                | 🟡 Building blocks (`embed`, `embedMany`, `rerank`); you write the pipeline |
| **Evaluation**            | ✅ Deterministic: faithfulness, relevance, context precision and recall, retrieval of expected sources; CLI and GitHub Action for CI | 🟡 `openevals` (LLM-judge) and LangSmith (hosted) | ✅ `@mastra/evals`: about 20 LLM-judge scorers (faithfulness, context recall...) plus code checks | ❌ None built in                                                            |
| **Citations**             | ✅ Per sentence, with a groundedness score and number and negation checks                                                            | 🟡 Wired up by hand                               | 🟡 Wired up by hand                                                                               | 🟡 Passes provider citations through; doesn't check them                    |
| **Guardrails**            | ✅ ACL filtering before generation, injection detection on the query and retrieved documents, PII redaction (pattern-based)          | 🟡 Via integrations                               | ✅ Processors: prompt injection, PII, moderation, system-prompt scrubbing (model-based)           | 🟡 Middleware you write                                                     |
| **Vector stores**         | In-memory and JSON file, PostgreSQL/pgvector and Qdrant, BM25 and hybrid search, plus a plugin contract                              | ✅ 50+ integrations                               | ✅ Many integrations (`@mastra/pg`, Pinecone, Qdrant...)                                          | ❌ Bring your own                                                           |
| **LLM providers**         | OpenAI (and compatible), Anthropic, Cohere, Ollama, and any AI SDK model through `createAiSdkAdapter`                                | ✅ Largest ecosystem                              | ✅ Through the AI SDK's providers                                                                 | ✅ Largest provider catalogue                                               |
| **Agents and tools**      | 🟡 Query planning and iterative retrieval                                                                                            | ✅ Mature agent framework                         | ✅ Agents, workflows, memory                                                                      | ✅ Tool calling and agent loops                                             |
| **Runs offline in tests** | ✅ TF-IDF embedder, test doubles, contract tests for your plugins                                                                    | 🟡 Fake models                                    | 🟡 Mock models                                                                                    | ✅ Mock providers                                                           |
| **Edge runtimes**         | ✅ Cloudflare Workers (tested in workerd), `/edge` entry without Node.js APIs                                                        | 🟡 Partial                                        | 🟡 Partial                                                                                        | ✅ Designed for it                                                          |
| **Install size**          | 34 MB full; `@devilsdev/rag-eval` alone about 6 MB                                                                                   | Varies by packages                                | Large (framework, storage, telemetry)                                                             | Small core, providers separate                                              |
| **Module format**         | ESM and CommonJS                                                                                                                     | Mostly ESM                                        | ESM                                                                                               | ESM and CommonJS                                                            |
| **Stability policy**      | ✅ Documented [SEMVER policy](https://github.com/DevilsDev/rag-pipeline-utils/blob/main/SEMVER.md)                                   | Versioned per package                             | Versioned per package                                                                             | Versioned, with codemods for majors                                         |

## Use them together

- **With the AI SDK:** use any AI SDK model as this library's embedder and
  LLM with [`createAiSdkAdapter`](./Integrations), or keep calling
  `generateText` yourself and check the answer with
  [`checkAnswer`](./Integrations#check-an-answer-from-any-framework).
- **With Mastra:** keep your agents and workflows, and use
  `checkAnswer` or `@devilsdev/rag-eval` as a deterministic first pass
  that costs no model calls, before Mastra's LLM-judge scorers.
- **With LangChain.js:** `checkAnswer` takes LangChain `Document`s
  (`pageContent`, `metadata`) as they come out of a retrieval chain, and
  `rag-pipeline eval` can score a test set against your chain's answers.

## Where each one wins

### LangChain.js wins when…

- You need the **largest catalogue** of vector store, LLM and tool
  integrations without writing connectors.
- Your application is **broader than RAG**: agents, tool use, multi-step
  workflows, structured output.
- You want a **hosted observability and evaluation product** (LangSmith).

### Mastra wins when…

- You're building **agents and workflows** in TypeScript and want RAG,
  memory, evals and guardrails in one framework with a local dev studio.
- You want **LLM-judge metrics** for things word overlap can't settle,
  such as paraphrases, tone or rubric scoring, and accept their per-call
  cost and variability.
- You want **model-based guardrails** (a classifier model rather than
  patterns).

### The Vercel AI SDK wins when…

- You mostly need **model calls**: one API over every provider,
  streaming, tool calling, and React, Svelte or Vue hooks for chat UIs.
- You'd rather **assemble your own retrieval** from small primitives.
  It's an excellent base layer, and this library runs on top of it.

### `@devilsdev/rag-pipeline-utils` wins when…

- **Grounding and evaluation are requirements.** Every answer comes back
  with per-sentence citations and a groundedness score, numbers and negation are checked against the sources, and `rag-pipeline eval`
  fails CI when answers get worse than on your main branch.
- You want those checks to be **deterministic and free**: no judge model,
  the same result every run, offline in tests. The trade-off is that
  word overlap misses paraphrases that an LLM judge would accept.
- You need **access control before generation**: documents a user may
  not see are filtered out before the model reads them.
- You need a **narrow surface for security review**: one package or only
  the parts you use, MIT, no required SaaS.

## Migration friction

| From             | Effort     | What's involved                                                                                                                                                          |
| ---------------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| LlamaIndex.TS    | Low–Medium | Vector-index RAG maps directly; see [Coming from LlamaIndex.TS](./Migration-LlamaIndex). Summary, tree and keyword-table indexes have no equivalent and need rethinking. |
| LangChain.js     | Medium     | Chain composition becomes a pipeline; keep custom retrievers and prompts with light wrapping. Or keep the chain and add `checkAnswer` and `rag-pipeline eval` alongside. |
| AI SDK (DIY RAG) | Low        | Pass your AI SDK models through `createAiSdkAdapter`; your retrieval code becomes a retriever plugin.                                                                    |
| Custom in-house  | Low–Medium | The plugin contracts let you keep your retriever and embedder code; `runContractTests` checks they behave as the pipeline expects.                                       |

## Cost considerations

All of these are free and open source; operating costs come from
embedding and LLM API calls and vector store hosting. One difference is
evaluation: LLM-judge metrics (Mastra, `openevals`, LangSmith) make model
calls for every scored answer, while this library's metrics make none.

## Honest non-goals

This library does not try to be:

- **An agent framework.** Use Mastra, LangChain or the AI SDK for agents,
  and this library for the RAG and grounding parts.
- **A no-code builder or a hosted service.** It's a Node.js library with
  no UI.
- **A vector database.** Bring your own, or use the in-memory and file
  stores for development.
- **A Python framework.** Node.js 22 or later only.

## How to decide

Pick `@devilsdev/rag-pipeline-utils` (on its own or next to the others)
if you can answer **yes** to:

- Is your primary workload **RAG** on **Node.js 22+** or Workers?
- Do you need **citations or evaluation** you can run in CI?
- Do you value **deterministic checks** and a small API over breadth?
- Are you comfortable writing a 50-line plugin for an integration that
  doesn't ship?

Pick **LangChain.js** for integration breadth or LangSmith, **Mastra**
for agents and workflows with LLM-judge evals, and the **AI SDK** as
your model layer under any of them.

## See also

- [Coming from LlamaIndex.TS](./Migration-LlamaIndex)
- [Integrations](./Integrations): the AI SDK adapter and `checkAnswer`
- [Concept overview](./Concepts-Core)
- [Evaluation](./Evaluation): the metrics and their limits
