---
mdx:
  format: md
---

# Class: StreamingEmbedder

EventEmitter-based wrapper around [createEmbeddingStream](../functions/createEmbeddingStream.md).

## Fires

StreamingEmbedder#start

## Fires

StreamingEmbedder#embedding

## Fires

StreamingEmbedder#batch

## Fires

StreamingEmbedder#backpressure

## Fires

StreamingEmbedder#done

## Fires

StreamingEmbedder#error

## Example

```ts
const se = new StreamingEmbedder(myEmbedder, { batchSize: 25 });
se.on("embedding", (e) => console.log(e.id, e.progress));
se.on("done", (stats) => console.log("finished", stats));
const all = await se.embedAll(documents);
```

## Extends

- `EventEmitter`\<\[`never`\]\>

## Constructors

### Constructor

```ts
new StreamingEmbedder(embedder, options?): StreamingEmbedder;
```

#### Parameters

| Parameter  | Type  | Description                                          |
| ---------- | ----- | ---------------------------------------------------- |
| `embedder` | `any` | Embedder instance with `.embed()` or `.embedQuery()` |
| `options?` | `any` | Override any key from DEFAULT_CONFIG                 |

#### Returns

`StreamingEmbedder`

#### Overrides

`EventEmitter<[never]>.constructor`

## Properties

| Property                                  | Type     |
| ----------------------------------------- | -------- |
| <a id="property-config"></a> `config`     | `any`    |
| <a id="property-embedder"></a> `embedder` | `any`    |
| <a id="property-stats"></a> `stats`       | `object` |
| `stats.failed`                            | `number` |
| `stats.processed`                         | `number` |
| `stats.totalTime`                         | `number` |

## Methods

### embedAll()

```ts
embedAll(documents): Promise<object[]>;
```

Convenience method that collects all embeddings into an array.

#### Parameters

| Parameter   | Type       | Description        |
| ----------- | ---------- | ------------------ |
| `documents` | `object`[] | Documents to embed |

#### Returns

`Promise`\<`object`[]\>

---

### embedStream()

```ts
embedStream(documents): AsyncGenerator<
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
}, void, unknown>;
```

Async generator that yields embeddings while emitting lifecycle events.

#### Parameters

| Parameter   | Type       | Description        |
| ----------- | ---------- | ------------------ |
| `documents` | `object`[] | Documents to embed |

#### Returns

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

#### Yields

#### Fires

StreamingEmbedder#start

#### Fires

StreamingEmbedder#embedding

#### Fires

StreamingEmbedder#batch

#### Fires

StreamingEmbedder#backpressure

#### Fires

StreamingEmbedder#done

#### Fires

StreamingEmbedder#error

---

### getStats()

```ts
getStats(): object;
```

Returns a snapshot of the cumulative statistics.

#### Returns

`object`

##### failed

```ts
failed: number;
```

##### processed

```ts
processed: number;
```

##### totalTime

```ts
totalTime: number;
```

---

### resetStats()

```ts
resetStats(): void;
```

Resets the cumulative statistics to zero.

#### Returns

`void`
