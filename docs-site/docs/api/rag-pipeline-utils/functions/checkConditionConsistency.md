---
mdx:
  format: md
---

# Function: checkConditionConsistency()

```ts
function checkConditionConsistency(claimText, docText, answerText?): object;
```

Condition consistency between a claim and a document. A claim that keeps
every noun and number of its source but drops a restriction on it grants
more than the source does: "Remote work is allowed two days per week"
from "Remote work is allowed two days per week with manager approval".
Word overlap passes it, so it is checked here (3.9).

The claim is compared with the document sentence that shares most of its
content words (any of them, on a tie). In the statements of that sentence
that hold the claim's words (a sentence is split at and, but, whereas,
while, however and semicolons, not at commas), each restricting clause
("with ... approval", "only if", "if", "unless", "provided", "subject to",
"as long as", "after <number> <unit>", "for <people> who/with ...",
"except") must be kept: at least one of its content words must appear in
the claim or elsewhere in the answer, so a condition restated in another
sentence still counts. Contrasting clauses ("but not in children") may be
left out, as the polarity check allows since 3.6.

## Parameters

| Parameter     | Type     | Description                             |
| ------------- | -------- | --------------------------------------- |
| `claimText`   | `string` | -                                       |
| `docText`     | `string` | -                                       |
| `answerText?` | `string` | The whole answer; defaults to the claim |

## Returns

`object`

missing: the restricting clauses the claim leaves out

### consistent

```ts
consistent: boolean;
```

### missing

```ts
missing: string[];
```

### sourceSentence

```ts
sourceSentence: string;
```
