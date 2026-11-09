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
"except") must be kept: at least one of its distinctive words (see
restrictingClauses) must appear in the claim, or in another sentence of
the answer that this document supports (most of its content words are in
the document), so a condition restated from the same source still counts
and a word from a sentence about something else doesn't. Contrasting
clauses that add or contrast something ("but not in children" after "in
adults", "but it may take a few minutes") may be left out, as the
polarity check allows since 3.6; since 3.9 one that narrows or negates
the statement before it ("but not for guests", "but only on Fridays",
"but except ...") is a restricting clause of that statement and must be
kept. Phrases that restrict nothing are not restrictions:
"even if", "if any", "if applicable", "if necessary", "if needed", "if
need be", "if possible", an anaphoric "If not," or "If so,", and "except
as required (or permitted) by law". A source with no space after a
sentence's full stop ("per week.If you need") is split there too.

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
