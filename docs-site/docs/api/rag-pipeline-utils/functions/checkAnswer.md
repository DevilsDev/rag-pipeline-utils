---
mdx:
  format: md
---

# Function: checkAnswer()

```ts
function checkAnswer(params?): Promise<AnswerCheck>;
```

Check an answer against the sources it was generated from.

## Parameters

| Parameter                 | Type                                                                                                                                           | Description                                                                                     |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `params?`                 | \{ `answer`: `string`; `embedder?`: `any`; `evaluate?`: `boolean`; `question?`: `string`; `referenceAnswer?`: `string`; `sources`: `any`[]; \} | -                                                                                               |
| `params.answer`           | `string`                                                                                                                                       | The generated answer                                                                            |
| `params.embedder?`        | `any`                                                                                                                                          | With a referenceAnswer, adds `evaluation.scores.semanticSimilarity` (computeSemanticSimilarity) |
| `params.evaluate?`        | `boolean`                                                                                                                                      | Also compute evaluation scores                                                                  |
| `params.question?`        | `string`                                                                                                                                       | The question; needed for relevance                                                              |
| `params.referenceAnswer?` | `string`                                                                                                                                       | Ground truth, for context recall (and semantic similarity when an embedder is given)            |
| `params.sources`          | `any`[]                                                                                                                                        | Documents the answer was generated from (see normalizeSources for accepted shapes)              |

## Returns

`Promise`\<`AnswerCheck`\>

## Example

```ts
// A LangChain chain's output
const check = await checkAnswer({
  question: input,
  answer: result.answer,
  sources: result.context, // LangChain Documents
});
if (!check.grounded) console.warn(check.unsupported);
```
