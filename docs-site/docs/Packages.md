---
sidebar_position: 3
title: Packages
description: Install only what you use. @devilsdev/rag-core, rag-connectors, rag-eval and rag-guardrails are the full package's parts, the same objects.
---

# Packages

`@devilsdev/rag-pipeline-utils` is made of four packages. Install the full package for everything, or only the parts you use:

| Package                     | What it has                                                                                                                                                                       | Installs        |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------- |
| `@devilsdev/rag-core`       | `createRagPipeline`, `MemoryRetriever`, hybrid search, the rerankers, caches, `CostCalculator`, `CostTracker`, `createModelRouter`                                                | ajv, pino       |
| `@devilsdev/rag-connectors` | `OpenAIConnector`, `AnthropicConnector`, `CohereConnector`, `OllamaConnector`, `LocalEmbedder`, `QdrantRetriever`, `PgVectorRetriever`, `WeaviateRetriever`, `createAiSdkAdapter` | rag-core, axios |
| `@devilsdev/rag-eval`       | The evaluation metrics, datasets and reports, `evaluateRagDataset`, `checkAnswer`, `CitationTracker`, hallucination detection                                                     | rag-core        |
| `@devilsdev/rag-guardrails` | `detectInjection`, `GuardrailsPipeline` and the pre-retrieval, retrieval and post-generation guards                                                                               | rag-core        |

Evaluating answers from another framework needs only `rag-eval`, about 6 MB installed. All four together are about 10 MB. The full package, at about 33 MB, adds the document loaders, `.ragrc.json` configuration, the CLI and the rest.

```bash
npm install @devilsdev/rag-eval
```

```js no-run
const { computeFaithfulness, checkAnswer } = require("@devilsdev/rag-eval");
```

```bash
npm install @devilsdev/rag-core @devilsdev/rag-connectors
```

```js no-run
const { createRagPipeline, MemoryRetriever } = require("@devilsdev/rag-core");
const {
  AnthropicConnector,
  LocalEmbedder,
} = require("@devilsdev/rag-connectors");
```

## How they fit together

- **The same objects.** The full package re-exports the four packages, and they share one copy of `rag-core`. `require("@devilsdev/rag-pipeline-utils").CitationTracker` is `require("@devilsdev/rag-eval").CitationTracker`. You can mix imports from the full package and the scoped ones, and `instanceof` works across them.
- **One version.** All five packages release together with the same version number. Keep them on the same version, since each depends on the others at exactly that version.
- **Types.** Each package has TypeScript declarations. `rag-core` carries the shared ones (`PipelineRunResult`, `RetrieverPlugin` and the rest) at `@devilsdev/rag-core/all-types`.
- **The MCP server.** `@devilsdev/rag-mcp-server` (3.4.0) is a command, not a library part: `npx @devilsdev/rag-mcp-server ./docs` serves a folder to MCP clients. It is built on `rag-core`, `rag-connectors` and `rag-eval` and released with the same version, but the full package doesn't include it, so the MCP SDK isn't in its install. See [MCP server](./Integrations.md#mcp-server-for-claude-and-other-mcp-clients).
- **The starters.** `create-rag-pipeline` (3.6.0) is `npm create rag-pipeline`: it writes a starter project (Next.js and the AI SDK, Mastra, or Cloudflare Workers) that depends on the full package at the same version. It's released with the others. See [Starter templates](./Starter-Templates.md).
- **Only in the full package:** the CLI, document loaders, `loadRagConfig` and the plugin registry, `FileVectorStore`, the `/edge`, `/testing` and `/experimental` entries, and the development, enterprise and dashboard tools.
