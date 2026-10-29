---
mdx:
  format: md
---

# Function: createEmbeddingStream()

```ts
function createEmbeddingStream(
  documents,
  embedder,
  options?,
): AsyncGenerator<
  | {
      backpressure?: boolean;
      error?: undefined;
      id: string;
      index: number;
      progress: number;
      vector: any;
    }
  | {
      error: any;
      id: string;
      index: number;
      progress: number;
    },
  void,
  unknown
>;
```

Async generator that streams embedding results for a collection of documents.

Documents are processed in batches of `batchSize`. Before each batch the
generator checks heap memory; when usage exceeds
`backpressureThreshold * maxMemoryMB` it pauses briefly and retries,
giving the GC time to reclaim memory.

Each yielded value is an object containing the document id, the computed
vector, the document index, and a progress fraction (0-1).

Errors within a batch are caught and yielded as objects with an `error`
property so that consumers can decide how to handle partial failures
without losing the rest of the stream.

## Parameters

| Parameter   | Type       | Description                                 |
| ----------- | ---------- | ------------------------------------------- |
| `documents` | `object`[] | Documents to embed                          |
| `embedder`  | `any`      | Embedder with `.embed()` or `.embedQuery()` |
| `options?`  | `any`      | Override any key from DEFAULT_CONFIG        |

## Returns

`AsyncGenerator`\<
\| \{
`backpressure?`: `boolean`;
`error?`: `undefined`;
`id`: `string`;
`index`: `number`;
`progress`: `number`;
`vector`: `any`;
\}
\| \{
`error`: `any`;
`id`: `string`;
`index`: `number`;
`progress`: `number`;
\}, `void`, `unknown`\>

## Yields

## Example

```ts
const docs = [
  { id: "1", content: "hello" },
  { id: "2", content: "world" },
];
for await (const emb of createEmbeddingStream(docs, myEmbedder)) {
  console.log(emb.id, emb.vector.length);
}
```
