---
mdx:
  format: md
---

# Function: checkNumericConsistency()

```ts
function checkNumericConsistency(claimText, docText): object;
```

Numeric consistency between a claim and a document: every number the claim
states (digits, decimals, percentages or number words) must also appear in
the document. Lexical overlap alone would ground "thirty days" against a
source that says "twenty days".

## Parameters

| Parameter   | Type     | Description |
| ----------- | -------- | ----------- |
| `claimText` | `string` | -           |
| `docText`   | `string` | -           |

## Returns

`object`

`matchedWords`: the words of a claim quantity or time the source states
another way ("90 minutes" for "one and a half hours"); computeSupportScore
counts them as matched

### claimNumbers

```ts
claimNumbers: string[];
```

### consistent

```ts
consistent: boolean;
```

### matchedWords

```ts
matchedWords: string[];
```

### missing

```ts
missing: string[];
```
