---
mdx:
  format: md
---

# Function: evaluateRagDataset()

```ts
function evaluateRagDataset(_datasetPath, _config): Promise<object[]>;
```

Evaluate a list of prompt/answer pairs using the RAG pipeline and compute scores

## Parameters

| Parameter      | Type     | Description                           |
| -------------- | -------- | ------------------------------------- |
| `_datasetPath` | `any`    | -                                     |
| `_config`      | `object` | RAG plugin \_config (loader optional) |

## Returns

`Promise`\<`object`[]\>
