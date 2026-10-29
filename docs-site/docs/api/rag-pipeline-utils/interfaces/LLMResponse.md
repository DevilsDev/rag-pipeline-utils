---
mdx:
  format: md
---

# ~~Interface: LLMResponse~~

## Deprecated

The pipeline reads `llm.generate()` as a string; an object
like this becomes "[object Object]". Return the answer text instead. This
type will be removed in the next major release.

## Properties

| Property                                       | Type                        |
| ---------------------------------------------- | --------------------------- |
| <a id="property-metadata"></a> ~~`metadata?`~~ | `Record`\<`string`, `any`\> |
| <a id="property-text"></a> ~~`text`~~          | `string`                    |
| <a id="property-usage"></a> ~~`usage?`~~       | `object`                    |
| `usage.completionTokens`                       | `number`                    |
| `usage.promptTokens`                           | `number`                    |
| `usage.totalTokens`                            | `number`                    |
