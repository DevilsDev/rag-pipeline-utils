---
mdx:
  format: md
---

# Function: validateDataset()

```ts
function validateDataset(dataset, options?): object;
```

Checks an evaluation dataset before anything runs. It never throws: every
problem is reported, with the case it is in.

## Parameters

| Parameter                   | Type                                                                 | Description                      |
| --------------------------- | -------------------------------------------------------------------- | -------------------------------- |
| `dataset`                   | \| `any`[] \| \{ `cases`: `any`[]; \}                                | Cases, or an object with `cases` |
| `options?`                  | \{ `requireExpected?`: `boolean`; `requireSourceIds?`: `boolean`; \} | -                                |
| `options.requireExpected?`  | `boolean`                                                            | Every case needs `expected`      |
| `options.requireSourceIds?` | `boolean`                                                            | Every case needs `sourceIds`     |

## Returns

`object`

`cases` holds the normalised cases (aliases resolved, ids filled in)
when `valid` is true, and is empty otherwise

### cases

```ts
cases: object[];
```

### errors

```ts
errors: object[];
```

### valid

```ts
valid: boolean;
```

### warnings

```ts
warnings: object[];
```
