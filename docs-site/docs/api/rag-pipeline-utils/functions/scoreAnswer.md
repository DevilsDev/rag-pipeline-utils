---
mdx:
  format: md
---

# Function: scoreAnswer()

```ts
function scoreAnswer(_actual, _expected): object;
```

Score a prompt-answer pair using multiple metrics

## Parameters

| Parameter   | Type  |
| ----------- | ----- |
| `_actual`   | `any` |
| `_expected` | `any` |

## Returns

`object`

### bleu

```ts
bleu: number;
```

### rouge

```ts
rouge: number;
```
