---
id: Integrations
title: Use with other frameworks
sidebar_label: Other frameworks
description: Use the Vercel AI SDK as an embedder and LLM, and check answers from LangChain, LlamaIndex, Mastra or your own code for citations and groundedness.
---

# Use with other frameworks

You don't have to switch frameworks to use this library. Two pieces work with what you already have:

- **`checkAnswer`** checks an answer from any framework against its sources: per-sentence citations, groundedness, unsupported sentences and evaluation scores.
- **`createAiSdkAdapter`** turns Vercel AI SDK models into an embedder and an LLM for `createRagPipeline()`.

## Check an answer from any framework

`checkAnswer({ question, answer, sources })` takes the answer your chain produced and the documents it was given. The sources can be in the shape your framework returns:

| Framework              | Source shape                              |
| ---------------------- | ----------------------------------------- |
| LangChain              | `Document`: `{ pageContent, metadata }`   |
| LlamaIndex             | node `{ text }`, or `{ node, score }`     |
| AI SDK, Mastra, others | strings, or `{ id, content }`             |
| This library           | retrieved results, `{ id, content, ... }` |

```javascript
import { checkAnswer } from "@devilsdev/rag-pipeline-utils";

// What a LangChain retrieval chain returns: an answer and its context
const result = {
  answer: "Full-time employees receive twenty days of paid vacation per year.",
  context: [
    {
      pageContent:
        "Full-time employees receive twenty days of paid vacation per year.",
      metadata: { source: "handbook.md" },
    },
  ],
};

const check = await checkAnswer({
  question: "How many vacation days do I get?",
  answer: result.answer,
  sources: result.context,
});

console.log(check.grounded); // true
console.log(check.groundedness); // 1
console.log(check.citations[0].sources[0].docId); // "handbook.md"
```

When an answer is not supported, `unsupported` lists the sentences no source backs. That includes a sentence whose numbers don't match its source:

```javascript
import { checkAnswer } from "@devilsdev/rag-pipeline-utils";

const sources = [
  "Full-time employees receive twenty days of paid vacation per year.",
];

const check = await checkAnswer({
  answer:
    "Full-time employees receive thirty days of paid vacation per year. The office is in Paris.",
  sources,
  evaluate: false,
});

console.log(check.grounded); // false
console.log(check.unsupported.length); // 2
```

The result:

| Field          | Meaning                                                                                                                           |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `grounded`     | Every sentence is supported by a source                                                                                           |
| `groundedness` | Share of supported sentences, 0 to 1                                                                                              |
| `unsupported`  | Sentences no source supports                                                                                                      |
| `citations`    | Sources supporting each sentence                                                                                                  |
| `evaluation`   | Faithfulness, relevance and context precision (context recall too when you pass a `referenceAnswer`); skip with `evaluate: false` |
| `sources`      | The sources as they were checked, normalized to `{ id, content, metadata }`                                                       |

Typical uses: log a warning or block a response when `grounded` is false, show citations in your UI, or track `groundedness` over time. `normalizeSources(sources)` is exported on its own if you only need the conversion.

## Vercel AI SDK models in a pipeline

`createAiSdkAdapter` wraps an AI SDK embedding model and language model. Pass the AI SDK functions you already import. The AI SDK is not a dependency of this package, so any version from 5 on works, from ESM or CommonJS.

```javascript no-run
import { embed, embedMany, generateText, streamText } from "ai";
import { openai } from "@ai-sdk/openai";
import {
  createAiSdkAdapter,
  createRagPipeline,
  MemoryRetriever,
} from "@devilsdev/rag-pipeline-utils";

const { embedder, llm } = createAiSdkAdapter({
  ai: { embed, embedMany, generateText, streamText },
  embeddingModel: openai.embedding("text-embedding-3-small"),
  languageModel: openai("gpt-4o-mini"),
  settings: { temperature: 0 },
});

const retriever = new MemoryRetriever();
const policy =
  "Full-time employees receive twenty days of paid vacation per year.";
await retriever.store([
  { id: "vacation", content: policy, vector: await embedder.embed(policy) },
]);

const pipeline = createRagPipeline({ embedder, retriever, llm });
const result = await pipeline.run({
  query: "How many vacation days do I get?",
  options: { citations: true },
});
```

How the adapter behaves:

- **Prompt:** retrieved documents go to the model as delimited, untrusted reference data, with the same system prompt the built-in connectors use. It is sent as `instructions` (AI SDK 7) and `system` (AI SDK 5 and 6), so it reaches the model on every version.
- **Embedding:** `embedder.embedBatch(texts)` uses `embedMany` when you pass it.
- **Streaming:** `run({ options: { stream: true } })` streams through `streamText` when you pass it.
- **Cancellation:** the run's `AbortSignal` is passed to every AI SDK call as `abortSignal`.
- **Settings:** `settings` applies to every text call. Per-run `temperature`, `maxOutputTokens` and similar options override it.
- **Providers:** any AI SDK provider works (OpenAI, Anthropic, Google, Mistral, Ollama and others), and so do the AI SDK's test models.

Tested against AI SDK 6 and 7.

## Mastra and other frameworks

Mastra agents and most other frameworks give you an answer string and the retrieved chunks. Pass them to `checkAnswer` as above, as strings or as `{ id, content }` objects.
