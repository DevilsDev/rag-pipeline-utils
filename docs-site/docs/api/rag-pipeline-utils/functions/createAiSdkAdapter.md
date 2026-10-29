---
mdx:
  format: md
---

# Function: createAiSdkAdapter()

```ts
function createAiSdkAdapter(options?): object;
```

Wrap AI SDK models as an embedder and an llm for createRagPipeline().

## Parameters

| Parameter                 | Type                                                                                                                            | Description                                                                   |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| `options?`                | \{ `ai`: `AiSdkFunctions`; `embeddingModel?`: `any`; `languageModel?`: `any`; `settings?`: `any`; `systemPrompt?`: `string`; \} | -                                                                             |
| `options.ai`              | `AiSdkFunctions`                                                                                                                | Functions imported from 'ai'                                                  |
| `options.embeddingModel?` | `any`                                                                                                                           | AI SDK embedding model                                                        |
| `options.languageModel?`  | `any`                                                                                                                           | AI SDK language model                                                         |
| `options.settings?`       | `any`                                                                                                                           | Defaults for every text call, e.g. `{ temperature: 0, maxOutputTokens: 512 }` |
| `options.systemPrompt?`   | `string`                                                                                                                        | Replaces the built-in RAG system prompt                                       |

## Returns

`object`

### embedder

```ts
embedder: any;
```

### llm

```ts
llm: any;
```

## Example

```ts
import { embed, embedMany, generateText, streamText } from "ai";
import { openai } from "@ai-sdk/openai";
import {
  createAiSdkAdapter,
  createRagPipeline,
} from "@devilsdev/rag-pipeline-utils";

const { embedder, llm } = createAiSdkAdapter({
  ai: { embed, embedMany, generateText, streamText },
  embeddingModel: openai.embedding("text-embedding-3-small"),
  languageModel: openai("gpt-4o-mini"),
});
const pipeline = createRagPipeline({ embedder, retriever, llm });
```
