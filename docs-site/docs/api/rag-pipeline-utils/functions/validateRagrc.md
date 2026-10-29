---
mdx:
  format: md
---

# Function: validateRagrc()

```ts
function validateRagrc(config): object;
```

Validate .ragrc.json configuration (single source of truth)

## Parameters

| Parameter | Type     | Description               |
| --------- | -------- | ------------------------- |
| `config`  | `object` | Configuration to validate |

## Returns

`object`

### errors?

```ts
errors?: any[];
```

### normalized?

```ts
normalized?: object;
```

### valid

```ts
valid: boolean;
```
