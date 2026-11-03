---
mdx:
  format: md
---

# Function: toContainNoPII()

```ts
function toContainNoPII(received, options?): object;
```

Passes when no email address, phone number, US social security number or
card number (the post-generation guard's patterns) appears in the value: a
string, or every string nested in an object such as a run() result.

## Parameters

| Parameter           | Type                                                   | Description            |
| ------------------- | ------------------------------------------------------ | ---------------------- |
| `received`          | `any`                                                  | -                      |
| `options?`          | \{ `patterns?`: \{ \[`x`: `string`\]: `RegExp`; \}; \} | Extra patterns by name |
| `options.patterns?` | \{ \[`x`: `string`\]: `RegExp`; \}                     | -                      |

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
