---
mdx:
  format: md
---

# Class: WebSocketAdapter

Adapts an AsyncGenerator to a WebSocket connection.

Sends JSON-framed messages for each token, a completion message when
the generator is exhausted, and an error message on failure. Handles
premature connection closure gracefully.

## Example

```ts
const adapter = new WebSocketAdapter();
adapter.on("done", () => console.log("stream complete"));
await adapter.stream(asyncTokenGenerator, ws);
```

## Extends

- `EventEmitter`\<\[`never`\]\>

## Constructors

### Constructor

```ts
new WebSocketAdapter(options?): WebSocketAdapter;
```

#### Parameters

| Parameter              | Type                                                                           | Description                       |
| ---------------------- | ------------------------------------------------------------------------------ | --------------------------------- |
| `options?`             | \{ `doneType?`: `string`; `errorType?`: `string`; `messageType?`: `string`; \} | Configuration overrides           |
| `options.doneType?`    | `string`                                                                       | Type field for completion message |
| `options.errorType?`   | `string`                                                                       | Type field for error messages     |
| `options.messageType?` | `string`                                                                       | Type field for token messages     |

#### Returns

`WebSocketAdapter`

#### Overrides

`EventEmitter<[never]>.constructor`

## Properties

| Property                              | Type  |
| ------------------------------------- | ----- |
| <a id="property-config"></a> `config` | `any` |

## Methods

### stream()

```ts
stream(asyncGenerator, wsConnection): Promise<void>;
```

Stream tokens from an AsyncGenerator over a WebSocket connection.

Each yielded value should be an object with at least a `token` property
and an optional `done` boolean. Messages are sent as JSON strings via
`wsConnection.send()`.

#### Parameters

| Parameter                  | Type                                                             | Description                                      |
| -------------------------- | ---------------------------------------------------------------- | ------------------------------------------------ |
| `asyncGenerator`           | `AsyncGenerator`\<\{ `done?`: `boolean`; `token`: `string`; \}\> | Token source                                     |
| `wsConnection`             | \{ `readyState?`: `number`; `send`: `Function`; \}               | WebSocket-like object with a `send(data)` method |
| `wsConnection.readyState?` | `number`                                                         | Optional W3C readyState property                 |
| `wsConnection.send`        | `Function`                                                       | Sends a string message over the socket           |

#### Returns

`Promise`\<`void`\>

Resolves when the stream ends or the connection closes

#### Throws

If wsConnection lacks a send method
