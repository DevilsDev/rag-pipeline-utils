# Roadmap review and proposed plan

> **Status, 2026-10-29 (after 2.6.2):** 2.6.0, 2.6.1 and 2.6.2 have shipped section 4's 2.6.0 plan, except the generated API reference, which moved to 2.7.0. 2.6.2 fixed `npm install` on machines without husky, a bug in every release since 2.2.1. For 2.7.0, `validateDataset`, `runEvaluation`, `compareConfigurations` and `rag-pipeline eval` are merged, and the `rag-eval` Action is built and tested in `DevilsDev/rag-eval-action`; its `v1` waits for 2.7.0 on npm. Left for 2.7.0: synthetic datasets, the pgvector and Qdrant connectors, the API reference and, last, the benchmark. `DashboardGenerator` turned out to be an operations dashboard, so the evaluation report has its own renderer (section 7.5 assumed otherwise). Section 9.5 is still open.

_Written 2026-10-29, the day after `@devilsdev/rag-pipeline-utils@2.5.0` was published. Its recommendations are applied in `PROJECT_ROADMAP.md` and `PROJECT_v3_PLAN.md` (2026-10-29); the decisions in section 8 record the defaults that were chosen._

**Contents:** 1. Where things stand · 2. `PROJECT_ROADMAP.md` problems · 3. `PROJECT_v3_PLAN.md` conflicts · 4. Proposed plan · 5. Edits to the two files · 6. Competitive strategy · 7. What was dropped, and what to revive · 8. Decisions needed · 9. Docs site: fixes and redesign

Two roadmap documents exist:

| File                         | Last updated        | What it is                                                  |
| ---------------------------- | ------------------- | ----------------------------------------------------------- |
| `.github/PROJECT_ROADMAP.md` | 2025-04-22 (v2.3.1) | Feature roadmap in tables; the `roadmap:*` scripts parse it |
| `.github/PROJECT_v3_PLAN.md` | 2026-04-19 (v2.4.5) | Scope and order of work for 3.0                             |

Both are out of date, and the v3 plan conflicts with what 2.5.0 shipped.

---

## 1. Where things stand after 2.5.0

What 2.5.0 delivered (see `CHANGELOG.md`, `[2.5.0]`):

- A CLI that does real work: an `init` wizard, `ingest`/`query`/`run` with a persistent `FileVectorStore`, `serve`, `doctor`, `hub install`/`certify`, and real `ai` commands.
- Pipeline correctness: AbortSignal cancellation and real timeouts, `answer: null` when there is no llm, and a final stream chunk that carries citations and evaluation.
- Better grounding: a numeric-consistency check, and context recall now needs a reference answer.
- Hardening: connectors retry only transient errors, plus SSO, plugin-signature, audit-log, JWT and ACL fixes.
- Simulated modules moved to `/experimental`. The main entry still exports them, with deprecation warnings, until 3.0.
- A rewritten README and docs site; every README example runs in a test.

What 2.5.0 did **not** deliver: the caching layer that the v3 plan had assigned to 2.5.0.

---

## 2. `PROJECT_ROADMAP.md`: what is wrong

### Marked upcoming or in progress, but done

| Roadmap item                        | Roadmap says | Actually                                                              |
| ----------------------------------- | ------------ | --------------------------------------------------------------------- |
| Interactive onboarding via CLI      | 🚧 v2.2.0    | Done in 2.5.0 (`rag-pipeline init` wizard)                            |
| Plugin support via CLI              | 🔜 v2.4.0    | Done in 2.5.0 (`hub install`, `hub certify`, `--registry`)            |
| Real-world RAG examples + use cases | 🔜 v2.4.0    | Done in 2.5.0 (3 runnable examples, README use cases)                 |
| GitHub Discussions integration      | 🔜 v2.2.0    | Discussions are enabled on the repository                             |
| Prebuilt Docker image               | 🔜 v2.4.0    | A `Dockerfile` exists, but no workflow publishes an image: still open |

### Marked done, but not confirmed

| Roadmap item                        | Problem                                                                                                                                                                                    |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| CHANGELOG auto-generation           | semantic-release was removed in 2.5.0; the changelog is now written by hand                                                                                                                |
| Contributor guide & issue templates | The guide exists as `docs/CONTRIBUTING.md` (GitHub reads it from `docs/`); there is no `.github/ISSUE_TEMPLATE/`, only a PR template                                                       |
| Blog post sync from changelog       | Only by hand: `npm run release:tag` (`scripts/generate-release-note.js`) writes a blog post from a tag; the `publish-release-blog.yml` workflow named in the test checklist does not exist |

### Stale or contradictory

- **Hydra.js integration** (🚧 v2.2.0): nothing in the code uses it. Either drop it or move it to "Considered, not planned".
- **Graph-based pipeline UI** (🔜 v2.5.0): this contradicts the v3 plan's anti-goal "Web UI for pipeline configuration".
- **i18n, multilingual toggle, blog comments** (🔜 v2.4.0): none of these exist yet (no `i18n` block in `docusaurus.config.js`). They are docs-site work, not library work, so they belong in their own section with no version target.
- **VS Code snippets & workspace** (🔜 v2.4.0): not started.

