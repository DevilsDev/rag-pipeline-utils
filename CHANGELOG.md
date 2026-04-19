# Changelog

All notable changes to this project are documented here.

This project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html)
and the [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) format.

Older history (pre-2.4.0) is preserved in the
[GitHub releases](https://github.com/DevilsDev/rag-pipeline-utils/releases)
page.

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
