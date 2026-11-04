---
mdx:
  format: md
---

# Function: fromOpenAIFileCitations()

```ts
function fromOpenAIFileCitations(response): ProviderCitations;
```

Normalise the file citations of an OpenAI Responses API response.

A `file_citation` carries only `file_id`, `filename` and an `index` into
the text, not the passage: the passages come from the file search
results, which the request must ask for with
`include: ["file_search_call.results"]`. Without them every citation is
unverifiable. OpenAI gives a position, not a span, and puts it after the
text it cites, a sentence or a paragraph (several citations can share
it): each sentence from the previous citation's position up to this one
is a claim carrying its citations. The boundary is inferred.
Web and container citations are counted in `skipped`. Pass a stream's
completed response.

## Parameters

| Parameter  | Type     | Description                                    |
| ---------- | -------- | ---------------------------------------------- |
| `response` | `object` | The Response, as the SDK returns it or as JSON |

## Returns

`ProviderCitations`
