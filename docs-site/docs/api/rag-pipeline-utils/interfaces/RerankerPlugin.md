---
mdx:
  format: md
---

# Interface: RerankerPlugin

A reranker. To register it with pluginRegistry it needs `metadata: { name, version, type: "reranker" }`.

## Methods

### rerank()

```ts
rerank(
   query,
   documents,
   options?
):
  | SearchResult[]
| Promise<SearchResult[]>;
```

Reorders (and may trim) the retrieved documents for the query.

#### Parameters

| Parameter         | Type                                               |
| ----------------- | -------------------------------------------------- |
| `query`           | `string`                                           |
| `documents`       | [`SearchResult`](SearchResult.md)[]                |
| `options?`        | \{ `signal?`: `AbortSignal`; `topK?`: `number`; \} |
| `options.signal?` | `AbortSignal`                                      |
| `options.topK?`   | `number`                                           |

#### Returns

\| [`SearchResult`](SearchResult.md)[]
\| `Promise`\<[`SearchResult`](SearchResult.md)[]\>
