---
mdx:
  format: md
---

# Function: checkContract()

```ts
function checkContract(
  type,
  factory,
  options?,
): Promise<{
  passed: boolean;
  results: object[];
  type: string;
}>;
```

Run the contract checks for a plugin without a test framework.

## Parameters

| Parameter           | Type                                                                                                 | Description                                                                                                  |
| ------------------- | ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `type`              | `"loader"` \| `"embedder"` \| `"retriever"` \| `"reranker"` \| `"llm"`                               | Plugin type                                                                                                  |
| `factory`           | () => `object` \| `Promise`\<`object`\>                                                              | Returns a new, empty plugin for each check                                                                   |
| `options?`          | \{ `registry?`: `boolean`; `setup?`: (`retriever`, `documents`) => `void` \| `Promise`\<`void`\>; \} | -                                                                                                            |
| `options.registry?` | `boolean`                                                                                            | Also require the `metadata` pluginRegistry.register() needs                                                  |
| `options.setup?`    | (`retriever`, `documents`) => `void` \| `Promise`\<`void`\>                                          | Retrievers: loads the test documents (default: `retriever.store(documents)`), for retrievers without store() |

## Returns

`Promise`\<\{
`passed`: `boolean`;
`results`: `object`[];
`type`: `string`;
\}\>

## Example

```ts
const report = await checkContract("embedder", () => new MyEmbedder());
if (!report.passed) console.log(report.results.filter((r) => !r.passed));
```
