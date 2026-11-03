---
mdx:
  format: md
---

# Function: checkPolarityConsistency()

```ts
function checkPolarityConsistency(claimText, docText): object;
```

Polarity consistency between a claim and a document. Word overlap alone
grounds "employees never receive paid vacation" against a source that says
"employees receive twenty days of paid vacation", because the negation is
one word among many. The claim is compared with the document sentence that
shares most of its content words (any of them, on a tie): it is consistent
when that sentence is negated exactly when the claim is.

Errs on the side of not grounding: a source that negates in other words
("contractors are excluded from vacation") does not match a negated claim,
and a sentence joining a positive and a negative statement is judged by
the source sentence closest to it as a whole.

## Parameters

| Parameter   | Type     | Description |
| ----------- | -------- | ----------- |
| `claimText` | `string` | -           |
| `docText`   | `string` | -           |

## Returns

`object`

sourceSentence: the closest document sentence the claim was compared with

### claimNegated

```ts
claimNegated: boolean;
```

### consistent

```ts
consistent: boolean;
```

### sourceSentence

```ts
sourceSentence: string;
```
