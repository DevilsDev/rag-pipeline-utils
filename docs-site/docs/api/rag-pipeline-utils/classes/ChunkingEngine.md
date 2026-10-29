---
mdx:
  format: md
---

# Class: ChunkingEngine

ChunkingEngine orchestrates text chunking using pluggable strategies.
Extends EventEmitter to emit 'chunk' events after each chunking operation.

## Extends

- `EventEmitter`\<\[`never`\]\>

## Constructors

### Constructor

```ts
new ChunkingEngine(options?): ChunkingEngine;
```

Create a ChunkingEngine instance.

#### Parameters

| Parameter                      | Type                                                                                                                                                                    | Description                                         |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------- |
| `options?`                     | \{ `chunkOverlap?`: `number`; `chunkSize?`: `number`; `minChunkSize?`: `number`; `separators?`: `string`[]; `similarityThreshold?`: `number`; `strategy?`: `string`; \} | Configuration options merged with DEFAULT_CONFIG.   |
| `options.chunkOverlap?`        | `number`                                                                                                                                                                | Default chunk overlap.                              |
| `options.chunkSize?`           | `number`                                                                                                                                                                | Default chunk size.                                 |
| `options.minChunkSize?`        | `number`                                                                                                                                                                | Default minimum chunk size.                         |
| `options.separators?`          | `string`[]                                                                                                                                                              | Default separators for recursive strategy.          |
| `options.similarityThreshold?` | `number`                                                                                                                                                                | Default similarity threshold for semantic strategy. |
| `options.strategy?`            | `string`                                                                                                                                                                | Default strategy name.                              |

#### Returns

`ChunkingEngine`

#### Overrides

`EventEmitter<[never]>.constructor`

## Methods

### chunk()

```ts
chunk(text, options?): string[];
```

Chunk text using the configured or specified strategy.

#### Parameters

| Parameter           | Type                         | Description                                          |
| ------------------- | ---------------------------- | ---------------------------------------------------- |
| `text`              | `string`                     | The input text to chunk. Must be a non-empty string. |
| `options?`          | \{ `strategy?`: `string`; \} | Per-call options that override the engine config.    |
| `options.strategy?` | `string`                     | Strategy name to use for this call.                  |

#### Returns

`string`[]

Array of text chunks.

#### Throws

If text is not a non-empty string.

#### Throws

If the specified strategy is not registered.

#### Fires

ChunkingEngine#chunk

---

### getConfig()

```ts
getConfig(): object;
```

Get the current engine configuration.

#### Returns

`object`

A copy of the current configuration.

---

### listStrategies()

```ts
listStrategies(): string[];
```

List all registered strategy names.

#### Returns

`string`[]

Array of strategy names.

---

### registerStrategy()

```ts
registerStrategy(name, fn): void;
```

Register a custom chunking strategy.

#### Parameters

| Parameter | Type       | Description                                                   |
| --------- | ---------- | ------------------------------------------------------------- |
| `name`    | `string`   | Strategy name (used to select it via options.strategy).       |
| `fn`      | `Function` | Strategy function with signature (text, options) => string[]. |

#### Returns

`void`

#### Throws

If name is not a non-empty string.

#### Throws

If fn is not a function.
