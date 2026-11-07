---
mdx:
  format: md
---

# Function: toBeGroundedIn()

```ts
function toBeGroundedIn(received, sources?, options?): object;
```

Passes when every sentence of the answer is supported by the sources: its
content words, numbers and negation match a source (see checkAnswer).

## Parameters

| Parameter                 | Type                                                          | Description                                                                                                            |
| ------------------------- | ------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `received`                | \| `string` \| \{ `answer`: `string`; `results?`: `any`[]; \} | An answer, or a run() result                                                                                           |
| `sources?`                | `any`[]                                                       | Defaults to the run() result's `results`                                                                               |
| `options?`                | \{ `conditionCheck?`: `boolean`; `threshold?`: `number`; \}   | Support threshold per sentence (default 0.5); `conditionCheck: false` skips the 3.9 condition check, as in checkAnswer |
| `options.conditionCheck?` | `boolean`                                                     | -                                                                                                                      |
| `options.threshold?`      | `number`                                                      | -                                                                                                                      |

## Returns

`object`

### message

```ts
message: () => string;
```

#### Returns

`string`

### pass

```ts
pass: boolean;
```
