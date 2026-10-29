---
mdx:
  format: md
---

# Class: ParallelEmbedder

Parallel processor for embedding operations with configurable concurrency

## Constructors

### Constructor

```ts
new ParallelEmbedder(embedder, _options?): ParallelEmbedder;
```

#### Parameters

| Parameter                  | Type                                                                                                                                                          | Description                                                                                                                                                                                                                                                                           |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `embedder`                 | `object`                                                                                                                                                      | Embedder with embed() and/or embedBatch()                                                                                                                                                                                                                                             |
| `_options?`                | \{ `batchSize?`: `number`; `maxConcurrency?`: `number`; `mode?`: `"auto"` \| `"batch"` \| `"single"`; `retryAttempts?`: `number`; `retryDelay?`: `number`; \} | -                                                                                                                                                                                                                                                                                     |
| `_options.batchSize?`      | `number`                                                                                                                                                      | Texts per batch                                                                                                                                                                                                                                                                       |
| `_options.maxConcurrency?` | `number`                                                                                                                                                      | Batches in flight at once                                                                                                                                                                                                                                                             |
| `_options.mode?`           | `"auto"` \| `"batch"` \| `"single"`                                                                                                                           | How a batch is embedded: 'batch' calls embed(texts) and expects one vector per text, 'single' calls embed(text) for each text. 'auto' uses embedBatch(texts) when the embedder has it, 'single' for the built-in connectors (which embed one string at a time) and 'batch' otherwise. |
| `_options.retryAttempts?`  | `number`                                                                                                                                                      | Retries per failed batch                                                                                                                                                                                                                                                              |
| `_options.retryDelay?`     | `number`                                                                                                                                                      | Base retry delay in ms                                                                                                                                                                                                                                                                |

#### Returns

`ParallelEmbedder`

## Properties

| Property                                              | Type                                |
| ----------------------------------------------------- | ----------------------------------- |
| <a id="property-batchsize"></a> `batchSize`           | `number`                            |
| <a id="property-embedder"></a> `embedder`             | `any`                               |
| <a id="property-maxconcurrency"></a> `maxConcurrency` | `number`                            |
| <a id="property-mode"></a> `mode`                     | `"auto"` \| `"batch"` \| `"single"` |
| <a id="property-retryattempts"></a> `retryAttempts`   | `number`                            |
| <a id="property-retrydelay"></a> `retryDelay`         | `number`                            |

## Methods

### createBatches()

```ts
createBatches(items, size): string[][];
```

Create batches from chunks array

#### Parameters

| Parameter | Type       | Description    |
| --------- | ---------- | -------------- |
| `items`   | `string`[] | Items to batch |
| `size`    | `number`   | Batch size     |

#### Returns

`string`[][]

Array of batches

---

### delay()

```ts
delay(ms): Promise<void>;
```

Delay utility for retry logic

#### Parameters

| Parameter | Type     | Description           |
| --------- | -------- | --------------------- |
| `ms`      | `number` | Milliseconds to delay |

#### Returns

`Promise`\<`void`\>

---

### embedBatch()

```ts
embedBatch(chunks): Promise<number[][]>;
```

Process chunks in parallel batches with concurrency control

#### Parameters

| Parameter | Type       | Description          |
| --------- | ---------- | -------------------- |
| `chunks`  | `string`[] | Text chunks to embed |

#### Returns

`Promise`\<`number`[][]\>

Array of embedding vectors

---

### processBatchWithRetry()

```ts
processBatchWithRetry(batch, batchIndex): Promise<number[][]>;
```

Process a single batch with retry logic

#### Parameters

| Parameter    | Type       | Description                    |
| ------------ | ---------- | ------------------------------ |
| `batch`      | `string`[] | Batch of chunks to process     |
| `batchIndex` | `number`   | Index of the batch for logging |

#### Returns

`Promise`\<`number`[][]\>

Embedding vectors for the batch
