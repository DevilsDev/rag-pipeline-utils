---
id: Security-Capabilities
title: Security Capabilities
sidebar_label: Security Capabilities
description: An honest matrix of what's implemented and battle-tested vs. what's recommended practice vs. what ships as example code requiring further hardening.
---

# Security Capabilities

This page is the **honest scorecard** of what the framework actually
implements vs. what it documents as best practice vs. what ships as
example code. Use it for vendor-evaluation checklists and threat-model
reviews.

For **how to report a vulnerability**, see [SECURITY.md in the repo](https://github.com/DevilsDev/rag-pipeline-utils/blob/main/SECURITY.md).

## Legend

| Marker              | Meaning                                                                                                                                                                               |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 🟢 **Implemented**  | Battle-tested code in the public API. Has tests. Used in production by maintainers. Follows the [SEMVER policy](https://github.com/DevilsDev/rag-pipeline-utils/blob/main/SEMVER.md). |
| 🟡 **Recommended**  | The framework provides primitives and documentation, but the user is responsible for the wiring. We don't ship a "turn it on" switch.                                                 |
| 🟠 **Example**      | Code exists in the repo (often in `examples/` or as a default plugin) but is intended as a starting point. Audit and harden before relying on it in production.                       |
| 🔴 **Not in scope** | Outside the framework's responsibility — handled by surrounding infrastructure.                                                                                                       |

## Pre-retrieval guardrails

| Capability                     | Status          | Where it lives                                                 | Notes                                                                                                                  |
| ------------------------------ | --------------- | -------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Prompt-injection detection     | 🟢 Implemented  | `GuardrailsPipeline` `preRetrieval.enableInjectionDetection`   | Pattern-matching heuristics with allowlist support. Tunable thresholds. Not a substitute for downstream output checks. |
| Topic / off-topic filtering    | 🟢 Implemented  | `preRetrieval.topicAllowlist`                                  | Cosine-similarity gate against a configurable topic embedding set.                                                     |
| Query length limits            | 🟢 Implemented  | `preRetrieval.maxQueryLength`                                  | Hard limit before any embedding spend.                                                                                 |
| Rate limiting per principal    | 🟡 Recommended  | Wire your own middleware (Fastify, Express, Lambda authorizer) | The framework does not own the request lifecycle.                                                                      |
| Authentication / authorization | 🔴 Not in scope | Your edge / API gateway                                        | The framework receives an authenticated principal; it does not authenticate.                                           |

## Retrieval-time guardrails

| Capability                           | Status         | Where it lives                                                               | Notes                                                                                                                                                                                                         |
| ------------------------------------ | -------------- | ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Minimum relevance threshold          | 🟢 Implemented | `retrieval.minRelevanceScore`                                                | Drops chunks below the configured cosine score. Prevents fishing.                                                                                                                                             |
| ACL / multi-tenant filtering         | 🟡 Recommended | Pass `tenantId` / `aclTags` in retrieval options; default plugins honor them | We provide the hooks; your retriever implementation must enforce them. The default `MemoryRetriever` honors `tenantId`; cloud retrievers (Pinecone, Weaviate, etc.) require user-supplied filter expressions. |
| Maximum context size                 | 🟢 Implemented | `retrieval.maxContextTokens`                                                 | Hard cap to prevent prompt bloat and runaway cost.                                                                                                                                                            |
| Embedding cache poisoning protection | 🟡 Recommended | Use signed cache keys + TTL                                                  | The framework's optional cache uses content-addressed keys; if you implement your own, sign them.                                                                                                             |

## Post-generation guardrails

| Capability                       | Status         | Where it lives                                              | Notes                                                                                                                            |
| -------------------------------- | -------------- | ----------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| PII detection                    | 🟢 Implemented | `postGeneration.enablePIIDetection`                         | Regex + named-entity heuristics for emails, phones, SSNs, credit cards. Configurable patterns. Tested against synthetic corpora. |
| Groundedness scoring             | 🟢 Implemented | `CitationTracker` + `evaluator.computeGroundedness()`       | Per-sentence attribution to source chunks. Returns a confidence score; you choose the threshold.                                 |
| Hallucination detection          | 🟢 Implemented | `evaluator.faithfulness`                                    | LLM-judged faithfulness score; pluggable judge model.                                                                            |
| Output redaction                 | 🟠 Example     | `examples/guardrails/redact-pii.js`                         | Reference implementation that masks detected PII. Adopt and extend per your compliance requirements.                             |
| Toxicity / safety classification | 🟡 Recommended | Plug a toxicity classifier as a `postGeneration.classifier` | The framework provides the hook; we don't ship a classifier (model choice is policy-laden).                                      |

## Supply-chain security

| Capability                                          | Status         | Where it lives                          | Notes                                                                                |
| --------------------------------------------------- | -------------- | --------------------------------------- | ------------------------------------------------------------------------------------ |
| Pinned GitHub Actions by SHA                        | 🟢 Implemented | `.github/workflows/*.yml`               | Every Action is pinned to a commit SHA, not a tag.                                   |
| Dependabot enabled                                  | 🟢 Implemented | `.github/dependabot.yml`                | Daily scan, auto-PR for patch-level bumps.                                           |
| Runtime `npm audit` gate                            | 🟢 Implemented | `.github/workflows/supply-chain.yml`    | Fails the build on any high+ severity advisory in runtime deps.                      |
| License allowlist enforcement                       | 🟢 Implemented | `supply-chain.yml` license-checker step | Production deps must be MIT / Apache / BSD / ISC / 0BSD / Unlicense / CC0 / CC-PDDC. |
| SBOM generation                                     | 🟢 Implemented | `npm run sbom`                          | CycloneDX format. Generated per release.                                             |
| Provenance attestation (`npm publish --provenance`) | 🟡 Recommended | Set up via OIDC publish workflow        | Currently published from local with token; OIDC migration is on the v3 roadmap.      |
| Signed git tags                                     | 🟡 Recommended | Use `git tag -s`                        | Not enforced by the project; depends on maintainer key setup.                        |

## Authentication primitives

| Capability            | Status          | Where it lives                     | Notes                                                                                            |
| --------------------- | --------------- | ---------------------------------- | ------------------------------------------------------------------------------------------------ |
| JWT validation helper | 🟢 Implemented  | `JWTValidator`                     | Verifies signature, expiry, audience, issuer. Replay protection via `jti` cache.                 |
| API key validation    | 🟠 Example      | `examples/auth/api-key.js`         | Reference; production should use a managed secrets store (AWS Secrets Manager, HashiCorp Vault). |
| OAuth2 / OIDC client  | 🔴 Not in scope | Use a library like `openid-client` | Out of scope for a RAG framework.                                                                |

## Logging and audit

| Capability                         | Status          | Where it lives                              | Notes                                                                                                            |
| ---------------------------------- | --------------- | ------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Structured logging                 | 🟢 Implemented  | `createLogger`, `pino`-based                | JSON output by default, console for dev. Correlation IDs propagated through pipelines.                           |
| Secret redaction in logs           | 🟢 Implemented  | `secure-logger`, `secure-logging` modules   | Auto-redacts `password`, `apiKey`, `token`, `authorization`, `cookie` fields by default. Configurable allowlist. |
| Audit log (immutable, append-only) | 🟢 Implemented  | `AuditLogger`                               | Append-only writer with checksum chain. Persists to file or your configured sink.                                |
| Tamper detection                   | 🟢 Implemented  | `AuditLogger.verify()`                      | Walks the checksum chain to detect tampering.                                                                    |
| Centralized log shipping           | 🔴 Not in scope | Wire your own (Datadog, Splunk, Loki, OTEL) | The framework writes structured logs; shipping is platform concern.                                              |

## Input validation

| Capability                                  | Status         | Where it lives                                    | Notes                                                                                       |
| ------------------------------------------- | -------------- | ------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| Path traversal protection                   | 🟢 Implemented | `sanitizePath` utility                            | Resolves and validates paths against an allowed base.                                       |
| Input sanitization                          | 🟢 Implemented | `InputSanitizer`                                  | Configurable allowlist/denylist for fields. Rejects payloads exceeding size limits.         |
| JSON schema validation for plugin contracts | 🟢 Implemented | `contracts/*.json` + `validate-plugin-contract`   | Plugins fail to register if they don't match the contract.                                  |
| ReDoS protection on user-supplied regex     | 🟡 Recommended | `safe-expression-evaluator` for evaluator scripts | If you accept regex from users elsewhere, run it through a safe runtime (e.g. RE2 binding). |

## Data governance

| Capability               | Status          | Where it lives                               | Notes                                                             |
| ------------------------ | --------------- | -------------------------------------------- | ----------------------------------------------------------------- |
| Multi-tenancy primitives | 🟢 Implemented  | `DataGovernance.tenantContext`               | Isolates retrieval, caches, and audit logs per `tenantId`.        |
| Data retention policies  | 🟡 Recommended  | Implement on your storage backend            | The framework reads/writes; lifecycle is the storage layer's job. |
| Encryption at rest       | 🔴 Not in scope | Storage backend (Postgres TDE, S3 SSE, etc.) | We don't manage your storage.                                     |
| Encryption in transit    | 🟡 Recommended  | All HTTP-based plugins use HTTPS by default  | Verify your custom plugins do too.                                |

## Security testing

| Capability                        | Status          | Where it lives                             | Notes                                                                                           |
| --------------------------------- | --------------- | ------------------------------------------ | ----------------------------------------------------------------------------------------------- |
| Unit tests for security utilities | 🟢 Implemented  | `__tests__/unit/security/**`               | 200+ tests for sanitizers, validators, audit logger.                                            |
| Integration tests for guardrails  | 🟢 Implemented  | `__tests__/integration/guardrails.test.js` | End-to-end pipeline with all three guardrail layers.                                            |
| Fuzz tests for input sanitizers   | 🟠 Example      | `__tests__/fuzz/`                          | Reference fuzz harnesses; not in CI by default. Run locally before security-sensitive releases. |
| Static analysis (CodeQL)          | 🟢 Implemented  | `.github/workflows/security.yml`           | CodeQL on every PR + scheduled weekly.                                                          |
| Penetration testing               | 🔴 Not in scope | Customer responsibility                    | We will publish disclosure-coordinated CVE fixes.                                               |

## What this framework does not protect against

Calling this out so it's not assumed:

- **Compromised LLM provider** — if your LLM API is hijacked, no
  framework guardrail will save you. Use trusted providers and treat
  outputs accordingly.
- **Embedding model bias** — embedding models reflect their training
  data. We don't debias them. Use evaluation to detect regressions.
- **Side-channel timing attacks** — guardrail evaluation takes
  measurable time; if you expose a public endpoint, a sufficiently
  motivated attacker can infer guardrail decisions from timing. Mitigate
  with constant-time response patterns at the HTTP layer.
- **Model exfiltration via inversion attacks** — if your corpus contains
  secrets, an attacker with sufficient query budget can reconstruct
  fragments of it. The framework helps you set rate limits and ACLs
  but cannot eliminate this class of attack entirely.
- **Bring-your-own-plugin maliciousness** — plugins run in your Node
  process with your privileges. Audit any third-party plugins you load.

## See also

- [SECURITY.md (repo)](https://github.com/DevilsDev/rag-pipeline-utils/blob/main/SECURITY.md) — disclosure policy, triage SLAs, supported versions
- [Security guide](./Security) — cookbook patterns and code examples
- [Guardrails reference (Architecture)](./Architecture#guardrails) — internal design
- [SEMVER.md (repo)](https://github.com/DevilsDev/rag-pipeline-utils/blob/main/SEMVER.md) — what counts as breaking
