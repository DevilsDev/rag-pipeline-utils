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

| Parameter                 | Type                                                                                                                                                                 | Description                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `params?`                 | \{ `answer`: `string`; `embedder?`: `any`; `evaluate?`: `boolean`; `judge?`: `JudgeLLM`; `question?`: `string`; `referenceAnswer?`: `string`; `sources`: `any`[]; \} | -                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `params.answer`           | `string`                                                                                                                                                             | The generated answer                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `params.embedder?`        | `any`                                                                                                                                                                | With a referenceAnswer, adds `evaluation.scores.semanticSimilarity` (computeSemanticSimilarity)                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `params.evaluate?`        | `boolean`                                                                                                                                                            | Also compute evaluation scores                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `params.judge?`           | `JudgeLLM`                                                                                                                                                           | Opt-in LLM judge for sentences the lexical check failed for lack of word overlap (correct paraphrases). It never overturns a sentence that failed the number or negation check, and a "supported" verdict must name a source whose numbers and negation match the sentence. Unparseable output keeps a sentence unsupported. With a judge, `grounded`, `groundedness` and `unsupported` combine both checks and `judge` reports the verdicts; `citations` and `evaluation` stay lexical. Errors thrown by `judge.generate` are not caught. |
| `params.question?`        | `string`                                                                                                                                                             | The question; needed for relevance                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `params.referenceAnswer?` | `string`                                                                                                                                                             | Ground truth, for context recall (and semantic similarity when an embedder is given)                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `params.sources`          | `any`[]                                                                                                                                                              | Documents the answer was generated from (see normalizeSources for accepted shapes)                                                                                                                                                                                                                                                                                                                                                                                                                                                         |

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
