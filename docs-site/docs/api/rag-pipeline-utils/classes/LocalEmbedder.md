---
mdx:
  format: md
---

# Class: LocalEmbedder

TF-IDF based embedder for fully offline use.
No external API required -- builds a vocabulary from training documents
and produces sparse TF-IDF vectors.

## Extends

- [`BaseConnector`](BaseConnector.md)

## Constructors

### Constructor

```ts
new LocalEmbedder(options?): LocalEmbedder;
```

#### Parameters

| Parameter                    | Type                                                                | Description                                           |
| ---------------------------- | ------------------------------------------------------------------- | ----------------------------------------------------- |
| `options?`                   | \{ `maxVocabularySize?`: `number`; `minDocFrequency?`: `number`; \} | -                                                     |
| `options.maxVocabularySize?` | `number`                                                            | Maximum vocabulary size                               |
| `options.minDocFrequency?`   | `number`                                                            | Minimum document frequency for a token to be included |

#### Returns

`LocalEmbedder`

#### Overrides

[`BaseConnector`](BaseConnector.md).[`constructor`](BaseConnector.md#constructor)

## Properties

| Property                                      | Type                        | Inherited from                                                                         |
| --------------------------------------------- | --------------------------- | -------------------------------------------------------------------------------------- |
| <a id="property-config"></a> `config`         | `any`                       | -                                                                                      |
| <a id="property-connected"></a> `connected`   | `boolean`                   | [`BaseConnector`](BaseConnector.md).[`connected`](BaseConnector.md#property-connected) |
| <a id="property-doccount"></a> `docCount`     | `number`                    | -                                                                                      |
| <a id="property-idf"></a> `idf`               | `Map`\<`string`, `number`\> | -                                                                                      |
| <a id="property-name"></a> `name`             | `string`                    | [`BaseConnector`](BaseConnector.md).[`name`](BaseConnector.md#property-name)           |
| <a id="property-options"></a> `options`       | `object`                    | [`BaseConnector`](BaseConnector.md).[`options`](BaseConnector.md#property-options)     |
| `options.name?`                               | `string`                    | -                                                                                      |
| <a id="property-vocabulary"></a> `vocabulary` | `Map`\<`string`, `number`\> | -                                                                                      |

## Accessors

### dimensions

#### Get Signature

```ts
get dimensions(): number;
```

##### Returns

`number`

Vector length produced by embed() once trained

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
embed(text, options?): number[];
```

Compute a TF-IDF vector for the given text.
The vector length equals the vocabulary size. Synchronous; when
options.signal is already aborted it throws an AbortError (which an
awaiting caller sees as a rejection).

#### Parameters

| Parameter         | Type                            | Description         |
| ----------------- | ------------------------------- | ------------------- |
| `text`            | `string`                        | Text to embed       |
| `options?`        | \{ `signal?`: `AbortSignal`; \} | -                   |
| `options.signal?` | `AbortSignal`                   | Cancellation signal |

#### Returns

`number`[]

L2-normalized TF-IDF vector

---

### embedQuery()

```ts
embedQuery(query, options?): number[];
```

Compute a TF-IDF vector for a query string.
Alias for [embed](#embed).

#### Parameters

| Parameter  | Type     | Description         |
| ---------- | -------- | ------------------- |
| `query`    | `string` | Query text to embed |
| `options?` | `any`    | Same as embed()     |

#### Returns

`number`[]

L2-normalized TF-IDF vector

---

### getCacheKey()

```ts
getCacheKey(role): string;
```

Cache identity for createRagPipeline({ cache }): a fingerprint of the
trained vocabulary and IDF weights, so retraining invalidates cached
query vectors (also across processes sharing a Redis cache).

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

### getState()

```ts
getState(): object;
```

Serializable vocabulary and IDF weights, so a trained embedder can be
restored in another process (e.g. by FileVectorStore-backed CLI queries).

#### Returns

`object`

##### docCount

```ts
docCount: number;
```

##### idf

```ts
idf: [string, number][];
```

##### vocabulary

```ts
vocabulary: [string, number][];
```

---

### getVocabularySize()

```ts
getVocabularySize(): number;
```

Get the current vocabulary size.

#### Returns

`number`

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

### setState()

```ts
setState(state): void;
```

Restore state produced by getState().

#### Parameters

| Parameter          | Type                                                                                                 | Description |
| ------------------ | ---------------------------------------------------------------------------------------------------- | ----------- |
| `state`            | \{ `docCount`: `number`; `idf`: \[`string`, `number`\][]; `vocabulary`: \[`string`, `number`\][]; \} | -           |
| `state.docCount`   | `number`                                                                                             | -           |
| `state.idf`        | \[`string`, `number`\][]                                                                             | -           |
| `state.vocabulary` | \[`string`, `number`\][]                                                                             | -           |

#### Returns

`void`

---

### train()

```ts
train(documents): void;
```

Build vocabulary and IDF weights from a corpus of documents.

#### Parameters

| Parameter   | Type                                                               | Description        |
| ----------- | ------------------------------------------------------------------ | ------------------ |
| `documents` | ( \| `string` \| \{ `content?`: `string`; `text?`: `string`; \})[] | Training documents |

#### Returns

`void`

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
