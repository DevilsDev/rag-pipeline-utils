# Project Roadmap: RAG Pipeline Utils

> Current release: 2.5.0 (2026-10-28)
> Last updated: 2026-10-29

This roadmap tracks what `@devilsdev/rag-pipeline-utils` has shipped and what comes next. The scope and order of the 3.0 work are explained in [PROJECT_v3_PLAN.md](PROJECT_v3_PLAN.md); the reasoning behind this version of the roadmap is in [ROADMAP-REVIEW.md](ROADMAP-REVIEW.md).

**Direction:** be the grounding, evaluation and guardrails layer for RAG in Node.js. It should work on its own through `createRagPipeline`, and next to LangChain, the Vercel AI SDK and Mastra.

**Status:** ✅ Done · 🚧 In progress · 🔜 Planned

**Releases:** fixes and features merge to `main` as they are ready and are published together in the next minor (the 2.5.x fixes ship in 2.6.0); a patch release from `main` stays available for anything urgent. The docs site deploys from `main` on every merge, so documentation for an unreleased feature carries a "Coming in 2.6.0" note until the release PR removes it. "Anytime" rows are not tied to a package release.

<!--
This file is read by scripts/create-roadmap-issues.js,
scripts/close-done-roadmap-issues.js and scripts/label-roadmap-issues.js.
Keep every tracked item in the single table below, with the columns
Release, Area, Feature, Description, Status, Tags (the scripts use the
third column as the issue title, the fourth as its body and the fifth as
the status). Do not add other tables or lines starting with a pipe,
and do not use "|" inside a cell. Renaming a Feature changes its issue title.
-->

## Roadmap

