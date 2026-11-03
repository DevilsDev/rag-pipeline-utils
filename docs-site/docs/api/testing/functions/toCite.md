---
mdx:
  format: md
---

# Function: toCite()

```ts
function toCite(received, ids, sources?): object;
```

Passes when the answer cites each of the given sources: at least one of its
sentences is supported by that source.

## Parameters

| Parameter  | Type                                                          | Description                              |
| ---------- | ------------------------------------------------------------- | ---------------------------------------- |
| `received` | \| `string` \| \{ `answer`: `string`; `results?`: `any`[]; \} | An answer, or a run() result             |
| `ids`      | `string` \| `string`[]                                        | Source id(s) that must be cited          |
| `sources?` | `any`[]                                                       | Defaults to the run() result's `results` |

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
