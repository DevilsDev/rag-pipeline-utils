# v3.0 — Planning & Scoping

> **Status**: planning. No code yet. Updated 2026-10-29 after 2.6.2; see
> [ROADMAP-REVIEW.md](ROADMAP-REVIEW.md) for the reasoning behind the changes.
> This document defines what v3.0
> is, what it isn't, and the order in which the work should land. The
> intent is that any contributor (or future-me) can read this doc cold
> and know what to build, in what order, and how to know it's done.

## Headline

**v3.0 is the major where we (a) split into scoped packages, (b) remove the deprecated experimental classes from the main entry, (c) drop Node 18 support, (d) upgrade the `openai` SDK, and (e) shrink the install. Intelligent caching ships first, in 2.6.0, and becomes part of the 3.0 baseline. We keep the name.**

Patch and minor releases on the 2.x line continue in parallel until v3.0 is in beta.

## What's in scope

| Item                                                                                                                           | Effort                                        | Risk   | Decision                                                                                |
| ------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------- | ------ | --------------------------------------------------------------------------------------- |
| **Intelligent caching** (embedding / retrieval / generation caches)                                                            | 2–3 days focused                              | Low    | Shipped in **v2.6.0** (2026-10-29), soaking in 2.x before 3.0                           |
| **Monorepo split** into `@devilsdev/rag-core`, `@devilsdev/rag-connectors`, `@devilsdev/rag-eval`, `@devilsdev/rag-guardrails` | 2–3 weeks                                     | High   | Build second — defines the v3.0 surface                                                 |
| **Drop Node.js 18** (require ≥ 20)                                                                                             | 0.5 day                                       | Low    | Land with the major bump — Node 18 EOL since April 2025                                 |
| **Rename decision** (keep `rag-pipeline-utils` vs. rename to `composable-rag` or similar)                                      | 0 days for the decision, 2 days for execution | Medium | See "Rename decision" section — strongly leaning **keep the name** with a tagline shift |
| **OIDC publishing for sub-packages**                                                                                           | 0.5 day per sub-package                       | Low    | Reuse the established v2.4.5 release.yml pattern                                        |
| **Migration guide**                                                                                                            | 1 day                                         | Low    | Required deliverable per [SEMVER policy](../SEMVER.md)                                  |
| **Remove deprecated experimental classes from the main entry** (15 classes; they stay under `/experimental`)                   | 0.5 day                                       | Low    | Added 2026-10-29. Allowed because 2.5.0 shipped one-time deprecation warnings           |
| **`openai` SDK major upgrade**                                                                                                 | 1 day                                         | Medium | Added 2026-10-29. The next major needs Node 20+, so it lands with the Node 18 drop      |
| **Smaller install**: provider SDKs become optional peer dependencies, CLI-only dependencies move to `@devilsdev/rag-cli`       | 2 days                                        | Medium | Added 2026-10-29. The 2.5.0 install is 188 packages / 57 MB; breaking, so major only    |

## What's NOT in scope

These have been considered and explicitly deferred:

- **Native Rust bindings for hot paths** — Cool, but the hot paths in a RAG pipeline are network-bound (embedder/LLM API calls), not CPU-bound. Rust bindings would speed up the wrong thing. Revisit only if benchmarks identify a real CPU bottleneck.
- **Kubernetes operator** — Out of scope for a library. Belongs in a separate `rag-pipeline-operator` repo if anyone wants to build it.
- **Edge-runtime deployment** (Cloudflare Workers, Vercel Edge) — Possible but requires careful audit of every dependency for V8-isolate compatibility. Could be a v3.x minor after v3.0 ships.
- **Built-in vector store** — Bring-your-own-store is the explicit design. Adding our own would compete with Pinecone/Weaviate/Qdrant/pgvector, which we don't want. (`FileVectorStore`, added in 2.5.0, is a local JSON index for the CLI and small projects, not a hosted or scalable store, so it does not change this. First-party connectors to real stores (pgvector, Qdrant, Pinecone) are planned for 2.7.0.)
- **Web UI / no-code builder** — Not a library concern.
- **Python port** — Not happening. Use the Python ecosystem's existing tools.

## Intelligent caching — design

