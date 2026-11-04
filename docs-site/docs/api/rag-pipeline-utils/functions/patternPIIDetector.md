---
mdx:
  format: md
---

# Function: patternPIIDetector()

```ts
function patternPIIDetector(options?): object;
```

The built-in PII check as a detector: emails, phone numbers, US social
security numbers and card numbers, by pattern.

## Parameters

| Parameter           | Type                                                   | Description                                       |
| ------------------- | ------------------------------------------------------ | ------------------------------------------------- |
| `options?`          | \{ `patterns?`: \{ \[`x`: `string`\]: `RegExp`; \}; \} | -                                                 |
| `options.patterns?` | \{ \[`x`: `string`\]: `RegExp`; \}                     | Extra patterns by label, merged with the defaults |

## Returns

`object`

### detect

```ts
detect: (text) => object;
```

#### Parameters

| Parameter | Type     |
| --------- | -------- |
| `text`    | `string` |

#### Returns

`object`

##### flagged

```ts
flagged: boolean;
```

##### labels

```ts
labels: string[];
```

##### matches

```ts
matches: object[];
```

### kind

```ts
kind: "pii";
```

### name

```ts
name: string;
```
