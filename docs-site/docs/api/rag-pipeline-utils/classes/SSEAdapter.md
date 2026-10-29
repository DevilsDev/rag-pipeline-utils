---
mdx:
  format: md
---

# Class: SSEAdapter

Adapts an AsyncGenerator to the Server-Sent Events protocol.

Writes well-formed SSE frames to an HTTP response, manages heartbeat
keep-alive comments, and handles client disconnects gracefully.

## Example

```ts
const adapter = new SSEAdapter({ heartbeatIntervalMs: 10000 });
adapter.on("token", (t) => console.log("sent", t));
await adapter.stream(asyncTokenGenerator, res);
```

## Extends

- `EventEmitter`\<\[`never`\]\>

## Constructors

### Constructor

```ts
new SSEAdapter(options?): SSEAdapter;
```

#### Parameters

| Parameter                      | Type                                                                                    | Description                             |
| ------------------------------ | --------------------------------------------------------------------------------------- | --------------------------------------- |
| `options?`                     | \{ `doneEvent?`: `string`; `eventName?`: `string`; `heartbeatIntervalMs?`: `number`; \} | Configuration overrides                 |
| `options.doneEvent?`           | `string`                                                                                | Sentinel value for the final data frame |
| `options.eventName?`           | `string`                                                                                | SSE event name for token frames         |
| `options.heartbeatIntervalMs?` | `number`                                                                                | Heartbeat interval in milliseconds      |

#### Returns

`SSEAdapter`

#### Overrides

`EventEmitter<[never]>.constructor`

## Properties

| Property                              | Type  |
| ------------------------------------- | ----- |
| <a id="property-config"></a> `config` | `any` |

## Methods

### formatEvent()

```ts
formatEvent(eventName, data): string;
```

Format a single SSE event string.

Multi-line data is split so each line is prefixed with `data: ` as
required by the SSE specification.

#### Parameters

| Parameter   | Type     | Description                        |
| ----------- | -------- | ---------------------------------- |
| `eventName` | `string` | The SSE event type                 |
| `data`      | `any`    | Payload (will be JSON-stringified) |

#### Returns

`string`

Fully formatted SSE frame including trailing blank line

---

### stream()

```ts
stream(asyncGenerator, httpResponse): Promise<void>;
```

Stream tokens from an AsyncGenerator to an HTTP response as SSE.

Sets the required SSE headers, starts a heartbeat timer, and iterates
over the generator. Each yielded value should be an object with at least
a `token` property and an optional `done` boolean.

#### Parameters

| Parameter        | Type                                                             | Description            |
| ---------------- | ---------------------------------------------------------------- | ---------------------- |
| `asyncGenerator` | `AsyncGenerator`\<\{ `done?`: `boolean`; `token`: `string`; \}\> | Token source           |
| `httpResponse`   | `ServerResponse`\<`IncomingMessage`\>                            | Writable HTTP response |

#### Returns

`Promise`\<`void`\>

Resolves when the stream ends or the client disconnects
