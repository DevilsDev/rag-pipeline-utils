---
mdx:
  format: md
---

# Function: detectInjection()

```ts
function detectInjection(text, opts?): object;
```

Detect prompt-injection attempts in text.

Built-in rules run on the folded text. Custom patterns run on the
normalised text (case preserved) and on the folded text.

## Parameters

| Parameter           | Type                                                                    | Description                |
| ------------------- | ----------------------------------------------------------------------- | -------------------------- |
| `text`              | `string`                                                                | -                          |
| `opts?`             | \{ `patterns?`: (`string` \| `RegExp`)[]; `useDefaults?`: `boolean`; \} | -                          |
| `opts.patterns?`    | (`string` \| `RegExp`)[]                                                | Extra patterns             |
| `opts.useDefaults?` | `boolean`                                                               | Include the built-in rules |

## Returns

`object`

### detected

```ts
detected: boolean;
```

### matches

```ts
matches: object[];
```

### normalized

```ts
normalized: string;
```