### Broken file references

The "Files" and "Contributor Stats" sections list files that do not exist:

- `scripts/release-changelog.js`
- `scripts/sync-roadmap-cli.js`
- `scripts/close-roadmap-done.js` (the real file is `scripts/close-done-roadmap-issues.js`)
- `.github/workflows/sync-roadmap.yml` (no workflow runs the sync; it only happens if someone runs `npm run roadmap:*` by hand)

---

## 3. `PROJECT_v3_PLAN.md`: what conflicts

1. **Caching was planned for 2.5.0, and that did not happen.** The plan wanted caching released first and in use for about 4 weeks before 3.0. That soak period has not started.
2. **The plan's 3.0 scope differs from the one agreed while preparing 2.5.0.**

   | In `PROJECT_v3_PLAN.md`                                                                   | Agreed during 2.5.0 work                                            |
   | ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
   | Split into `rag-core`, `rag-connectors`, `rag-eval`, `rag-guardrails` plus a meta-package | Remove deprecated `/experimental` classes from the main entry       |
   | Drop Node 18                                                                              | Drop Node 18                                                        |
   | Publish each sub-package to npm from CI (OIDC)                                            | Upgrade the `openai` SDK to its next major version (needs Node 20+) |
   | Keep the package name                                                                     | (no change)                                                         |

   The two lists do not exclude each other; only "drop Node 18" is in both.

3. **"Built-in vector store" is listed as something the plan won't do**, but 2.5.0 added `FileVectorStore`. It is a local JSON index for the CLI and small projects, not a rival to Pinecone or pgvector. The plan should say that, so the anti-goal stays credible.
4. **Its numbers are stale.** It says "2,050+ tests"; there are 2,381 now. The bundle-size baseline needs re-measuring: the tarball is 672.6 kB, 2.8 MB unpacked.
5. **Its migration guide name** (`Migration-v2-to-v3.md`) should be checked against the existing `docs-site/docs/Migration.md`, which now has an "Upgrading to v2.5.0" section.

---

## 4. Proposed plan

### 2.5.x: patches (as needed)

Small fixes that need no new API:

- `ExecutionTracer.exportTraces('json')` throws "circular structure" with the default `captureOutputs: true`.
- `ParallelEmbedder` calls `embed(array)`, but the built-in connectors embed one string at a time.
- `js-yaml` is used by two audit scripts but is not declared as a dependency.
- `sharp` platform packages are missing from the lockfile.
- A Jest worker sometimes reports "failed to exit gracefully".
- `scripts/test-reporter.js` is stale.

Work that ships no code but helps people find and adopt the package (strategy 6.7):

- Publish the launch post drafted in `release-notes/launch/devto-post.md`.
- Submit to awesome-RAG and awesome-LLM lists, and to MCP server directories.
- Add `CONTRIBUTING.md`, issue templates, and a few "good first issue" labels.

### 2.6.0: intelligent caching and framework adapters

All additive and opt-in, so no breaking changes. Caching is the plan's "2.5.0", renumbered; scope as written in the v3 plan:

- `CacheBackend` contract, `MemoryCache`, `RedisCache`.
- `createRagPipeline({ cache })` with three layers:
  - **Embeddings.** Key: text + model + dimensions. Default time to live (TTL): 30 days.
  - **Retrieval.** Key: query + topK + filters + retriever state. Default TTL: 1 hour.
  - **Generation.** Key: prompt + context hash + model + temperature. Default TTL: 24 hours. Turned off when temperature > 0.
- `cache: true` turns on all three in memory.
- Hit and miss metrics, `docs-site/docs/Caching.md`, and tests for an identical query hitting all three layers and for invalidation when the corpus changes.
- **Additions from the 2.5.0 work:**
  - Cache keys must include every run option that changes the result (`topK`, filters, guardrail and ACL context such as `userPermissions`), so one user's cached results are never served to another.
  - Store results only when the run succeeded and was not aborted or timed out.
  - Reuse the existing `EmbeddingReranker` LRU where possible.
- Then let it soak for about 4 weeks, as the v3 plan intended.

Added from the competitive strategy:

- **Vercel AI SDK adapter (6.1):** accept an AI SDK embedding model and language model as `embedder` / `llm`.
- **Bring your own output (6.1):** document and test running `CitationTracker`, `PipelineEvaluator` and the guardrails on an answer and sources from any framework (LangChain, Mastra, AI SDK), with no `createRagPipeline` involved.
- **Run in the browser (6.6):** StackBlitz links for the three examples, so someone can get a cited answer in under a minute.
- **Lighter startup (6.4, non-breaking part):** load CLI-only dependencies (`inquirer`, `chokidar`, `ora`, `cli-table3`, `jsdom`) lazily, so `require()` of the library does not load them. Install size only shrinks in 3.0.

Revived from 7.5 (new API, so a minor release rather than a 2.5.x patch):

