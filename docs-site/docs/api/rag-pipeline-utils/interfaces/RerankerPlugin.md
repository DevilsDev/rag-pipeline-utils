---
mdx:
  format: md
---

# Interface: RerankerPlugin

## Methods

### rerank()

```ts
rerank(
   results,
   query,
   options?
): Promise<SearchResult[]>;
```

#### Parameters

| Parameter  | Type                                |
| ---------- | ----------------------------------- |
| `results`  | [`SearchResult`](SearchResult.md)[] |
| `query`    | `string`                            |
| `options?` | `any`                               |

#### Returns

`Promise`\<[`SearchResult`](SearchResult.md)[]\>
