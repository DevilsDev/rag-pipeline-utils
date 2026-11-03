---
id: Testing
title: Testing your RAG code
sidebar_label: Testing
description: Deterministic, offline test helpers from @devilsdev/rag-pipeline-utils/testing - a hash embedder, an echo LLM, fixtures, a ready test pipeline and matchers such as toBeGroundedIn.
---

# Testing your RAG code

`@devilsdev/rag-pipeline-utils/testing` has deterministic, offline stand-ins for the parts of a pipeline that normally call a model. Tests that use them need no network and no API keys, and give the same result on every run.

| Export                 | What it is                                                                                                     |
| ---------------------- | -------------------------------------------------------------------------------------------------------------- |
| `HashEmbedder`         | Embedder that hashes words into a vector. Texts that share words come out similar, so retrieval ranks sensibly |
| `EchoLLM`              | LLM that answers with the top retrieved document, or an answer you set, and records every call                 |
| `fixtures.documents`   | Three short policy documents (vacation, remote work, expenses)                                                 |
| `createTestPipeline()` | A pipeline with `HashEmbedder`, a `MemoryRetriever` holding the documents, and `EchoLLM`                       |
| `ragMatchers`          | `toBeGroundedIn`, `toCite` and `toContainNoPII` for `expect.extend()` in Jest and Vitest                       |

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

## Matchers for answers

Register the matchers once, in a setup file or at the top of a test file, then assert on answers the way you assert on any other value:

```js no-run
import { expect, test } from "vitest"; // or Jest's global expect
import {
  createTestPipeline,
  ragMatchers,
} from "@devilsdev/rag-pipeline-utils/testing";

expect.extend(ragMatchers);

test("answers vacation questions from the handbook", async () => {
  const { pipeline } = await createTestPipeline();
  const result = await pipeline.run({
    query: "How many vacation days do I get?",
  });

  expect(result).toBeGroundedIn(); // every sentence supported by result.results
  expect(result).toCite("vacation");
  expect(result).toContainNoPII();
});
```

| Matcher                                   | Passes when                                                                                                                                               |
| ----------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `toBeGroundedIn(sources?, { threshold })` | Every sentence of the answer is supported by a source: its content words, numbers and negation match, as in `checkAnswer`                                 |
| `toCite(id \| ids, sources?)`             | At least one sentence is supported by each given source                                                                                                   |
| `toContainNoPII({ patterns })`            | No email, phone number, US SSN or card number (the post-generation guard's patterns, plus yours) appears in the string, or in any string inside an object |

The value under test is an answer string or anything with an `answer`, such as a `pipeline.run()` result. Without `sources`, `toBeGroundedIn` and `toCite` use the result's `results`. Sources can be in any shape `checkAnswer` reads: strings, `{ id, content }`, LangChain `Document`s or LlamaIndex nodes, so you can test answers from another framework too:

```js no-run
expect(chainOutput.answer).toBeGroundedIn(chainOutput.context); // LangChain Documents
```

A failure lists what went wrong, for example:

```text
expected the answer to be grounded in the 1 source(s), but 1 of 2 sentence(s) are not supported (groundedness 0.50):
  - Contractors get a company car.
```

The checks are deterministic, so a test fails or passes the same way every run. Like `checkAnswer`, they compare words, so a correct paraphrase can fail `toBeGroundedIn`; assert on answers from `EchoLLM`, fixtures, or recorded model output you've reviewed.

For TypeScript, declare the matchers once:

```ts
// vitest.d.ts (for Jest, augment jest.Matchers<R> instead)
import "vitest";

declare module "vitest" {
  interface Assertion<T = any> {
    toBeGroundedIn(sources?: unknown[], options?: { threshold?: number }): T;
    toCite(ids: string | string[], sources?: unknown[]): T;
    toContainNoPII(options?: { patterns?: Record<string, RegExp> }): T;
  }
}
```

## Contract tests for your plugins

`runContractTests(type, factory)` registers tests for the behaviour `createRagPipeline` relies on from a plugin of that type, so a plugin author doesn't have to work it out from the source. Pass a factory that returns a new plugin; each check gets its own.

```js no-run
// my-retriever.test.js
const { runContractTests } = require("@devilsdev/rag-pipeline-utils/testing");
const { MyRetriever } = require("./my-retriever");

runContractTests("retriever", () => new MyRetriever());
```

That works as is in Jest, Mocha and Vitest with `globals: true`. Elsewhere, pass your framework's `describe` and `it`:

```js no-run
import { describe, it } from "vitest"; // or "node:test"
import { runContractTests } from "@devilsdev/rag-pipeline-utils/testing";

runContractTests("llm", () => new MyLLM(), { describe, it });
```

The checks use `node:assert`, so they need nothing from the framework beyond `describe` and `it`. Each type checks what the pipeline calls:

| Type        | Checks                                                                                                                                                                                                      |
| ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `loader`    | `load()` can be called with no arguments                                                                                                                                                                    |
| `embedder`  | `embed(text)` returns a non-empty array of finite numbers; every vector, `embedQuery()`'s included, has the same length; it accepts `{ signal }`                                                            |
| `retriever` | an empty store returns an array; after `store(documents)`, `retrieve({ query, queryVector, topK, signal })` returns the closest first, sorted by numeric `score`, at most `topK`, with content and metadata |
| `reranker`  | `rerank(query, documents, { topK })` returns only documents it was given, at most `topK`, with the one that answers the query first                                                                         |
| `llm`       | `generate(query, documents, options)` resolves to a string; `generateStream()`, when present, yields `{ token, done }` and ends with `done: true`                                                           |

Every type also runs `validatePlugin` and one query through `createRagPipeline` with stand-ins for the other stages. The options:

- `registry: true` also requires the `metadata` that `pluginRegistry.register()` needs.
- `setup(retriever, documents)` loads the test documents into a retriever that has no `store()`, such as one that reads an existing index.
- `name` names the test group (default `"<type> contract"`).

To run the same checks without a test framework, for example in a script, use `checkContract`:

```js
import { checkContract, EchoLLM } from "@devilsdev/rag-pipeline-utils/testing";

const report = await checkContract("llm", () => new EchoLLM());
console.log(report.passed); // true
console.log(report.results.length); // 4

const broken = await checkContract("llm", () => ({
  async generate() {
    return { text: "Twenty days." }; // an object, not the answer text
  },
}));
console.log(broken.results.find((r) => !r.passed).error);
// "generate() resolved to object; the pipeline needs the answer text"
```

## In your own plugins' tests

`HashEmbedder` and `EchoLLM` pass `validatePlugin(stage, plugin, { registry: true })`, so they can stand in for real components anywhere a pipeline stage is expected, including `checkAnswer`, `computeSemanticSimilarity` and your own plugins' tests.
