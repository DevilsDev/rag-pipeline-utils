---
mdx:
  format: md
---

# Function: groundingMiddleware()

```ts
function groundingMiddleware(options?): any;
```

Create AI SDK language model middleware that retrieves context for each
call and checks the answer against it.

## Parameters

| Parameter  | Type                         | Description |
| ---------- | ---------------------------- | ----------- |
| `options?` | `GroundingMiddlewareOptions` | -           |

## Returns

`any`

An AI SDK LanguageModelMiddleware

## Example

```ts
import { generateText, wrapLanguageModel } from "ai";
import { openai } from "@ai-sdk/openai";
import { groundingMiddleware } from "@devilsdev/rag-pipeline-utils";

const model = wrapLanguageModel({
  model: openai("gpt-4o-mini"),
  middleware: groundingMiddleware({ retriever, embedder }),
});
const { text, sources, providerMetadata } = await generateText({
  model,
  prompt: "How many vacation days do I get?",
});
providerMetadata.ragPipeline.grounded; // true when every sentence is supported
```