### Three cache layers

```
┌─────────────────────────────────────────────────────────────────┐
│                  Pipeline.run({ query })                         │
└──────────────────┬──────────────────────────────────────────────┘
                   │
                   ▼
┌──────────────────────────────────┐
│  1. Embedding cache              │  Key: hash(text + model + dims)
│     (per chunk being embedded)   │  TTL: 30 days default
│     Hit → skip embedder call     │  Eviction: LRU + max-size
└──────────────┬───────────────────┘
               ▼
┌──────────────────────────────────┐
│  2. Retrieval-result cache       │  Key: hash(query + top_k + filters
│     (per query fingerprint)      │            + retriever_state_id)
│     Hit → skip retriever call    │  TTL: 1 hour default (corpus
└──────────────┬───────────────────┘            mutates more often)
               ▼
┌──────────────────────────────────┐
│  3. Generation cache             │  Key: hash(prompt + context_hash
│     (per prompt+context hash)    │            + model + temperature)
│     Hit → skip LLM call          │  TTL: 24 hours default
└──────────────────────────────────┘  Disabled when temperature > 0
```

### Public API design

```js
import { createRagPipeline, RedisCache, MemoryCache } from "@devilsdev/rag-pipeline-utils";

const pipeline = createRagPipeline({
  retriever: ...,
  llm: ...,
  cache: {
    embeddings: new RedisCache({ url: process.env.REDIS_URL, ttl: 30 * 24 * 3600 }),
    retrieval:  new MemoryCache({ maxEntries: 1000, ttl: 3600 }),
    generation: false,  // explicitly disabled
  },
});
```

Or the simplest case:

```js
const pipeline = createRagPipeline({
  retriever: ...,
  llm: ...,
  cache: true,  // turn on all 3 with sensible defaults (in-memory)
});
```

### Cache backend contract

```ts
interface CacheBackend {
  get(key: string): Promise<unknown | undefined>;
  set(
    key: string,
    value: unknown,
    opts?: { ttlSeconds?: number },
  ): Promise<void>;
  delete(key: string): Promise<void>;
  // Optional: stats for observability
  stats?(): Promise<{ hits: number; misses: number; size: number }>;
}
```

Ship `MemoryCache` and `RedisCache` in the box. Adapter contracts let users plug Memcached / DynamoDB / etc.

### Acceptance criteria

- [ ] Three new cache classes (`MemoryCache`, `RedisCache`, abstract `CacheBackend`)
- [ ] Pipeline integration: cache check before embedder/retriever/LLM, cache write after
- [ ] Per-layer enable/disable + TTL configuration
- [ ] Cache-hit metrics surfaced via existing `performance-monitor`
- [ ] Integration test: re-running an identical query hits cache in all 3 layers
- [ ] Integration test: invalidation when corpus changes (retrieval cache key includes retriever state)
- [ ] Documentation page: `docs-site/docs/Caching.md` with the diagram + decision tree
- [ ] CHANGELOG entry framing this as the user-visible win of the release

### Land it as v2.6.0 first

Caching is additive — opt-in via `cache:` config. Ship as `v2.6.0` and let it soak for a few weeks before declaring it part of the v3.0 baseline. This de-risks the v3.0 release.

Two requirements added after 2.5.0:

- Cache keys include every run option that changes the result, including guardrail and ACL context such as `userPermissions`, so one user's results are never served to another.
- Results are stored only when a run succeeded and was not aborted or timed out.

## Monorepo split — design

### The four packages

| Package                     | Surface                                                                                                       | Depends on |
| --------------------------- | ------------------------------------------------------------------------------------------------------------- | ---------- |
| `@devilsdev/rag-core`       | `createRagPipeline`, plugin registry, contracts, DAG engine, retry policies, structured logger                | (none)     |
| `@devilsdev/rag-connectors` | Embedders (OpenAI, Cohere, TF-IDF), retrievers (Memory), LLMs (OpenAI, Anthropic, Ollama), loaders, rerankers | `rag-core` |
| `@devilsdev/rag-eval`       | `PipelineEvaluator`, `CitationTracker`, `computeGroundedness`, judge primitives                               | `rag-core` |
| `@devilsdev/rag-guardrails` | `GuardrailsPipeline`, injection detection, PII, classifier hooks                                              | `rag-core` |

