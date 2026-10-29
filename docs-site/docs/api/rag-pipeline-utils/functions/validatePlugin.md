---
mdx:
  format: md
---

# Function: validatePlugin()

```ts
function validatePlugin(stage, plugin, options?): PluginValidationResult;
```

Checks that an object can be used as a pipeline stage, without throwing,
so plugin authors can assert on it in their own tests.

By default it checks what createRagPipeline() calls. With
`{ registry: true }` it also applies the rules pluginRegistry.register()
enforces: `metadata` with a string `name` and `version` and a `type`
equal to the stage, plus the methods in the stage's contract.

## Parameters

| Parameter           | Type                                                                   | Description               |
| ------------------- | ---------------------------------------------------------------------- | ------------------------- |
| `stage`             | `"loader"` \| `"embedder"` \| `"retriever"` \| `"reranker"` \| `"llm"` | -                         |
| `plugin`            | `object`                                                               | Plugin instance or object |
| `options?`          | \{ `registry?`: `boolean`; \}                                          | -                         |
| `options.registry?` | `boolean`                                                              | Also check registry rules |

## Returns

`PluginValidationResult`

## Example

```ts
const { validatePlugin } = require("@devilsdev/rag-pipeline-utils");
const result = validatePlugin("llm", myLlm, { registry: true });
expect(result.errors).toEqual([]);
```