- **`baseURL` on `OpenAIConnector`.** Opens up any OpenAI-compatible endpoint: the Hugging Face router, Groq, Together, vLLM, LM Studio. This stands in for the documented `HuggingFaceConnector`.
- **`validatePlugin` export**, wrapping the existing `src/utils/validate-plugin-contract.js`.
- **`@devilsdev/rag-pipeline-utils/testing` entry:**
  - A deterministic offline connector, based on the `OfflineConnector` in `__tests__/docs/readme-examples.test.js`.
  - Fixture documents.
  - Stands in for the documented `ExternalAPIMocker`.
- **`calculateSemanticSimilarity(answer, reference, { embedder })`**, an embedding-based score next to BLEU/ROUGE.
- **CLI `query` options:**
  - `--trace` (stage timings from `ExecutionTracer`).
  - `--explain` (rank reasons and which sentences each citation supports).
  - `--stats` (latency, tokens and cost from `CostTracker`).
  - `--streaming`.
  - `--timeout <ms>`.
- **CLI `--quiet`**, a global option.

### 2.7.0: evaluation in CI, real vector stores, published proof

- **GitHub Action `rag-eval` (6.2):** runs a test set through a pipeline and fails the pull request when groundedness, faithfulness or citation coverage falls below a threshold or drops from the base branch. It posts a summary comment. Decided 2026-10-29: it lives in its own public repo, `DevilsDev/rag-eval-action`, so it can be listed on the GitHub Marketplace and its releases stay separate from the npm release workflow. It is a thin `action.yml` that runs `rag-pipeline eval` from the npm package; the comparison and report logic stay in the package.
- **pgvector and Qdrant connectors (6.5)**, with Pinecone next. They follow the existing retriever contract (`store`, `retrieve`, signal support). This moves the "bundled retrievers" item from 3.1+ forward.
- **Public benchmark (6.3):** a reproducible script and results page that measure hallucination detection and citation accuracy on a public QA dataset, and latency with and without the 2.6 cache. Publish the results even where they are unflattering.

Revived from 7.5, the library side of the `rag-eval` Action:

- **`validateDataset(cases)`:** checks a test set's shape and fields before running anything, and gives clear errors.
- **`compareConfigurations(dataset, { baseline, candidate })`:** runs a test set through two pipelines and reports per-metric differences and the cases that regressed. The Action's "dropped from the base branch" check is built on it.
- **`generateSyntheticDataset(documents, { llm, count })`:** an LLM writes question/answer pairs from the corpus, each with the IDs of its source documents. Generated cases are marked for human review.
- **`rag-pipeline eval <dataset>`** CLI command with `--report html`, using the existing `DashboardGenerator`. This replaces the removed `ai dashboard`; the Action attaches the same report.

### 3.0.0-beta.1: the major

The plan's scope plus the one agreed during 2.5.0:

1. **Monorepo split** into `rag-core`, `rag-connectors`, `rag-eval` and `rag-guardrails`. `@devilsdev/rag-pipeline-utils` stays as a meta-package that re-exports everything, so existing imports keep working.
2. **Remove the deprecated experimental classes from the main entry.** They stay available under `/experimental`. The first and only main-entry removal, allowed by SEMVER.md because 2.5 gave the warning.
3. **Drop Node 18** (`engines >= 20`). This also changes the CI matrix and the main-branch ruleset's required checks; the ruleset change needs approval.
4. **Upgrade the `openai` SDK** to its next major version (needs Node 20+).
5. **Each sub-package publishes from CI with OIDC and provenance**, like `release.yml`, with its own Trusted Publisher entry on npm.
6. **A migration guide** covering "do nothing" and "switch to direct imports".
7. **Smaller install (6.4):** make the provider SDKs (`openai`) optional peer dependencies, and move CLI-only dependencies to a separate `@devilsdev/rag-cli` package (the meta-package keeps the `rag-pipeline` command). This is breaking for anyone who relied on `openai` being installed with this package, so it belongs in the major. Target: a library-only install well under today's 188 packages / 57 MB.

The plan's release criteria still apply:

- Upgrading from 2.x to 3.0 breaks nothing.
- Importing a sub-package directly makes the bundle at least 30% smaller.
- All tests pass.
- Caching cuts repeat-query latency by at least 50%.
- At least 2 external contributors review the migration guide.
- The beta is out for 2 or more weeks with no P0 issue.

**Open question:** the split is two to three weeks of work. If that is too much for one major, ship items 2 to 4 as 3.0 and the split as 3.1 (additive, because the meta-package keeps imports working). I recommend keeping the split in 3.0 only if a beta period is acceptable.

### 3.1 and later (from the v3 plan)

- A streaming-first API.
- Edge-runtime support.
- More vector-store connectors (Weaviate and others, after pgvector, Qdrant and Pinecone in 2.7).
- An MCP server template in `examples/`.
- Cost-aware routing.
- Revived from 7.5, when there is demand:
  - **OpenTelemetry exporter** for `ExecutionTracer` spans, as an optional peer dependency. Stands in for the documented `DistributedTracer`.
  - **Context packer** that fits retrieved passages into a token budget using `TokenBudget`. Stands in for `TokenOptimizer`.
  - **Plugin contract test kit:** `runContractTests(plugin)` for Jest or Vitest. Stands in for `PluginTester`.

### Docs-site and community (no version target)

