---
mdx:
  format: md
---

# Class: StreamRouter

Routes pipeline streaming output to SSE or WebSocket transports.

Provides both an Express/Node-HTTP-compatible request handler via
[StreamRouter#createHandler](#createhandler) and lower-level convenience methods
([StreamRouter#streamSSE](#streamsse), [StreamRouter#streamWS](#streamws)) for
manual integration.

## Example

```ts
const router = new StreamRouter({ enableCORS: true });
const handler = router.createHandler(pipeline);
app.post("/api/query", handler);
```

## Extends

- `EventEmitter`\<\[`never`\]\>

## Constructors

### Constructor

```ts
new StreamRouter(options?): StreamRouter;
```

#### Parameters

| Parameter                   | Type                                                                                                                               | Description                           |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------- |
| `options?`                  | \{ `corsOrigin?`: `string`; `defaultTransport?`: `string`; `enableCORS?`: `boolean`; `sseOptions?`: `any`; `wsOptions?`: `any`; \} | Configuration overrides               |
| `options.corsOrigin?`       | `string`                                                                                                                           | CORS origin value                     |
| `options.defaultTransport?` | `string`                                                                                                                           | Fallback transport type               |
| `options.enableCORS?`       | `boolean`                                                                                                                          | Enable CORS headers                   |
| `options.sseOptions?`       | `any`                                                                                                                              | Options forwarded to SSEAdapter       |
| `options.wsOptions?`        | `any`                                                                                                                              | Options forwarded to WebSocketAdapter |

#### Returns

`StreamRouter`

#### Overrides

`EventEmitter<[never]>.constructor`

## Properties

| Property                                      | Type                                      |
| --------------------------------------------- | ----------------------------------------- |
| <a id="property-config"></a> `config`         | `any`                                     |
| <a id="property-sseadapter"></a> `sseAdapter` | [`SSEAdapter`](SSEAdapter.md)             |
| <a id="property-wsadapter"></a> `wsAdapter`   | [`WebSocketAdapter`](WebSocketAdapter.md) |

## Methods

### createHandler()

```ts
createHandler(pipeline): Function;
```

Create an HTTP request handler that runs the pipeline in streaming mode
and routes output to the appropriate transport.

The returned function is compatible with Node's `http.createServer`,
Express, and similar frameworks.

Transport detection:

- `Accept: text/event-stream` header selects SSE
- `Upgrade: websocket` header selects WebSocket (note: actual upgrade
  negotiation is typically handled at a higher level)
- Otherwise falls back to DEFAULT_CONFIG.defaultTransport

#### Parameters

| Parameter  | Type  | Description                              |
| ---------- | ----- | ---------------------------------------- |
| `pipeline` | `any` | A pipeline object with a `.run()` method |

#### Returns

`Function`

Async request handler `(req, res) => Promise<void>`

---

### streamSSE()

```ts
streamSSE(
   pipeline,
   query,
   httpResponse,
   options?
): Promise<void>;
```

Run the pipeline in streaming mode and pipe tokens to an HTTP response
via Server-Sent Events.

If the pipeline returns a non-iterable result, it is sent as a single
SSE data frame followed by the done sentinel.

#### Parameters

| Parameter      | Type                                  | Description                     |
| -------------- | ------------------------------------- | ------------------------------- |
| `pipeline`     | `any`                                 | Pipeline with a `.run()` method |
| `query`        | `string`                              | User query string               |
| `httpResponse` | `ServerResponse`\<`IncomingMessage`\> | Writable HTTP response          |
| `options?`     | `any`                                 | Additional pipeline run options |

#### Returns

`Promise`\<`void`\>

---

### streamWS()

```ts
streamWS(
   pipeline,
   query,
   wsConnection,
   options?
): Promise<void>;
```

Run the pipeline in streaming mode and pipe tokens over a WebSocket
connection.

If the pipeline returns a non-iterable result, it is sent as a single
`result` message followed by a `done` message.

#### Parameters

| Parameter      | Type     | Description                              |
| -------------- | -------- | ---------------------------------------- |
| `pipeline`     | `any`    | Pipeline with a `.run()` method          |
| `query`        | `string` | User query string                        |
| `wsConnection` | `any`    | WebSocket-like connection with `.send()` |
| `options?`     | `any`    | Additional pipeline run options          |

#### Returns

`Promise`\<`void`\>
