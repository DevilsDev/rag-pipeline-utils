---
mdx:
  format: md
---

# Function: detectorVerdict()

```ts
function detectorVerdict(report, min?): object;
```

Check minimums such as `{ 'pattern-injection.recall': 0.5 }` against a
report. A key is `<detector>.<metric>`, where metric is precision,
recall, f1 or accuracy, or spans.precision / spans.recall.

## Parameters

| Parameter | Type                               | Description                   |
| --------- | ---------------------------------- | ----------------------------- |
| `report`  | `object`                           | An evaluateDetectors() report |
| `min?`    | \{ \[`x`: `string`\]: `number`; \} | -                             |

## Returns

`object`

### passed

```ts
passed: boolean;
```

### reasons

```ts
reasons: string[];
```
