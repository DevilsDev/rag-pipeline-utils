---
mdx:
  format: md
---

# Class: AnthropicConnector

LLM connector for the Anthropic Claude API.
Uses axios for HTTP calls and supports streaming via SSE.

## Extends

- [`BaseConnector`](BaseConnector.md)

## Constructors

### Constructor

```ts
new AnthropicConnector(options?): AnthropicConnector;
```

#### Parameters

| Parameter               | Type                                                                                                                                                                                                                         | Description                                                                                                    |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `options?`              | \{ `apiKey?`: `string`; `apiVersion?`: `string`; `baseURL?`: `string`; `maxRetries?`: `number`; `maxTokens?`: `number`; `model?`: `string`; `retryDelay?`: `number`; `systemPrompt?`: `string`; `temperature?`: `number`; \} | -                                                                                                              |
| `options.apiKey?`       | `string`                                                                                                                                                                                                                     | Anthropic API key (defaults to ANTHROPIC_API_KEY at construction)                                              |
| `options.apiVersion?`   | `string`                                                                                                                                                                                                                     | API version header                                                                                             |
| `options.baseURL?`      | `string`                                                                                                                                                                                                                     | API base URL                                                                                                   |
| `options.maxRetries?`   | `number`                                                                                                                                                                                                                     | Retries for transient failures                                                                                 |
| `options.maxTokens?`    | `number`                                                                                                                                                                                                                     | Max tokens in response                                                                                         |
| `options.model?`        | `string`                                                                                                                                                                                                                     | Claude model to use                                                                                            |
| `options.retryDelay?`   | `number`                                                                                                                                                                                                                     | Base backoff delay in ms                                                                                       |
| `options.systemPrompt?` | `string`                                                                                                                                                                                                                     | System prompt used when RAG context is supplied                                                                |
| `options.temperature?`  | `number`                                                                                                                                                                                                                     | Sampling temperature. 1 is the API default and is not sent; Claude 4.7 and later models reject any other value |

#### Returns

`AnthropicConnector`

#### Overrides

[`BaseConnector`](BaseConnector.md).[`constructor`](BaseConnector.md#constructor)

## Properties

| Property                                    | Type            | Inherited from                                                                         |
| ------------------------------------------- | --------------- | -------------------------------------------------------------------------------------- |
| <a id="property-client"></a> `client`       | `AxiosInstance` | -                                                                                      |
| <a id="property-config"></a> `config`       | `object`        | -                                                                                      |
| `config.apiKey`                             | `string`        | -                                                                                      |
| `config.apiVersion`                         | `string`        | -                                                                                      |
| `config.baseURL`                            | `string`        | -                                                                                      |
| `config.maxRetries`                         | `number`        | -                                                                                      |
| `config.maxTokens`                          | `number`        | -                                                                                      |
| `config.model`                              | `string`        | -                                                                                      |
| `config.retryDelay`                         | `number`        | -                                                                                      |
| `config.systemPrompt?`                      | `string`        | -                                                                                      |
| `config.temperature`                        | `number`        | -                                                                                      |
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

### generate()

```ts
generate(
   query,
   context?,
   options?
): Promise<string>;
```

Generate a response from Claude using the provided query and optional RAG context.

#### Parameters

| Parameter         | Type                            | Description                                     |
| ----------------- | ------------------------------- | ----------------------------------------------- |
| `query`           | `string`                        | The user query / prompt                         |
| `context?`        | `any`[]                         | Retrieved documents for RAG                     |
| `options?`        | \{ `signal?`: `AbortSignal`; \} | Override model, temperature, maxTokens per-call |
| `options.signal?` | `AbortSignal`                   | Cancels the request                             |

#### Returns

`Promise`\<`string`\>

The generated text

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

Stream a response from Claude token-by-token via SSE.

#### Parameters

| Parameter         | Type                            | Description                                     |
| ----------------- | ------------------------------- | ----------------------------------------------- |
| `query`           | `string`                        | The user query / prompt                         |
| `context?`        | `any`[]                         | Retrieved documents for RAG                     |
| `options?`        | \{ `signal?`: `AbortSignal`; \} | Override model, temperature, maxTokens per-call |
| `options.signal?` | `AbortSignal`                   | Cancels the stream                              |

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

| Parameter | Type    | Description |
| --------- | ------- | ----------- |
| `role`    | `"llm"` | -           |

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
