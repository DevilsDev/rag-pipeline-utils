---
mdx:
  format: md
---

# Function: detectHallucinations()

```ts
function detectHallucinations(citationResults, options?): object;
```

Detect hallucinations by analyzing citation results and classifying each sentence.

Classification:

- 'definite_hallucination': bestScore === 0 (no overlap with any source)
- 'likely_hallucination': bestScore > 0 but below threshold
- 'grounded': bestScore >= threshold

## Parameters

| Parameter            | Type                          | Description                                 |
| -------------------- | ----------------------------- | ------------------------------------------- |
| `citationResults`    | `object`[]                    | -                                           |
| `options?`           | \{ `threshold?`: `number`; \} | -                                           |
| `options.threshold?` | `number`                      | Score threshold for grounded classification |

## Returns

`object`

### hallucinationRate

```ts
hallucinationRate: number;
```

### sentences

```ts
sentences: object[];
```

### summary

```ts
summary: object;
```

#### summary.definite_hallucination

```ts
definite_hallucination: number;
```

#### summary.grounded

```ts
grounded: number;
```

#### summary.likely_hallucination

```ts
likely_hallucination: number;
```