- A workflow that publishes the Docker image (only if the server use case warrants it).
- i18n and blog comments, if there is demand.
- VS Code snippets.

---

## 5. Changes to make to the two files

**`.github/PROJECT_ROADMAP.md`**

- Keep its table layout (`| Feature | Status | Target Version | Tags |`) so `scripts/create-roadmap-issues.js` and the related scripts still parse it.
- Update the header (version and date).
- Mark the four finished items ✅ with version 2.5.0.
- Correct the three "done" items that are not done.
- Add rows for 2.6.0 (caching, adapters), 2.7.0 (evaluation Action, vector-store connectors, benchmark) and the 3.0 items.
- Move Hydra.js and the graph UI to "Considered, not planned".
- Fix the "Files" section so it lists only scripts that exist.

**`.github/PROJECT_v3_PLAN.md`**

- Renumber caching to 2.6.0.
- Add removal of the deprecated exports and the `openai` SDK upgrade to the scope table.
- Explain how `FileVectorStore` fits the "no built-in vector store" anti-goal.
- Refresh the test count and the bundle baseline.
- Add an update-log row for 2026-10-29.

---

## 6. Competitive strategy

### Where we are

Weekly npm downloads (week ending 2026-10-28, from `api.npmjs.org`):

| Package                             | Weekly downloads |
| ----------------------------------- | ---------------: |
| `ai` (Vercel AI SDK)                |       34,285,429 |
| `langchain`                         |        3,541,200 |
| `@mastra/core`                      |        2,527,770 |
| `promptfoo` (LLM evaluation)        |          878,672 |
| `@mastra/rag`                       |          226,500 |
| `llamaindex`                        |          141,097 |
| **`@devilsdev/rag-pipeline-utils`** |           **90** |

The GitHub repository has 1 star and no forks.

### Position

We will not win on number of integrations, so we shouldn't compete on that. What the big frameworks don't provide as a built-in, working layer is what 2.5.0 already has: per-sentence citations, groundedness with a numeric check, evaluation, and guardrails at three stages.

The goal is to be **the grounding, evaluation and guardrails layer that users of LangChain, the AI SDK and Mastra add to what they already have**. `createRagPipeline` remains a complete option for teams that want one small library.

### The seven moves

| #   | Move                                                                                    | Why it matters                                                                 | Lands in         |
| --- | --------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ | ---------------- |
| 6.1 | Work with the big frameworks: adapters, and our layers usable on any framework's output | Reaches their users without asking them to switch                              | 2.6.0            |
| 6.2 | Evaluation in CI as a GitHub Action                                                     | promptfoo shows the demand; nobody ships a RAG-specific version with citations | 2.7.0            |
| 6.3 | Published, reproducible benchmarks                                                      | Makes the comparison page believable                                           | 2.7.0            |
| 6.4 | Smaller install                                                                         | 188 packages / 57 MB today; contradicts "small surface to review"              | 2.6 (start), 3.0 |
| 6.5 | pgvector, Qdrant, Pinecone connectors                                                   | The most common reason to pick something else                                  | 2.7.0            |
| 6.6 | First minute: StackBlitz, starter templates                                             | A cited answer within 60 seconds of finding the package                        | 2.6.0            |
| 6.7 | Distribution and community                                                              | Launch post, awesome lists, MCP directories, contributor on-ramp               | 2.5.x            |

**Order:** 6.4 (start) and 6.1 first, because they make the package easy to adopt; then 6.2, because it gives people a reason to pick it.

### How we'll know it's working

Track monthly: weekly downloads, GitHub stars, npm and GitHub dependents, issues opened by people outside the project, and users of the evaluation Action. A reasonable first target, three months after 2.7.0: 1,000 weekly downloads and 10 dependents.

---

## 7. What was dropped

### 7.1 Removed from the package in 2.5.0

They had either never worked or could never be reached. The details are in `CHANGELOG.md`, `[2.5.0]` → Removed.

| What                                                                                                                                                                                                                                        | Why                                                                               | Status now                                                                                                                |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| CLI `ingest`, `query`, `doctor`, `validate`, `plugin search/install/publish` placeholders                                                                                                                                                   | Printed success without doing anything                                            | **Rebuilt for real** in 2.5.0: `ingest`/`query` with `FileVectorStore`, a real `doctor` and `validate`, and `hub install` |
| No-op CLI options: `--trace`, `--stats`, `--parallel`, `--streaming`, `--max-memory`, `--preview`, `--validate`, `--explain`, `--abort-timeout`, `--quiet`, `config show --format`                                                          | Had no effect                                                                     | Gone                                                                                                                      |
| Interactive wizard built on mock registry data                                                                                                                                                                                              | Showed fake plugins                                                               | **Rebuilt** as a real `init` wizard                                                                                       |
| `ai` CLI: federated learning, LLM fine-tuning, `ai train status/deploy`, `ai dashboard`, adaptive profiles, multimodal `search`/`describe`                                                                                                  | Called methods that did not exist, printed simulated numbers, exited 0 on failure | Gone. A real subset remains: `ai train embedding`, `ai benchmark`, `ai feedback`/`search`, `ai multimodal process`        |
| `src/dx/` (including a realtime debugger with an unauthenticated WebSocket), `src/cli/commands/{dx,docs}.js`, `plugin-marketplace-commands.js`, `src/query.js`, `src/ingest.js`, `src/pipeline/pipeline.js`, `src/core/pipeline-factory.js` | Never exported or registered; the debugger was a security risk                    | Gone                                                                                                                      |
| Ten duplicate modules in `src/ai/`, `src/dag/enhanced-dag-engine.js`                                                                                                                                                                        | Unreachable copies                                                                | Gone; the exported classes are unchanged                                                                                  |
| `src/cli/templates/*.template.json`                                                                                                                                                                                                         | Old config format, pointed at a schema that did not exist                         | Gone; the `init` templates are the source of truth                                                                        |
| semantic-release, duplicate ESLint/Babel configs, about 50 one-off fix scripts and their `ci:*` npm scripts, 14 test suites that never exercised `src/`                                                                                     | Tooling debt                                                                      | Gone; releases use `release.yml`                                                                                          |

