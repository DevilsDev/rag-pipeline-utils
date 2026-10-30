# Experimental modules

Some classes in this package are simulations or are incomplete. They now live in a separate entry point so you can tell them apart from the supported API:

```js
import {
  SSOManager,
  TenantManager,
  DataGovernanceManager,
  ModelTrainingOrchestrator,
} from "@devilsdev/rag-pipeline-utils/experimental";
```

Experimental modules are **not** covered by the guarantees in [SEMVER.md](https://github.com/DevilsDev/rag-pipeline-utils/blob/main/SEMVER.md). They may change or be removed in any release. Do not rely on them for authentication, tenant isolation, compliance or plugin isolation.

## What each module really does

| Export                                                                    | Status                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ModelTrainingOrchestrator`                                               | Training jobs finish on timers. Weights and metrics are random numbers; nothing is trained.                                                                                                                                                                                                                                                                                                                                                       |
| `FederatedLearningCoordinator`                                            | Participants and rounds exist only in memory. Model updates and aggregation metrics are random.                                                                                                                                                                                                                                                                                                                                                   |
| `MultiModalProcessor`                                                     | Stores content in memory and returns a random 768-dimension "unified embedding". No image, audio or video model is involved. Only `processContent()` works; `generateEmbeddings()`, `alignEmbeddings()` and `crossModalSearch()` throw because the functions they call do not exist.                                                                                                                                                              |
| `AdaptiveRetrievalEngine`                                                 | An in-memory placeholder strategy that does not query your index. Its methods (`retrieveDocuments`, `optimizeRetrieval`, `getAlgorithmConfig`, `updateStrategy`) currently throw because the functions they call do not exist.                                                                                                                                                                                                                    |
| `SSOManager`, `OAuth2Provider`, `OIDCProvider`, `ActiveDirectoryProvider` | OAuth2 and OIDC use PKCE (S256) and take `redirect_uri` from provider configuration; OIDC validates the `id_token` (JWKS signature, issuer, audience, expiry, nonce). Active Directory is only a development stub. A development bypass (any code accepted, fixed development user) is off by default and only active with `devBypass: true` when `NODE_ENV` is not `production`. The flows have not been tested against real identity providers. |
| `SAMLProvider`                                                            | Refuses to authenticate: SAML assertions cannot be verified without a vetted XML-signature library. Only the explicit `devBypass` returns a development user.                                                                                                                                                                                                                                                                                     |
| `TenantManager`, `ResourceMonitor`                                        | Tenant and workspace usage figures are random, so quota enforcement passes or fails at random.                                                                                                                                                                                                                                                                                                                                                    |
| `DataGovernanceManager` (`DataGovernance`)                                | Data classification is random; the compliance report always says "compliant"; GDPR erasure reports deleted records without deleting anything.                                                                                                                                                                                                                                                                                                     |
| `PluginSandbox`                                                           | `execute()` calls methods that do not exist and fails (in 3.0.0 the constructor itself threw; fixed in 3.0.1). Plugins are not isolated; they run in-process with your permissions. Requires the optional `isolated-vm` >= 6 peer dependency.                                                                                                                                                                                                     |
| `PluginCertification`                                                     | `submitForCertification()` uses fixed placeholder scores, then POSTs the result to the registry you configure (`registryUrl` or `RAG_PLUGIN_REGISTRY`); without one it rejects with `NO_PLUGIN_REGISTRY` and sends nothing. Up to 3.0.0 it defaulted to `registry.rag-pipeline.dev`, which is not a registered domain. For scores computed from a plugin's files use `rag-pipeline hub certify check <path>`.                                     |

## Migrating from the main entry

Since 3.0.0 these classes are exported only from `@devilsdev/rag-pipeline-utils/experimental`. Importing one from the main entry gives `undefined` in JavaScript and a compile error in TypeScript.

In 2.x they were also exported from the main entry, but deprecated there: using one (constructing it or calling a static method) prints a one-time `DeprecationWarning` with a code such as `RAG_DEP_TENANT_MANAGER`, and their type declarations are marked `@deprecated`.

To migrate, change the import path. In 2.x the classes are the same objects in both entries, so you can move imports one at a time before upgrading to 3.0:

```diff
- import { TenantManager } from "@devilsdev/rag-pipeline-utils";
+ import { TenantManager } from "@devilsdev/rag-pipeline-utils/experimental";
```

In 2.x the warnings could be silenced with Node's `--no-deprecation` flag; 3.0 prints none, because the main-entry exports are gone.

## Supported alternatives

| Need                                 | Use instead                                               |
| ------------------------------------ | --------------------------------------------------------- |
| Plugin certification scores          | `rag-pipeline hub certify check <path>`                   |
| Installing plugins                   | `rag-pipeline hub install` / `PluginHub.installPlugin()`  |
| Audit trails                         | `AuditLogger` (main entry)                                |
| Retrieval quality from user feedback | `rag-pipeline ai feedback` and `ai search`                |
| Embedder training                    | `rag-pipeline ai train embedding` (local TF-IDF embedder) |
