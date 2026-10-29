---
mdx:
  format: md
---

# Type Alias: EmbeddingOutput

```ts
type EmbeddingOutput = number[] | number[][] | object[];
```

An embedding returned by an embedder: a vector, a batch whose first vector is used, or `[{ values | vector | embedding }]`.
