---
mdx:
  format: md
---

# Function: splitSentences()

```ts
function splitSentences(text): string[];
```

Split text into sentences. Boundaries are found on the normalised text
(see normalize-text.js), so zero-width characters, no-break spaces and
full-width punctuation don't move them; the sentences returned are the
original text, trimmed.

A sentence ends at `.`, `!` or `?` followed by a space, or directly by a
capital after a lowercase word ("works.Wireless"); a full stop before a
lowercase word ("10 a.m. and") or after a title or Latin abbreviation
("Dr. Lee", "e.g. Paris") doesn't end one. A blank line, and the line
break around a list item or heading, end one too.

## Parameters

| Parameter | Type     | Description |
| --------- | -------- | ----------- |
| `text`    | `string` | -           |

## Returns

`string`[]
