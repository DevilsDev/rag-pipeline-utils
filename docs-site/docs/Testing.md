---
id: Testing
title: Testing your RAG code
sidebar_label: Testing
description: Deterministic, offline test helpers from @devilsdev/rag-pipeline-utils/testing - a hash embedder, an echo LLM, fixtures and a ready test pipeline.
---

# Testing your RAG code

`@devilsdev/rag-pipeline-utils/testing` has deterministic, offline stand-ins for the parts of a pipeline that normally call a model. Tests that use them need no network and no API keys, and give the same result on every run.

| Export                 | What it is                                                                                                     |
| ---------------------- | -------------------------------------------------------------------------------------------------------------- |
| `HashEmbedder`         | Embedder that hashes words into a vector. Texts that share words come out similar, so retrieval ranks sensibly |
| `EchoLLM`              | LLM that answers with the top retrieved document, or an answer you set, and records every call                 |
| `fixtures.documents`   | Three short policy documents (vacation, remote work, expenses)                                                 |
| `createTestPipeline()` | A pipeline with `HashEmbedder`, a `MemoryRetriever` holding the documents, and `EchoLLM`                       |

## A test pipeline in one call

```javascript
import { createTestPipeline } from "@devilsdev/rag-pipeline-utils/testing";

const { pipeline, llm } = await createTestPipeline();
const result = await pipeline.run({
  query: "How many vacation days do I get?",
  options: { citations: true },
});

console.log(result.results[0].id); // "vacation"
console.log(result.citations.groundednessScore); // 1
console.log(llm.calls.length); // 1
```

Pass your own documents, an LLM, or `llm: null` for retrieval only. `pipeline` takes extra `createRagPipeline` options, such as a reranker:

```javascript
import { createTestPipeline } from "@devilsdev/rag-pipeline-utils/testing";

const { pipeline } = await createTestPipeline({
  documents: [
    { id: "cats", content: "Cats sleep up to sixteen hours a day." },
    { id: "dogs", content: "Dogs need daily walks." },
  ],
  llm: null,
});

const result = await pipeline.run({ query: "How long do cats sleep?" });
console.log(result.results[0].id); // "cats"
console.log(result.answer); // null
```

## Asserting on what the model received

`EchoLLM` keeps every call in `calls`: the query, the documents and the options (including the `signal`). Use it to check what your code sends to the model, for example that guardrails removed a document before generation.

```javascript
import {
  EchoLLM,
  createTestPipeline,
} from "@devilsdev/rag-pipeline-utils/testing";

const llm = new EchoLLM({ answer: "Twenty days." });
const { pipeline } = await createTestPipeline({ llm });

await pipeline.run({ query: "vacation" });

const [call] = llm.calls;
console.log(call.query); // "vacation"
console.log(call.docs[0].id); // "vacation"
```

`answer` can also be a function of the query and documents, `(query, docs) => string`. `EchoLLM` streams too (`generateStream`), word by word.

## In your own plugins' tests

`HashEmbedder` and `EchoLLM` pass `validatePlugin(stage, plugin, { registry: true })`, so they can stand in for real components anywhere a pipeline stage is expected, including `checkAnswer`, `computeSemanticSimilarity` and your own plugins' tests.
