---
mdx:
  format: md
---

# Function: generateSyntheticDataset()

```ts
function generateSyntheticDataset(
  documents,
  options?,
): Promise<{
  cases: object[];
  skipped: object[];
}>;
```

Generates question and answer pairs from documents with an LLM.

Each document gets its own request, with that document as the only
context, so every case knows its source. Generated answers are checked
against the document with computeFaithfulness, and pairs whose answer the
document doesn't support, malformed pairs and repeated questions are
dropped and listed in `skipped`.

## Parameters

| Parameter                  | Type                                                                                                                                                                                                                                                                                   | Description                                                                |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| `documents`                | ( \| `string` \| \{ `content`: `string`; `id?`: `string`; `metadata?`: `any`; \})[]                                                                                                                                                                                                    | The corpus, e.g. the chunks you index                                      |
| `options?`                 | \{ `concurrency?`: `number`; `count?`: `number`; `generateOptions?`: `any`; `llm`: \{ `generate`: `Function`; \}; `minFaithfulness?`: `number`; `minLength?`: `number`; `onCase?`: (`testCase`) => `void`; `perDocument?`: `number`; `prompt?`: `string`; `signal?`: `AbortSignal`; \} | -                                                                          |
| `options.concurrency?`     | `number`                                                                                                                                                                                                                                                                               | Documents processed at the same time                                       |
| `options.count?`           | `number`                                                                                                                                                                                                                                                                               | Cases to generate at most                                                  |
| `options.generateOptions?` | `any`                                                                                                                                                                                                                                                                                  | Extra options for every `llm.generate()` call, e.g. `{ temperature: 0.7 }` |
| `options.llm`              | \{ `generate`: `Function`; \}                                                                                                                                                                                                                                                          | Any llm stage: `generate(query, docs, options)` returning a string         |
| `options.llm.generate`     | `Function`                                                                                                                                                                                                                                                                             | -                                                                          |
| `options.minFaithfulness?` | `number`                                                                                                                                                                                                                                                                               | Share of an answer's sentences the document must support                   |
| `options.minLength?`       | `number`                                                                                                                                                                                                                                                                               | Documents shorter than this many characters are skipped                    |
| `options.onCase?`          | (`testCase`) => `void`                                                                                                                                                                                                                                                                 | Called for each case kept                                                  |
| `options.perDocument?`     | `number`                                                                                                                                                                                                                                                                               | Questions to ask per document                                              |
| `options.prompt?`          | `string`                                                                                                                                                                                                                                                                               | Replaces the instruction; `{count}` is replaced by perDocument             |
| `options.signal?`          | `AbortSignal`                                                                                                                                                                                                                                                                          | -                                                                          |

## Returns

`Promise`\<\{
`cases`: `object`[];
`skipped`: `object`[];
\}\>

A dataset (`{ cases }`) plus what was dropped and why
