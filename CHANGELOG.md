# Changelog

All notable changes to this project are documented here.

This project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html)
and the [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) format.

Older history (pre-2.4.0) is preserved in the
[GitHub releases](https://github.com/DevilsDev/rag-pipeline-utils/releases)
page.

## [Unreleased]

### Fixed

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
- **Logger**: console-style calls such as `logger.error("Failed:", msg)` no
  longer log the message as one key per character.

### Changed

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

### Known limitations

- Grounding remains lexical. A sentence that repeats a source with a wrong
  number ("thirty days" instead of "twenty") is still scored as grounded.

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

[2.4.5]: https://github.com/DevilsDev/rag-pipeline-utils/releases/tag/v2.4.5
[2.4.4]: https://github.com/DevilsDev/rag-pipeline-utils/releases/tag/v2.4.4
[2.4.3]: https://github.com/DevilsDev/rag-pipeline-utils/releases/tag/v2.4.3
[2.4.2]: https://github.com/DevilsDev/rag-pipeline-utils/releases/tag/v2.4.2
[2.4.1]: https://github.com/DevilsDev/rag-pipeline-utils/releases/tag/v2.4.1
[2.4.0]: https://github.com/DevilsDev/rag-pipeline-utils/releases/tag/v2.4.0
