---
id: Comparison
title: Comparison vs Other Frameworks
sidebar_label: Comparison
description: Honest comparison of @devilsdev/rag-pipeline-utils with LangChain.js, Mastra and the Vercel AI SDK, including where we lose, and what to do now that LlamaIndex.TS is deprecated.
---

import ComparisonTable from "@site/src/components/ComparisonTable";
import MigrationCards from "@site/src/components/MigrationCards";

# Comparison vs Other Frameworks

This page exists to give you a decision framework, not to sell you on
this package. Where the alternatives win, we say so. Two of them,
Mastra and the Vercel AI SDK, are as often used **together with** this
library as instead of it, so the page says how they combine too.

> **Currency**: this comparison reflects each project as of
> **November 2026** (this library 3.9.0; Mastra `@mastra/core` 1.82, AI SDK 7.0). The
> JS AI ecosystem moves fast; if you read this months later, check the
> points where each project has likely improved.

:::note[LlamaIndex.TS is deprecated]
LlamaIndex.TS (`llamaindex` on npm) was deprecated by its maintainers and
its repository archived in 2026; the last release is 0.12.1 (December
2025). LlamaIndex for Python is unaffected. If you are moving off it, see
[Coming from LlamaIndex.TS](./Migration-LlamaIndex).
:::

## At a glance

<ComparisonTable>

