# Listings and directory submissions

Checked 2026-11-04. Each submission is a pull request (or form) under the maintainer's own account. Make one pull request per list, and read the list's contributing rules again before opening it, since they change.

## Eligible now

### 1. Danielskry/Awesome-RAG (about 1,400 stars, active)

Two sections fit. Use one pull request per entry, or a single PR adding both if the maintainer prefers that; their README has no contributing file.

**Section "🧰 Frameworks that Facilitate RAG"**: add at the end of the list (the list isn't alphabetical):

```markdown
- [rag-pipeline-utils](https://github.com/DevilsDev/rag-pipeline-utils): Node.js RAG library with sentence-level citations, answer evaluation in CI, guardrails, and pgvector/Qdrant stores; runs on Cloudflare Workers.
```

**Section "📊 Metrics & Evaluation → Tools"**: entries there use bold links:

```markdown
- **[rag-eval-action](https://github.com/DevilsDev/rag-eval-action)**: GitHub Action that scores a RAG test set on each pull request, compares it with the main branch and comments the regressions.
```

PR title: `Add rag-pipeline-utils (Node.js) and rag-eval-action`

PR body:

```
Adds a Node.js/TypeScript entry to the frameworks list, which is mostly
Python today, and a CI-focused evaluation tool.

- rag-pipeline-utils: MIT, on npm as @devilsdev/rag-pipeline-utils. Grounding
  (sentence-level citations, numeric checks), evaluation with baselines,
  guardrails, pgvector/Qdrant. Retrieval benchmarked on BEIR SciFact with a
  published method.
- rag-eval-action: GitHub Marketplace action that runs the evaluation on
  pull requests and posts the comparison with main.
```

### 2. tensorchord/Awesome-LLMOps (about 6,000 stars, active)

Rules: one pull request per suggestion, alphabetical order within a category, a star badge in the third column (their `scripts/generate-star-badges.py` makes it).

**Section "LLMOps"** table row, inserted in alphabetical order:

```markdown
| [rag-pipeline-utils](https://github.com/DevilsDev/rag-pipeline-utils) | Node.js RAG library with grounding checks, evaluation that fails CI on regressions, guardrails, cost-aware model routing and OpenTelemetry GenAI spans. | ![GitHub Badge](https://img.shields.io/github/stars/DevilsDev/rag-pipeline-utils.svg?style=flat-square) |
```

PR title: `Add rag-pipeline-utils to LLMOps`

### 3. GitHub repository "About" and topics

Not a listing, but it is what GitHub search and the topic pages show. The current description ("production-ready, modular framework ... with ease") predates 3.x.

Suggested description (under 350 characters):

> Retrieval-augmented generation for Node.js, with answers you can check: sentence-level citations, evaluation that fails CI on regressions, guardrails, pgvector and Qdrant, and Cloudflare Workers support.

Topics (replacing `utils`, `orchestration`, `retrieval-augmented-generation-rag` and `pipeline`), 20, the most GitHub allows:

`rag`, `retrieval-augmented-generation`, `llm`, `ai`, `nodejs`, `javascript`, `typescript`, `llm-evaluation`, `rag-evaluation`, `guardrails`, `citations`, `pgvector`, `qdrant`, `opentelemetry`, `observability`, `cloudflare-workers`, `vector-search`, `cli`, `ai-sdk`, `mastra`

Applied on 2026-11-04 with this command:

```bash
gh repo edit DevilsDev/rag-pipeline-utils \
  --description "Retrieval-augmented generation for Node.js, with answers you can check: sentence-level citations, evaluation that fails CI on regressions, guardrails, pgvector and Qdrant, and Cloudflare Workers support." \
  --homepage "https://devilsdev.github.io/rag-pipeline-utils/" \
  --remove-topic utils --remove-topic orchestration --remove-topic retrieval-augmented-generation-rag \
  --remove-topic pipeline \
  --add-topic retrieval-augmented-generation --add-topic typescript --add-topic llm-evaluation \
  --add-topic rag-evaluation --add-topic guardrails --add-topic citations --add-topic pgvector \
  --add-topic qdrant --add-topic opentelemetry --add-topic cloudflare-workers \
  --add-topic ai-sdk --add-topic mastra
```

## Not eligible yet

- **sindresorhus/awesome-nodejs**: needs a repository more than 30 days old with **at least 100 stars**. The repository has 1 star (2026-11-04). Revisit after the launch posts.
- **Hannibal046/Awesome-LLM** (27k stars): last updated 2025-07-31, so a pull request is unlikely to be reviewed.
- **MCP server directories**: they list servers you can install and run. `examples/mcp-server` is an example in this repository, not a published package, so it doesn't qualify and submitting it would mislead. `@devilsdev/rag-mcp-server` (`packages/rag-mcp-server`, `npx @devilsdev/rag-mcp-server ./docs`) is that installable server: once 3.4.0 publishes it to npm, it is eligible. Submit the package, not the example. What each needs, checked 2026-11-04:
  - **Official MCP registry** (registry.modelcontextprotocol.io): publish a `server.json` with the `mcp-publisher` CLI, with a package entry `registryType: "npm"`, `identifier: "@devilsdev/rag-mcp-server"`, the version and `transport: { type: "stdio" }`. The registry verifies npm packages by the `mcpName` field in the published package.json, which must equal the server name; the package has `"mcpName": "io.github.DevilsDev/rag-mcp-server"`. An `io.github.<org>/*` name needs an org owner to authenticate, and the registry docs say the interactive GitHub login can't prove an org role today: publish from GitHub Actions (OIDC) instead. Names in the registry keep the GitHub login's casing (for example `io.github.0Mattias/...`), so `DevilsDev` is right.
  - **mcp.so**: a pull request (or issue) to `chatmcp/mcpso` adding one Markdown line, the repository link and a one-sentence description, per a third-party write-up: to check.
  - **Glama**: indexes GitHub repositories; to be listed as runnable it builds the server from a Dockerfile whose command starts the stdio server, per the same write-up. There is no Dockerfile for the MCP server yet: to check.
  - **Smithery**: a form at smithery.ai/new. It has moved towards hosted servers reached over HTTPS, and whether it still lists stdio-only npm packages: to check.
  - **PulseMCP**: a submission form on pulsemcp.com; it also picks up servers from the official registry. To check.

## Order

1. Merge the issue templates (PR #164) and update the About text, so visitors from the posts land on a tidy repo.
2. Publish the dev.to post (`devto-post.md`).
3. Show HN (`hn-show-hn.md`), Tuesday to Thursday, 08:00–10:00 Pacific.
4. Reddit posts (`reddit-posts.md`), spread over the following week.
5. The two awesome-list pull requests, any time; they don't depend on the posts.