The current `@devilsdev/rag-pipeline-utils` becomes a **meta-package** that re-exports from all four — preserving the existing import path for backward compatibility through the v3.x line. Deprecation warning for the meta-package added in v3.x, removal in v4.0.

### Migration impact for users

- Default users (`import { createRagPipeline } from "@devilsdev/rag-pipeline-utils"`) — **zero change**, the meta-package still works
- Tree-shaking-conscious users can switch to direct imports: `import { createRagPipeline } from "@devilsdev/rag-core"` — smaller bundle
- Plugin authors using the contracts can import from `@devilsdev/rag-core/contracts` for a tighter dep

### Tooling

- Use **pnpm workspaces** for the monorepo (npm workspaces work but pnpm has better hoisting for our dep mix)
- **Changesets** for versioning across the 4 sub-packages plus the meta-package
- Each sub-package gets its own `release.yml` derived from the v2.4.5 OIDC pattern
- Each sub-package gets its own Trusted Publisher entry on npmjs.com

### Repository structure (proposed)

```
rag-pipeline-utils/                ← repo root (keeps the name)
├── packages/
│   ├── core/                      ← @devilsdev/rag-core
│   │   ├── src/
│   │   ├── contracts/
│   │   ├── package.json
│   │   ├── README.md
│   │   ├── CHANGELOG.md
│   │   └── SEMVER.md (symlink to /SEMVER.md)
│   ├── connectors/                ← @devilsdev/rag-connectors
│   ├── eval/                      ← @devilsdev/rag-eval
│   ├── guardrails/                ← @devilsdev/rag-guardrails
│   └── meta/                      ← @devilsdev/rag-pipeline-utils (re-exports)
├── examples/                       ← shared examples, updated to use sub-packages
├── docs-site/                      ← shared, navigates by sub-package
├── BENCHMARKS.md
├── SECURITY.md
├── SEMVER.md
├── LICENSE                         ← MIT, single root
└── pnpm-workspace.yaml
```

### Acceptance criteria

- [ ] `pnpm install` from a fresh clone produces a working dev environment
- [ ] All four sub-packages publish independently via OIDC
- [ ] Meta-package re-exports verified via integration test (existing imports work)
- [ ] Each sub-package's bundle is genuinely smaller than the current monolith (measure with `bundlephobia`)
- [ ] CHANGELOG entries on each sub-package distinct, not duplicated
- [ ] Migration guide (`docs-site/docs/Migration-v2-to-v3.md`) covers both "do nothing" and "switch to direct imports" paths
- [ ] All existing tests pass against the new package boundaries

## Drop Node 18 — the easy one

```diff
  "engines": {
-   "node": ">=18"
+   "node": ">=20"
  }
```

Node 18 hit end-of-life on **April 30, 2025**. By the time v3.0 ships, that's at least a year past EOL. Anyone still on 18 has bigger problems than this package.

Land this with the v3.0 commit. Mention in CHANGELOG. Update SEMVER.md "Supported runtime" line.

## Rename decision

### The case for renaming

- "utils" still suggests "small toolkit" not "production framework", which the repositioning addressed in the README but not in the package name itself
- Possible rename targets: `composable-rag`, `rag-platform`, `nodejs-rag`

### The case for keeping `rag-pipeline-utils`

- v2.4.x has shipped, has download history, has reviews, has the npm SEO. Renaming resets all of that to zero.
- The reviews that flagged "utils" framing were satisfied by the README repositioning and the `description` change. The package name itself was never the loudest signal.
- A rename forces every consumer to change their `package.json` — that's friction we'd be charging users for our marketing benefit
- npm reserves package names; if `composable-rag` ever becomes available we can claim it as an alias without renaming the canonical package

### Recommendation

**Keep the name. Don't rename in v3.0.**

The energy a rename would consume (re-publishing under a new name, deprecating the old, updating every doc/blog/external link) is better spent on the monorepo split and intelligent caching, both of which deliver actual user value.

If we ever go through a major repositioning that warrants a rename (e.g. expanding scope beyond RAG), revisit then.