### 7.2 Deprecated in 2.5.0, leaving the main entry in 3.0

These classes still work from the main entry with a one-time warning, and stay available under `@devilsdev/rag-pipeline-utils/experimental`. They are simulated or incomplete.

| Class                                                                                     | What is wrong                                                                           |
| ----------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| `ModelTrainingOrchestrator`, `FederatedLearningCoordinator`                               | Simulated training and metrics                                                          |
| `MultiModalProcessor`, `AdaptiveRetrievalEngine`                                          | Partly simulated                                                                        |
| `SSOManager`, `SAMLProvider`, `OAuth2Provider`, `ActiveDirectoryProvider`, `OIDCProvider` | SAML refuses to authenticate; OIDC cannot refresh sessions; not for real authentication |
| `TenantManager`, `ResourceMonitor`                                                        | Random quotas; no real isolation                                                        |
| `DataGovernanceManager` / `DataGovernance`                                                | Erasure deletes nothing                                                                 |
| `PluginSandbox`, `PluginCertification`                                                    | The sandbox does not isolate; certification scores are fixed                            |

To keep any of these past 3.0 as real features, each needs a working implementation first. Multi-tenancy and SSO are the ones users are most likely to ask for.

### 7.3 Removed from the documentation (never existed in the code)

The docs-site review for 2.5.0 removed documentation for APIs that were never implemented:

- **Evaluation:** `calculateBERTScore`, `calculateSemanticSimilarity`, `createEvaluationPipeline`, `validateDataset`, `generateSyntheticDataset`, `compareConfigurations`, `benchmarkComponents`, `createDashboardAPI`.
- **Migration:** `createMigrator`, `migrateConfig`, `createMigrationPlan` / `executeMigration` / `validateMigration`.
- **Performance:** `TokenOptimizer`, `StreamingPipeline`, `MemoryOptimizedPipeline`, `CacheManager`, `LoadBalancer`, `AutoScaler`, `createPerformanceMonitor`.
- **Subpaths that never existed:** `/enterprise`, `/observability` and `/testing`, with `DependencyContainer`, `SLOMonitor`, `ExternalAPIMocker`, `EnterpriseAuth`, `StructuredLogger`, `MetricsCollector`, `DistributedTracer`, `AlertManager` and `HealthChecker`.
- **Plugins:** `PluginRegistry` / `PluginManager` classes, `BaseLoader` / `BaseEmbedder` / `BaseLLM` / `BaseRetriever`, `validatePlugin`, `PluginTester`, `HuggingFaceConnector`.
- **Other:** `RAGPipeline` (it is `createRagPipeline`), `RagError` / `PluginError` / `ConfigurationError`, `Middleware`, `pipeline.on`.

A few are worth building for real later:

- `CacheManager`: the 2.6 caching covers it.
- A synthetic dataset generator: useful alongside the 2.7 evaluation Action.
- `HuggingFaceConnector`.

What exists today replaces the rest.

### 7.4 The roadmap: nothing removed, much postponed

The history of `PROJECT_ROADMAP.md` shows that no item was ever deleted. Unfinished items were moved to a later version instead:

| Item                                                       | Target history           | Status                                                  |
| ---------------------------------------------------------- | ------------------------ | ------------------------------------------------------- |
| Interactive onboarding via CLI                             | v2.2.0 (🚧)              | Done in 2.5.0                                           |
| Hydra.js integration                                       | v2.2.0 (🚧), never moved | Never started; propose dropping                         |
| GitHub Discussions                                         | v2.2.0                   | Enabled                                                 |
| VS Code snippets, i18n, multilingual toggle, blog comments | v2.3.0 → v2.4.0          | Never started                                           |
| Real-world examples                                        | v2.3.0 → v2.4.0          | Done in 2.5.0                                           |
| Slack/Discord release webhook                              | v2.3.0 → v2.4.0          | Never started                                           |
| Plugin support via CLI, prebuilt Docker image              | v2.4.0                   | Plugin CLI done in 2.5.0; no Docker image published     |
| Graph-based pipeline UI                                    | v2.5.0                   | Never started; conflicts with the v3 plan's "no web UI" |

