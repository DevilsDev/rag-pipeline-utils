---
sidebar_position: 23
title: Edge runtimes
description: The /edge entry runs without Node.js APIs, on Vercel Edge Functions, Cloudflare Workers without nodejs_compat, Deno and Netlify Edge Functions.
---

# Edge runtimes

`@devilsdev/rag-pipeline-utils/edge` is the library without Node.js APIs: one ES module that needs only Web APIs (`fetch`, `crypto.getRandomValues`, `TextEncoder`, streams). Use it where Node.js modules don't exist:

- Vercel Edge Functions
- Cloudflare Workers without `nodejs_compat`
- Deno and Netlify Edge Functions

On Node.js, and on Workers with `nodejs_compat` ([Cloudflare Workers](./Deployment-Cloudflare-Workers.md)), use the main entry: it has everything.

CI runs `/edge` in workerd with no Node.js compatibility, which has fewer APIs than Vercel's Edge runtime. It checks the result against the Node.js build: cache keys and Qdrant point ids hash the same in both ([`test/edge`](https://github.com/DevilsDev/rag-pipeline-utils/tree/main/test/edge)).

:::note[Vercel recommends Node.js]

Vercel now recommends its Node.js runtime over Edge for functions, and Next.js 16.3 no longer supports `runtime = 'edge'`. For a Next.js route, use the main entry on the Node.js runtime. `/edge` is for Vercel Edge Functions outside Next.js, and for the other runtimes above.

:::

## Use it

```js no-run
// api/ask.js, a Vercel Edge Function
import {
  AnthropicConnector,
  LocalEmbedder,
  MemoryRetriever,
  createRagPipeline,
} from "@devilsdev/rag-pipeline-utils/edge";

export const config = { runtime: "edge" };

const docs = [
  { id: "vacation", content: "Employees get twenty vacation days per year." },
  { id: "remote", content: "Remote work is allowed two days a week." },
];
const embedder = new LocalEmbedder();
embedder.train(docs);
const retriever = new MemoryRetriever();
await retriever.store(
  await Promise.all(
    docs.map(async (d) => ({ ...d, vector: await embedder.embed(d.content) })),
  ),
);

export default async function handler(request) {
  const query = new URL(request.url).searchParams.get("q");
  const pipeline = createRagPipeline({
    embedder,
    retriever,
    llm: new AnthropicConnector({ apiKey: process.env.ANTHROPIC_API_KEY }),
  });
  const result = await pipeline.run({ query, options: { citations: true } });
  return Response.json({ answer: result.answer, sources: result.results });
}
```

On Workers without `nodejs_compat`, use `env.ANTHROPIC_API_KEY`: there is no `process.env`.

## What's in it

| Area           | Exports                                                                                                                                                    |
| -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Pipeline       | `createRagPipeline` with streaming, `timeout`, `signal`, `cache`, citations, evaluation and `telemetry`; `packContext`                                     |
| Models         | `AnthropicConnector`, `CohereConnector`, `OllamaConnector`, `createAiSdkAdapter` (any AI SDK provider, including OpenAI), `createModelRouter`              |
| Retrieval      | `MemoryRetriever`, `QdrantRetriever`, `LocalEmbedder`, `HybridRetriever`, `BM25Search`, `reciprocalRankFusion`, the rerankers, `MemoryCache`, `RedisCache` |
| Grounding      | `checkAnswer`, `CitationTracker`, `detectHallucinations`, source mapping                                                                                   |
| Guardrails     | `detectInjection`, `GuardrailsPipeline` and its guards                                                                                                     |
| Evaluation     | The scoring functions, `PipelineEvaluator`, `runEvaluation`, `compareConfigurations`, reports                                                              |
| Agentic, costs | `AgenticPipeline` and its parts, `CostCalculator`, `CostTracker`, `TokenBudget`                                                                            |

It has the same types as the main entry. The bundle is about 140 KB compressed.

Left out, because it needs files, a Node.js server or Node-only packages:

- `.ragrc.json` loading, the document loaders and `FileVectorStore`
- `PgVectorRetriever` (it needs `pg`, which uses TCP)
- `OpenAIConnector`: use `createAiSdkAdapter` with `@ai-sdk/openai` instead
- The plugin registry, plugin hub and sandbox, `DevServer`, hot reload and the CLI

## Telemetry

The edge build can't load `@opentelemetry/api` itself, so pass the module in:

```js no-run
import * as api from "@opentelemetry/api";

const pipeline = createRagPipeline({
  embedder,
  retriever,
  llm,
  telemetry: { api },
});
```

The spans are the same as on Node.js ([OpenTelemetry](./Observability.md#opentelemetry)). You need a tracer provider that works in your runtime.

## Differences from Node.js

- **Logging.** The library's logger writes JSON lines with `console` instead of pino.
- **Separate classes.** `/edge` is its own bundle. Don't mix its objects with the main entry's in one process: `instanceof` checks across the two fail.
- **Timing.** On Workers, clocks advance only during I/O ([Timing](./Deployment-Cloudflare-Workers.md#what-doesnt)).
