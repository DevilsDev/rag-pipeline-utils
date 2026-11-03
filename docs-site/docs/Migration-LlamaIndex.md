---
id: Migration-LlamaIndex
title: Coming from LlamaIndex.TS
sidebar_label: From LlamaIndex.TS
description: LlamaIndex.TS is deprecated. How its documents, indexes, query engines, rerankers and evaluators map to @devilsdev/rag-pipeline-utils, and how to move one step at a time.
---

# Coming from LlamaIndex.TS

LlamaIndex.TS (`llamaindex` on npm) is deprecated: its maintainers archived the repository in 2026, and the last release is 0.12.1 (December 2025). Existing installs keep working, but they get no fixes, including security fixes, and no support for new models. This page maps its main concepts to this library, so you can move a vector-index RAG app over.

You don't have to move everything at once. The first step below works with your LlamaIndex code unchanged.

## Step 1: check the answers you have now

`checkAnswer` reads LlamaIndex's `NodeWithScore` objects (`{ node, score }`) as they come back in `response.sourceNodes`. Run it on your current query engine's answers to get per-sentence citations and a groundedness score, before you change anything else:

```ts
// your existing LlamaIndex code
const response = await queryEngine.query({ query });
const answer = response.message.content;
const sources = response.sourceNodes;
```

```js
import { checkAnswer } from "@devilsdev/rag-pipeline-utils";

// The shape of response.sourceNodes
const sources = [
  {
    node: {
      id_: "handbook",
      text: "Full-time employees receive twenty days of paid vacation per year.",
    },
    score: 0.82,
  },
];

const check = await checkAnswer({
  question: "How many vacation days do I get?",
  answer: "Full-time employees receive twenty days of paid vacation per year.",
  sources,
});

console.log(check.grounded); // true
```

Saved as a test set, the same questions become your baseline: run `rag-pipeline eval` against the new pipeline as you migrate and it tells you if answers got worse ([Evaluation in CI](./Evaluation)).

## Concepts

| LlamaIndex.TS                                            | Here                                                                                                                                  |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `new Document({ text, id_, metadata })`                  | A plain object `{ id, content, metadata }`                                                                                            |
| `SimpleDirectoryReader().loadData(dir)`                  | `rag-pipeline ingest <dir>` (Markdown, text, HTML and CSV), or read the files yourself; extract PDFs to text first                    |
| `SentenceSplitter` / node parsers                        | `ChunkingEngine` (`recursive`, `sentence`, `semantic`, `fixed-size` and `structure-aware` strategies); `ingest` chunks for you        |
| `Settings.llm = new OpenAI(...)`                         | Pass the LLM to the pipeline: `createRagPipeline({ llm: new OpenAIConnector() })`; no global settings                                 |
| `Settings.embedModel`                                    | `embedder`: `OpenAIConnector`, `CohereConnector`, `OllamaConnector`, `LocalEmbedder`, or an AI SDK model via `createAiSdkAdapter`     |
| `VectorStoreIndex.fromDocuments(docs)`                   | Embed the documents and `retriever.store()` them: `MemoryRetriever`, `FileVectorStore`, `PgVectorRetriever` or `QdrantRetriever`      |
| `index.asRetriever({ similarityTopK })`                  | The retriever itself: `retriever.retrieve({ query, queryVector, topK })`                                                              |
| `index.asQueryEngine()` + `queryEngine.query({ query })` | `createRagPipeline({ embedder, retriever, llm })` + `pipeline.run({ query, options: { topK } })`                                      |
| `response.message.content` / `response.sourceNodes`      | `result.answer` / `result.results`; add `options: { citations: true }` for `result.citations`                                         |
| `nodePostprocessors: [new CohereRerank()]`               | `reranker`: `CohereConnector`, `ScoringReranker`, `EmbeddingReranker` or `CascadeReranker`                                            |
| `BM25Retriever`                                          | `BM25Search`, and `HybridRetriever` to fuse it with vector search                                                                     |
| `queryEngine.query({ query, stream: true })`             | `pipeline.run({ query, options: { stream: true } })`                                                                                  |
| `FaithfulnessEvaluator`                                  | `checkAnswer` or `computeFaithfulness`: no judge model, so no extra calls (see the trade-off below)                                   |
| `RelevancyEvaluator`                                     | `computeAnswerRelevance` and `computeContextPrecision`                                                                                |
| `CorrectnessEvaluator`                                   | A test set with `expected` answers, scored by `rag-pipeline eval` or `runEvaluation`                                                  |
| `PineconeVectorStore` and other stores                   | pgvector and Qdrant ship; for others, write a small retriever plugin (`store()` and `retrieve()`) and test it with `runContractTests` |

## A query engine, rewritten

The LlamaIndex version:

```ts
import { Document, Settings, VectorStoreIndex } from "llamaindex";
import { OpenAI } from "@llamaindex/openai";

Settings.llm = new OpenAI({ model: "gpt-4o-mini" });

const index = await VectorStoreIndex.fromDocuments([
  new Document({ text: handbook, id_: "handbook" }),
]);
const queryEngine = index.asQueryEngine({ similarityTopK: 3 });
const response = await queryEngine.query({
  query: "How many vacation days do I get?",
});
console.log(response.message.content);
```

The same here. It runs offline with the TF-IDF embedder and `EchoLLM`, a stand-in that answers with the top passage; swap in `new OpenAIConnector({ model: "gpt-4o-mini" })` for a real answer:

```js
import {
  createRagPipeline,
  LocalEmbedder,
  MemoryRetriever,
} from "@devilsdev/rag-pipeline-utils";
import { EchoLLM } from "@devilsdev/rag-pipeline-utils/testing";

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

const pipeline = createRagPipeline({ embedder, retriever, llm: new EchoLLM() });
const result = await pipeline.run({
  query: "How many vacation days do I get?",
  options: { topK: 3, citations: true },
});

console.log(result.results[0].id); // "vacation"
console.log(result.citations.groundednessScore); // 1
```

What you gain over the query engine: `result.citations` maps each answer sentence to its sources, `options: { evaluate: true }` scores the answer, and [guardrails](./Concepts-Guardrails) can filter documents by access control before the model sees them.

## Deterministic checks, not a judge model

LlamaIndex's evaluators ask an LLM to grade each answer. This library's checks compare words, numbers and negation with the sources instead. They cost nothing, run offline and give the same result every time, which makes them suited to CI. The trade-off: a correct answer that paraphrases its source ("staff get 20 days of paid leave") is reported as unsupported, where an LLM judge would accept it. Look at failing cases before you trust a low score, and see [the known limits](./Evaluation#known-limitations).

## What doesn't carry over

- **Summary, tree, keyword-table and document-summary indexes** have no equivalent. Most apps that use them for retrieval do as well with `HybridRetriever` (BM25 plus vectors); for summarisation, call your LLM directly.
- **Chat engines** (`asChatEngine`) keep conversation state for you. Here, keep the history yourself and rewrite follow-up questions before calling `run()`.
- **Agents and tools**: use Mastra or the Vercel AI SDK, and call this library's pipeline or `checkAnswer` from a tool. See [Comparison](./Comparison#use-them-together).
- **LlamaCloud and LlamaParse** are LlamaIndex's hosted services and still exist; parse documents there and pass the text to `ingest` or your own loader if you rely on them.
