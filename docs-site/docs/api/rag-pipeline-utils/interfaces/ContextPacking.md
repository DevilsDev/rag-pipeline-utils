---
mdx:
  format: md
---

# Interface: ContextPacking

How the documents were fitted into `maxContextTokens`.

## Properties

| Property                                    | Type                     | Description                                                      |
| ------------------------------------------- | ------------------------ | ---------------------------------------------------------------- |
| <a id="property-dropped"></a> `dropped`     | (`string` \| `number`)[] | Ids of the documents left out because they didn't fit.           |
| <a id="property-kept"></a> `kept`           | (`string` \| `number`)[] | Ids (or positions) of the documents passed to the LLM, in order. |
| <a id="property-maxtokens"></a> `maxTokens` | `number`                 | -                                                                |
| <a id="property-tokens"></a> `tokens`       | `number`                 | Tokens used by the kept documents, wrappers included.            |
| <a id="property-truncated"></a> `truncated` | (`string` \| `number`)[] | Ids of documents cut to fit (marked `metadata.truncated`).       |
