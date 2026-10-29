---
mdx:
  format: md
---

# Interface: LLMResponse

## Properties

| Property                                   | Type                        |
| ------------------------------------------ | --------------------------- |
| <a id="property-metadata"></a> `metadata?` | `Record`\<`string`, `any`\> |
| <a id="property-text"></a> `text`          | `string`                    |
| <a id="property-usage"></a> `usage?`       | `object`                    |
| `usage.completionTokens`                   | `number`                    |
| `usage.promptTokens`                       | `number`                    |
| `usage.totalTokens`                        | `number`                    |
