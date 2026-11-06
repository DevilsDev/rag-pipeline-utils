---
id: Integrations
title: Use with other frameworks
sidebar_label: Other frameworks
description: Ground any Vercel AI SDK model with middleware, use AI SDK models as an embedder and LLM, and check answers from LangChain, LlamaIndex, Mastra or your own code for citations and groundedness.
---

# Use with other frameworks

You don't have to switch frameworks to use this library. These pieces work with what you already have:

- **`groundingMiddleware`** adds retrieval, answer checks and guardrails to any Vercel AI SDK model.
- **`createMastraScorer`** and **`createMastraGuardrails`** bring the metrics and guardrails to Mastra agents.
- **`checkAnswer`** checks an answer from any framework against its sources: per-sentence citations, groundedness, unsupported sentences and evaluation scores.
- **`verifyCitations`** checks the citations Claude or OpenAI file search returned: whether each cited passage supports its claim (3.5.0; see [Verify the citations a model returns](./Evaluation.md#verify-the-citations-a-model-returns)).
- **`createAiSdkAdapter`** turns Vercel AI SDK models into an embedder and an LLM for `createRagPipeline()`.
- **`@devilsdev/rag-mcp-server`** (3.4.0) serves a folder of documents to Claude and other MCP clients, with search and answer checks.

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

Already calling `generateText` or `streamText`? `groundingMiddleware` adds retrieval and grounding to any AI SDK model without changing the rest of your code. Wrap the model with the AI SDK's `wrapLanguageModel`:

```javascript no-run
import { generateText, wrapLanguageModel } from "ai";
import { openai } from "@ai-sdk/openai"; // or anthropic("claude-haiku-4-5") from "@ai-sdk/anthropic"
import {
  groundingMiddleware,
  LocalEmbedder,
  MemoryRetriever,
} from "@devilsdev/rag-pipeline-utils";

// Any retriever and embedder; here an in-memory index of your documents
const embedder = new LocalEmbedder();
embedder.train(docs.map((d) => d.content));
const retriever = new MemoryRetriever();
await retriever.store(
  docs.map((d) => ({ ...d, vector: embedder.embed(d.content) })),
);

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

| Option           | What it does                                                                                                                                                                                      |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `preRetrieval`   | Prompt-injection detection on the query; from 3.5.0 also your own [`detectors`](./Concepts-Guardrails#plug-in-your-own-detectors)                                                                 |
| `retrieval`      | `enforceACL` with `context.userPermissions`, `minRelevanceScore`, `detectInjection` in retrieved documents: before the model sees them                                                            |
| `postGeneration` | PII redaction of the answer and the report, from 3.5.0 including what your PII `detectors` find. Redaction needs the whole answer, so streamed text is held back and sent when the model finishes |

Without `strict`, findings are reported in `providerMetadata.ragPipeline.guardrails` and the call continues (with the query sanitised, documents filtered and PII redacted). With `strict: true`, a flagged query or answer throws `GroundingBlockedError` (`code: "GROUNDING_BLOCKED"`, with the report), and a flagged query never reaches the model.

### Judge paraphrases

The answer check compares words, numbers and negation, so a correct paraphrase is reported unsupported. Pass `judge`, any LLM with `generate()`, and it rules on the sentences that failed for lack of word overlap, the same as [`checkAnswer({ judge })`](./Evaluation#paraphrases-the-optional-llm-judge): it never overturns a wrong number or a negation, and one call per answer at most.

```javascript no-run
import { generateText, wrapLanguageModel } from "ai";
import { openai } from "@ai-sdk/openai";
import {
  createAiSdkAdapter,
  groundingMiddleware,
} from "@devilsdev/rag-pipeline-utils";

const base = openai("gpt-4o-mini");
const { llm: judge } = createAiSdkAdapter({
  ai: { generateText },
  languageModel: base,
});

const model = wrapLanguageModel({
  model: base,
  middleware: groundingMiddleware({ retriever, embedder, judge }),
});

const { providerMetadata } = await generateText({
  model,
  prompt: "How many vacation days do I get?",
});
providerMetadata.ragPipeline.judge.verdicts; // [{ sentence, verdict, sourceId, reason, lexicalReason, decidedBy }]
```

Give the judge the base model, not the wrapped one: a judge on the wrapped model would retrieve and check its own verdicts. If the judge throws (a rate limit, a network error), the call still returns the answer: its sentences stay unsupported and `ragPipeline.judge.error` says why. With `postGeneration`, PII is redacted from the verdicts too.

The middleware is a plain object and the package doesn't import the AI SDK, so it works from ESM or CommonJS. It is tested against AI SDK 6 and 7; AI SDK 5 uses the same call shapes but isn't tested. For TypeScript, set `specificationVersion` to your version's middleware version (`"v2"` for 5, `"v3"` for 6, the default, `"v4"` for 7).

## Mastra

### Scorers

`createMastraScorer` turns this library's metrics into Mastra scorers. They make no model calls, so they cost nothing and score the same way every run: run them on every response, or as a cheap first pass next to Mastra's LLM-judge scorers. Pass `createScorer` from Mastra; Mastra is not a dependency of this package.

```javascript no-run
import { Agent } from "@mastra/core/agent";
import { createScorer } from "@mastra/core/evals";
import { createMastraScorer } from "@devilsdev/rag-pipeline-utils";

const groundedness = createMastraScorer({
  createScorer,
  metric: "groundedness",
});

const agent = new Agent({
  id: "handbook",
  name: "Handbook assistant",
  instructions: "Answer from the handbook search tool.",
  model,
  tools: { vectorQueryTool },
  scorers: {
    groundedness: {
      scorer: groundedness,
      sampling: { type: "ratio", rate: 1 },
    },
  },
});
```

| `metric`                 | Score                                                                                                                                             |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `groundedness` (default) | Share of answer sentences supported by the context: words, numbers and negation, as in `checkAnswer`. The reason quotes the unsupported sentences |
| `faithfulness`           | Share of answer sentences whose content words appear in the context (`computeFaithfulness`)                                                       |
| `contextPrecision`       | Share of passages relevant to the question                                                                                                        |
| `contextRecall`          | Share of the reference answer supported by the context. Needs `groundTruth`, for example from `runEvals`                                          |

The context is, by default, what the agent's tool calls returned: an array of passages, or an object with `relevantContext`, `results`, `sources` or `documents`, as Mastra's vector query tool returns. Pass `context` (fixed passages) or `getContext(run)` to score against something else. Passages can be strings, `{ id, content }`, LangChain `Document`s or LlamaIndex nodes. A run with no context scores 0, with a reason saying so.

### Guardrails processor

`createMastraGuardrails` is a Mastra processor with this library's guardrails: prompt-injection detection on the user's message, and PII redaction of the answer. A flagged message calls Mastra's `abort()`, so the run stops with a tripwire (`result.tripwire`), the same way Mastra's own processors stop it.

```javascript no-run
import { createMastraGuardrails } from "@devilsdev/rag-pipeline-utils";

const guardrails = createMastraGuardrails({ injection: true, pii: "redact" });

const agent = new Agent({
  // ...
  inputProcessors: [guardrails],
  outputProcessors: [guardrails],
});
```

| Option         | Default    | What it does                                                                                                                                  |
| -------------- | ---------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `injection`    | `true`     | Check the last user message; `false` to skip, or `PreRetrievalGuard` options                                                                  |
| `pii`          | `"redact"` | Replace emails, US phone numbers, US SSNs and card numbers in the answer with `[REDACTED]`; `"block"` aborts the run instead; `false` to skip |
| `piiPatterns`  |            | Extra patterns by name, such as `{ employeeId: /EMP-\d{5}/g }`                                                                                |
| `piiDetectors` |            | (from 3.5.0) PII [detectors](./Concepts-Guardrails#plug-in-your-own-detectors) to run on the answer too; their matches are redacted           |
| `piiBuiltIn`   | `true`     | (from 3.5.0) `false` uses only `piiDetectors`, not the built-in patterns                                                                      |

Both checks are pattern-based by default, unlike Mastra's `PromptInjectionDetector` and `PIIDetector`, which call a model: they are free and fast, and catch less. Use whichever fits, or both. From 3.5.0, `injection: { detectors }` and `piiDetectors` add a model or service of your own; with any detector configured, the processor's hooks return promises, which Mastra awaits.

Tested against `@mastra/core` 1.81.

## MCP server for Claude and other MCP clients

`@devilsdev/rag-mcp-server` gives Claude, Cursor or any other [MCP](https://modelcontextprotocol.io) client a folder of your documents to search, and a way to check answers against them. It indexes the folder when it starts, with the offline TF-IDF embedder and an in-memory retriever, so it needs no API key, database or network:

```bash
npx @devilsdev/rag-mcp-server ./docs
```

The client starts the server over stdio. In Claude Code:

```bash
claude mcp add docs -- npx -y @devilsdev/rag-mcp-server /absolute/path/to/docs
```

In Claude Desktop, and other clients with an `mcpServers` config:

```json
{
  "mcpServers": {
    "docs": {
      "command": "npx",
      "args": ["-y", "@devilsdev/rag-mcp-server", "/absolute/path/to/docs"]
    }
  }
}
```

It serves two read-only tools:

| Tool               | Input                                   | Returns                                                                                                                           |
| ------------------ | --------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `search_documents` | `query`, `topK` (1–20, default 4)       | `{ passages: [{ id, source, score, text }] }`, best first                                                                         |
| `check_answer`     | `answer`, `question`, `sources`, `topK` | `checkAnswer` on the answer: `grounded`, `groundedness`, `unsupported` sentences, `citations` per sentence, the `sources` checked |

`check_answer` checks against the `sources` you pass, as strings or `{ id, text }`; without them, it retrieves passages for the question and answer from the index. Passage text comes from your files, and the tool descriptions tell the client to treat it as data, not instructions.

The server reads Markdown, HTML, CSV and text files, the types the CLI's `ingest` reads, and skips the rest. Options: `--top-k <n>` sets the default passage count and `--embedder local` is the only embedder. For another embedder, a persistent index or a vector database, build your own server from the [MCP server example](https://github.com/DevilsDev/rag-pipeline-utils/tree/main/examples/mcp-server).

## Other frameworks

Most other frameworks give you an answer string and the retrieved chunks. Pass them to `checkAnswer` as above, as strings or as `{ id, content }` objects.
