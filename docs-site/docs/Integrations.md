---
id: Integrations
title: Use with other frameworks
sidebar_label: Other frameworks
description: Ground any Vercel AI SDK model with middleware, use AI SDK models as an embedder and LLM, and check answers from LangChain, LlamaIndex, Mastra or your own code for citations and groundedness.
---

# Use with other frameworks

You don't have to switch frameworks to use this library. These pieces work with what you already have:

- **`groundingMiddleware`** (coming in 3.3.0) adds retrieval, answer checks and guardrails to any Vercel AI SDK model.
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

## Ground an AI SDK app with middleware

:::info[Coming in 3.3.0]
`groundingMiddleware` is in 3.3.0.
:::

Already calling `generateText` or `streamText`? `groundingMiddleware` adds retrieval and grounding to any AI SDK model without changing the rest of your code. Wrap the model with the AI SDK's `wrapLanguageModel`:

```javascript no-run
import { generateText, wrapLanguageModel } from "ai";
import { openai } from "@ai-sdk/openai";
import { groundingMiddleware } from "@devilsdev/rag-pipeline-utils";

const model = wrapLanguageModel({
  model: openai("gpt-4o-mini"),
  middleware: groundingMiddleware({ retriever, embedder, topK: 4 }),
});

const { text, sources, providerMetadata } = await generateText({
  model,
  prompt: "How many vacation days do I get?",
});

sources; // the passages the answer was given, as AI SDK sources
providerMetadata.ragPipeline.grounded; // false if any sentence is unsupported
providerMetadata.ragPipeline.unsupported; // the sentences no passage supports
```

On each call it:

1. **Retrieves** passages for the last user message, through the same pipeline as `createRagPipeline`: your `embedder`, `retriever` and optional `reranker`, `topK`, and a token budget with `maxContextTokens`. Or pass a `pipeline` you already built; its `llm` is not called.
2. **Adds them to that message** as delimited, untrusted reference data, with the system prompt the built-in connectors use.
3. **Checks the answer** with `checkAnswer` and attaches the report as `providerMetadata.ragPipeline`: `grounded`, `groundedness`, `unsupported`, `citations`, the passages' ids and scores, and what each guard found. `onResult(report)` receives it too, for logging or metrics.
4. **Returns the passages as sources**, so `result.sources` lists them (and a UI message stream sends them with `sendSources: true`). `sources: false` turns this off.

`streamText` works the same way: text streams as the model writes it, and the report arrives with the last part (`await result.providerMetadata`).

### Per-request options

Pass them in `providerOptions.ragPipeline`. They are removed before the call reaches the provider.

```javascript no-run
await generateText({
  model,
  messages, // a conversation: retrieval uses the last user message
  providerOptions: {
    ragPipeline: {
      query: "vacation days for contractors", // retrieve for this instead
      topK: 6,
      context: { userPermissions: session.roles }, // for the ACL guard
    },
  },
});
```

### Guardrails

The three guards of [`GuardrailsPipeline`](./Concepts-Guardrails) are options (`true` for their defaults, or their options object):

| Option           | What it does                                                                                                                                 |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `preRetrieval`   | Prompt-injection detection on the query                                                                                                      |
| `retrieval`      | `enforceACL` with `context.userPermissions`, `minRelevanceScore`, `detectInjection` in retrieved documents: before the model sees them       |
| `postGeneration` | PII redaction of the answer and the report. Redaction needs the whole answer, so streamed text is held back and sent when the model finishes |

Without `strict`, findings are reported in `providerMetadata.ragPipeline.guardrails` and the call continues (with the query sanitised, documents filtered and PII redacted). With `strict: true`, a flagged query or answer throws `GroundingBlockedError` (`code: "GROUNDING_BLOCKED"`, with the report), and a flagged query never reaches the model.

The middleware is a plain object and the package doesn't import the AI SDK, so it works from ESM or CommonJS. It is tested against AI SDK 6 and 7; AI SDK 5 uses the same call shapes but isn't tested. For TypeScript, set `specificationVersion` to your version's middleware version (`"v2"` for 5, `"v3"` for 6, the default, `"v4"` for 7).

## Mastra and other frameworks

Mastra agents and most other frameworks give you an answer string and the retrieved chunks. Pass them to `checkAnswer` as above, as strings or as `{ id, content }` objects.
