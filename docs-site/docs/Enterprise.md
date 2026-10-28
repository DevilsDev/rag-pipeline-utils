# Enterprise Features

> **Experimental:** SSO (SAML/OAuth2/OIDC/Active Directory), multi-tenancy, data governance, model training, federated learning, multimodal processing, adaptive retrieval, the plugin sandbox and `PluginCertification` are simulated or incomplete. They are exported from `@devilsdev/rag-pipeline-utils/experimental` and must not be used for authentication, tenant isolation, compliance or plugin isolation. See [Experimental modules](./Experimental.md) for what each one really does.

This page covers the supported building blocks in **@devilsdev/rag-pipeline-utils** for running RAG in regulated or multi-user environments: audit logging, token validation, access-controlled retrieval, plugin signatures, cost limits and observability. They are all exported from the main entry. There are no `/enterprise`, `/observability` or `/testing` subpaths. The package exposes only `.`, `./experimental` and `./cli`.

---

## What is supported

| Need                                  | Supported API                                               | Notes                                                        |
| ------------------------------------- | ----------------------------------------------------------- | ------------------------------------------------------------ |
| Tamper-evident audit trail            | `AuditLogger`                                               | JSONL files, HMAC signatures, optional field encryption      |
| Validating bearer tokens              | `JWTValidator`                                              | HS/RS/ES/PS algorithms, issuer/audience checks, replay store |
| Access control on retrieved documents | `RetrievalGuard` / `GuardrailsPipeline` (`enforceACL`)      | Fails closed without `userPermissions`                       |
| Trusting third-party plugins          | `PluginSignatureVerifier`, signed manifests                 | Ed25519, signed `contentDigest`                              |
| Cost and token limits                 | `CostTracker`, `TokenBudget`, `CostCalculator`              | Built-in prices are unverified; see `PRICING_METADATA`       |
| Logs, metrics and traces              | `logger`, `metrics`, `ExecutionTracer`, `MetricsAggregator` | See [Observability](./Observability.md)                      |
| SSO, tenants, governance, sandboxing  | None (experimental only)                                    | See [Experimental modules](./Experimental.md)                |

---

## Audit Logging

`AuditLogger` writes audit events as JSON lines under `logDir/daily/`. Each event gets a sequence number, an integrity hash and an HMAC signature. With an encryption key, sensitive fields are encrypted with AES-GCM, using a random IV per field.

```javascript
const { once } = require("events");
const { AuditLogger } = require("@devilsdev/rag-pipeline-utils");

const audit = new AuditLogger({
  logDir: "./audit-logs",
  encryptionKey: process.env.RAG_AUDIT_ENCRYPTION_KEY, // or set the env var
  requireEncryption: true, // a missing key is an error instead of a warning
  signingKey: process.env.RAG_AUDIT_SIGNING_KEY, // stable across restarts
});
await once(audit, "audit_system_initialized"); // directories are created asynchronously

await audit.logDataAccess({
  _action: "query",
  _tenantId: "acme",
  _userId: "user-42",
  dataType: "document",
  recordCount: 3,
  accessMethod: "api",
  result: "success",
});

const { results, total } = await audit.queryLogs({
  tenantId: "acme",
  startDate: "2026-10-01",
});
const integrity = await audit.verifyIntegrity();
```

- Event methods: `logAuthentication`, `logAuthorization`, `logDataAccess`, `logDataModification`, `logSystemChanges`, `logAPIAccess` and `logComplianceEvent`. They take the actor fields with a leading underscore (`_action`, `_tenantId`, `_userId`, `_correlationId`).
- `queryLogs()` filters by `tenantId`, `userId`, `category`, `action`, `severity` and `correlationId` (the plain or underscore form), plus `startDate`, `endDate`, `limit` and `offset`.
- Events are buffered. They are written every `flushInterval` ms (default 5000), when `batchSize` events (default 100) have accumulated, or straight away for critical events.
- The encryption key comes from `encryptionKey` or `RAG_AUDIT_ENCRYPTION_KEY`. Without one, encryption is turned off with a warning, unless `requireEncryption: true` is set.
- Signatures are compared in constant time. Without `signingKey` a random key is generated per process, so `verifyIntegrity()` flags records written before a restart. Always pass `signingKey` in production.
- `generateComplianceReport()` summarises the recorded events. It is not a certification of SOC 2, GDPR, HIPAA or PCI-DSS compliance.

---

## Token Validation

