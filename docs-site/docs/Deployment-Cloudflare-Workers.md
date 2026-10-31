---
sidebar_position: 22
title: Cloudflare Workers
description: Run createRagPipeline on Cloudflare Workers with the nodejs_compat flag, what works there, and what does not.
---

# Cloudflare Workers

:::info[Coming in 3.2.0]

Workers support needs 3.2.0: earlier versions load, but Claude and Ollama streaming, `QdrantRetriever` and the optional `openai` and `@opentelemetry/api` packages fail there.

:::

`createRagPipeline` runs on [Cloudflare Workers](https://developers.cloudflare.com/workers/) with the `nodejs_compat` compatibility flag. Every change to the library is checked in workerd, the Workers runtime: CI bundles a probe Worker and the [Cloudflare Worker example](https://github.com/DevilsDev/rag-pipeline-utils/tree/main/examples/cloudflare-worker) with Wrangler and runs them ([`test/edge`](https://github.com/DevilsDev/rag-pipeline-utils/tree/main/test/edge)).

## Set up

```bash
npm install @devilsdev/rag-pipeline-utils
npm install --save-dev wrangler
```

`wrangler.toml`:

```toml
name = "rag-worker"
main = "src/worker.js"
compatibility_date = "2025-09-01"
compatibility_flags = ["nodejs_compat"]
```

The library uses Node.js APIs such as `events`, `crypto`, `buffer` and `stream`, which Workers provide under `nodejs_compat`. Without the flag, Wrangler fails to bundle it.

```js no-run
import {
  AnthropicConnector,
  createRagPipeline,
} from "@devilsdev/rag-pipeline-utils";

export default {
  async fetch(request, env) {
    // An index built once per isolate from bundled documents; see the example.
    const { embedder, retriever } = await getIndex();
    const pipeline = createRagPipeline({
      embedder,
      retriever,
      llm: new AnthropicConnector({ apiKey: env.ANTHROPIC_API_KEY }),
    });
    const query = new URL(request.url).searchParams.get("q");
    const result = await pipeline.run({ query, options: { citations: true } });
    return Response.json(result);
  },
};
```

Pass API keys from the Worker's `env` (set them with `wrangler secret put ANTHROPIC_API_KEY`) rather than relying on `process.env`.

The [example](https://github.com/DevilsDev/rag-pipeline-utils/tree/main/examples/cloudflare-worker) is a complete Worker: it indexes bundled documents in memory on the first request and answers `GET /ask?q=...` as JSON, or as server-sent events with `&stream=1`.

## What works

These run in workerd in CI:

| Feature                                                                                  | Notes                                                                 |
| ---------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| `createRagPipeline`: retrieval, reranking, generation, streaming, `timeout` and `signal` |                                                                       |
| Citations and evaluation (`citations`, `evaluate`)                                       |                                                                       |
| `maxContextTokens` and `packContext`                                                     |                                                                       |
| `cache: true`                                                                            | The in-memory cache lasts as long as the isolate, not across isolates |
| `MemoryRetriever`, `LocalEmbedder`                                                       | Index documents bundled with the Worker, or loaded at startup         |
| `QdrantRetriever`                                                                        | Uses `fetch`                                                          |
| `AnthropicConnector`, `OllamaConnector`                                                  | Including streaming                                                   |
| `OpenAIConnector`                                                                        | Add `openai` to the Worker's dependencies, as on Node.js              |
| `telemetry`                                                                              | Add `@opentelemetry/api` and a tracer provider that works in Workers  |
| Guardrails (`detectInjection`, `GuardrailsPipeline`), `ChunkingEngine`                   |                                                                       |

## What doesn't

- **Files.** Workers have no persistent disk: `FileVectorStore` can only use the runtime's temporary in-memory file system, which does not outlive the request. Use `MemoryRetriever` with bundled data, or a database: `QdrantRetriever` over HTTP. `PgVectorRetriever` needs the `pg` package and a TCP connection to PostgreSQL; the CI check doesn't cover it.
- **The CLI, `DevServer`, hot reload and the plugin sandbox** (`isolated-vm` is a native module) are for Node.js only.
- **Timing.** Workers advance their clocks only when the Worker does I/O, so `timing.firstTokenMs` and `totalMs` reflect network waits, not CPU time. Run [`ai benchmark`](./CLI.md#ai-benchmark) on Node.js for CPU-bound timings.

The bundle is about 1.5 MB compressed.

## Vercel and other edge runtimes

Vercel's Edge runtime, and Workers without `nodejs_compat`, provide only a subset of Node.js APIs, and the library loads Node.js modules (`fs`, `path`, `crypto`, `stream`) when it is imported, so it does not run there. On Vercel, use the Node.js runtime for the function that calls the pipeline.
