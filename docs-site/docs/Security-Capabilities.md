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

| Marker              | Meaning                                                                                                                                      |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| 🟢 **Implemented**  | Code in the public API with tests. Follows the [SEMVER policy](https://github.com/DevilsDev/rag-pipeline-utils/blob/main/SEMVER.md).         |
| 🟡 **Recommended**  | The framework provides primitives and documentation, but the user is responsible for the wiring. We don't ship a "turn it on" switch.        |
| 🟠 **Experimental** | Exported from `@devilsdev/rag-pipeline-utils/experimental`. Simulated or incomplete; not covered by SEMVER. Do not rely on it in production. |
| 🔴 **Not in scope** | Outside the framework's responsibility — handled by surrounding infrastructure.                                                              |

## Pre-retrieval guardrails

| Capability                     | Status          | Where it lives                                                                     | Notes                                                                                                                                                                                                                                       |
| ------------------------------ | --------------- | ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Prompt-injection detection     | 🟢 Implemented  | `PreRetrievalGuard` (`preRetrieval.enableInjectionDetection`), `detectInjection()` | Pattern rules matched against normalised text (NFKC, zero-width characters removed, homoglyph and leetspeak folding). Extra patterns via `injectionPatterns`. The query is never rewritten; strict mode blocks. Heuristic, not a guarantee. |
| Topic / off-topic filtering    | 🟢 Implemented  | `preRetrieval.blockedTopics` / `preRetrieval.allowedTopics`                        | Keyword-based topic lists (opt-in via `enableTopicFiltering`).                                                                                                                                                                              |
| Query length limits            | 🟢 Implemented  | `preRetrieval.maxQueryLength`                                                      | Default 10000 characters.                                                                                                                                                                                                                   |
| Rate limiting per principal    | 🟡 Recommended  | Wire your own middleware (Fastify, Express, Lambda authorizer)                     | The framework does not own the request lifecycle.                                                                                                                                                                                           |
| Authentication / authorization | 🔴 Not in scope | Your edge / API gateway                                                            | The framework receives an authenticated principal; it does not authenticate.                                                                                                                                                                |

## Retrieval-time guardrails

| Capability                     | Status         | Where it lives                                     | Notes                                                                                                                                                                                                                     |
| ------------------------------ | -------------- | -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Runs before generation         | 🟢 Implemented | `GuardrailsPipeline` → `options.filterResults`     | Since 2.5.0 the retrieval guard runs between retrieval and generation, so the LLM never sees removed documents. Removed documents are reported by id only.                                                                |
| Minimum relevance threshold    | 🟢 Implemented | `retrieval.minRelevanceScore`                      | Drops results whose `score` is below the threshold.                                                                                                                                                                       |
| ACL filtering                  | 🟢 Implemented | `retrieval.enforceACL` + `context.userPermissions` | Checks each document's `requiredRole` / `acl` against the caller's roles. Fails closed since 2.5.0: without `userPermissions`, restricted documents are removed. Tenant isolation in your vector store is still your job. |
| Indirect prompt-injection scan | 🟢 Implemented | `retrieval.detectInjection`, `injectionAction`     | Opt-in. Scans retrieved document text; removes (default) or flags matching documents.                                                                                                                                     |
| Freshness filter               | 🟢 Implemented | `retrieval.maxAgeDays`                             | Disabled by default (0).                                                                                                                                                                                                  |
| Retrieved text as untrusted    | 🟢 Implemented | Built-in LLM connectors                            | Since 2.5.0 retrieved context goes in the user message as delimited reference data, never in the system role, with a system prompt telling the model to treat it as data.                                                 |

## Post-generation guardrails

| Capability                       | Status         | Where it lives                                                                       | Notes                                                                                                                                                                                       |
| -------------------------------- | -------------- | ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| PII detection and redaction      | 🟢 Implemented | `postGeneration.enablePIIDetection`, `piiPatterns`                                   | Regex patterns for emails, phone numbers, SSNs and credit cards. Since 2.5.0 PII is also redacted in citations and evaluation details, and strict-mode blocks do not return the raw answer. |
| Groundedness scoring             | 🟢 Implemented | `postGeneration.enableGroundednessCheck`, `CitationTracker`, `computeGroundedness()` | Lexical support per sentence plus a numeric-consistency check. Negation, units and multi-document claims are not checked.                                                                   |
| Hallucination detection          | 🟢 Implemented | `detectHallucinations()`, `computeFaithfulness()`                                    | Lexical (not LLM-judged): sentences with low support in the retrieved documents are flagged.                                                                                                |
| Toxicity / safety classification | 🟡 Recommended | Your own check on `result.answer`                                                    | Not shipped (model choice is policy-laden).                                                                                                                                                 |

## Supply-chain security

| Capability                                          | Status         | Where it lives                          | Notes                                                                                                          |
| --------------------------------------------------- | -------------- | --------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| Pinned GitHub Actions by SHA                        | 🟢 Implemented | `.github/workflows/*.yml`               | Actions are pinned to a commit SHA, not a tag.                                                                 |
| Dependabot enabled                                  | 🟢 Implemented | `.github/dependabot.yml`                | Weekly npm scan.                                                                                               |
| Runtime `npm audit` gate                            | 🟢 Implemented | `.github/workflows/supply-chain.yml`    | `npm audit --audit-level=high --omit=dev`. For 2.5.0 it reports no high or critical findings.                  |
| License allowlist enforcement                       | 🟢 Implemented | `supply-chain.yml` license-checker step | Production dependencies are checked against an allowlist of licenses.                                          |
| SBOM generation                                     | 🟢 Implemented | `npm run sbom`                          | CycloneDX format.                                                                                              |
| Provenance attestation (`npm publish --provenance`) | 🟢 Implemented | `.github/workflows/release.yml`         | Releases are published from the release workflow with OIDC and `--provenance`.                                 |
| Tarball smoke test                                  | 🟢 Implemented | `npm run smoke:pack`                    | Installs the packed tarball in a clean project and imports it (CJS, ESM, TypeScript) in CI and before publish. |
| Signed git tags                                     | 🟡 Recommended | Use `git tag -s`                        | Not enforced by the project.                                                                                   |

## Plugin trust

| Capability                     | Status          | Where it lives                                         | Notes                                                                                                                                            |
| ------------------------------ | --------------- | ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Ed25519 manifest signatures    | 🟢 Implemented  | `PluginSignatureVerifier`, `pluginRegistry.register()` | On and fail-closed by default when `NODE_ENV=production`. The trust store is empty by default (2.5.0); add signers explicitly.                   |
| Code binding (`contentDigest`) | 🟢 Implemented  | Signed manifest field                                  | A signed `contentDigest` binds the plugin files and is always enforced when present. `requireContentDigest` / `requireSignedPlugins` are opt-in. |
| Install-time static scan       | 🟢 Implemented  | `rag-pipeline hub install`                             | High-risk findings block the install unless `--allow-risky`; the stage contract is checked in a separate process.                                |
| Plugin sandboxing              | 🟠 Experimental | `PluginSandbox` (`/experimental`)                      | Non-functional; plugins run in-process with your privileges. See [Experimental](./Experimental.md).                                              |

## Authentication primitives

| Capability                      | Status          | Where it lives                               | Notes                                                                                                                                                                                                   |
| ------------------------------- | --------------- | -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| JWT validation helper           | 🟢 Implemented  | `JWTValidator`                               | Verifies signature, expiry, audience, issuer. Replay protection via a bounded `jti` store (`maxTrackedJtis`); external tokens are single-use by default (`singleUseTokens`).                            |
| SSO (OAuth2 / OIDC / SAML / AD) | 🟠 Experimental | `@devilsdev/rag-pipeline-utils/experimental` | OIDC validates id_tokens and uses PKCE, but the flows are untested against real identity providers; `SAMLProvider` refuses to authenticate. Use a vetted library such as `openid-client` in production. |

## Logging and audit

| Capability               | Status          | Where it lives                              | Notes                                                                                                                                                                 |
| ------------------------ | --------------- | ------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Structured logging       | 🟢 Implemented  | `logger` export (pino-based)                | JSON output.                                                                                                                                                          |
| Secret redaction in logs | 🟢 Implemented  | Internal secure-logging utilities           | Pattern-based redaction of API keys and bearer tokens in log data.                                                                                                    |
| Audit log                | 🟢 Implemented  | `AuditLogger`                               | Encrypted fields (`createCipheriv`, random IV) when a key is set via `encryptionKey` or `RAG_AUDIT_ENCRYPTION_KEY`; `requireEncryption` makes a missing key an error. |
| Tamper detection         | 🟢 Implemented  | `AuditLogger.verifyIntegrity()`             | HMAC signatures compared in constant time. Pass a stable `signingKey`, otherwise records written before a restart are flagged.                                        |
| Centralized log shipping | 🔴 Not in scope | Wire your own (Datadog, Splunk, Loki, OTEL) | The framework writes structured logs; shipping is a platform concern.                                                                                                 |

## Input validation

| Capability                                  | Status         | Where it lives                        | Notes                                                                                 |
| ------------------------------------------- | -------------- | ------------------------------------- | ------------------------------------------------------------------------------------- |
| Basic input validation                      | 🟢 Implemented | `validateInput(input, { maxLength })` | Length limit and a small denylist of tokens; returns `{ valid, reasons, sanitized }`. |
| Path traversal protection                   | 🟡 Recommended | Your application code                 | No path sanitizer is exported; see the [Security guide](./Security.md#path-handling). |
| JSON schema validation for plugin contracts | 🟢 Implemented | `contracts/*.json`                    | Plugins fail to register if they don't implement the stage contract.                  |
| ReDoS protection on user-supplied regex     | 🟡 Recommended | Your application code                 | If you accept regex from users, run it through a safe runtime (e.g. an RE2 binding).  |

## Data governance

| Capability                 | Status          | Where it lives                                              | Notes                                                                                                                                 |
| -------------------------- | --------------- | ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| Multi-tenancy / governance | 🟠 Experimental | `TenantManager`, `DataGovernanceManager` in `/experimental` | Simulated: usage figures and data classification are random and GDPR erasure deletes nothing. Do not use for isolation or compliance. |
| Data retention policies    | 🟡 Recommended  | Implement on your storage backend                           | The framework reads/writes; lifecycle is the storage layer's job.                                                                     |
| Encryption at rest         | 🔴 Not in scope | Storage backend (Postgres TDE, S3 SSE, etc.)                | We don't manage your storage. `FileVectorStore` writes a plain JSON file.                                                             |
| Encryption in transit      | 🟡 Recommended  | Built-in cloud connectors use HTTPS                         | Verify your custom plugins do too.                                                                                                    |

## Security testing

| Capability                        | Status          | Where it lives                   | Notes                                                          |
| --------------------------------- | --------------- | -------------------------------- | -------------------------------------------------------------- |
| Unit tests for security utilities | 🟢 Implemented  | `__tests__/unit/security/**`     | JWT, audit logging, plugin signatures, command injection, SSO. |
| Guardrails tests                  | 🟢 Implemented  | `__tests__/unit/guardrails/`     | All three guardrail layers.                                    |
| Static analysis (CodeQL)          | 🟢 Implemented  | `.github/workflows/security.yml` | On pushes and pull requests to `main`, plus weekly.            |
| Penetration testing               | 🔴 Not in scope | Customer responsibility          | We publish disclosure-coordinated fixes.                       |

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
- [Security guide](./Security.md) — cookbook patterns and code examples
- [Guardrails reference (Architecture)](./Architecture.md#guardrails) — internal design
- [Experimental modules](./Experimental.md) — simulated or incomplete modules and their status
- [SEMVER.md (repo)](https://github.com/DevilsDev/rag-pipeline-utils/blob/main/SEMVER.md) — what counts as breaking