| Dimension                 | `@devilsdev/rag-pipeline-utils`                                                                                                                                             | LangChain.js                                                                                               | Mastra                                                                                           | Vercel AI SDK                                                               |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------- |
| **Primary focus**         | RAG pipelines with grounding, evaluation and guardrails                                                                                                                     | General-purpose LLM orchestration                                                                          | TypeScript framework for agents and workflows                                                    | Provider-neutral model calls, streaming, tools and UI hooks                 |
| **License**               | MIT                                                                                                                                                                         | MIT                                                                                                        | Apache-2.0 (ee/ folders: Mastra Enterprise License)                                              | Apache-2.0                                                                  |
| **RAG pipeline**          | ✅ `createRagPipeline`: embed, retrieve, rerank, pack context, generate                                                                                                     | ✅ Retrievers and chains                                                                                   | ✅ `@mastra/rag`: chunking, vector query tool, reranking, GraphRAG                               | 🟡 Building blocks (`embed`, `embedMany`, `rerank`); you write the pipeline |
| **Evaluation**            | ✅ Deterministic: faithfulness, relevance, context precision and recall, retrieval of expected sources; CLI and GitHub Action for CI; an optional LLM judge for paraphrases | 🟡 `openevals` (LLM-judge) and LangSmith (hosted)                                                          | ✅ `@mastra/evals`: 17 built-in scorers (faithfulness, context precision...) plus 11 code checks | ❌ None built in                                                            |
| **Citations**             | ✅ Per sentence, with a groundedness score and number, negation and condition checks                                                                                        | 🟡 Provider citations passed through (such as Anthropic's); otherwise wired up by hand                     | 🟡 Wired up by hand                                                                              | 🟡 Passes provider citations through; doesn't check them                    |
| **Guardrails**            | ✅ ACL filtering before generation, injection detection on the query and retrieved documents, PII redaction (pattern-based)                                                 | 🟡 Built-in PII redaction (pattern-based) and human approval middleware; prompt-injection checks you write | ✅ Processors: prompt injection, PII, moderation, system-prompt scrubbing (model-based)          | 🟡 Middleware you write                                                     |
| **Vector stores**         | ✅ In-memory and JSON file, PostgreSQL/pgvector, Qdrant, Pinecone and Weaviate, BM25 and hybrid search, plus a plugin contract                                              | ✅ About 20 listed integrations, including pgvector, Pinecone, Qdrant and Weaviate                         | ✅ Many integrations (`@mastra/pg`, Pinecone, Qdrant...)                                         | ❌ Bring your own                                                           |
| **LLM providers**         | ✅ OpenAI (and compatible), Anthropic, Ollama, and any AI SDK model through `createAiSdkAdapter`                                                                            | ✅ Largest ecosystem                                                                                       | ✅ Own model router, with 200+ providers listed                                                  | ✅ Largest provider catalogue                                               |
| **Agents and tools**      | 🟡 Query planning and iterative retrieval                                                                                                                                   | ✅ Mature agent framework                                                                                  | ✅ Agents, workflows, memory                                                                     | ✅ Tool calling and agent loops                                             |
| **Runs offline in tests** | ✅ TF-IDF embedder, test doubles, contract tests for your plugins                                                                                                           | 🟡 Fake chat models (`fakeModel`, `FakeListChatModel`)                                                     | 🟡 Tool mocks in experiments; no documented mock model                                           | ✅ Mock providers                                                           |
| **Edge runtimes**         | ✅ Cloudflare Workers, including without nodejs_compat (tested in workerd)                                                                                                  | ✅ Cloudflare Workers, Vercel Edge, Deno, Bun and browsers                                                 | ✅ Official Cloudflare Workers deployer                                                          | ✅ Designed for it                                                          |
| **Install size**          | 34 MB full; `@devilsdev/rag-eval` alone about 6 MB                                                                                                                          | About 66 MB (`langchain` + `@langchain/core`)                                                              | About 148 MB (`@mastra/core` alone)                                                              | About 25 MB (`ai` alone; providers separate)                                |
| **Module format**         | ESM and CommonJS                                                                                                                                                            | ESM and CommonJS                                                                                           | ESM and CommonJS                                                                                 | ESM only (since AI SDK 7)                                                   |
| **Stability policy**      | ✅ Documented [SEMVER policy](https://github.com/DevilsDev/rag-pipeline-utils/blob/main/SEMVER.md)                                                                          | Versioned per package                                                                                      | Versioned per package                                                                            | Versioned, with codemods for majors                                         |

</ComparisonTable>

### Sources

- **LangChain.js:** [README](https://cdn.jsdelivr.net/npm/langchain@1.5.14/README.md), [guardrails](https://docs.langchain.com/oss/javascript/langchain/guardrails), [vector stores](https://docs.langchain.com/oss/javascript/integrations/vectorstores), [openevals](https://docs.langchain.com/langsmith/openevals), [ChatAnthropic](https://docs.langchain.com/oss/javascript/integrations/chat/anthropic), [retrieval](https://docs.langchain.com/oss/javascript/langchain/retrieval), [unit testing](https://docs.langchain.com/oss/javascript/langchain/test/unit-testing), [`FakeListChatModel`](https://reference.langchain.com/javascript/langchain-core/utils/testing/FakeListChatModel)
- **Mastra:** [licensing](https://mastra.ai/docs/community/licensing), [built-in scorers](https://mastra.ai/docs/evals/built-in-scorers), [guardrails](https://mastra.ai/docs/agents/guardrails), [Cloudflare deployer](https://mastra.ai/reference/deployer/cloudflare), [RAG](https://mastra.ai/reference/rag/overview), [RAG chatbot guide](https://mastra.ai/articles/rag-chatbot), [experiments](https://mastra.ai/docs/evals/experiments), [model providers](https://mastra.ai/models/providers)
- **Vercel AI SDK:** [AI SDK 7 migration guide](https://ai-sdk.dev/docs/migration-guides/migration-guide-7-0), [reranking](https://ai-sdk.dev/docs/ai-sdk-core/reranking), [testing](https://ai-sdk.dev/docs/ai-sdk-core/testing), [generating text](https://ai-sdk.dev/docs/ai-sdk-core/generating-text), [middleware](https://ai-sdk.dev/docs/ai-sdk-core/middleware)
- **LlamaIndex.TS:** [repository](https://github.com/run-llama/LlamaIndexTS)

Checked on 10 November 2026 against langchain 1.5, @mastra/core 1.82 and ai 7.0.

Install sizes: node_modules after a fresh install of the named packages, measured 10 November 2026.

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

- You need a **large catalogue** of vector store, LLM and tool
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
- You want those checks to be **deterministic and free**: by default no
  judge model, the same result every run, offline in tests. The trade-off
  is that word overlap misses paraphrases that an LLM judge would accept.
  Since 3.4.0 you can pass a judge to `checkAnswer` for those sentences
  only; the lexical checks stay in charge and it costs one call per answer.
- You need **access control before generation**: documents a user may
  not see are filtered out before the model reads them.
- You need a **narrow surface for security review**: one package or only
  the parts you use, MIT, no required SaaS.

## Migration friction

<MigrationCards archived="LlamaIndex.TS">

| From             | Effort     | What's involved                                                                                                                                                          |
| ---------------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| LlamaIndex.TS    | Low–Medium | Vector-index RAG maps directly; see [Coming from LlamaIndex.TS](./Migration-LlamaIndex). Summary, tree and keyword-table indexes have no equivalent and need rethinking. |
| LangChain.js     | Medium     | Chain composition becomes a pipeline; keep custom retrievers and prompts with light wrapping. Or keep the chain and add `checkAnswer` and `rag-pipeline eval` alongside. |
| AI SDK (DIY RAG) | Low        | Pass your AI SDK models through `createAiSdkAdapter`; your retrieval code becomes a retriever plugin.                                                                    |
| Custom in-house  | Low–Medium | The plugin contracts let you keep your retriever and embedder code; `runContractTests` checks they behave as the pipeline expects.                                       |

</MigrationCards>

## Cost considerations

All of these are free and open source; operating costs come from
embedding and LLM API calls and vector store hosting. One difference is
evaluation: LLM-judge metrics (Mastra, `openevals`, LangSmith) make model
calls for every scored answer, while this library's metrics make none unless you pass the optional judge.

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
