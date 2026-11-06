---
id: Testing-RAG-TypeScript
title: Testing RAG in TypeScript
sidebar_label: Testing RAG in TypeScript
description: A step-by-step guide to testing retrieval-augmented generation in TypeScript with Vitest - typed matchers such as toBeGroundedIn, catching wrong numbers with checkAnswer, and failing CI when a test set's scores drop.
---

# Testing RAG in TypeScript

RAG code rarely fails loudly. Someone changes the chunk size, the prompt, the model or the embedder, everything still runs, and the answers quietly get worse: a number changes, a sentence stops matching the document it came from. This guide sets up a TypeScript project that catches that, in three layers:

1. **Unit tests** that assert on answers with typed matchers (`toBeGroundedIn`, `toCite`, `toContainNoPII`), offline and deterministic.
2. **Answer checks** with `checkAnswer`, which flag a sentence that its sources don't support, numbers and negation included, for answers from any framework.
3. **A test set** that `rag-pipeline eval` scores in CI, failing the build when the scores drop.

Everything here runs without an API key. The finished project is in [examples/testing-typescript](https://github.com/DevilsDev/rag-pipeline-utils/tree/main/examples/testing-typescript); its tests run in this repository's CI, and before each release a check installs the packed package with the latest Vitest and TypeScript, then type-checks it, runs the tests and runs the evaluation, so the code below works as written.

## Set up the project

You need Node.js 22 or later.

```bash
npm install @devilsdev/rag-pipeline-utils
npm install --save-dev vitest typescript @types/node
```

```json title="package.json"
{
  "name": "rag-pipeline-testing-typescript",
  "version": "1.0.0",
  "description": "Testing RAG answers in TypeScript with Vitest and @devilsdev/rag-pipeline-utils: the code of the Testing RAG in TypeScript guide",
  "private": true,
  "type": "module",
  "engines": {
    "node": ">=22"
  },
  "scripts": {
    "test": "vitest run",
    "typecheck": "tsc --noEmit",
    "ingest": "rag-pipeline ingest docs",
    "eval": "rag-pipeline eval eval/tests.json --min sourceRecall=1"
  },
  "dependencies": {
    "@devilsdev/rag-pipeline-utils": "^3.7.1"
  },
  "devDependencies": {
    "@types/node": "^22.0.0",
    "typescript": "^7.0.0",
    "vitest": "^5.1.0"
  },
  "license": "MIT"
}
```

A strict TypeScript configuration, checking the package's own declarations too (`skipLibCheck: false`):

```json title="tsconfig.json"
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "noEmit": true,
    "skipLibCheck": false
  },
  "include": [
    "tests",
    "vitest.config.ts",
    "vitest.setup.ts",
    "rag-matchers.d.ts"
  ]
}
```

## Register the matchers, with their types

`ragMatchers` adds three matchers to `expect`. Register them once, in a Vitest setup file:

```ts title="vitest.setup.ts"
import { expect } from "vitest";
import { ragMatchers } from "@devilsdev/rag-pipeline-utils/testing";

expect.extend(ragMatchers);
```

```ts title="vitest.config.ts"
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: { setupFiles: ["./vitest.setup.ts"] },
});
```

TypeScript also needs to know about them, or `expect(result).toBeGroundedIn()` doesn't compile. The package exports their signatures as `RagMatchers`; add them to Vitest's `Matchers` in a declaration file:

```ts title="rag-matchers.d.ts"
import "vitest";
import type { RagMatchers } from "@devilsdev/rag-pipeline-utils/testing";

declare module "vitest" {
  interface Matchers<R, T> extends RagMatchers<R> {}
}
```

Now a misspelled matcher or a wrong argument is a compile error, like any other assertion: `expect(answer).toCite(123)` fails with `Argument of type 'number' is not assignable to parameter of type 'string | string[]'`.

On Jest, add the same signatures to Jest's `Matchers` instead:

```ts title="rag-matchers.d.ts (Jest)"
import type { RagMatchers } from "@devilsdev/rag-pipeline-utils/testing";

declare global {
  namespace jest {
    interface Matchers<R> extends RagMatchers<R> {}
  }
}

export {};
```

## Write the first tests

```ts title="tests/answers.test.ts"
import { describe, expect, test } from "vitest";
import { checkAnswer } from "@devilsdev/rag-pipeline-utils";
import { createTestPipeline } from "@devilsdev/rag-pipeline-utils/testing";

describe("vacation answers", () => {
  test("are grounded in the handbook and cite it", async () => {
    const { pipeline } = await createTestPipeline();
    const result = await pipeline.run({
      query: "How many vacation days do I get?",
    });

    expect(result).toBeGroundedIn();
    expect(result).toCite("vacation");
    expect(result).toContainNoPII();
  });

  test("a wrong number is caught", async () => {
    const sources = [
      {
        pageContent:
          "Full-time employees receive twenty days of paid vacation per year.",
      },
    ];
    const answer =
      "Full-time employees receive thirty days of paid vacation per year.";

    expect(answer).not.toBeGroundedIn(sources);

    const check = await checkAnswer({ answer, sources });
    expect(check.grounded).toBe(false);
    expect(check.unsupported).toEqual([answer]);
  });
});
```

The first test runs a whole pipeline with `createTestPipeline()`: a `HashEmbedder`, an in-memory retriever holding three short policy documents, and an `EchoLLM` that answers with the top retrieved document. No network, no keys, the same result every run. Then it asserts three things about the answer:

- **`toBeGroundedIn()`**: every sentence is supported by the retrieved passages (`result.results`), checking content words, numbers and negation.
- **`toCite("vacation")`**: at least one sentence is supported by the `vacation` document.
- **`toContainNoPII()`**: no email address, phone number, US social security number or card number anywhere in the result.

The second test is the failure this library exists for: an answer that says thirty days when the source says twenty. `not.toBeGroundedIn(sources)` passes, and `checkAnswer` returns the exact sentence in `unsupported`, so a failing test tells you what went wrong.

```bash
npx vitest run
npx tsc --noEmit
```

## Test your own pipeline

`createTestPipeline()` is for testing code around the pipeline. To test your real pipeline, build it in the test the way your app does and keep the same assertions. Two things change:

- **Answers from a real model vary.** Assert on properties, not exact text: grounded, cites the right document, no PII, mentions the right number. `toBeGroundedIn(sources, { threshold })` takes a per-sentence support threshold (default 0.5).
- **Model calls cost money and time.** Keep those tests in a separate file or project and run them less often than the offline ones, for example nightly or before a release.

`checkAnswer` works on answers from any framework. Pass LangChain documents (`{ pageContent, metadata }`), LlamaIndex nodes or plain strings as `sources`; see [Check an answer from any framework](./Integrations.md#check-an-answer-from-any-framework).

## Score a test set in CI

Unit tests check single answers. A test set checks the whole system against cases you care about, and `rag-pipeline eval` turns it into a pass or fail. The example has two documents in `docs/`, an offline configuration and two cases:

```json title=".ragrc.json"
{
  "pipeline": [
    { "stage": "loader", "name": "auto" },
    { "stage": "embedder", "name": "local" },
    {
      "stage": "retriever",
      "name": "file-store",
      "config": { "path": ".rag/index.json" }
    }
  ]
}
```

```json title="eval/tests.json"
[
  {
    "id": "vacation-days",
    "prompt": "How many vacation days do full-time employees get?",
    "expected": "Full-time employees receive twenty days of paid vacation per year.",
    "sourceIds": ["docs/vacation.md"]
  },
  {
    "id": "remote-work",
    "prompt": "How often can I work remotely?",
    "expected": "Remote work is allowed two days per week with manager approval.",
    "sourceIds": ["docs/remote-work.md"]
  }
]
```

`sourceIds` names the documents a case should retrieve; with the CLI's index a file path matches its chunks. Index the documents and run the set:

```bash
npx rag-pipeline ingest docs
npx rag-pipeline eval eval/tests.json --min sourceRecall=1
```

```text
2 cases, 0 failed

  sourceRecall      1.000

✅ Evaluation passed
```

Without an `llm` stage only `sourceRecall` is measured. Add a model to `.ragrc.json` and the same command scores `faithfulness`, `groundedness`, `citationCoverage` and the rest; see [`eval`](./CLI.md#eval).

To catch regressions rather than fixed minimums, save a report on your main branch and compare pull requests with it. A metric whose mean drops by more than `--tolerance` (default 0.02), or a case that now fails, fails the run:

```bash
# on main
npx rag-pipeline eval eval/tests.json --output eval-main.json

# on a pull request
npx rag-pipeline eval eval/tests.json --baseline eval-main.json --report eval-summary.md
```

The [rag-eval-action](https://github.com/DevilsDev/rag-eval-action) GitHub Action does this for you: it keeps the main branch's report in the Actions cache, runs the set on every pull request, posts the summary as a comment and fails the check when scores drop. A plain workflow that runs all three layers:

```yaml title=".github/workflows/rag-tests.yml"
name: RAG tests
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v6
      - uses: actions/setup-node@v6
        with:
          node-version: 22
      - run: npm ci
      - run: npx tsc --noEmit
      - run: npx vitest run
      - run: npx rag-pipeline ingest docs
      - run: npx rag-pipeline eval eval/tests.json --min sourceRecall=1
```

## Next steps

- [Testing your RAG code](./Testing.md): every test helper, the fixtures and contract tests for your own plugins.
- [Evaluation](./Evaluation.md): the metrics, the dataset format and comparing configurations.
- [Concepts: evaluation](./Concepts-Evaluation.md): how grounding checks words, numbers and negation, and what it can't see.
