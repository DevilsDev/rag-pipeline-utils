---
mdx:
  format: md
---

# Interface: RetrieverPlugin

## Methods

### retrieve()

```ts
retrieve(query, options?): Promise<SearchResult[]>;
```

#### Parameters

| Parameter  | Type                                          |
| ---------- | --------------------------------------------- |
| `query`    | \| `string` \| \{ `embedding`: `number`[]; \} |
| `options?` | [`RetrieveOptions`](RetrieveOptions.md)       |

#### Returns

`Promise`\<[`SearchResult`](SearchResult.md)[]\>
