---
mdx:
  format: md
---

# Function: validateInput()

```ts
function validateInput(input, opts?): object;
```

Checks input against a maximum length and a fixed list of disallowed
tokens (code fences, `${`, `</script`, `--`, `;`, `||`, `&&`).

## Parameters

| Parameter         | Type                          | Description           |
| ----------------- | ----------------------------- | --------------------- |
| `input`           | `any`                         | Converted to a string |
| `opts?`           | \{ `maxLength?`: `number`; \} | -                     |
| `opts.maxLength?` | `number`                      | -                     |

## Returns

`object`

`sanitized` is the input cut to `maxLength`

### reasons

```ts
reasons: string[];
```

### sanitized

```ts
sanitized: string;
```

### valid

```ts
valid: boolean;
```