| Release     | Area          | Feature                                         | Description                                                                                                                     | Status         | Tags               |
| ----------- | ------------- | ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- | -------------- | ------------------ |
| v2.0.0      | CI            | Automated test coverage with Jest               | Jest suite with coverage thresholds enforced in CI                                                                              | ✅ Done        | test, ci           |
| v2.0.0      | CI            | Codecov upload in CI                            | Coverage uploaded to Codecov from ci.yml                                                                                        | ✅ Done        | ci                 |
| v2.0.0      | CI            | GitHub Actions CI: lint, test, release          | ci.yml (Test & Lint on Node 18, 20, 22) and release.yml                                                                         | ✅ Done        | ci                 |
| v2.0.0      | Docs          | GitHub Pages deploy for Docusaurus              | docs-site built and deployed to GitHub Pages                                                                                    | ✅ Done        | docs, deploy       |
| v2.1.0      | Tooling       | Roadmap to GitHub Issues sync                   | npm run roadmap:\* scripts create, label and close issues from this file (run by hand)                                          | ✅ Done        | ci, roadmap        |
| v2.1.0      | Tooling       | Label sync from roadmap                         | npm run labels:sync creates the roadmap labels                                                                                  | ✅ Done        | ci, labels         |
| v2.1.1      | Tooling       | Release notes and blog post generation          | npm run release:tag generates release notes and a blog post from a tag (run by hand)                                            | ✅ Done        | cli, release, blog |
| v2.1.0      | Docs          | Performance tuning and SSR check                | docs-site build validation (validate-build.js, test-build.js)                                                                   | ✅ Done        | perf, ssr          |
| v2.1.1      | Docs          | Blog subscribe and RSS                          | Docusaurus blog with RSS and Atom feeds                                                                                         | ✅ Done        | blog               |
| v2.1.1      | Docs          | SEO and Open Graph cards                        | Social card and page metadata on the docs site                                                                                  | ✅ Done        | seo, meta          |
| v2.4.5      | Release       | OIDC trusted publishing with provenance         | release.yml publishes to npm without a long-lived token and attaches provenance                                                 | ✅ Done        | release, security  |
| v2.5.0      | CLI           | Interactive onboarding via CLI                  | rag-pipeline init wizard with local, openai, anthropic and ollama templates                                                     | ✅ Done        | devx, onboarding   |
| v2.5.0      | CLI           | Plugin support via CLI                          | hub install (path, .tgz, npm, registry) with checksum and security scan; hub certify                                            | ✅ Done        | cli, plugin        |
| v2.5.0      | CLI           | Working ingest, query, serve and doctor         | Persistent local index with FileVectorStore; local HTTP API; real diagnostics                                                   | ✅ Done        | cli                |
| v2.5.0      | Docs          | Real-world RAG examples and use cases           | Three runnable examples with offline modes; use cases in the README                                                             | ✅ Done        | docs, showcase     |
| v2.5.0      | Community     | GitHub Discussions                              | Discussions enabled on the repository                                                                                           | ✅ Done        | community          |
| v2.5.0      | Core          | Cancellation and real timeouts                  | AbortSignal passed to every stage; no stage starts after an abort                                                               | ✅ Done        | core               |
| v2.5.0      | Core          | Experimental entry point                        | Simulated modules moved to /experimental with deprecation warnings on the main entry                                            | ✅ Done        | core, semver       |
| v2.5.0      | Docs          | README examples tested in CI                    | Every JavaScript example in the README runs in the test suite                                                                   | ✅ Done        | docs, test         |
| v2.0.0      | Community     | Contributor guide                               | docs/CONTRIBUTING.md (GitHub shows it from docs/)                                                                               | ✅ Done        | community, docs    |
| Anytime     | Community     | Issue templates                                 | Bug, feature and plugin submission templates and good-first-issue labels                                                        | 🔜             | community          |
| Anytime     | Community     | Launch post and listings                        | Publish the drafted dev.to post; submit to awesome-RAG, awesome-LLM and MCP server directories                                  | 🔜             | community          |
| v2.6.0      | Core          | Fix ExecutionTracer JSON export                 | exportTraces('json') throws on circular structures when captureOutputs is true                                                  | ✅ Done        | bug                |
| v2.6.0      | Core          | Fix ParallelEmbedder with single-text embedders | ParallelEmbedder calls embed(array) but built-in connectors embed one string                                                    | ✅ Done        | bug                |
| v2.5.x      | Docs site     | Docs site deploy fix                            | Only docs-build.yml deploys Pages; post-deploy check that the homepage and a docs page return 200                               | ✅ Done        | docs, ci           |
| v2.5.x      | Docs site     | Accurate docs homepage                          | Working quick start, current stats and connector count, tagline from package.json, sidebar without 3.0 package names            | ✅ Done        | docs               |
| v2.5.x      | Docs site     | Docusaurus upgrade and cleanup                  | Docusaurus 3.10, retire the 2.3.1 snapshot from the version menu, remove unused components                                      | ✅ Done        | docs               |
| v2.5.x      | Docs site     | Docs site redesign                              | Banner-based theme for light and dark, new hero with pipeline diagram and CLI demo, CodeBlock everywhere, new navbar            | ✅ Done        | docs, design       |
| v2.5.x      | Docs site     | Docs search                                     | Ctrl/Cmd K local search now, Algolia DocSearch later                                                                            | ✅ Done        | docs, devx         |
| v2.5.x      | Docs site     | Config builder on the docs site                 | Interactive .ragrc.json builder validated against the schema in the browser                                                     | ✅ Done        | docs, devx         |
| v2.6.0      | Docs site     | Generated API reference                         | TypeDoc pages from the generated type declarations                                                                              | 🔜             | docs               |
| v2.5.x      | Docs site     | llms.txt for AI assistants                      | /llms.txt and /llms-full.txt generated from the docs                                                                            | ✅ Done        | docs, devx         |
| v2.5.x      | Docs site     | Mermaid diagrams and changelog page             | Diagrams as code that work in dark mode; CHANGELOG rendered on the site                                                         | ✅ Done        | docs               |
| v2.5.x      | Docs site     | Docs examples tested in CI                      | Run docs-site JavaScript blocks like the README examples; Lighthouse and link checks                                            | ✅ Done        | docs, test         |
| v2.6.0      | Core          | Intelligent caching                             | Opt-in embedding, retrieval and generation caches with MemoryCache, RedisCache and a CacheBackend contract                      | ✅ Done        | core, perf         |
| v2.6.0      | Integration   | Vercel AI SDK adapter                           | Use AI SDK embedding and language models as embedder and llm                                                                    | ✅ Done        | integration        |
| v2.6.0      | Integration   | Grounding on any framework's output             | Documented and tested use of citations, evaluation and guardrails on answers from LangChain, Mastra or the AI SDK               | ✅ Done        | integration, eval  |
| v2.6.0      | Connectors    | OpenAI-compatible baseURL                       | baseURL option on OpenAIConnector for Hugging Face, Groq, Together, vLLM and LM Studio                                          | ✅ Done        | connectors         |
| v2.6.0      | Testing       | Testing entry point                             | /testing export with a deterministic offline connector and fixtures                                                             | ✅ Done        | test, devx         |
| v2.6.0      | Eval          | Semantic similarity metric                      | calculateSemanticSimilarity scores an answer against a reference with any embedder                                              | ✅ Done        | eval               |
| v2.6.0      | Plugins       | validatePlugin export                           | Export the existing plugin contract validator for use in plugin tests                                                           | ✅ Done        | plugin             |
| v2.6.0      | CLI           | Query trace, explain, stats and streaming       | query --trace, --explain, --stats, --streaming and --timeout; global --quiet                                                    | ✅ Done        | cli                |
| v2.6.0      | Docs          | Run examples in the browser                     | StackBlitz links and .stackblitzrc offline start commands for the three examples; needs a manual check that each boots          | 🚧 In progress | docs, devx         |
| v2.6.0      | Packaging     | Lazy-load optional dependencies                 | Importing the package loads 9 packages instead of 54 (about 4x faster); axios, jsonwebtoken, ajv and chokidar load on first use | ✅ Done        | perf, packaging    |
| v2.7.0      | Eval          | rag-eval GitHub Action                          | Fails a pull request when groundedness, faithfulness or citation coverage drops; posts a summary                                | 🔜             | eval, ci           |
| v2.7.0      | Eval          | Dataset validation and comparison               | validateDataset and compareConfigurations for test sets and A/B pipeline runs                                                   | 🔜             | eval               |
| v2.7.0      | Eval          | Synthetic test set generation                   | generateSyntheticDataset writes question and answer pairs with source IDs from a corpus                                         | 🔜             | eval               |
| v2.7.0      | CLI           | rag-pipeline eval command                       | Run a test set from the CLI with an HTML report                                                                                 | 🔜             | cli, eval          |
| v2.7.0      | Connectors    | pgvector and Qdrant retrievers                  | First-party vector-store connectors following the retriever contract; Pinecone next                                             | 🔜             | connectors         |
| v2.7.0      | Docs          | Public benchmark                                | Reproducible hallucination-detection, citation-accuracy and cache-latency results                                               | 🔜             | docs, perf         |
| v3.0.0      | Packaging     | Scoped packages                                 | Split into rag-core, rag-connectors, rag-eval and rag-guardrails; this package becomes a meta-package                           | 🔜             | packaging, semver  |
| v3.0.0      | Core          | Remove experimental classes from main entry     | The 15 deprecated classes stay available under /experimental only                                                               | 🔜             | core, semver       |
| v3.0.0      | Platform      | Require Node.js 20                              | Drop Node 18 (end of life April 2025) from engines and CI                                                                       | 🔜             | platform, semver   |
| v3.0.0      | Connectors    | OpenAI SDK major upgrade                        | Move the openai dependency to its next major version                                                                            | 🔜             | connectors, semver |
| v3.0.0      | Packaging     | Smaller install                                 | Provider SDKs become optional peer dependencies; CLI dependencies move to a separate package                                    | 🔜             | packaging, semver  |
| v3.0.0      | Docs          | Migration guide for 3.0                         | Covers keeping the meta-package and switching to direct sub-package imports                                                     | 🔜             | docs, semver       |
| v3.x        | Observability | OpenTelemetry exporter                          | Export ExecutionTracer spans to OpenTelemetry as an optional peer dependency                                                    | 🔜             | observability      |
| v3.x        | Core          | Context packing to a token budget               | Fit retrieved passages into a token budget using TokenBudget                                                                    | 🔜             | core               |
| v3.x        | Plugins       | Plugin contract test kit                        | runContractTests(plugin) for Jest or Vitest                                                                                     | 🔜             | plugin, test       |
| v3.x        | Core          | Streaming-first API                             | Time to first token as a primary metric                                                                                         | 🔜             | core               |
| v3.x        | Platform      | Edge runtime support                            | Cloudflare Workers and Vercel Edge after a dependency audit                                                                     | 🔜             | platform           |
| v3.x        | Examples      | MCP server template                             | Standalone MCP server exposing a pipeline in examples/                                                                          | 🔜             | examples           |
| v3.x        | Core          | Cost-aware routing                              | Pick the cheapest suitable LLM per query class                                                                                  | 🔜             | core               |
| Unscheduled | Docs          | Automated release blog post                     | A workflow that runs the release:tag blog generation when a release is published                                                | 🔜             | blog, release      |
| Unscheduled | Infra         | Prebuilt Docker image                           | Publish the image from CI, only if the server use case warrants it                                                              | 🔜             | infra, deploy      |
| Unscheduled | Docs          | i18n for the docs site                          | Translations and a language toggle, if there is demand                                                                          | 🔜             | i18n               |
| Unscheduled | Docs          | Comments on blog posts                          | Comment system for the docs blog, if there is demand                                                                            | 🔜             | blog, community    |
| Unscheduled | DevX          | VS Code snippets and workspace                  | Snippets for pipelines and plugins                                                                                              | 🔜             | devx               |
| Unscheduled | Infra         | Release notification webhook                    | Post releases to Slack or Discord                                                                                               | 🔜             | infra, notify      |

