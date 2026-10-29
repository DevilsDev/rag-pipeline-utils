---
mdx:
  format: md
---

# Class: CohereConnector

Embedder + reranker connector for the Cohere API.
Provides text embeddings (with separate document/query input types) and
document reranking capabilities.

## Extends

- [`BaseConnector`](BaseConnector.md)

## Constructors

### Constructor

```ts
new CohereConnector(options?): CohereConnector;
```

#### Parameters

| Parameter                 | Type                                                                                                                                                         | Description                        |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------- |
| `options?`                | \{ `apiKey?`: `string`; `baseURL?`: `string`; `embeddingModel?`: `string`; `inputType?`: `string`; `queryInputType?`: `string`; `rerankModel?`: `string`; \} | -                                  |
| `options.apiKey?`         | `string`                                                                                                                                                     | Cohere API key                     |
| `options.baseURL?`        | `string`                                                                                                                                                     | API base URL                       |
| `options.embeddingModel?` | `string`                                                                                                                                                     | Embedding model                    |
| `options.inputType?`      | `string`                                                                                                                                                     | Input type for document embeddings |
| `options.queryInputType?` | `string`                                                                                                                                                     | Input type for query embeddings    |
| `options.rerankModel?`    | `string`                                                                                                                                                     | Reranking model                    |

#### Returns

`CohereConnector`

#### Overrides

[`BaseConnector`](BaseConnector.md).[`constructor`](BaseConnector.md#constructor)

## Properties

| Property                                    | Type            | Inherited from                                                                         |
| ------------------------------------------- | --------------- | -------------------------------------------------------------------------------------- |
| <a id="property-client"></a> `client`       | `AxiosInstance` | -                                                                                      |
| <a id="property-config"></a> `config`       | `any`           | -                                                                                      |
| <a id="property-connected"></a> `connected` | `boolean`       | [`BaseConnector`](BaseConnector.md).[`connected`](BaseConnector.md#property-connected) |
| <a id="property-name"></a> `name`           | `string`        | [`BaseConnector`](BaseConnector.md).[`name`](BaseConnector.md#property-name)           |
| <a id="property-options"></a> `options`     | `object`        | [`BaseConnector`](BaseConnector.md).[`options`](BaseConnector.md#property-options)     |
| `options.name?`                             | `string`        | -                                                                                      |

## Methods

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

### embed()

```ts
embed(text, options?): Promise<number[]>;
```

Generate an embedding vector for document text.
Uses the document input type by default.

#### Parameters

| Parameter         | Type                            | Description         |
| ----------------- | ------------------------------- | ------------------- |
| `text`            | `string`                        | Input text to embed |
| `options?`        | \{ `signal?`: `AbortSignal`; \} | -                   |
| `options.signal?` | `AbortSignal`                   | Cancels the request |

#### Returns

`Promise`\<`number`[]\>

Embedding vector

---

### embedQuery()

```ts
embedQuery(query, options?): Promise<number[]>;
```

Generate an embedding vector for a search query.
Uses the query input type for better retrieval accuracy.

#### Parameters

| Parameter         | Type                            | Description         |
| ----------------- | ------------------------------- | ------------------- |
| `query`           | `string`                        | Query text to embed |
| `options?`        | \{ `signal?`: `AbortSignal`; \} | -                   |
| `options.signal?` | `AbortSignal`                   | Cancels the request |

#### Returns

`Promise`\<`number`[]\>

Embedding vector

---

### getCacheKey()

```ts
getCacheKey(role): string;
```

Cache identity for createRagPipeline({ cache }).

#### Parameters

| Parameter | Type         | Description |
| --------- | ------------ | ----------- |
| `role`    | `"embedder"` | -           |

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

### rerank()

```ts
rerank(
   query,
   documents,
   options?
): Promise<any[]>;
```

Rerank documents by relevance to a query using Cohere's reranker.

#### Parameters

| Parameter         | Type                                               | Description                                       |
| ----------------- | -------------------------------------------------- | ------------------------------------------------- |
| `query`           | `string`                                           | The search query                                  |
| `documents`       | `any`[]                                            | Documents to rerank                               |
| `options?`        | \{ `signal?`: `AbortSignal`; `topK?`: `number`; \} | -                                                 |
| `options.signal?` | `AbortSignal`                                      | Cancels the request                               |
| `options.topK?`   | `number`                                           | Number of top results to return (defaults to all) |

#### Returns

`Promise`\<`any`[]\>

Reranked documents with relevance scores

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
