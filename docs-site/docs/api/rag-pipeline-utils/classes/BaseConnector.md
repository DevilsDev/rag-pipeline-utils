---
mdx:
  format: md
---

# Class: BaseConnector

Abstract base class for all connectors.
Provides connection lifecycle, health checking, and retry logic.

## Extends

- `EventEmitter`\<\[`never`\]\>

## Extended by

- [`OllamaConnector`](OllamaConnector.md)
- [`LocalEmbedder`](LocalEmbedder.md)
- [`MemoryRetriever`](MemoryRetriever.md)
- [`OpenAIConnector`](OpenAIConnector.md)
- [`AnthropicConnector`](AnthropicConnector.md)
- [`CohereConnector`](CohereConnector.md)

## Constructors

### Constructor

```ts
new BaseConnector(options?): BaseConnector;
```

#### Parameters

| Parameter       | Type                     | Description            |
| --------------- | ------------------------ | ---------------------- |
| `options?`      | \{ `name?`: `string`; \} | -                      |
| `options.name?` | `string`                 | Connector display name |

#### Returns

`BaseConnector`

#### Overrides

`EventEmitter<[never]>.constructor`

## Properties

| Property                                    | Type      |
| ------------------------------------------- | --------- |
| <a id="property-connected"></a> `connected` | `boolean` |
| <a id="property-name"></a> `name`           | `string`  |
| <a id="property-options"></a> `options`     | `object`  |
| `options.name?`                             | `string`  |

## Methods

### connect()

```ts
connect(): Promise<void>;
```

Establish the connection.
Override in subclass for custom connection logic.

#### Returns

`Promise`\<`void`\>

---

### disconnect()

```ts
disconnect(): Promise<void>;
```

Tear down the connection.
Override in subclass for custom disconnection logic.

#### Returns

`Promise`\<`void`\>

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

---

### isHealthy()

```ts
isHealthy(): Promise<boolean>;
```

Check whether the connector is healthy and operational.
Override in subclass for custom health checks.

#### Returns

`Promise`\<`boolean`\>

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
