---
mdx:
  format: md
---

# Function: verifyCitations()

```ts
function verifyCitations(input, options?): Promise<CitationVerification>;
```

Check every claim against the passages it cites: together, so a claim
that takes one fact from each of two passages is supported. Each
citation's own score is reported too.

## Parameters

| Parameter                | Type                                                                     | Description                                                                                                                                                                                                                                                        |
| ------------------------ | ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `input`                  | `ProviderCitations`                                                      | From fromAnthropicCitations() or fromOpenAIFileCitations()                                                                                                                                                                                                         |
| `options?`               | \{ `documents?`: `object`[]; `judge?`: \{ `generate`: `Function`; \}; \} | -                                                                                                                                                                                                                                                                  |
| `options.documents?`     | `object`[]                                                               | Documents to weight terms by (IDF); default: all cited passages                                                                                                                                                                                                    |
| `options.judge?`         | \{ `generate`: `Function`; \}                                            | Opt-in LLM judge for claims that failed for lack of word overlap (paraphrases), as in checkAnswer(); it may only name a passage the claim cites, and never overturns a number or negation mismatch. One call at most. Errors from `judge.generate` are not caught. |
| `options.judge.generate` | `Function`                                                               | -                                                                                                                                                                                                                                                                  |

## Returns

`Promise`\<`CitationVerification`\>