From `PROJECT_v3_PLAN.md`:

- **Planned for 2.5.0 but not delivered:** intelligent caching. Proposed for 2.6.0.
- **Deliberately not planned:** Rust bindings, a Kubernetes operator, a built-in vector store, a web UI or no-code builder, a Python port, a hosted SaaS, a general agent framework, native binaries. This review keeps all of those. It adds a note that `FileVectorStore` is a local index, not a hosted vector store.
- **Edge runtime:** stays a 3.x candidate.

### 7.5 Which dropped features to revive

A feature is worth reviving if it does two things:

- It supports the strategy in section 6: grounding, evaluation and guardrails that work alongside other frameworks.
- It is cheap, because most of the code already exists.

The release column refers to the plan in section 4.

#### Revive

| Feature (from)                                      | Why                                                                                                                                     | Cost                                                 | Release |
| --------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- | ------- |
| `validateDataset` (7.3)                             | The `rag-eval` Action must reject a malformed test set before running it                                                                | Small                                                | 2.7.0   |
| `compareConfigurations` (7.3)                       | Runs a test set through two pipelines and reports the difference: the Action's "fail if scores drop from the base branch" check         | Medium; builds on the 2.5.0 `evaluateRagDataset` fix | 2.7.0   |
| `generateSyntheticDataset` (7.3)                    | Writes question/answer pairs with source IDs from your corpus; without it users hand-write test sets, the biggest barrier to the Action | Medium                                               | 2.7.0   |
| `calculateSemanticSimilarity` (7.3)                 | Embedding-based answer score; BLEU/ROUGE penalise correct answers that are worded differently                                           | Small                                                | 2.6.0   |
| `validatePlugin` (7.3)                              | `validatePluginContract` already exists in `src/utils/` but is not exported; authors can run the `hub certify` checks in their tests    | Tiny                                                 | 2.6.0   |
| `PluginTester` (7.3), as a contract test kit        | `runContractTests(plugin)` checks signatures, signal handling and return shapes, so third-party plugins can be trusted                  | Medium                                               | Later   |
| `/testing` entry (7.3, `ExternalAPIMocker`)         | A deterministic offline connector and fixtures, so users can test pipelines without network access or API keys                          | Small; the README test already has one               | 2.6.0   |
| `query --trace`, `--explain` (7.1)                  | Stage timings from `ExecutionTracer`; why each passage ranked where it did and what each citation supports                              | Small                                                | 2.6.0   |
| `query --stats` (7.1)                               | Latency, tokens and cost from `CostTracker`                                                                                             | Small                                                | 2.6.0   |
| `query --streaming` (7.1)                           | The pipeline already streams                                                                                                            | Small                                                | 2.6.0   |
| `query --timeout <ms>` (7.1, was `--abort-timeout`) | Uses the 2.5.0 cancellation                                                                                                             | Tiny                                                 | 2.6.0   |
| `--quiet` (7.1)                                     | Standard option                                                                                                                         | Tiny                                                 | 2.6.0   |

#### Revive in a different form

| Dropped feature                                  | Replacement                                                                                                                                                      | Release |
| ------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- |
| `HuggingFaceConnector` (7.3)                     | `baseURL` option on `OpenAIConnector` (Anthropic and Cohere already have one). Covers the Hugging Face OpenAI-compatible router, Groq, Together, vLLM, LM Studio | 2.6.0   |
| `DistributedTracer` (7.3)                        | OpenTelemetry exporter for `ExecutionTracer` spans, as an optional peer dependency                                                                               | Later   |
| `CacheManager` (7.3)                             | `MemoryCache` / `RedisCache` from the 2.6 caching work                                                                                                           | 2.6.0   |
| `ai dashboard` (7.1), `createDashboardAPI` (7.3) | `rag-pipeline eval <dataset> --report html` using the existing `DashboardGenerator`; the Action attaches the same report                                         | 2.7.0   |
| `TokenOptimizer` (7.3)                           | A helper that packs retrieved context into a token budget using `TokenBudget`                                                                                    | Later   |
| `createEvaluationPipeline` (7.3)                 | Covered by the fixed `evaluateRagDataset` plus `compareConfigurations`                                                                                           | 2.7.0   |

#### Leave dropped

