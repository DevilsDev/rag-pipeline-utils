# Changelog

All notable changes to this project are documented here.

This project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html)
and the [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) format.

Older history (pre-2.4.0) is preserved in the
[GitHub releases](https://github.com/DevilsDev/rag-pipeline-utils/releases)
page.

## [3.8.2] - 2026-11-08

A patch release with security fixes.

### Security

- Fixed an access-control issue in `QdrantRetriever`, `PineconeRetriever`,
  `WeaviateRetriever` and `PgVectorRetriever`.
- Fixed an access-control issue in `HybridRetriever`.
- Fixed an issue in how `GuardrailsPipeline` checks streamed answers.
- Fixed an issue in what `GuardrailsPipeline` returns when it blocks an
  answer.
- Fixed an access-control issue in `GuardrailsPipeline` with custom
  pipelines.
- Fixed a signature-verification issue in how plugins configured in
  `.ragrc.json` are loaded.
- Fixed an issue in the `hub install` security scan and contract check.
- Fixed denial-of-service issues in `InjectionDetector`, the default PII
  patterns and answer scoring.
- Fixed a denial-of-service issue in `EntityExtractor`.
- Fixed a denial-of-service issue in plugin archive extraction.
- Fixed a denial-of-service issue in `@devilsdev/rag-mcp-server`'s tool
  inputs.
- Fixed a request-validation issue in `DevServer` when it is bound to all
  interfaces.
- Fixed an integrity-verification issue in `AuditLogger`.
- Fixed an access-control issue in `AuditLogger`'s tenant filters.

### Changed

- **Re-ingest documents with top-level access restrictions.**
  `QdrantRetriever`, `PineconeRetriever`, `WeaviateRetriever` and
  `PgVectorRetriever` now store a document's top-level `acl` and
  `requiredRole` (Pinecone, Weaviate and pgvector under the reserved
  metadata key `rag_access`). Documents stored by earlier versions were
  saved without them; re-ingest them. See
  [Do I need to re-ingest?](https://devilsdev.github.io/rag-pipeline-utils/docs/Security#do-i-need-to-re-ingest)
  to check a store. Thanks to a reader for suggesting this.
- **`HybridRetriever` keeps the restrictions of every copy of a document.**
  When two retrievers return the same document, the merged result requires
  every restriction any copy sets, which can hide documents that were
  visible before. The role `rag:no-access` is reserved: it restricts a
  document to no one, and a user's permissions never match it.
- **Blocked `GuardrailsPipeline` results carry no text.** A withheld result
  has no answer, an empty `guardrails.postGeneration.sanitizedOutput`, and
  guard summaries without the query, matched strings or document content.
- **`hub install` scans more and passes less.** The security scan now
  covers the package entry file whatever its extension and the files it
  loads by relative path, so some installs that passed before are blocked;
  the stage-contract check runs with only `PATH` (plus `SystemRoot` and
  `TEMP` on Windows) from your environment.
- **`hub certify` scans the entry file the same way as `hub install`.** Its
  security score now covers the package entry file whatever its extension,
  so some plugins score lower than before.
- **`GuardrailsPipeline` buffers streamed answers.** With
  `options.stream: true` and a post-generation guard, the answer is checked
  as a whole and released as one token chunk followed by the done chunk;
  buffering stops at the output guard's `maxResponseLength`, or 1,000,000
  characters when none is set.
- **`GuardrailsPipeline` withholds results the retrieval guard couldn't
  check.** When the wrapped pipeline neither calls `options.filterResults`
  nor returns `results`: with `enforceACL`, any successful result is
  withheld (`success: false`) in both modes; with only other retrieval
  checks, strict mode withholds it and non-strict mode returns it with
  `guardrails.retrieval.skipped` and a one-time warning.
- **Plugins configured in `.ragrc.json` are verified before they load.**
  When the shared `pluginRegistry` verifies signatures (by default when
  `NODE_ENV` is `production`), a configured plugin whose manifest fails
  verification is no longer loaded. An unsigned plugin still loads, with a
  one-time `RAG_PLUGIN_UNSIGNED` warning (refused with
  `requireSignedPlugins`); a signed manifest without a `contentDigest`, or
  with `contentDigest: null`, loads with a one-time
  `RAG_PLUGIN_NO_CONTENT_DIGEST` warning (refused with
  `requireContentDigest`).
- **Plugins from a JSON plugin config warn when unsigned.** The async loader
  for a JSON plugin config now emits the same one-time `RAG_PLUGIN_UNSIGNED`
  warning for a plugin without a manifest as the `.ragrc.json` loader does.
- **`@devilsdev/rag-mcp-server` limits tool inputs.** `check_answer`
  accepts an answer of up to 50,000 characters and up to 100 sources of up
  to 200,000 characters each; a `question` or `query` can be up to 10,000
  characters. Larger input is rejected with an error. It also rejects input
  that would take too long to check: more than 2,000,000 answer words ×
  source clauses, or more than 3,000,000 answer sentences × source
  characters. A check runs in a worker thread with at most 512 MB of heap,
  and one that takes longer than 10 seconds is stopped with an error; at
  most 2 checks run at once, up to 8 more wait, and further calls are
  refused until one finishes. Each limit can be raised with a CLI flag or
  environment variable (see the package README). `checkAnswer` itself is
  unchanged: its cost grows with the size of the answer and the sources, so
  cap untrusted input before checking it.
- **`DevServer` checks the `Host` header of loopback requests whatever it is
  bound to.** A server bound to `0.0.0.0` or `::` now refuses requests that
  arrive from a loopback address with a non-loopback `Host` header.
- **Plugin archives with a malformed extended (pax) header are refused.**
  `hub install` rejects the whole archive instead of reading it in part.
- **`AuditLogger` chains and verifies its records.** New records carry a
  sequence number, a link to the previous record, a `keyId` and a keyed
  hash over the whole record. `verifyIntegrity()` also returns
  `integrityBreaks`, `missingLogs`, `unchained`, `otherKey` and
  `secondWriter`; `tamperedLogs` has one entry per record, with `reason`
  and `reasons`; a missing signature is reported only for records written
  with signing on. Unreadable lines are reported instead of thrown, and
  `queryLogs()` returns their count as `skippedLines`.
- **`AuditLogger` stores a signing key when none is configured.** Without
  `signingKey` or `RAG_AUDIT_SIGNING_KEY`, a key is generated once and
  stored in `logDir/integrity/signing.key`, so records verify after a
  restart, with a one-time `RAG_AUDIT_NO_SIGNING_KEY` warning; it only
  detects accidental damage and casual edits. Records written with the
  stored key count as `otherKey` once you configure a key.
- **`AuditLogger` validates tenant filters.** `queryLogs()`,
  `verifyIntegrity()` and `generateComplianceReport()` throw a `TypeError`
  for a `tenantId` that is present but not a string, and no longer fall
  back to `_tenantId` when `tenantId` is present. A compliance report
  without a `tenantId` is deprecated: pass `allTenants: true` to cover
  every tenant.

## [3.8.1] - 2026-11-07

A patch release with security fixes.

### Security

- Fixed an access-control issue in `MemoryRetriever`, `FileVectorStore`
  and `BM25Search`.
- Fixed a signature-verification issue in `PluginSignatureVerifier`.
- Fixed an issue in how `DevServer` applies its default options.
- Fixed a request-validation issue in `DevServer`.
- Fixed an issue in how `DevServer` recognises loopback host names.
- Fixed a denial-of-service issue in `@devilsdev/rag-mcp-server`'s HTML
  indexing.
- Fixed an access-control issue in how `RetrievalGuard` reads user
  permissions.
- Fixed an access-control issue in how `RetrievalGuard` reads document
  restrictions.

### Changed

- **`RetrievalGuard` now requires every restriction a document sets.** A
  document can set `requiredRole` or `acl` at its top level, in `metadata`
  and on `doc`; access now requires meeting each one that is set (any one
  role of a list is enough for that list). This can hide documents that
  were visible before.

## [3.8.0] - 2026-11-06

A minor release with no breaking changes, about testing RAG in TypeScript.
`@devilsdev/rag-pipeline-utils/testing` now exports `RagMatchers`, so
`toBeGroundedIn`, `toCite` and `toContainNoPII` compile on Vitest's and
Jest's `expect`, with wrong arguments reported as type errors; until now
they didn't compile in TypeScript. A new guide, "Testing RAG in TypeScript",
builds a project around them from a runnable example. Releases now announce
themselves on GitHub Discussions, dev.to, Bluesky and Mastodon, and the
development dependencies lost 237 packages and 50 audit findings.

### Added

- **Typed matchers for TypeScript.** `@devilsdev/rag-pipeline-utils/testing`
  exports `RagMatchers`, the signatures of `toBeGroundedIn`, `toCite` and
  `toContainNoPII` on `expect`. Add them to Vitest's or Jest's `Matchers`
  in a declaration file and the matchers compile, with wrong arguments
  reported as type errors. Before, `expect(result).toBeGroundedIn()` didn't
  compile in TypeScript, and the declaration the Testing page suggested
  failed under Vitest 5 ("All declarations of 'Assertion' must have
  identical type parameters").
- **A "Testing RAG in TypeScript" guide**, built from
  `examples/testing-typescript`: Vitest with typed matchers, catching a
  wrong number with `checkAnswer`, and a test set scored by
  `rag-pipeline eval` in CI. A test keeps the guide's code identical to the
  example and runs the example's tests; consumer journey K installs the
  packed package with the latest Vitest and TypeScript and type-checks,
  tests and evaluates the example.

### Internal

- Automated dev.to posts are rejected if they contain `{{` or `{%`, which
  dev.to reads as Liquid.

- **Automated promotion** (`promotion/`, `scripts/promote/`, the Promote
  workflow). A published release announces itself in GitHub Discussions,
  on dev.to (the blog post, with its canonical URL), Bluesky and Mastodon,
  built from the release notes and blog post. A monthly Claude routine
  writes one dev.to article into `promotion/queue/` and the workflow
  publishes it; another records a monthly growth review on a GitHub issue.
  No one reviews the posts, so every one passes checks first: each number
  must appear in the files it came from, links must be https on an allowed
  host and live, the text must fit the channel, and a post recorded in the
  "Automated promotion log" issue is never published twice. dev.to can answer 500 and still create the
  article, so a retry first looks for one with the same title or
  canonical URL.
- **Dependency cleanup: `npm audit` findings in development tooling fell
  from 64 to 14, and none is high.** Eight OpenTelemetry SDK packages
  (`sdk-node`, `auto-instrumentations-node`, the Jaeger, Prometheus and
  OTLP exporters, `resources`, `sdk-metrics`, `semantic-conventions`)
  were dev dependencies of three modules nothing loads
  (`src/observability/telemetry.js`, `audit-logger.js` and
  `security-monitor.js`); the modules and the packages are removed, 237
  packages in all. `eslint-plugin-storybook` is removed too (no stories).
  The library's own OpenTelemetry support (`@opentelemetry/api`, an
  optional peer) is unchanged. The 14 left have no fix upstream:
  `deepmerge` (latest is vulnerable) through Jest and Docusaurus, and
  `minimatch` 10 inside TypeDoc, which crashes with 11. What you install
  from npm had none before and has none now.

## [3.7.1] - 2026-11-06

A patch release with no breaking changes: security fixes from a review of
every open code-scanning alert. `QueryPlanner` could take minutes on a
query with a long run of spaces; it now plans 200,000 characters in well
under a second. `rag-pipeline plugin install` and `rag-pipeline config set`
no longer let a crafted `__proto__` key write to `Object.prototype`. The
npm page has a new README.

### Changed

- **A new README on npm,** written for developers meeting the library for
  the first time: what it catches, two runnable examples, and what else is
  in the box.

### Fixed

- **Backslashes in the `eval` Markdown report are escaped,** so an error
  message with `\|` no longer splits a table cell.
- `QdrantRetriever` and the plugin hub strip trailing slashes from a URL in
  linear time.

### Security

- **`QueryPlanner` no longer slows to a halt on long runs of spaces.** Its
  clause patterns (the `;` and "and how" boundaries, and the "vs" and
  comparison patterns) tried every way to split a run of whitespace:
  4,000 spaces took 21 seconds, and the time grew with the cube of the
  length. Whitespace runs are now read as one space and the patterns can
  split a run only one way, so 200,000 characters of any shape plan in
  well under a second. `QueryPlanner` is exported from the main entry and
  `/edge` and is given user queries, so a long query could tie up a
  server. Found by CodeQL (`js/polynomial-redos`).
- **`rag-pipeline plugin install` rejects `"stage": "__proto__"`.** A
  plugin whose `package.json` set its stage to `__proto__` (or
  `constructor`) passed the stage check, and registering it wrote to
  `Object.prototype` in the CLI process. Only the stage names the
  installer knows are accepted now.
- **`rag-pipeline config set` ignores a `__proto__` key inside the value.**
  The key path was checked, but a value such as `{"__proto__": {}}`
  was merged into `Object.prototype`. The merge also
  recurses only into the config's own objects now.

### Internal

- Docker base images are pinned by digest, and Dependabot keeps the
  digests current; the development image no longer installs an unused
  `nodemon`.
- The Security and Supply Chain workflows are read-only by default; only
  the jobs that upload results or sign get `security-events` or
  `id-token`.
- The changelog script runs `git add` without a shell, and `dev-tools`
  clean handles every `*` in a pattern.
- JSDoc types match the 3.7 code (the TypeScript check of the JSDoc is
  back below 3.6.0's warning count).

## [3.7.0] - 2026-11-06

A minor release with no breaking changes, about more vector stores and
fewer wrong verdicts. `WeaviateRetriever` adds Weaviate, and
`PineconeRetriever` now works on indexes that embed text themselves, so a
pipeline, and the CLI's `ingest`, need no embedder there. The answer check
reads numbers with units as quantities ("2 kg" matches "2,000 grams",
"2 pounds" no longer passes against "2 kilograms"), fractions as
percentages and 12-hour times against clock times, and drops two false
alarms 3.6 added; grounding verdicts can change, so re-save the report
you compare against with `rag-pipeline eval --baseline`. The CLI says in
one line which API key is missing or refused. A DAG run with a timeout no
longer keeps the process alive, and the logger writes synchronously
without a process `exit` listener.

### Added

- **`WeaviateRetriever`**: a Weaviate collection as a vector store, over
  the REST and GraphQL APIs with the built-in `fetch` (no client package;
  on the edge build too). The first `store()` creates the collection for
  vectors you provide (`vectorizer: "none"`, cosine distance), or adds the
  properties it needs to one created elsewhere. Document ids become the
  same UUIDs `QdrantRetriever` uses, with the original id kept as
  `rag_id`; metadata is kept as JSON and `metadata.source` as an
  exact-match property for `removeBySource`. Scores are cosine similarity
  (1 minus Weaviate's distance). Batch imports that Weaviate answers with
  per-object errors fail with the reason, and a batch of another vector
  size is rejected before it is sent. It has the CLI's `size`, `list` and
  `removeBySource`, only touches objects it wrote, and `.ragrc.json` takes
  `"name": "weaviate"` (the URL from `config.url` or `WEAVIATE_URL`, the
  key only from `WEAVIATE_API_KEY`). It passes the retriever contract
  against an in-memory Weaviate in the unit tests and against Weaviate
  1.40.4 in the CI vector-store job, with pgvector and Qdrant.

- **`PineconeRetriever` on indexes that embed text themselves** (integrated
  embedding, such as the console's quick-start index with `chunk_text` and
  `llama-text-embed-v2`), which 3.6.0 refused. The retriever finds the
  embedded text field in the index description (or takes `textField`),
  sends each document's `content` in it, and searches by the query text
  with the Documents API's `embed` scoring, so documents need no vector
  and a pipeline needs no embedder: `createRagPipeline` passes the query
  text to the retriever when there is none. A request with only a vector,
  or a document without content, is refused with the reason before
  anything is sent. Upserts go in batches of up to 96 documents and under
  2 MB, Pinecone's limits for embedded fields. Freshness waits, `list`,
  `size`, `clear` and `removeBySource` work as on the other index kinds.
  An index with both a `dense_vector` field and an embedded text field
  still gets your vectors unless you pass `textField`. The retriever
  passes a text version of the retriever contract against the in-memory
  Pinecone (with a bag-of-words "model") and against a real
  integrated-embedding index (`npm run test:live`), and `.ragrc.json`
  takes `textField`.

- **The CLI with no embedder, on a retriever that embeds text itself.**
  When the retriever's `embedsText()` resolves `true` (`PineconeRetriever`
  on an integrated-embedding index), `.ragrc.json` needs no embedder
  stage: `rag-pipeline ingest` stores the chunks' text without computing
  vectors, `query`, `run`, `eval`, `ai search` and `ai benchmark` send the
  question's text, and `doctor` doesn't report a missing embedder. Other
  retrievers still need an embedder, with the same error as before.

- **Vector stores in workerd.** The edge check (`test/edge`) now runs
  `QdrantRetriever` and `PineconeRetriever` in the Workers runtime, from
  the packed package installed in a project of its own, on the main entry
  (with `nodejs_compat`) and on `/edge` (without): store, retrieve, list,
  size, delete, `removeBySource` and `clear`, against stateful fake Qdrant
  and Pinecone APIs (Pinecone's document and vector indexes, with its log
  sequence numbers, so the retriever's wait for its own writes runs too).
  The results, and the ids sent to each store (sha256 of the document ids,
  including non-ASCII and multi-block ones), must equal the Node.js build's.
  No library change was needed.

- **A draft blog post for every release.** Publishing a GitHub release
  runs `.github/workflows/release-blog.yml`. It drafts the post from the
  version's CHANGELOG section, or `release-notes/v<version>.md` when that
  exists, and opens a pull request from `blog/v<version>` for review. A
  patch gets a shorter post. It skips prereleases and any version that
  already has a post, so hand-written posts are kept, and the workflow
  can also be run by hand with a version. `scripts/generate-release-note.js`
  (`npm run release:tag`) is rewritten to do the drafting. The old script
  needed a config file that no longer exists, built the post from commit
  messages and pushed to `main`. The new one writes valid Docusaurus MDX:
  braces and `<` outside code are escaped, and relative links point at the
  release tag on GitHub.

### Changed

- **The CLI says which API key is missing or refused, in one line.**
  Without a key, `query`, `run`, `ingest`, `eval` and `generate-dataset`
  print `no Anthropic API key. Set ANTHROPIC_API_KEY and run the command
again.` (they suggested the `apiKey` option, which is for library code).
  With a refused key they print `Anthropic rejected the API key (401
authentication_error: invalid x-api-key). Check ANTHROPIC_API_KEY.`, and
  the same for OpenAI (`OPENAI_API_KEY`) and Cohere (`COHERE_API_KEY`).
  The part of the key OpenAI echoes in its 401 is redacted. `eval` and
  `generate-dataset` say it once, instead of a failure per case or a skip
  reason per chunk, and `generate-dataset` then writes no empty file.
  An error no command handles prints one line instead of a stack trace;
  `--verbose` adds the stack, with keys redacted. The library's own
  messages are unchanged; key errors now also carry `provider` (and
  `envVar` when the key is missing), and OpenAIConnector's HTTP errors
  carry `provider` and `envVar`.

- **Grounding verdicts can change** for `checkAnswer`, `verifyCitations`,
  `CitationTracker`, `PostGenerationGuard` and the judge's failure
  classification, because of the fixes below. Re-save the report you pass
  to `rag-pipeline eval --baseline` after upgrading.

### Fixed

- **Packaging: package.json in the form npm publishes.** At the 3.6.0
  publish npm auto-corrected the root package.json (the `rag-pipeline`
  bin path `./bin/cli.js`, and the plain https `repository.url`) and the
  scoped packages' (the repository URL, copied from the root by
  `scripts/build-packages.js`). The bin path is now `bin/cli.js` and the
  repository URL `git+https://github.com/DevilsDev/rag-pipeline-utils.git`,
  so `npm publish` has nothing to correct in any of the seven packages. A
  test runs `npm pkg fix` on each published package.json and fails if it
  would change anything.

- **DAG timeouts no longer keep the process alive.** A `DAGEngine` run (and
  so `AgenticPipeline`, which runs one) with a `timeout` left its timer
  pending after the run finished, holding the process open for up to the
  full timeout (60 seconds by default in `AgenticPipeline`). The timer is
  now cleared when the run settles.

- **The logger adds no process `exit` listener.** It now writes JSON to
  stdout synchronously instead of through pino's asynchronous stream, which
  registered an `exit` flush hook for every copy of the module; under Jest
  (a fresh copy per test file) these piled up into
  `MaxListenersExceededWarning`. Lines are also no longer lost on
  `process.exit()`. Pretty printing (`LOG_PRETTY=true`) is unchanged.

- **Units, fractions and times in the answer check.** A number with a unit
  is checked as a quantity, converted exactly within its kind (mass,
  length, durations from seconds to weeks, months and years): "2 kg"
  matches "2,000 grams" and "90 minutes" matches "one and a half hours",
  while "2 pounds" no longer passes against "2 kilograms", or "3 weeks"
  against "3 days". "Three quarters of", "half of" and "a third of" read
  as 75%, 50% and 33% (a bare "half" is not a number), "5 pm" and "9 to 5"
  match 17:00 and 9:00 to 17:00 when the source states clock times, and a
  footnote marker after a year ("1992.1 It ...") no longer hides the year.
  A month is not converted to days. A quantity in a unit the source doesn't
  state falls back to the plain number check, as before.

- **Two false alarms from the 3.6 clause rule:** a clause that continues
  the first clause's subject ("The drug lowered blood pressure but did not
  reduce mortality") now supports "The drug did not reduce mortality", and
  an opening framing clause ("Based on these results, ...") no longer fails
  a claim whose statement matches.
  On the project-written dev cases (`__tests__/fixtures/lexical-checks/`,
  the 3.7 ones committed before the change), correct claims passing went
  from 32/47 to 46/47 and real mismatches caught from 40/45 to 45/45 (51
  cases now, with the regression cases added later: 50/51 and 45/45).

  On the published sets, re-run from the cached Claude responses (see
  "3.6.0 and 3.7 compared" on the Benchmarks page): every SciFact citation
  claim the check flagged was already hand-reviewed, false alarms went from
  43 to 35 across five models with the 3 real problems still caught, and the
  citation benchmark's number mutations are caught as before. RAGTruth
  sentences wrongly flagged went from 1,474 to 1,467 and misses from 108 to
  109; HaluEval doesn't change. The first run on the frozen code found three
  regressions in Yelp answers (hours written "7:0-23:0", "up to 8 people"
  and "at 11 W ..." read as times, "seven days a week" as a duration the
  source doesn't state); they were fixed, with project-written cases first,
  and the sets were run once more.

### Internal

- The test suite exits on its own: no forced worker exit, no
  `MaxListenersExceededWarning`, and no fake-timer warnings from the plugin
  hub tests.

## [3.6.0] - 2026-11-05

A minor release with no breaking changes, about getting started and fewer
false alarms. `npm create rag-pipeline` scaffolds a working app with
Next.js and the AI SDK, Mastra or Cloudflare Workers. `PineconeRetriever`
adds Pinecone, on both its document and vector indexes. The main entry
now works in a deployed Cloudflare Worker: on 3.2.0 to 3.5.0 it failed
there, so if you deploy to Workers, upgrade. The lexical answer check
raises fewer false alarms (hand-reviewed on the SciFact citations: 78 to
43, with every real problem still caught), so grounding verdicts can
change: re-save the report you compare against with `rag-pipeline eval
--baseline`. The MCP server is listed in the official MCP Registry.

### Added

- **`PineconeRetriever`**: a Pinecone serverless index as a vector store,
  over the REST API with the built-in `fetch` (no client package; on the
  edge build too). It works with both kinds of index, read from the index
  description: document indexes (what Pinecone creates now) through the
  Documents API, and vector indexes through the vectors API; an index that
  embeds text itself is refused with the reason. It owns a namespace, keeps
  content and metadata in Pinecone's flat metadata, and waits for its own
  writes to be indexed before reading, using Pinecone's log sequence
  numbers, so a query right after `store()` sees them. It has the CLI's
  `size`, `list` and `removeBySource`, and `.ragrc.json` takes
  `"name": "pinecone"` (the key only from `PINECONE_API_KEY`). It passes
  the retriever contract against an eventually consistent in-memory
  Pinecone of both kinds in CI, and against real indexes of both kinds;
  `examples/openai-pinecone` uses it instead of its own adapter.
- **Starter templates: `npm create rag-pipeline`** (the new
  `create-rag-pipeline` package). `--template next` is a Next.js app with
  any AI SDK model wrapped in `groundingMiddleware`; `mastra` is a Mastra
  agent with a document-search tool, the groundedness scorer and
  guardrails; `workers` is a Cloudflare Worker on the `/edge` build, with
  streaming. Each answers from a folder of documents, returns its sources
  and a grounding check, and runs without an API key, returning the
  matching passages. CI scaffolds, builds and runs each one against the
  current build (`npm run test:templates`); `--live` runs them with Claude.
- **An MCP Registry entry for `@devilsdev/rag-mcp-server`**
  (`packages/rag-mcp-server/server.json`, `io.github.DevilsDev/rag-mcp-server`),
  kept at the release version by `npm version`, for `mcp-publisher publish`.

- **Consumer journeys** (`npm run test:consumer`): eleven developer journeys
  against the packed package and the live Claude API, run before a
  release (they found the API-key leak fixed in 3.5.0).
- **A record of the project's Claude API use**: the live suite and the
  journeys log each call's usage (no content), and `npm run claude:usage`
  builds the "Claude API calls behind these numbers" tables on the
  Benchmarks page from those ledgers and the benchmarks' response cache.

### Changed

- **Grounding verdicts can change** for `checkAnswer`, `verifyCitations`,
  `CitationTracker`, `PostGenerationGuard` and the LLM judge's failure
  classification, because of the fixes below. Re-save the report you pass
  to `rag-pipeline eval --baseline` (run once with `--output`) after
  upgrading, so the regression gate compares like with like.

### Fixed

- **The main entry in a deployed Cloudflare Worker** (broken since 3.2.0).
  Installed from npm, `import ... from "@devilsdev/rag-pipeline-utils"`
  crashed when the Worker started (`index.mjs` loads the CommonJS build
  with `createRequire`, which workerd can't do), and a project without
  `openai` or `@opentelemetry/api` failed to bundle. The package now
  points Wrangler at the CommonJS build (a `workerd` export condition, in
  the scoped packages too), and those optional peers are required so a
  bundle without them builds. CI aliased the package to its CommonJS build
  in a checkout that has both peers, which hid both; `test/edge` now also
  installs the packed tarballs into a project of its own and runs the
  example from there. On 3.2.0 to 3.5.0, import
  `@devilsdev/rag-pipeline-utils/edge` in Workers instead.

- **Fewer lexical false alarms** (found by the Claude benchmarks). On the
  project-written dev cases (`__tests__/fixtures/lexical-checks/`,
  committed before the change), correct claims passing went from 12/37
  to 27/37 and real mismatches caught from 23/36 to 32/36 (78 cases now,
  with the identifier and new-pattern cases added later: 28/40 and 35/39):

  - a negation in a clause the claim leaves out ("binds to the receptor
    but does not activate it" supports "binds to the receptor") no longer
    fails the claim;
  - a sentence with two negated clauses ("the trial was not blinded, and it
    did not report side effects") is no longer read as positive, and
    "nunca ... ni" counts once;
  - reference numbers ("Document 3", "Table 2") are no longer compared as
    facts, and identifiers ("kinesin-8", "IL-2") are compared whole;
  - month names and numeric dates match ("12 May 2019" vs "12/05/2019" or
    "2019-05-12");
  - German, Spanish and French negation words count;
  - and mismatches the check used to miss: a negated clause in a sentence
    whose other clause matches, and a wrong month.

  On the published sets, re-run from the cached Claude responses (see
  "3.5.0 and 3.6 compared" on the Benchmarks page): RAGTruth sentences
  wrongly flagged fell from 1,633 to 1,474 (misses 107 to 108), and with a
  Claude judge by about a quarter, with a few more misses; answer-level
  scores barely move (RAGTruth F1 0.691 to 0.688, HaluEval precision 0.861
  to 0.887 with recall 0.544 to 0.536), because an answer stays flagged
  while any of its sentences is. Hand review of every SciFact citation
  claim flagged: false alarms 78 to 43 across five models, real problems
  caught 3 to 3. The first run on the frozen code found identifiers
  passing with a different number ("IL-2" for "IL-3"); that was fixed, with
  project-written cases first, and the sets were run once more.

  New false alarms from the clause rule, found by that review: a claim
  whose subject the source names only in its other, positive clause
  ("the drug was not better than the combined therapy" against "the drug
  was better than placebo, but was not better than the combined
  therapy"), and a claim whose framing clause ("Based on these results,
  ...") has no negation. Still missed: unit conversion ("2 kg" vs "2,000
  grams") and the same number with a different unit, "three quarters" vs
  75%, 12- vs 24-hour times, and a footnote marker glued to a year.

## [3.5.0] - 2026-11-05

A minor release with no breaking changes, about checks you can measure and
see, and a security fix: upgrade if you use `AnthropicConnector`,
`CohereConnector` or `OllamaConnector`, whose errors carried the API key.
The guards take your own injection and PII detectors, and
`rag-pipeline eval-guardrails` measures them; the built-in patterns' precision
and recall are published on public test sets, low recall included.
Evaluation scores become OpenTelemetry events on the spans they judge and
Langfuse scores. `verifyCitations()` checks that the passages Claude or
OpenAI file search cite support the sentences citing them.
`AnthropicConnector` works with current Claude models: on 3.4.0 the judge
failed on all of them but Haiku 4.5, and `generate()` could return
`undefined`. One telemetry change follows the GenAI conventions: the
retrieval span is now named `retrieval`.

### Security

- **Connector errors no longer carry the API key.** `AnthropicConnector`,
  `CohereConnector` and `OllamaConnector` rethrew axios errors, which keep
  the request config, headers included: `console.error(err)` or a logger
  that serializes errors printed the key (`x-api-key` or the bearer token)
  for any failed call, such as a wrong key, an unknown model or a network
  error, including from `checkAnswer({ judge })`. Errors are now plain
  `Error`s with `status`, `code` and `response: { status, statusText,
headers, data }` and no request config; a streamed request's error body
  is read and the stream dropped. The message now includes the API's own
  explanation: `Anthropic API error 401: authentication_error: invalid
x-api-key` instead of `Request failed with status code 401`. Found by
  the consumer journeys. `OpenAIConnector` uses the OpenAI SDK, whose
  errors don't carry the key.

### Added

- **Claude benchmarks** on the Benchmarks page: `checkAnswer` on RAGTruth
  (a balanced sample for five Claude models as the judge, the full test
  split for three), HaluEval, three runs to measure run-to-run variation
  and 136 project-written edge cases (`benchmarks/judge.js`,
  `benchmarks/judge-more.js`); `verifyCitations` on Claude's own citations
  over SciFact abstracts, with a hand review, mutations and 48 edge cases
  (`benchmarks/claude-citations.js`); and answer latency through
  `createRagPipeline` (`benchmarks/claude-latency.js`). Every API response
  is cached, so the tables rebuild without calling the API.

- **Pluggable guard detectors.** `PreRetrievalGuard`, `RetrievalGuard`
  and `PostGenerationGuard` take `detectors`: objects `{ name, kind:
'injection' | 'pii', detect(text, context) }`, such as an
  injection classifier or a PII service, run with the built-in patterns or, with
  `builtIn: false`, instead of them. Async detectors run through the new
  `checkAsync()` and `filterAsync()`, which `GuardrailsPipeline`,
  `groundingMiddleware` and `createMastraGuardrails` (`injection: {
detectors }`, `piiDetectors`) now use; the sync `check()` and
  `filter()` throw a `TypeError` for an async detector instead of
  skipping it. A detector that throws blocks by default
  (`onDetectorError: 'skip'` to ignore it), and each gets the request's
  `AbortSignal` in `context.signal` (`checkAsync(text, { signal })`;
  `GuardrailsPipeline` and the middleware pass theirs). `RetrievalGuard`
  runs detectors in its injection scan, so it requires
  `detectInjection: true` with them. What a PII detector finds is
  redacted from the answer and from text copied from it (citations,
  evaluation details, the middleware's report); the matched text stays
  out of the guard result's JSON, and `detectedText(result)` passes it to
  `redact(text, matches)`. `patternInjectionDetector()` and
  `patternPIIDetector()` are the built-in checks as detectors, and
  `runContractTests("detector", ...)` checks your own. Without
  `detectors`, every guard returns what it did before.
- **Measured guardrails.** `rag-pipeline eval-guardrails <cases.jsonl>`
  runs injection and PII detectors over labelled cases (`{ kind, text,
flagged }`, or PII `spans` scored by overlap) and reports precision,
  recall, F1, the confusion counts and a 95% interval per detector and
  per tag, as JSON (`--output`) and Markdown or HTML (`--report`). It
  loads your detectors with `--detectors <module>`, and exits 1 when a
  detector throws or a `--min detector.metric=value` is not met. From
  code: `evaluateDetectors()`, `detectorVerdict()` and
  `renderDetectorReport()`. The Benchmarks page publishes the numbers
  for the built-in patterns and the
  `protectai/deberta-v3-base-prompt-injection-v2` classifier on the
  deepset/prompt-injections and jackhhao/jailbreak-classification test
  splits, Gretel's synthetic PII documents and a new pack of RAG attack
  fixtures (`benchmarks/guardrails.js`, run in the Benchmarks workflow).
  The patterns miss most injections, which is the case for a detector.
  `RetrievalGuard`'s ACL filter gets correctness tests over every
  combination of restriction and permissions.
- **Scores in OpenTelemetry and Langfuse.** With `telemetry` on and
  `evaluate` or `citations` in a run, each score is emitted as a
  `gen_ai.evaluation.result` event (a log record, per the GenAI semantic
  conventions), parented to the span it judges: `chat` for faithfulness,
  relevance, groundedness and `citationCoverage`, `retrieval` for context
  precision and recall. Events use the logs API of `@opentelemetry/api`
  1.10+; with SDKs that register their LoggerProvider through
  `@opentelemetry/api-logs`, pass it as `telemetry: { logs }` (or a
  `{ logger }`). There is no new dependency, and without a logs API the
  events are skipped. The run result carries its ids in
  `result.telemetry` (`traceId`, `spanId`, `spans.retrieval`,
  `spans.generation`), and `toLangfuseScores(result)` turns its scores
  (or a `checkAnswer()` result's) into `langfuse.score.create()` objects
  attached to the trace and the observation each judges; without a trace
  id they are Langfuse experiment evaluations. `evaluationScores(result)`
  returns them as a plain list. Langfuse is not a dependency.
- **Verify provider citations.** `fromAnthropicCitations(message, {
documents })` and `fromOpenAIFileCitations(response)` normalise the
  citations of a Claude message (every citation type carries
  `cited_text`) or an OpenAI Responses API response with file search
  (the passages come from `file_search_call.results`, which need
  `include: ["file_search_call.results"]`), and `verifyCitations()`
  checks each claim against the passages it cites with `checkAnswer`'s
  overlap, number and negation checks and the optional judge, which may
  only name a passage the claim cites. It reports `verified`, each
  claim's verdict (`supported`, `unsupported` or `unverifiable`) and
  reason, each citation's score, and the sentences no citation covers.

### Changed

- The retrieval span is named `retrieval` with kind internal, as the
  GenAI conventions define it (it was `retrieval <data source>`, kind
  client). The data source is still in `gen_ai.data_source.id`. Only
  pgvector and Qdrant spans change name; dashboards that match on the old
  name need updating.

### Fixed

- **TypeScript with `@types/node` 25 or later.** The generated
  declarations said `extends EventEmitter<[never]>` (48 files), which
  `@types/node` 25+ rejects (TS2344), so a strict project without
  `skipLibCheck` didn't compile. They now say `extends EventEmitter`, and
  the pack smoke test also compiles against the latest `@types/node`.
- **`CostTracker` estimates input tokens from everything the model reads**
  (the query, the retrieved passages and the prompt around them) when a
  result carries no usage; it counted only the query, about 25 times too
  few on a three-passage run. `result.cost.tokensEstimated` says when the
  counts are estimated, and `result.cost.requestedModel` gives the model
  the run asked for next to `model`, the price-table entry
  (`claude-haiku-4-5` is priced as `claude-haiku-4.5`).
- A strict `GuardrailsPipeline` block says why: `error` is
  `"Post-generation guard flagged output: PII detected (email): 1
occurrence(s); ..."` (the same start as before, then the guard's issues,
  which name kinds and counts, never the PII).

- **`AnthropicConnector` works with current Claude models** (found by the
  Claude benchmarks, confirmed live):
  - Claude 4.7 and later reject any temperature but the default with
    HTTP 400. The LLM judge asks for temperature 0, so `checkAnswer`,
    `verifyCitations` and the middleware's `judge` failed on Haiku 5.5,
    Sonnet 5.5 (the connector's default), Opus 5.5 and Fable 5.1. A request
    a model rejects for `temperature` is now sent again without it, once
    per model, with a `RAG_ANTHROPIC_TEMPERATURE` warning.
  - `generate()` returned `content[0].text`, which is `undefined` when the
    model thinks first (`[thinking, text]`, most replies from Haiku 5.5 and
    Opus 5.5) and threw a `TypeError` on a refusal. It now returns every
    text block, and a reply with no text rejects with `code:
"MODEL_REFUSED"` or `"NO_TEXT"` and a message that says why.
  - `generateWithUsage(query, context, options)` resolves `{ text, usage
}`; the judge uses it when an LLM has it, so `check.judge.usage` is
    filled with Claude. `generate()` still resolves a string.
- `verifyCitations` reports `refused: true` (and is never `verified`)
  for a Claude message with `stop_reason: "refusal"`;
  `fromAnthropicCitations` passes the `stopReason` through.
- `CostCalculator`, `CostTracker` and `createModelRouter` price Claude
  Haiku 5.5 ($0.10 / $0.50 per million input / output tokens, prompts up
  to 100k tokens) and Claude Fable 5.1 ($10 / $50); they were reported as
  costing 0, with a warning. Found by the live Claude tests.
- `@devilsdev/rag-mcp-server`: its package.json is in the form npm
  publishes (`bin` without `./`, a `git+https` repository URL), so
  publishing no longer prints "npm auto-corrected some errors".

### Documentation

- The README's LLM quick start starts with Claude (`AnthropicConnector`
  with `LocalEmbedder`, since Anthropic has no embeddings API), then
  OpenAI; the guardrails use case says that `strict: true` blocks rather
  than redacts; the Usage page explains the optional result fields in
  TypeScript; the middleware example defines its retriever and embedder;
  Observability gives a local in-memory setup and which OpenTelemetry
  line has the logs API. From the consumer journeys.

## [3.4.0] - 2026-11-04

A minor release with no breaking changes. An optional LLM judge closes
the paraphrase gap in the answer check without giving up its guarantees:
it only sees sentences that failed for lack of shared words, and it never
overturns a wrong number or a negation. `@devilsdev/rag-mcp-server` serves
a folder of documents to Claude and other MCP clients, with search and
answer checks, offline. The npm page gets a short README of its own.

### Added

- **Opt-in LLM judge for paraphrases.** `checkAnswer({ ..., judge: llm })`
  asks any LLM with this library's `generate()` contract to rule on the
  sentences the lexical check failed for lack of word overlap, such as a
  correct paraphrase, in one call per answer. The deterministic check runs
  first and stays the default: without `judge` the result and its shape
  are unchanged. The judge never overturns a sentence that failed because
  a number doesn't match its source or because it is negated where its
  source is not, and a "supported" verdict counts only when it names a
  source that passes the number and negation checks against the sentence.
  Sources and sentences go to the judge as delimited, untrusted data;
  output that isn't the expected JSON verdicts keeps a sentence
  unsupported. `check.judge` lists a verdict per sentence (`verdict`,
  `sourceId`, `reason`, `lexicalReason`, `decidedBy: "lexical" | "judge"`),
  the number of calls and, when the LLM result carries `usage`, the summed
  token usage; `grounded`, `groundedness` and `unsupported` combine both
  checks. `PipelineEvaluator`, the CLI, the test matchers and the Mastra
  scorers stay deterministic.
- **The LLM judge in the AI SDK middleware.** `groundingMiddleware({
retriever, judge })` passes `judge` to the answer check, and the report
  in `providerMetadata.ragPipeline` gains `judge` (the verdicts, calls and
  usage), for `generateText` and `streamText`. A judge that throws, such as
  on a rate limit, doesn't fail the call: the answer is returned, its
  sentences stay unsupported and `judge.error` says why. With the
  post-generation guard, PII is redacted from the verdicts too. Give the
  judge the base model, not the wrapped one. A judge for the CLI is not in
  this release.
- `@devilsdev/rag-mcp-server`, an installable MCP server:
  `npx @devilsdev/rag-mcp-server ./docs` indexes the Markdown, HTML, CSV
  and text files in a folder with the offline TF-IDF embedder and serves
  two tools over stdio. `search_documents({ query, topK? })` returns
  passages with id, source, score and text;
  `check_answer({ answer, question?, sources? })` runs `checkAnswer`
  against the sources given,
  or against passages retrieved for the question and answer, and returns
  `grounded`, `groundedness`, the unsupported sentences and citations.
  Options: `--top-k` and `--embedder local`. It depends on
  `@devilsdev/rag-core`, `-connectors` and `-eval`, versioned in lockstep;
  the MCP SDK is not a dependency of the main package. The release
  workflow publishes it after the main package. `examples/mcp-server`
  stays as the starting point for building your own server.

### Documentation

- **A short README for npm.** The package page on npmjs.com now shows a
  page of about 110 lines: what the library does, `checkAnswer`, an offline
  pipeline, what's included, the packages and links. The full README moved
  to `.github/README.md`, which GitHub shows on the repository page, so
  GitHub is unchanged. Both READMEs' examples run in the docs tests, and
  both keep absolute links.
- **Run the README use cases on StackBlitz.** Ten of the README's use
  cases link to a script in `examples/use-cases` that opens and runs on
  StackBlitz with no install or API key: six are the README's code as is,
  and the AI SDK, guardrails, token budget and timeout examples use a mock
  or stand-in model. `check-your-answer.js` checks an answer and sources
  you paste in. A test runs every script and fails when one drifts from
  its README block. Multi-part questions and fully local runs need a real
  model, so they have no link.
- Roadmap: a growth goal of 10,000 npm downloads a month by May 2027,
  with the baseline, how progress is measured, the reasons to choose the
  library in the order to lead with them, a three-phase plan, and a row
  for each new adoption item (integration listings, StackBlitz links, a
  testing guide, observability recipes, template galleries, a monthly
  review).

## [3.3.0] - 2026-11-04

A minor release with no breaking changes. Grounding now catches answers
that negate their source, and the checks come to the tools you already
use: `groundingMiddleware` for the Vercel AI SDK, `toBeGroundedIn` and
other matchers for Jest and Vitest, and scorers and a guardrails
processor for Mastra. The comparison drops LlamaIndex.TS, which is
deprecated, and adds a guide for moving off it.

### Added

- **Mastra adapters.** `createMastraScorer({ createScorer, metric })` turns
  groundedness, faithfulness, context precision or context recall into a
  Mastra scorer that makes no model calls; by default it scores against
  what the agent's tool calls returned. `createMastraGuardrails()` is a
  Mastra processor that aborts the run on prompt injection in the user's
  message and redacts PII from the answer (or aborts, with
  `pii: "block"`). Mastra is not a dependency.

- **`groundingMiddleware`** for the Vercel AI SDK: wrap any model with
  `wrapLanguageModel({ model, middleware: groundingMiddleware({ retriever }) })`
  and each `generateText` or `streamText` call retrieves passages for the
  last user message (embedder, retriever, reranker, `topK`,
  `maxContextTokens`), gives them to the model as untrusted reference data,
  checks the answer with `checkAnswer` and returns the report as
  `providerMetadata.ragPipeline` and the passages as `sources`. The
  pre-retrieval, retrieval (ACL, injection in documents) and
  post-generation (PII) guards are options; with `strict`, a flagged query
  or answer throws `GroundingBlockedError`. Per-request `query`, `topK` and
  ACL `context` go in `providerOptions.ragPipeline`. Tested against AI SDK 6
  and 7; the AI SDK is not a dependency.

- **Matchers for Jest and Vitest** in `/testing`: `expect.extend(ragMatchers)`
  adds `toBeGroundedIn(sources?)`, `toCite(ids, sources?)` and
  `toContainNoPII()`. They take an answer or a `pipeline.run()` result
  (whose `results` are the default sources), read sources in every shape
  `checkAnswer` accepts, and list the unsupported sentences, missing
  citations or PII found when they fail.

### Fixed

- **Grounding ignored negation.** `checkAnswer`, `CitationTracker`,
  `computeFaithfulness`, `computeContextRecall` and the post-generation
  guard grounded "Full-time employees never receive paid vacation" against
  a source saying they receive twenty days, because the negation was one
  word among many. A sentence that is negated where the closest sentence of
  its source is not, or the reverse, now scores below 0.4 and is not
  grounded. The check is exported as `checkPolarityConsistency`. It looks
  for negation words, so a source that negates in other words ("contractors
  are excluded") no longer supports a negated sentence, and answers can
  score lower than before.

### Security

- Dev, docs-site and edge-test dependencies updated (lockfile refresh,
  `sharp` ^0.35.5, and npm `overrides` for `serialize-javascript`, `uuid`,
  `minimatch`, `undici`), which closes 88 of the open Dependabot alerts. The
  published package is unaffected: its `dependencies` ranges did not change and
  `npm audit --omit=dev` still reports 0 vulnerabilities.

### Documentation

- Comparison: LlamaIndex.TS is marked deprecated (its repository is
  archived), and Mastra and the Vercel AI SDK are compared, with how to use
  them together with this library, in the README, on the Comparison page
  and on the docs homepage. A new page, "Coming from LlamaIndex.TS", maps
  its documents, indexes, query engines, rerankers and evaluators to this
  library. The README mentions the retrieval guard's scan of retrieved
  documents for injection (`detectInjection`).
- README: the comparison table mentions the scoped packages, the `run()`
  result shape includes `route` and `timing`, and the examples list
  includes the Cloudflare Worker and the MCP server.
- Issue templates for bug reports, feature requests and plugin
  submissions, links to Discussions and the security policy for questions
  and vulnerabilities, a pull request checklist that replaces the old
  release-only one, and a Community plugins section on the Plugins page.
- Roadmap: the 3.3 and 3.4 plan (`.github/PLAN-3.3.md`), based on a scan of
  comparable npm packages, with a row for each item.

## [3.2.0] - 2026-11-03

A minor release with no breaking changes. It adds OpenTelemetry spans,
time to first token, cost-aware model routing, Cloudflare Workers and a
`/edge` entry without Node.js APIs, and splits the library into four
packages (`@devilsdev/rag-core`, `-connectors`, `-eval`, `-guardrails`)
that this package re-exports. Installs are 15 MB smaller.

### Added

- **OpenTelemetry spans.** `createRagPipeline({ telemetry: true })`
  records each run as a `rag.pipeline.run` span with a child span per
  stage call (`embeddings <model>`, `retrieval <data source>`, `rerank`,
  `chat <model>`), nested under the caller's active span and named after
  the OpenTelemetry GenAI semantic conventions. Spans carry counts,
  durations, models, cache outcomes and packing; query text and documents
  only with `recordContent: true`. Failed stages, `{ success: false }`
  runs, timeouts and aborts set ERROR status, and streamed answers end
  their spans when the stream does. `@opentelemetry/api` is a new
  optional peer dependency (`>=1.0.0 <2`), loaded only when telemetry is
  configured; without it, `telemetry` fails at `createRagPipeline` with
  `MISSING_DEPENDENCY`.

- **An MCP server example** (`examples/mcp-server`): a `search_documents`
  tool for Claude Desktop, Claude Code and other MCP clients, served over
  stdio with the official MCP SDK. It searches the index `rag-pipeline
ingest` builds and returns passages with their sources, offline and
  without an API key; its test drives it through a real MCP client. The
  docs no longer describe `MCPServer` as plugging into MCP clients on its
  own: it builds tool definitions and handles calls, and needs a transport
  such as this example's.

- **Time to first token.** A streamed answer's done chunk carries
  `timing: { firstTokenMs, totalMs }`, measured from the call to `run()`,
  so the first-token time includes retrieval and reranking: the wait the
  user sees. Non-streamed results carry `timing: { totalMs }`. With
  `telemetry`, the `chat` span records `gen_ai.response.time_to_first_chunk`
  (seconds, the OpenTelemetry GenAI attribute) and the run span
  `rag.time_to_first_token_ms`. In the CLI, `query --streaming --trace`
  prints the first-token time and `ai benchmark --streaming` reports its
  p50 and p95 (`stages.firstToken` in `--json`). Code that compares whole
  chunks or results with deep equality will see the new `timing` field.

- **Cloudflare Workers.** The pipeline runs on Workers with the
  `nodejs_compat` flag: retrieval, generation and streaming, citations,
  evaluation, caching, `QdrantRetriever` and the Anthropic, Ollama and
  OpenAI connectors. A new `examples/cloudflare-worker` answers from
  bundled documents as JSON or server-sent events. CI runs it and a probe
  of the library in workerd, the Workers runtime, on every change
  (`test/edge`). See the new Cloudflare Workers deployment page for what
  doesn't work there (files, the CLI, the plugin sandbox) and for Vercel.

- **Cost-aware model routing.** `createModelRouter({ routes })` is an
  llm that sends each query to the cheapest model suited to it: a
  classifier (`classifyQuery` by default, or your own `classify`) puts the
  query in a class, and among the routes that handle that class it picks
  the lowest estimated cost for this query's prompt and expected answer.
  Prices come from `CostCalculator` or per-route `pricing`; a route with no
  price is an error rather than free. Runs report `route: { class, model,
estimatedCost }`, also on the stream's done chunk, as `rag.route.*`
  span attributes and in the `chat` span's name. `fallback: true` retries
  failures on the next cheapest route. `CostTracker` prices routed runs at
  the chosen model, and `CostCalculator` adds Claude Haiku 4.5 and Claude
  Opus 5.5 list prices.
- **Routing from `.ragrc.json`.** The `router` llm configures
  `createModelRouter` for the CLI: its `routes` are llm entries (`name`,
  `config`, `handles`, `model`, `pricing`), with `fallback` and
  `expectedOutputTokens`. `.ragrc.schema.json` describes it. `query --trace`
  prints the chosen model, class and estimated cost, `--json` adds `route`,
  and `--stats` prices the run at the chosen model.

- **`@devilsdev/rag-pipeline-utils/edge`.** The library without Node.js
  APIs, as one ES module, for Vercel Edge Functions, Cloudflare Workers
  without `nodejs_compat`, Deno and Netlify Edge Functions. It has the
  pipeline, connectors (Anthropic, Cohere, Ollama, the AI SDK adapter),
  `MemoryRetriever`, `QdrantRetriever`, routing, grounding, guardrails and
  evaluation; it leaves out files, `.ragrc.json`, `PgVectorRetriever`,
  `OpenAIConnector` and the CLI. Cache keys and Qdrant point ids are the
  same as on Node.js. CI runs it in workerd with no Node.js compatibility.
- **`telemetry: { api }`** passes the `@opentelemetry/api` module to
  `createRagPipeline`, for `/edge`, which cannot load it itself.

- **Scoped packages.** `@devilsdev/rag-core` (`createRagPipeline`,
  retrieval, reranking, caching, costs and routing),
  `@devilsdev/rag-connectors`, `@devilsdev/rag-eval` and
  `@devilsdev/rag-guardrails`, for installing only what you use: `rag-eval`
  alone installs about 6 MB. `@devilsdev/rag-pipeline-utils` depends on the
  four and re-exports them, so its objects are theirs (`instanceof` holds
  across them); its API does not change. All five release together, at
  the same version.

### Changed

- **A smaller install: 15 MB and 51 packages less.** The `rag-pipeline`
  CLI now runs from a bundle (`dist/cli.cjs`), like the library, so the
  package no longer ships `src/` (373 files to 165). The bundle includes
  the CLI's prompts, spinner, colours, tables and argument parser
  (`inquirer`, `ora`, `chalk`, `cli-table3`, `commander`), which are no
  longer installed as dependencies, and the unused `ajv-formats` is
  dropped: installing the package goes from 48 MB to 33 MB. The package
  itself stays about 3.4 MB unpacked. Their license notices ship in
  `dist/cli.cjs.LICENSES.txt`. Nothing changes for users: the package's
  `exports` map never allowed imports from `src/`, and every CLI command
  behaves the same.

### Fixed

- TypeScript: under `strict`, `MemoryRetriever`, `FileVectorStore`,
  `QdrantRetriever`, `PgVectorRetriever`, `ScoringReranker`,
  `EmbeddingReranker`, `CascadeReranker` and the new `createModelRouter`
  were rejected as `createRagPipeline` components, because their declared
  types disagreed with the plugin contracts. Their declarations now match
  (retrievers take an optional `queryVector`, rerankers return the
  documents they were given with `relevanceScore`), and the retriever
  contract's `store()` takes documents with a `vector`. Nothing changes at
  runtime.
- `AnthropicConnector.generateStream` and `OllamaConnector.generateStream`
  decode streamed bytes as UTF-8 across chunk boundaries, so a character
  split between two network chunks is no longer garbled; they also read
  web `ReadableStream` bodies, which on Workers previously streamed
  nothing.
- `QdrantRetriever` calls the global `fetch` correctly on Workers, which
  rejected it with "Illegal invocation".
- The optional `openai` and `@opentelemetry/api` packages load inside
  bundles (Wrangler, esbuild, webpack). The `require.resolve` check used
  before reported them missing there even when they were bundled. A module
  missing inside them is still reported as is.
- A run with `citations` no longer fails when the model returns an empty
  answer: citations are skipped, as for a retrieval-only run.

## [3.1.1] - 2026-10-31

A patch for the npm package page. No code changes.

### Changed

- **The README opens with the install command and a runnable example**,
  followed by "Why this library", whose points now include the evaluation
  CLI and Action, the PostgreSQL/pgvector and Qdrant stores, contract
  tests and context packing. The optional peer dependencies are listed
  under Installation, and the capabilities and comparison tables cover
  3.1.
- **Every README link is absolute**, so links to SEMVER.md, CHANGELOG.md,
  SECURITY.md, LICENSE, the examples and the contributing guide work on
  npmjs.com. A test keeps links absolute, images on https and in-page
  anchors pointing at headings.
- **The README's images are pinned to the release in the published
  package.** On GitHub they still load from `main`; `npm pack` rewrites
  them to the version's tag and restores them afterwards, so each
  version's npm page shows its own images.
- **The banner says Node.js ≥ 22** (it said 18).
- `package.json`: `homepage` is the documentation site (it was the GitHub
  README), and the keywords add pgvector, qdrant, vector-database,
  rag-evaluation, llm-evaluation and context-window.

## [3.1.0] - 2026-10-31

Two additions for building on the library; no breaking changes.

### Added

- **Contract tests for plugins.** `runContractTests(type, factory)` from
  `@devilsdev/rag-pipeline-utils/testing` registers tests for the
  behaviour `createRagPipeline` relies on from a loader, embedder,
  retriever, reranker or LLM: return types and shapes, vector lengths,
  ranking and `topK`, streaming chunks, and one query through a real
  pipeline. The checks use `node:assert`, so they run in Jest, Vitest,
  Mocha or `node:test` (pass `{ describe, it }` where they aren't
  globals). `checkContract` runs the same checks without a test framework
  and returns a report. Options: `registry` (also require register()'s
  metadata), `setup` (load test documents into a retriever without
  `store()`) and `name`.
- **Context packing to a token budget.** `run({ options: {
maxContextTokens } })` fits the documents the LLM sees into a token
  budget, after filtering and reranking: it keeps the best-ranked
  documents that fit, skipping ones that don't, and cuts the top document
  at a word boundary when it alone is too long. `result.results` is then
  the packed list (so citations and evaluation score what the model saw)
  and `result.packing` lists what was kept, dropped and cut; a stream's
  last chunk carries it too. `countTokens` plugs in a real tokenizer
  (default: about four characters per token). The same logic is exported
  as `packContext(documents, { maxTokens, countTokens, truncate })`. Cut
  documents are copies, so cached retrieval results stay whole.

## [3.0.2] - 2026-10-31

### Security

- **`csv-parse` ^7.0.3** (was `^5.6.0`), for
  [GHSA-8cw4-87c7-c6xx](https://github.com/advisories/GHSA-8cw4-87c7-c6xx),
  prototype replacement through the `columns` option, which the CSV
  loader uses. With the loader's options CSV values are strings, so a
  `__proto__` column header could not replace a prototype; it only dropped
  that column from the indexed text, which 3.0.2 keeps. The loader's
  output is otherwise unchanged, and `npm audit --omit=dev` reports no
  vulnerabilities.

### Changed

- **The README shows `rag-pipeline eval` in a recorded demo**: a test set
  passes, then a change that makes answers stop using the documents fails
  against the saved baseline and exits 1.
- Repository files (not part of the npm package):
  - The root `Dockerfile`'s default stage is now an image of the
    `rag-pipeline` CLI. It used to run `--help` behind a health check on a port nothing
    served, and its label said Apache-2.0; the project is MIT.
  - `deployment/kubernetes` and `deployment/helm` deploy your image of
    `examples/fastify-rag-demo` instead of an image that was never
    published, and the Helm chart has templates. See
    `deployment/README.md`.
  - The unused 2025 React dashboard in `public/` and its `server.js` are
    removed, and build-time dependencies of the docs site are updated
    (tinypool, minimatch, yaml, qs).

## [3.0.1] - 2026-10-30

A patch for problems found while auditing the documentation against
3.0.0. No API changes.

### Security

- **`PluginHub` and `PluginCertification` sent requests to an unregistered
  domain by default.** Without a `registryUrl` they used
  `https://registry.rag-pipeline.dev`, a domain the project doesn't control
  (`rag-pipeline.dev` was not registered when checked on 2026-10-30), so
  whoever registered it would receive their requests: `PluginHub` attached
  `RAG_PLUGIN_HUB_API_KEY` as a Bearer token and posted usage analytics
  (search queries, plugin ids) once a minute whenever there were any, and `PluginCertification`
  posted certification submissions. There is no default registry now: pass
  `registryUrl` or set `RAG_PLUGIN_REGISTRY`, as the `rag-pipeline hub` CLI
  already required. Without one, requests reject with
  `NO_PLUGIN_REGISTRY` and nothing is sent. Certificate and badge links are
  built from the configured registry.

### Fixed

- **`AuditLogger.verifyIntegrity()` could check no logs and still report
  `verified: true`.** Daily files are named by their UTC date, but the
  files in a date range were found by stepping one local day at a time
  from 1970. In timezones ahead of UTC with daylight saving the steps
  drifted onto the previous UTC day, so today's file was never opened.
  `queryLogs()` used the same code and could miss records. Files are now
  matched by their UTC date from a directory listing, which also replaces
  about 20,000 file checks per call.
- **`AnthropicConnector` failed with its default settings.** Its default
  model, `claude-3-5-sonnet-20241022`, was retired by Anthropic on
  2025-10-28. The default is now `claude-sonnet-5-5`, Anthropic's listed
  replacement. Claude 4.7 and later models accept only the API's default
  temperature, so the connector's default `temperature` is now that value
  (1) and is left out of the request; an explicit `temperature` is still
  sent. Answers were sampled at 0.7 before; pass `temperature: 0.7` to keep
  that on models that accept it. `CostCalculator` prices
  `claude-sonnet-5-5`.
- **`new PluginSandbox()` threw `PluginSignatureVerifier is not a
constructor`** (experimental). It constructs again; `execute()` is still
  not functional.
- **`wrapError` left `{reason}` in messages.** Templates such as
  `PIPELINE_EXECUTION_FAILED` end in `{reason}`; it is now filled from the
  wrapped error's message unless the context gives one.
- `PluginHub`'s `User-Agent` reported version 2.1.8; it now reports the
  installed version.

## [3.0.0] - 2026-10-30

A major release that removes what 2.x deprecated and changes the runtime
requirements. The pipeline API, plugin contracts, configuration files and
CLI commands are unchanged. See
[Upgrading to v3.0.0](https://devilsdev.github.io/rag-pipeline-utils/docs/Migration#upgrading-to-v300)
for the steps.

### Changed

- **Breaking: Node.js 22 or later is required** (`engines.node >= 22`).
  Node 18 and 20 have reached end of life; CI tests Node 22 and 24. Stay
  on 2.x to run on Node 18 or 20.
- **`PluginSandbox` needs `isolated-vm` 6 or later** (the optional peer
  dependency was `>=5.0.0`). isolated-vm 5 doesn't build on Node 24.
- **The `openai` SDK is now 7.x** (was `^4.93`). `OpenAIConnector`'s
  options and results are unchanged. openai 7 uses Node's built-in `fetch`
  and has no dependencies of its own, so 11 packages leave the install
  tree.
- **Breaking: `openai` is an optional peer dependency.** Install it
  yourself to use `OpenAIConnector`: `npm install openai` (4.93 or later;
  CI tests 7.x). Without it, the connector's methods reject with code
  `MISSING_DEPENDENCY` and an install hint, and `rag-pipeline init` with
  the openai template prints the install step. A clean install drops from
  58 MB and 188 packages (2.7.1) to 47 MB and 172 packages. Optional peers
  are now always left out of the bundle.

### Removed

- **Breaking: the experimental classes are no longer exported from the
  main entry.** Import them from `@devilsdev/rag-pipeline-utils/experimental`
  instead, as 2.5.0 to 2.7.x already allowed: `ModelTrainingOrchestrator`,
  `FederatedLearningCoordinator`, `MultiModalProcessor`,
  `AdaptiveRetrievalEngine`, `SSOManager`, `SAMLProvider`, `OAuth2Provider`,
  `ActiveDirectoryProvider`, `OIDCProvider`, `TenantManager`,
  `ResourceMonitor`, `DataGovernanceManager` / `DataGovernance`,
  `PluginSandbox` and `PluginCertification`. Their `RAG_DEP_*` deprecation
  warnings are gone with them, and importing the package no longer loads
  these modules. Their pages in the generated API reference are removed;
  [Experimental modules](https://devilsdev.github.io/rag-pipeline-utils/docs/Experimental)
  describes them.
- **Breaking (TypeScript only): the type declarations deprecated in 2.7.0
  are removed.** `LoadConfigOptions`, `LLMResponse`, `DAGNode`, `DAGOptions`,
  `ErrorFormatter`, `EvalResult` and `Document.embedding` didn't describe
  what the code reads or returns. Use a path for `loadConfig`, return the
  answer text from `generate()`, store embeddings as `Document.vector`, and
  see the `DAG`, `createError` / `wrapError` and `evaluateRagDataset`
  declarations.

### Fixed

- **Connector retries missed network failures.** The openai SDK's
  connection errors keep `name: "Error"`, so `APIConnectionError` and
  `APIConnectionTimeoutError` were never retried; with openai 7 a refused
  connection wasn't retried either, because the socket error code sits one
  level deeper in `error.cause`. `isRetryableError` now matches the error
  class and walks the cause chain.

## [2.7.1] - 2026-10-30

### Fixed

- **`metrics.MetricsRegistry`'s `getOrCreateCounter`, `getOrCreateHistogram`
  and `getOrCreateGauge` returned a metric of another type** when its name
  was taken, so a later call such as `.inc()` failed far from the cause.
  They now throw a `TypeError` naming the name and both types.
- **`pipelineMetrics` lost errors and could misreport active operations.**
  `recordError` counted only the types `plugin` and `stage` in
  `errors.total` and `errors.byType`; every type is now counted.
  `operationsActive` is now a `Gauge`, so it goes down with `dec()`.
- **An empty `Histogram`'s `getStatistics()` reported `min: Infinity` and
  `max: -Infinity`**; they are now `null`, which is also what JSON showed.
- **`createError` gave 14 error codes the "unknown error" message**, among
  them `NETWORK_TIMEOUT`, `FS_READ_ERROR`, `DAG_EXECUTION_FAILED` and
  `AUTH_INSUFFICIENT_PERMISSIONS`. Every code now has its own message and
  suggestions, and a suggestion whose placeholder has no value in the
  context is left out rather than shown as `{name}`.
- `eventLogger.EventTypes` and `EventSeverity` now include `STAGE_END`,
  `MEMORY_WARNING` and `WARN`, the values `PipelineEventLogger` already
  records. The recorded values don't change.

## [2.7.0] - 2026-10-30

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
  Every release from 2.0.0 to 2.6.1 declared
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

[3.4.0]: https://github.com/DevilsDev/rag-pipeline-utils/releases/tag/v3.4.0
[3.3.0]: https://github.com/DevilsDev/rag-pipeline-utils/releases/tag/v3.3.0
[3.2.0]: https://github.com/DevilsDev/rag-pipeline-utils/releases/tag/v3.2.0
[3.1.1]: https://github.com/DevilsDev/rag-pipeline-utils/releases/tag/v3.1.1
[3.1.0]: https://github.com/DevilsDev/rag-pipeline-utils/releases/tag/v3.1.0
[3.0.2]: https://github.com/DevilsDev/rag-pipeline-utils/releases/tag/v3.0.2
[3.0.1]: https://github.com/DevilsDev/rag-pipeline-utils/releases/tag/v3.0.1
[3.0.0]: https://github.com/DevilsDev/rag-pipeline-utils/releases/tag/v3.0.0
[2.7.1]: https://github.com/DevilsDev/rag-pipeline-utils/releases/tag/v2.7.1
[2.7.0]: https://github.com/DevilsDev/rag-pipeline-utils/releases/tag/v2.7.0
[2.6.2]: https://github.com/DevilsDev/rag-pipeline-utils/releases/tag/v2.6.2
[2.6.1]: https://github.com/DevilsDev/rag-pipeline-utils/releases/tag/v2.6.1
[2.6.0]: https://github.com/DevilsDev/rag-pipeline-utils/releases/tag/v2.6.0
[2.5.0]: https://github.com/DevilsDev/rag-pipeline-utils/releases/tag/v2.5.0
[2.4.5]: https://github.com/DevilsDev/rag-pipeline-utils/releases/tag/v2.4.5
[2.4.4]: https://github.com/DevilsDev/rag-pipeline-utils/releases/tag/v2.4.4
[2.4.3]: https://github.com/DevilsDev/rag-pipeline-utils/releases/tag/v2.4.3
[2.4.2]: https://github.com/DevilsDev/rag-pipeline-utils/releases/tag/v2.4.2
[2.4.1]: https://www.npmjs.com/package/@devilsdev/rag-pipeline-utils/v/2.4.1
[2.4.0]: https://www.npmjs.com/package/@devilsdev/rag-pipeline-utils/v/2.4.0
