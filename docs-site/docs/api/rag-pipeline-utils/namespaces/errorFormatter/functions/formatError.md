---
mdx:
  format: md
---

# Function: formatError()

```ts
function formatError(code, context?): object;
```

Fill the template for an error code with context values. Unknown codes use
the UNKNOWN_ERROR template. Each placeholder is replaced at its first
occurrence only; placeholders with no context value stay as written.

## Parameters

| Parameter  | Type                            | Description                                 |
| ---------- | ------------------------------- | ------------------------------------------- |
| `code`     | `string`                        | Error code                                  |
| `context?` | \{ \[`x`: `string`\]: `any`; \} | Placeholder values, converted with String() |

## Returns

`object`

Formatted error details

### code

```ts
code: string;
```

### context

```ts
context: object;
```

#### Index Signature

```ts
[x: string]: any
```

### documentation

```ts
documentation: string;
```

### message

```ts
message: string;
```

### suggestions

```ts
suggestions: string[];
```