`JWTValidator` signs and verifies JWTs with an explicit algorithm allow-list. With strict validation (the default), `issuer` and `audience` are required.

```javascript
const { JWTValidator } = require("@devilsdev/rag-pipeline-utils");

const jwt = new JWTValidator({
  secret: process.env.JWT_SECRET,
  algorithm: "HS256",
  issuer: "my-app",
  audience: "rag-api",
  clockTolerance: 0, // an explicit 0 is honoured
});

const token = jwt.sign({ sub: "user-42", roles: ["analyst"] });
const claims = jwt.verify(token); // throws if invalid
```

- `jti` and `sub` are required by default. Externally issued tokens are single-use (`singleUseTokens: true`): verifying the same JTI twice throws `Token replay detected`. Tokens signed by the same validator may be re-verified.
- The replay store is bounded by `maxTrackedJtis` (default 100000), and its entries expire.

---

## Access-Controlled Retrieval

`GuardrailsPipeline` wraps a pipeline with the pre-retrieval, retrieval and post-generation guards. The retrieval guard runs between retrieval and generation (through `options.filterResults`), so documents the user may not see never reach the LLM.

```javascript
const {
  createRagPipeline,
  GuardrailsPipeline,
} = require("@devilsdev/rag-pipeline-utils");

const guarded = new GuardrailsPipeline(
  createRagPipeline({ embedder, retriever, llm }),
  {
    retrieval: {
      enforceACL: true,
      minRelevanceScore: 0.2,
      detectInjection: true,
    },
    strict: true,
  },
);

const result = await guarded.run({
  query: "Q3 revenue by region",
  context: { userPermissions: ["finance"] },
});
// result.guardrails.retrieval.removed lists removed documents by id only
```

- A document is restricted when it has an `acl` or `requiredRole` field (a role or a list of roles). The user needs at least one of them in `context.userPermissions`.
- With `enforceACL`, a missing `userPermissions` fails closed: every restricted document is removed.
- The guard reads `acl` and `requiredRole` from the top level of each retrieved document. The built-in `MemoryRetriever` and `FileVectorStore` return only `id`, `score`, `content` and `metadata`, so with them you must copy the field to the top level, for example in a small retriever wrapper.
- `detectInjection: true` scans retrieved documents for indirect prompt injection.

See [Guardrails concepts](./Concepts-Guardrails.md) for all options.

---

## Plugin Trust

Plugins run in-process with your permissions. The `PluginSandbox` is experimental and does not isolate anything. Control what you load:

- `rag-pipeline hub install` statically scans plugins and blocks high-risk findings unless you pass `--allow-risky`. It never runs install scripts.
- Signed manifests (Ed25519) are verified by `pluginRegistry.register()` and `PluginSignatureVerifier`. A signed `contentDigest` binds the plugin code, and registries can require signed plugins (`requireSignedPlugins`) and digests (`requireContentDigest`). The trust store is empty by default.

See [Plugin Signatures](./Plugins.md#plugin-signatures).

---

## Cost Controls

```javascript
const {
  CostTracker,
  PRICING_METADATA,
} = require("@devilsdev/rag-pipeline-utils");

const tracker = new CostTracker({
  model: "gpt-4o-mini",
  enableBudget: true,
  budgetOptions: { maxCost: 5, maxTokens: 1_000_000 },
});
const tracked = tracker.wrap(pipeline);

const result = await tracked.run({ query: "What is RAG?" });
console.log(result.cost); // { inputTokens, outputTokens, estimatedCost, model, currency }
console.log(tracker.getSummary());
console.log(PRICING_METADATA.asOf, PRICING_METADATA.verified); // built-in prices are unverified
```

When the budget is exceeded, `run()` throws an error with `code: 'BUDGET_EXCEEDED'`. Token counts are estimated from text length when the result carries no usage data. Pass `calculatorOptions: { pricing }` to use your own prices.

---

## Production Deployment

The library runs inside your own Node.js service; it does not ship a server for production. `rag-pipeline serve` / `DevServer` is a local development API bound to `127.0.0.1`. For container and cluster setups see:

- [Docker](./Deployment-Docker.md)
- [Kubernetes](./Deployment-Kubernetes.md)
- [AWS](./Deployment-AWS.md), [Azure](./Deployment-Azure.md), [GCP](./Deployment-GCP.md)
- [Security guide](./Security.md) and [Security capabilities](./Security-Capabilities.md)
