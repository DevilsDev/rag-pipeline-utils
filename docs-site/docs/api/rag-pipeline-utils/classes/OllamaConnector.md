---
mdx:
  format: md
---

# Class: OllamaConnector

Connector for Ollama local LLM server.
Supports text generation (sync and streaming) and embeddings.
Ollama needs no API key.

## Extends

- [`BaseConnector`](BaseConnector.md)

## Constructors

### Constructor

```ts
new OllamaConnector(options?): OllamaConnector;
```

#### Parameters

| Parameter                 | Type                                                                                                                                                                                                      | Description                                     |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------- |
| `options?`                | \{ `baseURL?`: `string`; `embeddingModel?`: `string`; `maxRetries?`: `number`; `model?`: `string`; `retryDelay?`: `number`; `systemPrompt?`: `string`; `temperature?`: `number`; `timeout?`: `number`; \} | -                                               |
| `options.baseURL?`        | `string`                                                                                                                                                                                                  | Ollama server URL                               |
| `options.embeddingModel?` | `string`                                                                                                                                                                                                  | Default embedding model                         |
| `options.maxRetries?`     | `number`                                                                                                                                                                                                  | Retries for transient failures                  |
| `options.model?`          | `string`                                                                                                                                                                                                  | Default generation model                        |
| `options.retryDelay?`     | `number`                                                                                                                                                                                                  | Base backoff delay in ms                        |
| `options.systemPrompt?`   | `string`                                                                                                                                                                                                  | System prompt used when RAG context is supplied |
| `options.temperature?`    | `number`                                                                                                                                                                                                  | Generation temperature                          |
| `options.timeout?`        | `number`                                                                                                                                                                                                  | Request timeout in ms                           |

#### Returns

`OllamaConnector`

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

Generate an embedding vector for the given text.

#### Parameters

| Parameter         | Type                            | Description         |
| ----------------- | ------------------------------- | ------------------- |
| `text`            | `string`                        | Text to embed       |
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

Generate an embedding vector for a query string.
Alias for [embed](#embed).

#### Parameters

| Parameter  | Type     | Description         |
| ---------- | -------- | ------------------- |
| `query`    | `string` | Query text to embed |
| `options?` | `any`    | Same as embed()     |

#### Returns

`Promise`\<`number`[]\>

Embedding vector

---

### generate()

```ts
generate(
   query,
   context?,
   options?
): Promise<string>;
```

Generate a response for the given query with optional context documents.

#### Parameters

| Parameter              | Type                                                                          | Description                   |
| ---------------------- | ----------------------------------------------------------------------------- | ----------------------------- |
| `query`                | `string`                                                                      | The user query                |
| `context?`             | `any`[]                                                                       | Context documents for RAG     |
| `options?`             | \{ `model?`: `string`; `signal?`: `AbortSignal`; `temperature?`: `number`; \} | Override options              |
| `options.model?`       | `string`                                                                      | Override the generation model |
| `options.signal?`      | `AbortSignal`                                                                 | Cancels the request           |
| `options.temperature?` | `number`                                                                      | Override temperature          |

#### Returns

`Promise`\<`string`\>

Generated response text

---

### generateStream()

```ts
generateStream(
   query,
   context?,
   options?
): AsyncGenerator<{
  done: boolean;
  token: any;
}, void, unknown>;
```

Stream a response token-by-token for the given query.

#### Parameters

| Parameter              | Type                                                                          | Description                   |
| ---------------------- | ----------------------------------------------------------------------------- | ----------------------------- |
| `query`                | `string`                                                                      | The user query                |
| `context?`             | `any`[]                                                                       | Context documents for RAG     |
| `options?`             | \{ `model?`: `string`; `signal?`: `AbortSignal`; `temperature?`: `number`; \} | Override options              |
| `options.model?`       | `string`                                                                      | Override the generation model |
| `options.signal?`      | `AbortSignal`                                                                 | Cancels the stream            |
| `options.temperature?` | `number`                                                                      | Override temperature          |

#### Returns

`AsyncGenerator`\<\{
`done`: `boolean`;
`token`: `any`;
\}, `void`, `unknown`\>

#### Yields

---

### getCacheKey()

```ts
getCacheKey(role): string;
```

Cache identity for createRagPipeline({ cache }).

#### Parameters

| Parameter | Type                    | Description |
| --------- | ----------------------- | ----------- |
| `role`    | `"embedder"` \| `"llm"` | -           |

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