## Sequencing

```
NOW                                   ┐
├── v2.5.0 — Shipped 2026-10-28 (fixes, CLI, /experimental)
├── v2.6.0 — Shipped 2026-10-29       │  Soak in 2.x for ~4 weeks
│   (caching, adapters, 2.5.x fixes;  │
│    2.6.1 docs, 2.6.2 install fix)   │
├── v2.7.0 — Evaluation in CI (in     │
│            progress)                │  before promoting to v3.0
├── (~4 weeks of feedback)            ┘
│
├── v3.0.0-beta.1 — Monorepo split    ┐
│   - 4 sub-packages published        │  Beta period: 2-4 weeks
│   - Meta-package re-exports          │  for plugin authors to test
│   - Migration guide                  │
│   - Drop Node 18                     │
│   - Remove deprecated exports        │
│   - openai SDK major, smaller install│
│   - All existing tests pass         ┘
│
├── v3.0.0-rc.1 — Bug fixes from beta
├── v3.0.0     — General availability
└── v3.x       — Caching becomes baseline; optional new features
                  (edge runtime support? streaming improvements?)
```

## Out of v3.0, candidate for v3.1+

| Candidate                                              | Notes                                                                             |
| ------------------------------------------------------ | --------------------------------------------------------------------------------- |
| First-class streaming-first API                        | Time-to-first-token as a primary metric, not an afterthought                      |
| Edge-runtime support (Cloudflare Workers, Vercel Edge) | Requires V8-isolate compatibility audit                                           |
| Bundled Pinecone / Weaviate / Qdrant retrievers        | Currently consumer-built; could ship as `@devilsdev/rag-connectors-pinecone` etc. |
| MCP server template in `examples/`                     | Standalone MCP server exposing a pipeline                                         |
| Cost-aware routing                                     | Auto-select cheapest LLM per query class                                          |

## Anti-goals (won't do)

- Web UI for pipeline configuration
- Hosted SaaS version
- Built-in vector store
- Python port
- General-purpose agent framework (use LangChain for that)
- Native binary distribution

## How we'll know v3.0 is ready

| Signal                                                                                                                                                                         | Threshold |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------- |
| All v2.5.x users can `npm install @devilsdev/rag-pipeline-utils@3.0.0` and have nothing break                                                                                  | Required  |
| Tree-shaking-aware users see ≥30% bundle size reduction by switching to direct sub-package imports (2.5.0 baseline: 672.6 kB tarball, 2.8 MB unpacked, 188 installed packages) | Required  |
| All tests pass on the new structure (2,381 at 2.5.0)                                                                                                                           | Required  |
| Caching demonstrably reduces repeat-query latency by ≥50% on the demo corpus                                                                                                   | Required  |
| Migration guide reviewed by at least 2 external contributors                                                                                                                   | Required  |
| Beta has been live for at least 2 weeks with no P0 issues                                                                                                                      | Required  |

## What this document is NOT

- A timeline. Effort estimates are rough; the dates emerge from actual work.
- A commitment. The order can change if a v2.5.x bug or external feedback shifts priorities.
- A rename mandate. See "Rename decision" — leaning toward keep.

## Update log

| Date       | Change                                                                                                                                                                                                      |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-04-19 | Initial planning doc, post-v2.4.5                                                                                                                                                                           |
| 2026-10-29 | After 2.5.0: caching moved to 2.6.0, 2.7.0 added, deprecated-export removal, `openai` upgrade and smaller install added to scope, `FileVectorStore` note, baselines refreshed                               |
| 2026-10-29 | The 2.5.x bug fixes ship in 2.6.0, not a separate patch; a 2.5.1 from `main` stays available for anything urgent                                                                                            |
| 2026-10-29 | 2.6.0 and 2.6.1 shipped (caching, framework adapters, `/testing`); 2.7.0 is next, starting with the dataset format and `validateDataset`                                                                    |
| 2026-10-29 | 2.6.2 shipped the install fix (husky ran on install since 2.2.1), built from the 2.6.1 tag; 2.7.0: dataset validation, comparison and `rag-pipeline eval` merged, the rag-eval Action built in its own repo |
