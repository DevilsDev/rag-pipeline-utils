---
mdx:
  format: md
---

# Function: createMastraScorer()

```ts
function createMastraScorer(options?): any;
```

Create a Mastra scorer from one of this library's metrics.

## Parameters

| Parameter              | Type                                                                                                                                                                                             | Description                                                                                       |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------- |
| `options?`             | \{ `context?`: `any`[]; `createScorer`: `Function`; `getContext?`: `Function`; `id?`: `string`; `metric?`: `"groundedness"` \| `"faithfulness"` \| `"contextPrecision"` \| `"contextRecall"`; \} | -                                                                                                 |
| `options.context?`     | `any`[]                                                                                                                                                                                          | Fixed passages to score against (strings, { id, content }, LangChain Documents, LlamaIndex nodes) |
| `options.createScorer` | `Function`                                                                                                                                                                                       | `createScorer` from "@mastra/core/evals"                                                          |
| `options.getContext?`  | `Function`                                                                                                                                                                                       | `(run) => passages`; defaults to the results of the agent's tool calls                            |
| `options.id?`          | `string`                                                                                                                                                                                         | Scorer id (default `rag-<metric>`)                                                                |
| `options.metric?`      | `"groundedness"` \| `"faithfulness"` \| `"contextPrecision"` \| `"contextRecall"`                                                                                                                | -                                                                                                 |

## Returns

`any`

A Mastra scorer

## Example

```ts
import { createScorer } from "@mastra/core/evals";
import { createMastraScorer } from "@devilsdev/rag-pipeline-utils";

const groundedness = createMastraScorer({ createScorer, metric: "groundedness" });
const agent = new Agent({ ..., scorers: { groundedness: { scorer: groundedness } } });
```
