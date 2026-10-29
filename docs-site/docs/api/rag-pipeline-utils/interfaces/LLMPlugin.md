---
mdx:
  format: md
---

# Interface: LLMPlugin

An LLM. To register it with pluginRegistry it needs `metadata: { name, version, type: "llm" }`.

## Methods

### generate()

```ts
generate(
   query,
   documents,
   options?
): string | Promise<string>;
```

Answers the query from the retrieved documents. Must resolve to the
answer text: the pipeline converts the result with `String()`.
`options` is the run's `options` plus its AbortSignal.

#### Parameters

| Parameter         | Type                                                        |
| ----------------- | ----------------------------------------------------------- |
| `query`           | `string`                                                    |
| `documents`       | [`SearchResult`](SearchResult.md)[]                         |
| `options?`        | \{ \[`key`: `string`\]: `any`; `signal?`: `AbortSignal`; \} |
| `options.signal?` | `AbortSignal`                                               |

#### Returns

`string` \| `Promise`\<`string`\>

---

### generateStream()?

```ts
generateStream?(
   query,
   documents,
   options?
): AsyncIterable<
  | string
  | {
  done?: boolean;
  token: string;
}>;
```

Streams the answer; used with `options.stream` when present, otherwise `generate` is yielded as one chunk.

#### Parameters

| Parameter         | Type                                                        |
| ----------------- | ----------------------------------------------------------- |
| `query`           | `string`                                                    |
| `documents`       | [`SearchResult`](SearchResult.md)[]                         |
| `options?`        | \{ \[`key`: `string`\]: `any`; `signal?`: `AbortSignal`; \} |
| `options.signal?` | `AbortSignal`                                               |

#### Returns

`AsyncIterable`\<
\| `string`
\| \{
`done?`: `boolean`;
`token`: `string`;
\}\>