| Feature                                                                                                                                                                    | Reason                                                                                                       |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Federated learning, LLM fine-tuning, adaptive profiles (7.1)                                                                                                               | Need training infrastructure; out of scope for a library and ruled out by the v3 plan                        |
| Multimodal `search` / `describe` (7.1)                                                                                                                                     | Need vision models; revisit only on demand                                                                   |
| Plugin `search` / `publish` (7.1)                                                                                                                                          | No plugin registry exists for them to call; `hub install` from a path, `.tgz` or npm covers the need         |
| `src/dx` realtime debugger (7.1)                                                                                                                                           | It was a security hole; `--trace` and `TraceInspector` cover the useful part                                 |
| `calculateBERTScore` (7.3)                                                                                                                                                 | Needs a model to run; semantic similarity gets most of the benefit                                           |
| `LoadBalancer`, `AutoScaler`, `SLOMonitor`, `AlertManager`, `HealthChecker`, `DependencyContainer`, `EnterpriseAuth`, `MemoryOptimizedPipeline`, `StreamingPipeline` (7.3) | Infrastructure concerns, or they exist in another form (`serve` has `/health`; streaming is built in)        |
| Migration tools (7.3)                                                                                                                                                      | The old config format never worked with the code, so there is nothing to migrate; `validate` explains errors |
| `Base*` classes, `PluginRegistry` / `PluginManager` classes, `Middleware` (7.3)                                                                                            | Plain-object contracts are simpler                                                                           |
| `RagError` / `PluginError` / `ConfigurationError` (7.3)                                                                                                                    | `createError` codes cover it; reconsider only if users ask for `instanceof` checks                           |
| Duplicate modules, old templates, semantic-release, fix scripts (7.1)                                                                                                      | Tooling debt                                                                                                 |
| No-op `--parallel`, `--max-memory`, `--preview`, `--validate`, `config show --format` (7.1)                                                                                | No clear use, or covered by `--json`, `validate` and `doctor`                                                |

---

## 8. Decisions needed from you

1. **Caching as 2.6.0** before 3.0? (Recommended: yes.)
2. **3.0 scope:** everything listed above in 3.0 with a beta, or the split deferred to 3.1?
3. **Roadmap items to drop:** Hydra.js and the graph-based pipeline UI. Drop them, or keep them as "considered"?
4. **Apply the edits in section 5** to both files, in one PR?
5. **Competitive strategy:** adopt the position in section 6 (a layer that works with the big frameworks) and the 2.6 / 2.7 additions in section 4?
6. **Revived features (7.5):** revive the items marked "Revive" and "Revive in a different form" in the releases listed there?
7. **Deprecated experimental classes:** remove them from the main entry in 3.0 as planned, or first rebuild one of them for real (multi-tenancy or SSO)?
8. **Docs site (section 9):** fix and redesign the site in the order of section 9.3?

---

## 9. Docs site: fixes and redesign

Site: https://devilsdev.github.io/rag-pipeline-utils/ (Docusaurus, `docs-site/`). I reviewed it on 2026-10-29 from the live URL and from a local build of `main`.

### 9.1 What is wrong today

**The site is down.**

- Every page returns a GitHub Pages 404.
- Two workflows deploy to Pages on each push to `main`. `docs-automation.yml` uploads the raw `docs/` folder, which has no `index.html`. It finished after the Docusaurus deploy from `docs-build.yml` and replaced the site.
- **Fixed in PR #94.** After merging, the site needs one manual redeploy (`gh workflow run docs-build.yml --ref main`), because #94 doesn't touch the paths that trigger `docs-build.yml`.

**Content that is wrong:**

| Where                | Problem                                                                                                                                                         |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Homepage quick start | The snippet creates a pipeline with no `embedder`, so copying it fails. It also passes `apiKey` explicitly instead of the README's environment-variable pattern |
| Homepage stats band  | "2050+ Tests" (now 2,381); "Zero production vulnerabilities" needs a date or a link to the audit                                                                |
| Homepage features    | "7 provider connectors": there are four (OpenAI, Anthropic, Cohere, Ollama) plus the offline `LocalEmbedder`                                                    |
| Homepage tagline     | "Enterprise-grade composable RAG pipelines with advanced AI capabilities" is vague and differs from the README and npm description                              |
| Sidebar              | "Core (rag-core)", "Connectors (rag-connectors)", "Evaluation (rag-eval)", "Guardrails (rag-guardrails)" name packages that don't exist until 3.0               |
| Version menu         | Offers the 2.3.1 snapshot (25 pages, marked unmaintained). It documents APIs that the 2.5.0 docs review removed as never implemented                            |

**Gaps that developers notice first:**

- **No search.** The Algolia block in `docusaurus.config.js` is commented out with placeholder keys.
- **Homepage code isn't highlighted.** It is raw `<pre>` text, not Docusaurus `CodeBlock`. There are no copy buttons, and wide lines scroll sideways inside fixed-height cards.
- **Generic look.** It is close to the default Docusaurus template, and its blue (`#2563EB`) doesn't match the README banner (navy with a sky-to-violet accent).
- **Six components are built but unused:** `CodePlayground`, `ConfigGenerator`, `InteractiveBadge`, `PerformanceCalculator`, `Tooltip`, `TourGuide`.
- **Maintenance:**
  - `@docusaurus/*` is pinned to 3.7.0 in `package.json`, and 3.10.2 is available.
  - The `onBrokenMarkdownLinks` option is deprecated.
  - During the review, the browser tab froze twice right after the dark-mode toggle. I couldn't reproduce it in a clean tab and found no theme-dependent code, so treat it as something to test, not a known bug.

### 9.2 Direction

Make the site look and read like the README: the same banner identity, honest claims, and only code that runs. Developers should be able to **find** something in one keystroke, **copy** working code, and **try** it without installing anything.

### 9.3 Plan

