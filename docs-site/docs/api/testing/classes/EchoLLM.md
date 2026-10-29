---
mdx:
  format: md
---

# Class: EchoLLM

LLM stand-in. Answers with `answer` (a string, or a function of the query
and documents), or else with the top document's content. Every call is
recorded in `calls`, so tests can assert on what the pipeline sent.

## Constructors

### Constructor

```ts
new EchoLLM(options?): EchoLLM;
```

#### Parameters

| Parameter           | Type                                                                                | Description                                        |
| ------------------- | ----------------------------------------------------------------------------------- | -------------------------------------------------- |
| `options?`          | \{ `answer?`: `string` \| ((`arg0`, `arg1`) => `string`); `fallback?`: `string`; \} | -                                                  |
| `options.answer?`   | `string` \| ((`arg0`, `arg1`) => `string`)                                          | -                                                  |
| `options.fallback?` | `string`                                                                            | Answer when there are no documents and no `answer` |

#### Returns

`EchoLLM`

## Properties

| Property                                  | Type                                       | Description                                                       |
| ----------------------------------------- | ------------------------------------------ | ----------------------------------------------------------------- |
| <a id="property-answer"></a> `answer`     | `string` \| ((`arg0`, `arg1`) => `string`) | The fixed answer, or a function of (query, docs) that returns it. |
| <a id="property-calls"></a> `calls`       | `object`[]                                 | -                                                                 |
| <a id="property-fallback"></a> `fallback` | `string`                                   | Returned when there are no documents and no `answer`.             |
| <a id="property-metadata"></a> `metadata` | `object`                                   | -                                                                 |
| `metadata.name`                           | `string`                                   | -                                                                 |
| `metadata.type`                           | `string`                                   | -                                                                 |
| `metadata.version`                        | `string`                                   | -                                                                 |

## Methods

### generate()

```ts
generate(
   query,
   docs?,
   options?
): Promise<string>;
```

#### Parameters

| Parameter         | Type                            | Description |
| ----------------- | ------------------------------- | ----------- |
| `query`           | `string`                        | -           |
| `docs?`           | `any`[]                         | -           |
| `options?`        | \{ `signal?`: `AbortSignal`; \} | -           |
| `options.signal?` | `AbortSignal`                   | -           |

#### Returns

`Promise`\<`string`\>

---

### generateStream()

```ts
generateStream(
   query,
   docs?,
   options?
): AsyncGenerator<{
  done: boolean;
  token: string;
}, void, unknown>;
```

Streams the same answer word by word, then a done chunk.

#### Parameters

| Parameter         | Type                            | Description |
| ----------------- | ------------------------------- | ----------- |
| `query`           | `string`                        | -           |
| `docs?`           | `any`[]                         | -           |
| `options?`        | \{ `signal?`: `AbortSignal`; \} | -           |
| `options.signal?` | `AbortSignal`                   | -           |

#### Returns

`AsyncGenerator`\<\{
`done`: `boolean`;
`token`: `string`;
\}, `void`, `unknown`\>

#### Yields

---

### getCacheKey()

```ts
getCacheKey(role): string;
```

Cache identity for createRagPipeline({ cache }); none when `answer` is a
function, since its output cannot be identified.

#### Parameters

| Parameter | Type     | Description |
| --------- | -------- | ----------- |
| `role`    | `string` | -           |

#### Returns

`string`
