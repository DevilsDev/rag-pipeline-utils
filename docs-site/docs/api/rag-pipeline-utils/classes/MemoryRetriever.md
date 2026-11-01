---
mdx:
  format: md
---

# Class: MemoryRetriever

In-memory vector store with cosine similarity retrieval.
Stores document vectors and retrieves the most similar ones to a query vector.
All vectors in one store must have the same dimension.

## Extends

- [`BaseConnector`](BaseConnector.md)

## Constructors

### Constructor

```ts
new MemoryRetriever(options?): MemoryRetriever;
```

#### Parameters

| Parameter               | Type                                                                 | Description                                                                                        |
| ----------------------- | -------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `options?`              | \{ `eviction?`: `"error"` \| `"fifo"`; `maxDocuments?`: `number`; \} | -                                                                                                  |
| `options.eviction?`     | `"error"` \| `"fifo"`                                                | What to do when a store() would exceed maxDocuments: throw (default) or evict the oldest documents |
| `options.maxDocuments?` | `number`                                                             | Maximum number of documents to store                                                               |

#### Returns

`MemoryRetriever`

#### Overrides

[`BaseConnector`](BaseConnector.md).[`constructor`](BaseConnector.md#constructor)

## Properties

| Property                                      | Type                                                                                     | Inherited from                                                                         |
| --------------------------------------------- | ---------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| <a id="property-config"></a> `config`         | `any`                                                                                    | -                                                                                      |
| <a id="property-connected"></a> `connected`   | `boolean`                                                                                | [`BaseConnector`](BaseConnector.md).[`connected`](BaseConnector.md#property-connected) |
| <a id="property-dimensions"></a> `dimensions` | `number`                                                                                 | -                                                                                      |
| <a id="property-documents"></a> `documents`   | `Map`\<`string`, \{ `content?`: `string`; `metadata?`: `any`; `vector`: `number`[]; \}\> | -                                                                                      |
| <a id="property-name"></a> `name`             | `string`                                                                                 | [`BaseConnector`](BaseConnector.md).[`name`](BaseConnector.md#property-name)           |
| <a id="property-options"></a> `options`       | `object`                                                                                 | [`BaseConnector`](BaseConnector.md).[`options`](BaseConnector.md#property-options)     |
| `options.name?`                               | `string`                                                                                 | -                                                                                      |

## Methods

### clear()

```ts
clear(): Promise<void>;
```

Remove all stored documents and reset the vector dimension.

#### Returns

`Promise`\<`void`\>

---

### connect()

```ts
connect(): Promise<void>;
```

Establish the connection.
Override in subclass for custom connection logic.

#### Returns

`Promise`\<`void`\>

#### Inherited from

[`BaseConnector`](BaseConnector.md).[`connect`](BaseConnector.md#connect)

---

### disconnect()

```ts
disconnect(): Promise<void>;
```

Tear down the connection.
Override in subclass for custom disconnection logic.

#### Returns

`Promise`\<`void`\>

#### Inherited from

[`BaseConnector`](BaseConnector.md).[`disconnect`](BaseConnector.md#disconnect)

---

### getCacheKey()

```ts
getCacheKey(role): string;
```

Cache identity for createRagPipeline({ cache }).

#### Parameters

| Parameter | Type          | Description |
| --------- | ------------- | ----------- |
| `role`    | `"retriever"` | -           |

#### Returns

`string`

---

### getInfo()

```ts
getInfo(): object;
```

Return basic information about the connector.

#### Returns

`object`

##### connected

```ts
connected: boolean;
```

##### name

```ts
name: string;
```

##### type

```ts
type: string;
```

#### Inherited from

[`BaseConnector`](BaseConnector.md).[`getInfo`](BaseConnector.md#getinfo)

---

### getStats()

```ts
getStats(): object;
```

Get statistics about the store.

#### Returns

`object`

##### dimensions

```ts
dimensions: number;
```

##### documentCount

```ts
documentCount: number;
```

##### maxDocuments

```ts
maxDocuments: number;
```

---

### isHealthy()

```ts
isHealthy(): Promise<boolean>;
```

Check whether the connector is healthy and operational.
Override in subclass for custom health checks.

#### Returns

`Promise`\<`boolean`\>

#### Inherited from

[`BaseConnector`](BaseConnector.md).[`isHealthy`](BaseConnector.md#ishealthy)

---

### retrieve()

```ts
retrieve(queryOrObj, k?): Promise<object[]>;
```

Retrieve the top-k most similar documents to a query vector.

#### Parameters

| Parameter    | Type                                                                                                                | Description                                                                                                                                                                                      |
| ------------ | ------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `queryOrObj` | \| `number`[] \| \{ `query?`: `string`; `queryVector?`: `number`[]; `signal?`: `AbortSignal`; `topK?`: `number`; \} | Either a raw vector array or an object with queryVector, optional topK and optional AbortSignal. queryVector is required (optional in the type only to match the pipeline's retriever contract). |
| `k?`         | `number`                                                                                                            | Number of results to return (used when queryOrObj is an array)                                                                                                                                   |

#### Returns

`Promise`\<`object`[]\>

#### Throws

When the query vector's dimension differs from the stored vectors

---

### store()

```ts
store(vectors): Promise<void>;
```

Store one or more vector documents. The batch is validated before
anything is inserted, so a rejected call leaves the store unchanged.

#### Parameters

| Parameter | Type       | Description |
| --------- | ---------- | ----------- |
| `vectors` | `object`[] | -           |

#### Returns

`Promise`\<`void`\>

#### Throws

When a vector's dimension differs from the store's, or
(eviction 'error') when the store would exceed maxDocuments

---

### withRetry()

```ts
withRetry(
   fn,
   retries?,
   delay?,
   opts?
): Promise<any>;
```

Retry wrapper for transient failures.

Only retryable errors are retried: network errors and HTTP
408/409/425/429/5xx (see isRetryableError). Other errors
(400, 401, 403, 404, aborts, errors with no status or network code) are
thrown immediately. Backoff is exponential with full jitter, starting at
`delay` and capped at `opts.maxDelay`; a Retry-After header on the error
is honoured (capped at `opts.maxDelay`). Emits a 'retry' event before
each retry.

#### Parameters

| Parameter           | Type                                                                                         | Description                                            |
| ------------------- | -------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| `fn`                | `Function`                                                                                   | Async function to execute; receives the attempt number |
| `retries?`          | `number`                                                                                     | Maximum number of retry attempts                       |
| `delay?`            | `number`                                                                                     | Base backoff delay in ms                               |
| `opts?`             | \{ `maxDelay?`: `number`; `shouldRetry?`: (`err`) => `boolean`; `signal?`: `AbortSignal`; \} | -                                                      |
| `opts.maxDelay?`    | `number`                                                                                     | Upper bound for a single backoff delay                 |
| `opts.shouldRetry?` | (`err`) => `boolean`                                                                         | Override retry classification                          |
| `opts.signal?`      | `AbortSignal`                                                                                | Aborts the call and any pending backoff                |

#### Returns

`Promise`\<`any`\>

Result of the function

#### Throws

The first non-retryable error, or the last error once retries are exhausted

#### Inherited from

[`BaseConnector`](BaseConnector.md).[`withRetry`](BaseConnector.md#withretry)
