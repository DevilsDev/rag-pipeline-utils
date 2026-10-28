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

| Export                                                                    | Status                                                                                                                                                                                                                                                   |
| ------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ModelTrainingOrchestrator`                                               | Training jobs finish on timers. Weights and metrics are random numbers; nothing is trained.                                                                                                                                                              |
| `FederatedLearningCoordinator`                                            | Participants and rounds exist only in memory. Model updates and aggregation metrics are random.                                                                                                                                                          |
| `MultiModalProcessor`                                                     | Stores content in memory and returns a random 768-dimension "unified embedding". No image, audio or video model is involved.                                                                                                                             |
| `AdaptiveRetrievalEngine`                                                 | An in-memory placeholder strategy. It does not query your index.                                                                                                                                                                                         |
| `SSOManager`, `OAuth2Provider`, `OIDCProvider`, `ActiveDirectoryProvider` | When `NODE_ENV` is not exactly `production`, any authorization code is accepted and a session for a fixed development user is issued. In production mode the OIDC `id_token` is not validated (signature, issuer, audience, nonce) and PKCE is not used. |
| `SAMLProvider`                                                            | A stub: XML signatures and assertions are not verified.                                                                                                                                                                                                  |
| `TenantManager`, `ResourceMonitor`                                        | Tenant and workspace usage figures are random, so quota enforcement passes or fails at random.                                                                                                                                                           |
| `DataGovernanceManager` (`DataGovernance`)                                | Data classification is random; the compliance report always says "compliant"; GDPR erasure reports deleted records without deleting anything.                                                                                                            |
| `PluginSandbox`                                                           | `execute()` calls methods that do not exist and fails. Plugins are not isolated; they run in-process with your permissions. Requires the optional `isolated-vm` peer dependency.                                                                         |
| `PluginCertification`                                                     | `submitForCertification()` uses fixed placeholder scores. For scores computed from a plugin's files use `rag-pipeline hub certify check <path>`.                                                                                                         |

## Migrating from the main entry

These classes are still exported from `@devilsdev/rag-pipeline-utils`, but they are deprecated there:

- Using one (constructing it or calling a static method) prints a one-time `DeprecationWarning` with a code such as `RAG_DEP_TENANT_MANAGER`.
- Their type declarations are marked `@deprecated`.
- They will be removed from the main entry in the next major release.

To migrate, change the import path. The classes are the same objects, so `instanceof` checks keep working across both entries:

```diff
- import { TenantManager } from "@devilsdev/rag-pipeline-utils";
+ import { TenantManager } from "@devilsdev/rag-pipeline-utils/experimental";
```

Warnings can be silenced with Node's `--no-deprecation` flag, but changing the import is the better fix.

## Supported alternatives

| Need                                 | Use instead                                               |
| ------------------------------------ | --------------------------------------------------------- |
| Plugin certification scores          | `rag-pipeline hub certify check <path>`                   |
| Installing plugins                   | `rag-pipeline hub install` / `PluginHub.installPlugin()`  |
| Audit trails                         | `AuditLogger` (main entry)                                |
| Retrieval quality from user feedback | `rag-pipeline ai feedback` and `ai search`                |
| Embedder training                    | `rag-pipeline ai train embedding` (local TF-IDF embedder) |