## Considered, not planned

These are listed here instead of the table so the issue scripts do not open issues for them.

- **Hydra.js integration for dynamic config.** It was marked in progress for v2.2.0 but never started. `.ragrc.json`, `loadRagConfig` and `validate` cover configuration.
- **Graph-based pipeline UI.** It was targeted at v2.5.0 and never started. A web UI is an anti-goal in the v3 plan.
- **CHANGELOG auto-generation.** semantic-release was removed in 2.5.0. The changelog is written by hand and releases go through `release.yml`.
- **Previously marked done, but no implementation found:** "Status badge: Release Review Passed" (no badge in the README and no workflow for it) and "Kanban sync for roadmap issues" (no workflow or script). They are dropped from tracking; re-add either as a new row if it is still wanted.
- **Anti-goals from the v3 plan:** web UI, hosted SaaS, built-in hosted vector store, Python port, general-purpose agent framework, native binaries, Rust bindings, Kubernetes operator.

## How this file is used

- `npm run roadmap:sync`, `npm run roadmap:close` and `npm run labels:sync` read this file. They run by hand; no workflow runs them.
  - `scripts/create-roadmap-issues.js` and `scripts/roadmap-sync.js` open an issue for each row not marked ✅.
  - `scripts/close-done-roadmap-issues.js` closes the issue for each ✅ row.
  - `scripts/label-roadmap-issues.js` labels matching issues.
  - `scripts/ensure-roadmap-labels.js` creates the labels.
- The full plan for 3.0 is in [PROJECT_v3_PLAN.md](PROJECT_v3_PLAN.md).
