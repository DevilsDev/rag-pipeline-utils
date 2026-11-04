---
mdx:
  format: md
---

# Function: patternInjectionDetector()

```ts
function patternInjectionDetector(options?): object;
```

The built-in prompt-injection check as a detector.

## Parameters

| Parameter           | Type                           | Description                                 |
| ------------------- | ------------------------------ | ------------------------------------------- |
| `options?`          | \{ `patterns?`: `RegExp`[]; \} | -                                           |
| `options.patterns?` | `RegExp`[]                     | Extra patterns, added to the built-in rules |

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
kind: "injection";
```

### name

```ts
name: string;
```
