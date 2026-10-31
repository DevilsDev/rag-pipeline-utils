---
mdx:
  format: md
---

# Function: runContractTests()

```ts
function runContractTests(type, factory, options?): void;
```

Register the contract tests for a plugin with your test framework.

## Parameters

| Parameter           | Type                                                                                                                                                                | Description                                                                                                  |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `type`              | `"loader"` \| `"embedder"` \| `"retriever"` \| `"reranker"` \| `"llm"`                                                                                              | Plugin type                                                                                                  |
| `factory`           | () => `object` \| `Promise`\<`object`\>                                                                                                                             | Returns a new, empty plugin for each check                                                                   |
| `options?`          | \{ `describe?`: `Function`; `it?`: `Function`; `name?`: `string`; `registry?`: `boolean`; `setup?`: (`retriever`, `documents`) => `void` \| `Promise`\<`void`\>; \} | -                                                                                                            |
| `options.describe?` | `Function`                                                                                                                                                          | Your framework's describe (default: the global one)                                                          |
| `options.it?`       | `Function`                                                                                                                                                          | Your framework's it/test (default: the global it or test)                                                    |
| `options.name?`     | `string`                                                                                                                                                            | Name of the test group (default: "<type> contract")                                                          |
| `options.registry?` | `boolean`                                                                                                                                                           | Also require the `metadata` pluginRegistry.register() needs                                                  |
| `options.setup?`    | (`retriever`, `documents`) => `void` \| `Promise`\<`void`\>                                                                                                         | Retrievers: loads the test documents (default: `retriever.store(documents)`), for retrievers without store() |

## Returns

`void`

## Examples

```ts
// my-retriever.test.js (Jest; Vitest with globals; Mocha)
const { runContractTests } = require("@devilsdev/rag-pipeline-utils/testing");
runContractTests("retriever", () => new MyRetriever());
```

```ts
// Vitest without globals, or node:test
import { describe, it } from "vitest"; // or "node:test"
runContractTests("llm", () => new MyLLM(), { describe, it });
```