**Phase A: fix (about 1 day, after #94)**

1. Redeploy, and add a post-deploy check to `docs-build.yml`: after deploying, request the homepage and one docs page, and fail if either is not 200.
2. Homepage content:
   - A working quick start, the same offline `LocalEmbedder` + `MemoryRetriever` example as the README.
   - Accurate stats, connector count and tagline (taken from `package.json` `description`).
3. Sidebar labels without the 3.0 package names.
4. Drop the 2.3.1 snapshot from the version menu. Keep the files until 3.0, then remove them.
5. Upgrade to Docusaurus 3.10.2 and move `onBrokenMarkdownLinks` to `markdown.hooks`.
6. Delete the six unused components, or revive them per Phase C. Don't ship dead code.

**Phase B: redesign (2 to 3 days)**

1. **Theme:**
   - Navy and sky-to-violet tokens from `assets/banner.svg`, defined for light and dark mode, with WCAG AA contrast in both.
   - Inter for text and JetBrains Mono for code, self-hosted through `@fontsource`.
2. **Hero:**
   - Name and one-line value.
   - An `npm install` command with a copy button.
   - The pipeline diagram (query → retrieve → rerank → generate → answer + citations) as inline SVG, with a subtle animation that respects `prefers-reduced-motion`.
   - Buttons: "Quick start", "Run it in your browser" (Phase C), GitHub.
3. **Homepage sections:**
   - What you get: citations, evaluation, guardrails, CLI.
   - The recorded CLI demo (`assets/demo.gif`).
   - Use-case cards with highlighted, tested snippets.
   - A short comparison linking to the Comparison page.
   - A "Works with LangChain, the AI SDK and Mastra" strip, once the 2.6 adapters exist.
4. **Code everywhere through `CodeBlock`:**
   - Copy buttons, `title=` file names and line highlighting.
   - Tabs for npm / pnpm / yarn and for ESM / CommonJS.
5. **Navigation:**
   - Navbar: Docs · API · CLI · Examples · Blog · version · GitHub stars.
   - A tidy footer.
   - Breadcrumbs, "Edit this page", last-updated dates.
6. A **social card** regenerated from the banner, so links shared on Slack, X and LinkedIn look right.
7. Check mobile and dark mode on every page template.

**Phase C: features developers will enjoy (3 to 4 days)**

| Feature                  | What it gives developers                                                                            | How                                                                                                           |
| ------------------------ | --------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Search (Ctrl/⌘ K)        | Find any API, option or CLI flag instantly                                                          | `@easyops-cn/docusaurus-search-local` now (no account needed); Algolia DocSearch later (free for open source) |
| Run in the browser       | Run the three examples with no install                                                              | "Open in StackBlitz" buttons (WebContainers run Node)                                                         |
| `.ragrc.json` builder    | Pick a template, embedder, retriever and LLM, then copy or download a config that passes the schema | Revive `ConfigGenerator`, validated with `.ragrc.schema.json` in the browser                                  |
| Generated API reference  | Signatures, types and JSDoc that cannot drift from the code                                         | `docusaurus-plugin-typedoc` over the generated `.d.ts`; the hand-written page keeps the guides                |
| `llms.txt`               | AI coding assistants (Claude, Cursor, Copilot) read the docs as one clean file                      | `docusaurus-plugin-llms`, generating `/llms.txt` and `/llms-full.txt`                                         |
| Diagrams as code         | Architecture and data-flow diagrams that stay in sync and work in dark mode                         | `@docusaurus/theme-mermaid`                                                                                   |
| Changelog page           | Release history on the site                                                                         | Render `CHANGELOG.md` as a docs page, linked from each release post                                           |
| "Was this page helpful?" | A quick way to report a confusing page                                                              | A link to a prefilled GitHub Discussion or issue, with no tracking                                            |

**Phase D: keep it accurate (about 1 day)**

- Extend the README examples test (`__tests__/docs/readme-examples.test.js`) to run the JavaScript blocks on docs-site pages, so documentation examples fail CI when they drift.
- Run a link checker on the built site in CI (Docusaurus already fails on broken internal links; add external links on a weekly schedule).
- Add Lighthouse CI on the homepage and one docs page, with targets of at least 90 for performance, accessibility, best practices and SEO.

### 9.5 Open item from Phase D

Lighthouse (desktop, in CI) reports a cumulative layout shift of about 0.43 on `/docs/Config-Builder`, which holds its performance score at 78. The homepage and Introduction score 96 to 97.

**Not the cause** (each checked and ruled out):

- the `createdAt` timestamp (fixed; it did cause hydration errors);
- late-loading styles (the builder's CSS is in the render-blocking stylesheet);
- the sticky output column;
- server versus hydrated layout (identical at 1350 px).

In a real browser at Lighthouse's width the shift measures 0, and the Lighthouse filmstrip shows no visible movement. It is deterministic (the same value on every run), so the next step is a Lighthouse trace (`--save-assets`) to see which frame records it. Performance is a warning, not an error, so it does not block pull requests.

### 9.4 Where it fits

- Phase A goes with the **2.5.x** items; it's documentation only and can ship any time.
- Phases B and C can land on `main` between releases, since the site deploys on its own. Ship them before the 2.6.0 announcement, so the new features land on the redesigned site.
- Phase D goes with **2.6.0**, together with the `/testing` entry.
