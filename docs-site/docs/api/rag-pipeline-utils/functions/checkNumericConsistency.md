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

### claimNumbers

```ts
claimNumbers: string[];
```

### consistent

```ts
consistent: boolean;
```

### missing

```ts
missing: string[];
```
