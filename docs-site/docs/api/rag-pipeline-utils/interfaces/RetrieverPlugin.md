---
mdx:
  format: md
---

# Interface: RetrieverPlugin

A retriever. To register it with pluginRegistry it needs `store()` and `metadata: { name, version, type: "retriever" }`.

## Methods

### retrieve()

```ts
retrieve(options):
  | SearchResult[]
| Promise<SearchResult[]>;
```

Returns up to `topK` documents for the query, closest first.

#### Parameters

| Parameter | Type                                    |
| --------- | --------------------------------------- |
| `options` | [`RetrieveOptions`](RetrieveOptions.md) |

#### Returns

\| [`SearchResult`](SearchResult.md)[]
\| `Promise`\<[`SearchResult`](SearchResult.md)[]\>

---

### store()?

```ts
store ? documents : unknown;
```

Adds documents with their embeddings. Not called by the pipeline; required by pluginRegistry and the CLI.

#### Parameters

| Parameter   | Type                                     |
| ----------- | ---------------------------------------- |
| `documents` | ([`Document`](Document.md) & `object`)[] |

#### Returns

`unknown`
