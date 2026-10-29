# Changelog

All notable changes to this project are documented here.

This project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html)
and the [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) format.

Older history (pre-2.4.0) is preserved in the
[GitHub releases](https://github.com/DevilsDev/rag-pipeline-utils/releases)
page.

## [Unreleased]

Planned for 2.7.0.

### Added

- **`validateDataset(dataset, { requireExpected, requireSourceIds })`**
  checks an evaluation test set before it runs and reports every problem
  with its case index, id and field, without throwing. A dataset is an
  array of `{ prompt, expected, sourceIds, id, tags }` cases or
  `{ cases: [...] }`; `question` and `referenceAnswer` are accepted as
  aliases, and the `{ prompt, expected }` shape `evaluateRagDataset` reads
  is valid unchanged. Valid datasets come back normalised in `cases`.
- **`runEvaluation(dataset, pipeline)`** runs every case with citations and
  evaluation on and returns a JSON report: per-case answers, retrieved ids,
  scores (faithfulness, relevance, context precision and recall,
  groundedness, citation coverage, and `sourceRecall` against the case's
  `sourceIds`) and per-metric means. Failed cases are recorded, not thrown;
  options for `concurrency`, a per-case `timeout`, `signal` and `onCase`.
  Reports record the `libraryVersion`, and `compareConfigurations` warns
  when two runs used different versions, since scoring can change between
  releases.
- **`compareConfigurations(dataset, { baseline, candidate })`** compares two
  runs, where each side is a pipeline or a saved report, and reports
  `regressed`, per-metric deltas, and the cases that now fail or dropped by
  more than `caseTolerance`. `tolerance` (default 0.02) sets the allowed
  drop in a metric's mean.
- **`generateSyntheticDataset(documents, { llm, count })`** drafts a test set:
  an LLM writes question and answer pairs about one document at a time, and
  each case records the document in `sourceIds`. Answers their document
  doesn't support (by `computeFaithfulness`), repeated questions, malformed
  replies and short documents are skipped and listed with a reason. Cases
  are tagged `synthetic` and marked `reviewed: false`.
- **`rag-pipeline generate-dataset --output <file>`** does the same from the
  index with the configured `llm`, and won't overwrite a file without
  `--force`.
- **`PgVectorRetriever`** stores and searches documents in PostgreSQL with
  the pgvector extension: cosine similarity, upserts in one transaction, an
  HNSW index with an `efSearch` option for recall, and `removeBySource`, `delete`, `clear`, `size` and `list` for
  the CLI. Pass a `pg` Pool, or a connection string with `pg` installed (an
  optional peer dependency, loaded only when used). In `.ragrc.json` it is
  the `pgvector` retriever and reads its connection string from
  `DATABASE_URL`. It isn't cached unless you give it a `cacheKey`.
- **`QdrantRetriever`** stores and searches documents in a Qdrant
  collection through its REST API, with no client package. Document ids map
  to stable UUIDs, with the original id kept in the payload; writes wait
  until Qdrant applies them. In `.ragrc.json` it is the `qdrant` retriever,
  reading `QDRANT_URL` and `QDRANT_API_KEY`. Tested against Qdrant 1.20.
- **`rag-pipeline eval <dataset>`** runs a `.json` or `.jsonl` test set
  through the configured pipeline and exits 1 when a case fails, a metric
  is below its `--min metric=value`, or the run regressed from a
  `--baseline` report. `--output` saves the run as a baseline, `--report`
  writes a standalone HTML page (`.html`) or a Markdown summary for a pull
  request comment, and `--json` prints the verdict. Also `--tolerance`,
  `--case-tolerance`, `--concurrency`, `--timeout` and `--top-k`.
- **[`DevilsDev/rag-eval-action`](https://github.com/DevilsDev/rag-eval-action)**,
  a GitHub Action that runs `rag-pipeline eval` on pull requests, compares
  them with the default branch's report from the Actions cache, posts a
  summary comment that later runs update, and fails the check when scores
  drop. Its `v1` is published with this release.
- **`renderEvaluationReport`** (Markdown or HTML) and
  **`evaluationVerdict`** for the same reports in code.
- `sourceIds` match a retrieved result's `id` or its `metadata.source`, so
  a case can name a file when the index stores chunks of it.
- **A generated API reference** on the docs site: a page for every export,
  with its methods, options and types, built from the published type
  declarations by `npm run docs:api`. CI fails when it is out of date.
- **Published speed benchmarks** on the docs site: pipeline overhead, and
  ingest throughput, query latency and recall@10 for `MemoryRetriever`,
  `FileVectorStore`, `PgVectorRetriever` and `QdrantRetriever`, measured in
  CI against real pgvector and Qdrant (`npm run bench:speed`), and
  retrieval quality (nDCG@10, recall, MRR) of the offline retrievers on
  BEIR SciFact (`npm run bench:quality`), where `BM25Search` matches the
  published BM25 baseline. The tables are generated from the committed
  reports in `benchmarks/results/`.
- `logger.info()`, `.warn()`, `.error()` and `.debug()` log through the
  shared logger. The `logger` export is the logger module, so these were
  undefined; `logger.logger.info()` keeps working.

### Fixed

- **`LocalEmbedder` ignored most words on a large corpus.** When a corpus
  had more distinct tokens than `maxVocabularySize` (10,000), `train()`
  kept the rarest ones, mostly words that occur in a single document, so
  most queries embedded to all zeros. It now keeps the most common tokens.
  On BEIR SciFact nDCG@10 rose from 0.12 to 0.47. Indexes built before
  keep their saved vocabulary until you ingest again; re-run `ingest` to
  benefit.
- **The TypeScript declarations for the core API didn't match the code.**
  Plugins written to them failed at runtime. `RetrieverPlugin.retrieve`
  takes one `{ query, queryVector, topK, signal }` object,
  `RerankerPlugin.rerank` takes `(query, documents)`, and `LLMPlugin.generate`
  takes `(query, documents, options)` and must return the answer text: an
  `LLMResponse` object became the answer `"[object Object]"`.
  `PipelineRunResult` now has `answer`, `citations` and `evaluation`, and
  `run()` with `options: { stream: true }` is typed to resolve a stream.
  The
  declarations of `loadConfig` (synchronous, takes a path), `validateRagrc`,
  `normalizeConfig`, `pluginRegistry`, `createError` and `wrapError`,
  `computeBLEU`, `computeROUGE` and `scoreAnswer` (token arrays,
  `(actual, expected)`), `retry`, `withRetry`, `RateLimiter`,
  `BatchProcessor`, `ConnectionPoolManager`, `JWTValidator`,
  `PluginSignatureVerifier`, `validateInput`, `DAG`, `evaluateRagDataset`,
  `HotReloadManager`, `DevServer`, `AuditLogger`, `PluginHub`, `metrics`,
  `eventLogger` and `ParallelProcessor` are now generated from the source,
  so they describe what each one does. A call that matched an old
  declaration but not the code, such as `rerank(results, query)` or
  `await loadConfig({ configPath })`, may no longer compile; it didn't
  work when run.
  `LLMResponse`, `LoadConfigOptions`, `DAGNode`, `DAGOptions`,
  `ErrorFormatter` and `EvalResult` are deprecated.

- **The CLI didn't wait for retrievers whose methods are async**, as a
  remote vector store's are: `ingest` didn't wait for `removeBySource`, so
  re-ingesting a file could keep its old chunks or delete the new ones, and `generate-dataset`,
  `ai feedback` and `ai benchmark` failed on `list()`. Every retriever call
  is now awaited. The fitted `local` embedder with a store that can't save
  its state now stops with a message instead of embedding queries with an
  empty vocabulary.
- A bad option value (`--top-k 0`, `--min speed=1`) printed a stack trace;
  the CLI now prints a one-line error naming the option and exits 1.

## [2.6.2] - 2026-10-29

### Fixed

- **`npm install` failed on machines without husky installed globally.**
  Every release from 2.2.1 to 2.6.1 declared
  `"postinstall": "husky install"`. husky is a development tool that isn't
  installed in users' projects, so installing the package failed with
  `husky: not found` (or `'husky' is not recognized` on Windows) on clean
  machines and CI runners. The hook now runs from `prepare`, which npm runs
  only in this repository, and the pack smoke test fails if the package
  has any install-time script. No code changes.

## [2.6.1] - 2026-10-29

Documentation only; no code changes.

### Changed

- **README covers the 2.6.0 features**, so the npm package page shows
  them: `checkAnswer` for answers from other frameworks, the `/testing`
  entry, caching, the `query` `--explain`, `--trace`, `--stats` and
  `--streaming` options, `OpenAIConnector` `baseURL` and the AI SDK
  adapter.
- **StackBlitz examples checked**: the basic pipeline, OpenAI with
  Pinecone (offline mock) and the Fastify service each install and run.
  The docs now say to reload if StackBlitz stalls while cloning.

## [2.6.0] - 2026-10-29

### Added

- **`OpenAIConnector` `baseURL`** for OpenAI-compatible APIs (Groq,
  Together, the Hugging Face router, vLLM, LM Studio, Ollama's `/v1`
  endpoint). With a custom `baseURL` the key is never read from
  `OPENAI_API_KEY`, so an OpenAI key is not sent to another provider; pass
  `apiKey`, or omit it for local servers that need none.
- **`validatePlugin(stage, plugin, { registry })`** returns
  `{ valid, errors, warnings }` for a plugin without throwing, for use in
  plugin tests. `registry: true` also applies the rules
  `pluginRegistry.register()` enforces.
- **`ParallelEmbedder` `mode`** (`'auto'`, `'batch'`, `'single'`).
- **`checkAnswer({ question, answer, sources })`** checks an answer from any
  framework (LangChain, LlamaIndex, Mastra, the AI SDK, your own code)
  against its sources: `grounded`, `groundedness`, the `unsupported`
  sentences, per-sentence `citations` and `evaluation` scores. Sources may be
  strings, `{ id, content }`, LangChain Documents or LlamaIndex nodes;
  `normalizeSources` is exported for the conversion alone.
- **Caching**: `createRagPipeline({ cache })` caches query embeddings,
  retrieval results and answers (`true`, a store, or per layer with time to
  live). `MemoryCache` (LRU and TTL) and `RedisCache` (node-redis or
  ioredis) are included; any `get`/`set` store works. A layer caches only
  when its component identifies itself (`getCacheKey(role)` or `cacheKey`;
  all built-ins do), retrieval is keyed by the store's state and the query
  vector, answers by the exact documents and generation options, and
  answers are not cached when the temperature is above 0. Retrieval is
  cached before `filterResults` and the reranker, so guardrail ACLs run on
  every request. Nothing from a failed, aborted or timed-out run, or from an
  unfinished stream, is stored. Results carry `cache` per layer and the
  pipeline has `cacheStats()`.
- **`@devilsdev/rag-pipeline-utils/testing`**: deterministic, offline test
  helpers. `HashEmbedder`, `EchoLLM` (answers with the top document or a set
  answer, records every call, streams), `fixtures.documents` and
  `createTestPipeline()`. Shares classes with the main entry and is not
  loaded by it.
- **`computeSemanticSimilarity(answer, reference, { embedder })`**: cosine
  similarity of the two embeddings, 0 to 1. `checkAnswer` adds it as
  `evaluation.scores.semanticSimilarity` when given a `referenceAnswer` and
  an `embedder`.
- **`rag-pipeline query`** options: `--trace` (time per stage), `--explain`
  (passage scores, and the passages supporting each answer sentence, with
  unsupported sentences flagged), `--stats` (latency, estimated tokens and
  cost), `--streaming` and `--timeout <ms>`; global `--quiet`. `--json`
  includes trace, stats and explanation when asked.
- **`createAiSdkAdapter({ ai, embeddingModel, languageModel })`** wraps
  Vercel AI SDK models as an `embedder` and an `llm` for
  `createRagPipeline()`, with streaming, `embedMany` batching and the run's
  `AbortSignal`. You pass the AI SDK functions, so it is not a dependency and
  works with AI SDK 5, 6 and 7 from ESM or CommonJS. The RAG system prompt
  is sent as both `instructions` (AI SDK 7) and `system` (5 and 6). Tested
  against AI SDK 6 and 7 with their mock models.

### Changed

- **Faster CLI.** Commands load only their own dependencies: `--help`
  takes about 0.5 s and `query` about 0.5 s instead of about 3.6 s. Loading
  the CLI drops from 1281 modules and 93 packages to 55 and 13. The HTML,
  Markdown and CSV loaders load `jsdom`, `marked` and `csv-parse` when they
  read a file.
- **Faster import.** `require('@devilsdev/rag-pipeline-utils')` takes about
  125 ms instead of about 515 ms and loads 31 modules from 9 packages
  instead of 245 from 54 (published bundle, Node 22). `axios`,
  `jsonwebtoken`, `ajv` and `chokidar` now load when the feature that needs
  them is first used (the Anthropic, Cohere and Ollama connectors,
  `JWTValidator`, plugin registration and config validation, hot reload).
  The shared `pluginRegistry` loads its contracts on first use; registries
  created with `new PluginRegistry()` still load them in the constructor.

### Fixed

- **`ExecutionTracer.exportTraces('json')`** threw "circular structure"
  with the default `captureOutputs: true`: traces stored the live result,
  which carries the trace. Traces now store JSON snapshots, which also keeps
  later changes to a result out of its recorded trace.
- **`ParallelEmbedder`** failed with the built-in connectors, which embed
  one string at a time, because it always called `embed(batch)` with an
  array. In the default `'auto'` mode it now embeds texts one by one for
  those connectors and uses `embedBatch(texts)` when an embedder has it;
  other embedders are still called with the array.

## [2.5.0] - 2026-10-28

### Added

- **Cancellation**: `createRagPipeline` creates an AbortController per run
  and passes its signal to every component (`retriever.retrieve({ signal })`,
  `embedder.embedQuery/embed(text, { signal })`, `reranker.rerank(q, docs,
{ signal })`, `llm.generate(q, docs, { signal })`); a new `options.signal`
  lets callers cancel. All built-in connectors and rerankers honour it.
  `AgenticPipeline` and `IterativeRetriever` propagate it too.
- `QueryPlanner.plan(query, { llm, signal })`: LLM-proposed sub-queries with
  strict JSON validation and heuristic fallback (returns a Promise);
  `AgenticPipeline` option `enableLlmPlanning` (default `false`).
- `checkNumericConsistency`, `extractNumbers`, `detectInjection` and
  `PRICING_METADATA` exports.
- Opt-in `detectInjection` on `RetrievalGuard` to scan retrieved documents for
  indirect prompt injection.
- `CostCalculator`: pricing provenance (`source`, `asOf`, `verified`), a
  `pricing` override, one-time unknown-model warnings
  (`RAG_UNKNOWN_MODEL_PRICING`), longest-match model resolution.
- `EmbeddingReranker` `cacheSize` (LRU of document embeddings) and
  `concurrency` options; `MemoryRetriever` `eviction: 'fifo'` option.
- Plugin signatures: `computeContentDigest()`, a signed `contentDigest` that
  binds plugin code, opt-in `requireContentDigest` and `requireSignedPlugins`,
  and `register()`'s optional `{ content }` argument.
- `JWTValidator` options `singleUseTokens` (default `true`) and
  `maxTrackedJtis` (default 100000).
- `AuditLogger` reads its key from `encryptionKey` or
  `RAG_AUDIT_ENCRYPTION_KEY`; `requireEncryption: true` makes a missing key an
  error.
- `.env.example` for `docker compose`.
- `npm run test:serial` and `npm run format:check`.
- **Working CLI workflow**: `rag-pipeline init`, `ingest <path>`, `query
<question>` and `run` now do real work against a persistent local index.
  `init` writes a pipeline of built-in components (`--template local |
openai | ollama | anthropic`, or interactive prompts in a terminal).
- **`FileVectorStore`** (exported): JSON-file vector index with atomic
  writes, embedder/dimension tracking and per-source re-ingestion.
- **`.ragrc.json` pipeline resolution**: entries `{ stage, name, config }`
  resolve to built-in components, custom plugin modules under `plugins`, or
  plugins registered on `pluginRegistry`.
- **`rag-pipeline serve`** and a working **`DevServer`**: local HTTP API
  (`GET /health`, `POST /query`) bound to 127.0.0.1, JSON only, 64 KB body
  limit, no CORS.
- `LocalEmbedder.getState()` / `setState()`.
- **`rag-pipeline hub install <source>`** installs plugins from a local
  directory, `.tgz`, single `.js` file, `npm:<package>` or a registry
  (sha256-verified). It contains extraction to `.rag/plugins`, runs a static
  security scan (high-risk findings block unless `--allow-risky`), checks the
  stage contract in a separate process, and registers the plugin in
  `.ragrc.json`. `PluginHub.installPlugin()` uses the same installer.
- **`rag-pipeline hub certify submit|check <path>`** scores a local plugin
  from its files (contract, security scan, tests, documentation) against the
  BASIC/VERIFIED/ENTERPRISE automated thresholds.
- **`rag-pipeline hub list`** lists plugins registered in the config.
- **`rag-pipeline init` setup wizard**: chooses the embedder, LLM, retriever and an optional reranker, using only built-ins or custom plugin modules. Connector options are pre-filled with the connector defaults. Each custom plugin is loaded and its stage method checked before it is accepted. The wizard reports which API key environment variables are missing, can run a connection test on request, and previews the JSON before writing.
- **`rag-pipeline ai`**, built on the configured pipeline and index:
  `ai train embedding [path]` refits the `local` TF-IDF embedder and
  re-embeds the index; `ai benchmark` reports measured p50/p95/mean latency
  per stage; `ai feedback <question> <docId> --rating up|down` stores votes in
  `.rag/feedback.json` and `ai search` applies them as a capped,
  explained score adjustment; `ai multimodal process <path>` reports type,
  characters and chunks for text files (images exit 1: no built-in connector
  accepts image input).

### Deprecated

- **Experimental modules moved to `@devilsdev/rag-pipeline-utils/experimental`**:
  `ModelTrainingOrchestrator`, `FederatedLearningCoordinator`,
  `MultiModalProcessor`, `AdaptiveRetrievalEngine`, `SSOManager`,
  `SAMLProvider`, `OAuth2Provider`, `ActiveDirectoryProvider`, `OIDCProvider`,
  `TenantManager`, `ResourceMonitor`, `DataGovernanceManager` /
  `DataGovernance`, `PluginSandbox` and `PluginCertification`. They are
  simulated or incomplete (random metrics, SSO that accepts any code outside
  production and does not verify SAML or OIDC tokens, random quotas, erasure
  that deletes nothing, a non-functional sandbox, fixed certification
  scores); see the Experimental docs page. Their main-entry exports still
  work but emit a one-time `DeprecationWarning` (`RAG_DEP_*` codes) when
  used, are marked `@deprecated` in the types, and will be removed from the
  main entry in the next major release. The same classes are shared by both
  entries, so `instanceof` checks keep working.

### Removed

- Unused CLI config templates under `src/cli/templates/` (old format,
  referenced a schema path that did not exist).
- Ten unreachable duplicate modules under `src/ai/` and the internal
  `src/dag/enhanced-dag-engine.js` (never reachable from the package entries;
  the exported classes are unchanged).
- semantic-release configuration and dependencies (releases use
  `npm publish --provenance` from the release workflow), duplicate
  `.eslintrc.json` and `.babelrc`, about 50 one-off fix scripts and their
  `ci:*` npm scripts, the tracked `junit.xml`, and 14 test suites that never
  exercised `src/` (fake pipelines, mocks, empty timing loops).
- CLI placeholders that printed success without doing anything (`ingest`,
  `query`, `doctor`, `validate`, `plugin search|install|publish`) and
  options that had no effect (`--trace`, `--stats`, `--parallel`,
  `--streaming`, `--max-memory`, `--preview`, `--validate`, `--explain`,
  `--abort-timeout`, `--quiet`, `config show --format`).
- The interactive wizard built on hard-coded mock registry data.
- The unregistered `src/cli/commands/ai-ml*` command modules: federated
  learning, LLM fine-tuning, `ai train status|deploy`, `ai dashboard`,
  adaptive profiles and multimodal `search`/`describe`. They called methods
  missing from the `src/ai` engines, exited 0 on failure and printed
  hard-coded or simulated numbers. The `src/ai` library modules are unchanged.
- Unreachable modules that were never exported or registered: `src/dx/`
  (including a realtime debugger exposing an unauthenticated WebSocket),
  `src/cli/commands/{dx,docs}.js`, `src/cli/input-sanitization-middleware.js`,
  `src/cli/plugin-marketplace-commands.js`, `src/query.js`, `src/ingest.js`,
  `src/pipeline/pipeline.js`, `src/core/pipeline-factory.js`. The package
  `exports` map only exposes `.` and `./cli`, so these were never public.

### Fixed

- **`evaluateRagDataset`** scores the generated answer; it scored the
  retrieved documents, so every case failed with zero scores.
- **`RetrievalGuard`** with `enforceACL` also reads a top-level `acl` /
  `requiredRole` on results that have `metadata` (it read only `metadata`
  then).
- **`createRagPipeline`**: timeouts now cancel work and no stage starts after
  an abort (a timeout still resolves `{ success: false, error: 'Execution
timeout' }`; a caller abort resolves `'Execution aborted'`). Without an llm
  it runs retrieval only and returns `answer: null` instead of `'ok'`. Stream
  mode with `citations` or `evaluate` ends with one `{ token: '', done: true,
citations, evaluation }` chunk. The artificial 5 ms delay is removed.
- **Connectors** retry only transient failures (network, 408/409/425/429/5xx)
  with exponential backoff, jitter and `Retry-After`; SDK-internal retries are
  disabled. API keys are read at construction, and calls without a key fail
  fast with `MISSING_API_KEY`.
- **`MemoryRetriever`** enforces `maxDocuments` and rejects mismatched vector
  dimensions instead of truncating them.
- **`AuditLogger`** no longer encrypts with a random per-process key that made
  logs unreadable after a restart; legacy `createCipher` records decrypt on
  Node 22+.
- **`JWTValidator` / `jwt-config`** honour an explicit `clockTolerance` /
  `notBeforeTolerance` of 0 (it became 30); the expired-token test is enabled.
- **`loadPluginsFromJson`** awaits registration and verifies signed manifests
  and plugin files before importing them.
- **`rag-pipeline init`**: the connection test aborts its calls after the 15 s
  timeout and the CLI exits afterwards.
- **Benchmarks** accept `--iterations=N`, no longer abort on the retry
  benchmarks' deliberate warm-up failures, and exit when done.
- **Docs generation** no longer hangs: the JSDoc regex backtracked
  exponentially on an unterminated `/**`.
- **Tests** run in parallel again (a suite destroyed the Jest worker's own
  stdio streams), no longer rewrite tracked fixtures, and coverage works on
  Windows (the test setup no longer patches `path.resolve`).
- **Package import**: `require()` / `import` of 2.4.5 failed in every clean
  install with `Cannot find module 'isolated-vm'`. `isolated-vm` is now
  loaded only when `PluginSandbox` runs and is an optional peer dependency;
  `pino-pretty` is an optional peer as well. Added the missing `ajv-formats`
  and `marked` dependencies, pinned `chalk` to 4.x (5.x is ESM-only), removed
  unused `dotenv`. Importing the bundle no longer prints "Missing Contract"
  warnings. A tarball smoke test (`npm run smoke:pack`) now runs in CI and
  before publish.
- **`createRagPipeline`**: the `embedder` result was computed and discarded,
  so vector retrievers never received a `queryVector`. Plugins registered on
  the exported `pluginRegistry` are now resolvable by name, and the timeout
  timer is cleared when a run finishes.
- **`MemoryRetriever`** throws a clear error when no `queryVector` is given
  instead of crashing inside cosine similarity.
- **README / docs quick start** now passes an `embedder`; as previously
  written it could not retrieve anything from `MemoryRetriever`.
- **Citations** with zero retrieved documents no longer fail the run; every
  sentence is reported as unsupported.
- **`HybridRetriever`** passes the full request (including `queryVector`) to
  `retrieve()`, so vector results are no longer silently dropped, and throws
  when every retriever fails.
- **Guardrails**: the retrieval guard (ACL, relevance, freshness) now runs
  before generation via the new `options.filterResults` hook; removed
  documents are reported by id only; strict-mode blocks no longer return the
  raw answer; PII is redacted in citations and evaluation details too.
- **`AuditLogger`**: tenant/user/action filters never matched, so queries and
  compliance reports returned every tenant's records. Encryption now uses
  `createCipheriv` with a random IV per field (it threw on Node 22 and reused
  the nonce on Node 18/20). The integrity hash now covers action and tenant.
- **`InputSanitizer`**: a regex state bug let command-injection payloads
  through after a previously blocked input.
- **`LLMReranker`** sends an actual ranking prompt instead of the raw
  question, keeps documents the LLM omits, and honours `topK`.
- **Agentic RAG**: with an `embedder`, each sub-query and refined query is
  embedded on its own instead of reusing the original query vector.
- **TypeScript**: 52 runtime exports (citations, guardrails, hybrid
  retrieval, agentic RAG, connectors, rerankers, GraphRAG, ...) had no
  declarations. They are now generated from JSDoc at build time into
  `dist/types/` and re-exported from `dist/index.d.ts`; the build fails if
  any export is undeclared, and the smoke test compiles a TypeScript consumer.
- **`doctor` / `validate`** report real findings (unknown components,
  missing stages, missing API keys, broken custom plugins) and exit 1 on
  errors. `doctor --auto-fix` no longer lets callers re-enable a shell, no
  longer strips Windows path separators, and runs npm on Windows.
- **`hub`** (alias `plugin`) commands are registered. There is no default
  registry (the old default host does not exist): pass `--registry <url>` or
  set `RAG_PLUGIN_REGISTRY` for registry operations.
- **Hot reload** ignore patterns work again (chokidar 4 dropped glob support)
  and only JavaScript changes trigger a reload.
- `loadRagConfig()` accepts a config file path as well as a directory and no
  longer logs to stdout.
- `LocalEmbedder` produced all-zero vectors for corpora of two or fewer
  documents (IDF is now smoothed).
- **Logger**: console-style calls such as `logger.error("Failed:", msg)` no
  longer log the message as one key per character.

### Changed

- **Documentation**: the README is rewritten with use cases whose code runs
  in CI (`__tests__/docs/readme-examples.test.js` executes every README
  example), and `.ragrc.json`'s JSON schema (`.ragrc.schema.json`, shipped in
  the package) now describes the `pipeline` + `plugins` format the CLI and
  `loadRagConfig()` actually use.
- **Metric changes**:
  - Context recall now measures how much of a reference (ground-truth) answer
    the retrieved documents support. Pass it via
    `PipelineEvaluator.evaluate(result, { referenceAnswer })` or
    `run({ options: { evaluate: true, referenceAnswer } })`. Without one,
    `scores.contextRecall` is omitted, `details.contextRecall` is
    `{ score: null, skipped: true, reason }`, and `metadata.metricsSkipped`
    lists it.
  - `computeGroundedness` is a weighted mean over the available components;
    without a reference it is `(0.4 * faithfulness + 0.3 * contextPrecision)
/ 0.7`.
  - Claim support checks numbers: a sentence whose numbers (digits, decimals,
    percentages, number words) are not in the source scores below 0.4 and is
    not grounded. This affects citations, faithfulness, recall,
    `PostGenerationGuard` and `SelfCritiqueChecker`. "20" equals "twenty".
- **`createRagPipeline`** results always include `answer` when an llm is
  configured.
- **`QueryPlanner`** splits only at clause or question boundaries, keeps
  "salt and pepper"-style phrases intact, and expands comparisons into one
  sub-query per entity plus the comparison; results carry `source`.
- **Prompts**: built-in connectors put retrieved context in the user message
  as delimited, untrusted reference data, with a system prompt telling the
  model to treat it as data. Answers may differ.
- **`PreRetrievalGuard`** returns the query unchanged (no partial deletion) and
  reports detections in `injection`; strict mode still blocks. Detection
  normalises input first. To cut false positives, bare "act as", "jailbreak",
  uppercase "DAN", mid-line "system:" and "you are now ready" are no longer
  flagged; chat role markers, prompt-exfiltration phrasing and normalisation
  bypasses now are.
- **`CostCalculator`** prices `gpt-4o-mini-*` and `claude-3-5-sonnet-*`
  correctly (previously gpt-4 pricing and $0); `customPricing` entries without
  `unit` default to per-1000 tokens. Built-in prices are marked unverified:
  their `asOf` is when they were added, not when they were checked.
- **`EmbeddingReranker`** limits concurrency to 4 by default; call
  `clearCache()` after retraining an embedder.
- **`AuditLogger`** with encryption enabled and no key now disables
  encryption with a warning instead of using a throwaway key.
- **Plugin trust store** is empty by default (the placeholder key is gone).
- **`docker compose`** requires `POSTGRES_PASSWORD`, `REDIS_PASSWORD` and
  `GRAFANA_ADMIN_PASSWORD`, publishes ports on 127.0.0.1 only, and drops the
  debugger port and the Prometheus lifecycle API; the image build fails on
  critical runtime vulnerabilities.
- **CI**: one `ci.yml` workflow (required checks `Test & Lint (18|20|22)`)
  that also enforces `format:check` and the tarball smoke test, and runs for
  pull requests into any branch. `npm test` runs Jest in parallel.
- **`DevServer`** now really listens: `start()` binds port 3000 by default
  (pass `port: 0` for a free port), so existing callers may see
  `EADDRINUSE`. Default host is `127.0.0.1` (was `localhost`), default
  `watchPaths` is `[]` (was `./src/plugins`, `./src/mocks`), and requests
  must use a loopback `Host` header while bound to loopback.
- **`loadRagConfig()`** error messages now include details
  (`Config validation failed: ...`, `Invalid JSON in config file <path>: ...`)
  and it no longer logs.
- **`rag-pipeline plugin` / `hub`** registry operations require
  `--registry <url>` or `RAG_PLUGIN_REGISTRY`. `hub certify submit` takes a
  local plugin path and reports computed scores; it previously issued
  certificates from fixed placeholder scores. `PluginHub.installPlugin()` now
  installs into `<project>/.rag/plugins` and registers the plugin in the
  config (it previously only wrote `metadata.json` to `localCacheDir`), and
  `getInstalledPlugins()` reads the config.
- **`FileVectorStore`** index files store mostly-zero vectors sparsely and
  round values to 7 significant digits (about 10x smaller for the `local`
  embedder).

- **Grounding scores** (citations, faithfulness, context precision/recall,
  groundedness, `PostGenerationGuard`, `SelfCritiqueChecker`) now measure the
  share of a sentence's content words found in a document, optionally
  IDF-weighted. They previously used Jaccard similarity against the whole
  document, which shrinks with document length: an answer copied verbatim
  from a ~70-word chunk scored 0. Scores will be noticeably higher for
  grounded answers.
- Default per-sentence similarity threshold raised from 0.3 to 0.5
  (`CitationTracker.similarityThreshold`, `PipelineEvaluator.threshold`,
  faithfulness/recall/hallucination-detector `threshold`). Aggregate
  thresholds (`groundednessThreshold`, `approvalThreshold`) are unchanged.
- The tokenizer keeps non-ASCII letters (`Política` no longer becomes
  `poltica`) and splits on newlines and hyphens instead of gluing words
  together. This also affects BM25, BLEU/ROUGE and the scoring reranker.
- `RetrievalGuard` with `enforceACL` now fails closed when
  `context.userPermissions` is missing.
- `CitationTracker.track()` non-array error message is now
  "retrievedDocs must be an array".

### Security

- Production dependencies: `npm audit --omit=dev` reports no high or critical
  findings (axios ^1.21.0; overrides for fast-uri, follow-redirects,
  form-data, ws and zod).
- Experimental SSO: the development bypass that accepted any authorization
  code requires `devBypass: true` and a non-production `NODE_ENV` and is
  refused in production; OIDC id_tokens are validated (JWKS signature, iss,
  aud, exp, nonce); OAuth2/OIDC use PKCE (S256); `redirect_uri` comes only
  from configuration; callbacks must match the stored login request's
  provider.
- Plugin signatures: Ed25519 verification works (`crypto.verify` with
  KeyObjects); a signed `contentDigest` binds plugin code and is always
  enforced when present.
- `AuditLogger` compares HMAC signatures in constant time; `JWTValidator`'s
  replay store is bounded and expires entries.
- Retrieved documents are no longer placed in the LLM system role; prompt
  injection detection normalises homoglyphs, leetspeak and zero-width
  characters.
- `.secrets` is no longer tracked in git (rotate anything it held) and is
  excluded from Docker builds.

### Known limitations

- Grounding is lexical plus a numeric-consistency check. Not checked:
  negation ("not twenty days"), units ("20 hours" vs "20 days"), ordinals, a
  lone "one", differently split decimals, and claims that combine facts from
  several documents. Document-side matching is lenient ("twenty-five" in a
  source also supports "twenty" or "five").
- The `openai` SDK stays on 4.x: newer majors need Node 20+ and will come with
  3.0. `csv-parse` has one moderate advisory whose fix is a major release.
- Experimental SSO cannot refresh OIDC sessions, and `SAMLProvider` refuses
  to authenticate.
- `AuditLogger`'s HMAC signing key is random per process unless `signingKey`
  is passed, so `verifyIntegrity` flags records written before a restart.

## [2.4.5] - 2026-04-19

### Changed

- **Supply chain**: first release published via GitHub Actions OIDC trusted
  publishing with `--provenance` attached. Tarball now ships with a SLSA
  build provenance attestation signed via Sigstore; consumers can verify
  the git-commit → tarball-bytes chain with `npm audit signatures`. No
  long-lived `NPM_TOKEN` involved.
- Publish workflow (`.github/workflows/release.yml`): switched from
  `NODE_AUTH_TOKEN` to OIDC, upgraded npm CLI to 11.5.1+ at job start,
  added `--provenance` and `--ignore-scripts` to the publish step.

No API, behavior, or documented-surface changes from 2.4.4.

## [2.4.4] - 2026-04-16

### Added

- **`BENCHMARKS.md`** (root, ships in tarball) — methodology-first
  benchmarks doc covering what we measure, what we don't, how to
  run the suite, environment disclosure template, JSON report schema,
  end-to-end harness template for benchmarking your own stack,
  interpretation guide (percentiles, throughput, memory), common
  pitfalls, and a CI regression pattern.
- **`SEMVER.md`** (root, ships in tarball) — API stability policy.
  Defines public surface, what counts as breaking, deprecation
  process (one-minor warning window minimum), supported runtimes,
  TypeScript and ESM/CJS commitments.
- **`docs-site/docs/Security-Capabilities.md`** — capability matrix
  distinguishing what's battle-tested (🟢) vs. recommended practice
  (🟡) vs. example code requiring hardening (🟠) vs. out of scope
  (🔴), across pre-retrieval, retrieval-time, and post-generation
  guardrails plus supply-chain, auth, logging, input validation, and
  data governance.
- **`docs-site/docs/Concepts-Core.md`**,
  `Concepts-Connectors.md`, `Concepts-Evaluation.md`,
  `Concepts-Guardrails.md` — four conceptual-module overviews mapped
  to a future `rag-core` / `rag-connectors` / `rag-eval` /
  `rag-guardrails` package boundary, so reviewers can reason about
  blast radius without us splitting the codebase.
- **`docs-site/docs/Comparison.md`** — honest comparison vs.
  LangChain.js and LlamaIndex.TS, including where we lose and a
  decision framework. Currency dated to April 2026.
- **`examples/fastify-rag-demo/`** — runnable end-to-end RAG service:
  Fastify 5 + OpenAI + in-memory retriever + 3-layer guardrails
  - citations + evaluation. Ships with Dockerfile, Fly.io `fly.toml`,
    Railway `railway.json`, ingest + smoke-test scripts, and a complete
    README. ~150 lines of `server.js`.
- **`examples/README.md`** — index of runnable examples with
  contribution guidance.

### Changed

- README "Documentation" section now links to BENCHMARKS, SECURITY,
  CHANGELOG (added in 2.4.3) plus SEMVER, the Security Capabilities
  matrix, the Comparison page, and the runnable demo.
- Sidebar adds two new categories: "Concepts" (4 pages) and a
  Comparison page under Overview. Security-Capabilities slotted under
  Enterprise.

## [2.4.3] - 2026-04-16

### Security

- **axios** upgraded from `1.8.4` → `1.15.0`, closing two critical advisories:
  - [GHSA-fvcv-3m26-pcqx](https://github.com/advisories/GHSA-fvcv-3m26-pcqx) — unrestricted cloud metadata exfiltration via header injection chain
  - [GHSA-3p68-rc4w-qgx5](https://github.com/advisories/GHSA-3p68-rc4w-qgx5) — SSRF via `NO_PROXY` hostname normalization bypass
- **follow-redirects** transitive patched for moderate auth-header leak on cross-domain redirects ([GHSA-r4q5-vmmm-2653](https://github.com/advisories/GHSA-r4q5-vmmm-2653))
- Supply-chain CI workflow now runs `npm audit` with `--omit=dev` and scopes the license allowlist to runtime deps — dev-only licenses no longer break the build, since they don't ship in the published tarball
- Added `Unlicense` and `CC-PDDC` to the license allowlist as legitimate public-domain dedications

### Added

- `SECURITY.md` — responsible-disclosure policy with triage SLAs and safe-harbor language
- `CHANGELOG.md` — this file

### Changed

- `package.json` description updated to match the new positioning: _"Composable RAG for Node.js — with built-in evaluation, citations, guardrails, and observability."_ (previously the long "comprehensive enterprise-grade toolkit" line)

## [2.4.2] - 2026-04-16

### Changed

- **License: GPL-3.0 → MIT.** Removes adoption friction for commercial and closed-source consumers.
- README repositioned around three core primitives — `pipeline`, `plugin`, `connector` — instead of export counts. New sections: _Who This Is For_, _Use Cases_ (Document Q&A with citations / internal knowledge assistant with evaluation / enterprise service with guardrails).
- Docs-site homepage code example switched from CommonJS `require()` to ESM `import`, matching the README and the package's dual-mode export.
- Docs-site stat cards replaced unverified "<200ms retrieval latency" with verifiable "MIT License" + "3 Core Primitives".
- Kubernetes deployment examples in `docs-site/docs/Deployment-Kubernetes.md` bumped from `2.3.1` to `2.4.2` (6 occurrences).
- Algolia DocSearch facet filter and docs version label updated to `2.4.2`.

## [2.4.1] - 2026-04-15

### Changed

- Complete README rewrite for professional npm.js rendering — concise structure, ASCII architecture diagram (replaces Mermaid, which npm.js does not render), 21 keywords for discoverability.
- Additional internal files excluded from the published tarball (`src/cli/plugin-marketplace-commands.js`, example folders).

## [2.4.0] - 2026-04-14

First public release on the 2.4 line, introducing the v2.4 feature set.

### Added

- **GraphRAG** — knowledge-graph construction with entity/relationship extraction and graph traversal retrieval.
- **Streaming embeddings** — SSE and WebSocket adapters with backpressure control.
- **Advanced reranking** — cascaded reranker combining BM25, embedding similarity, and LLM scoring.
- **Performance dashboard** — bottleneck detection, execution tracing, token and cost tracking, budget enforcement.
- **MCP integration** — expose pipelines as Model Context Protocol tools.
- **3-layer guardrails** — pre-retrieval (prompt-injection detection, topic filtering), retrieval-time (minimum relevance thresholds), post-generation (PII detection, groundedness enforcement).
- **Agentic RAG** — query planning, iterative retrieval, self-critique via DAG execution.
- **Citation tracker** — per-sentence source attribution with hallucination detection and groundedness scoring.
- **RAG evaluation harness** — faithfulness, relevance, context precision/recall, groundedness metrics.
- **Hybrid retriever** — vector + BM25 with Reciprocal Rank Fusion.
- **Five chunking strategies** — sentence, fixed-size, recursive, semantic, structure-aware.
- **Seven provider connectors** — OpenAI, Anthropic, Cohere, Ollama, Local TF-IDF embedder, in-memory retriever, and a plugin registry for custom providers.

### Infrastructure

- ESLint auto-fixes across `src/` (174 violations resolved).
- Docs site published at <https://devilsdev.github.io/rag-pipeline-utils/> with versioned docs.
- Dual-module build (CJS + ESM) via esbuild; TypeScript declarations auto-generated.
- 2050+ tests (unit + integration + contract) with zero production vulnerabilities at release time.

---

For release notes prior to v2.4.0, see
[github.com/DevilsDev/rag-pipeline-utils/releases](https://github.com/DevilsDev/rag-pipeline-utils/releases).

[2.6.2]: https://github.com/DevilsDev/rag-pipeline-utils/releases/tag/v2.6.2
[2.6.1]: https://github.com/DevilsDev/rag-pipeline-utils/releases/tag/v2.6.1
[2.6.0]: https://github.com/DevilsDev/rag-pipeline-utils/releases/tag/v2.6.0
[2.5.0]: https://github.com/DevilsDev/rag-pipeline-utils/releases/tag/v2.5.0
[2.4.5]: https://github.com/DevilsDev/rag-pipeline-utils/releases/tag/v2.4.5
[2.4.4]: https://github.com/DevilsDev/rag-pipeline-utils/releases/tag/v2.4.4
[2.4.3]: https://github.com/DevilsDev/rag-pipeline-utils/releases/tag/v2.4.3
[2.4.2]: https://github.com/DevilsDev/rag-pipeline-utils/releases/tag/v2.4.2
[2.4.1]: https://github.com/DevilsDev/rag-pipeline-utils/releases/tag/v2.4.1
[2.4.0]: https://github.com/DevilsDev/rag-pipeline-utils/releases/tag/v2.4.0
