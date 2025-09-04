# RAG Pipeline Utils — Developer-Focused Use Cases

> Modular, composable, and CI-verified RAG orchestration for modern AI applications.

---

## Use Case 1: Pluggable Local RAG Stack for Prototyping

**Problem:** Traditional RAG tools force tight vendor dependencies.

**Solution:** Use mockable local plugin implementations to simulate loaders, embedders, retrievers, and LLMs.

```bash
npm install @devilsdev/rag-pipeline-utils
```

```js
// cli.js or app.js
import { PluginRegistry } from "./src/core/plugin-registry.js";
import { loadRagConfig } from "./src/config/load-config.js";

const config = loadRagConfig(".ragrc.json");
const loader = PluginRegistry.getPlugin("loader", "pdf");
const docs = loader.load("./test.pdf");
```

**Benefits**

- Local plugin mocks with expected method contracts
- Reusable plugin templates (`pdf-loader.js`, `openai-embedder.js`)
- Dev-first DX: debug, snapshot, iterate without cloud costs

---

## Use Case 2: Declarative CLI RAG Pipelines (CI-Ready)

**Problem:** Hardcoded pipeline steps can't be validated or changed by non-engineers.

**Solution:** Define `.ragrc.json` once and reuse across environments.

```json
{
  "loader": { "pdf": "./src/mocks/pdf-loader.js" },
  "embedder": { "openai": "./src/mocks/openai-embedder.js" },
  "retriever": { "pinecone": "./src/mocks/pinecone-retriever.js" },
  "llm": { "openai": "./src/mocks/openai-llm.js" },
  "namespace": "docs-poc",
  "pipeline": ["loader", "embedder", "retriever"]
}
```

```bash
node ./bin/cli.js ingest ./docs/whitepaper.pdf
node ./bin/cli.js query "What’s the goal of this architecture?"
```

**Benefits**

- Teams can standardize pipelines in source control
- Tests fail fast if structure or mocks drift
- Non-devs can operate pipelines via CLI

---

## Use Case 3: Mock-First TDD for Plugin Development

**Problem:** LLM, vector, and loader logic are often developed without tests.

**Solution:** Define contract-compliant mocks and CI-validate their structure before connecting to APIs.

```js
export default class CustomEmbedder {
  embed(docs) { return docs.map(...); }
  embedQuery(q) { return [...]; }
}
```

Run full contract verification:

```bash
npm run ci
```

**Benefits**

- Every plugin is CI-verified for method presence
- Shared contracts enforce required interfaces
- Onboarding new devs? Just follow `pluginContracts.js`

---

## Use Case 4: Vendor-Neutral AI Data Pipelines

**Problem:** Every RAG stack is locked to OpenAI + Pinecone + Langchain.

**Solution:** Use this project to mix, match, or mock vector/LLM pairs:

```js
"retriever": { "localstore": "./src/plugins/local-retriever.js" },
"llm": { "cohere": "./src/plugins/cohere-llm.js" }
```

**Benefits**

- Run multiple RAG pipelines in parallel (A/B testing, evals)
- Lower infra cost with offline/local plugin support
- Integrate with tools outside Langchain ecosystem

---

## 🛠 Use Case 5: Plugin Engineering with Guardrails

**Problem:** Complex plugin systems break silently.

**Solution:** This framework has:

- Plugin method contract enforcement
- CLI test runner (`scripts/ci-runner.js`)
- Auto repair tool (`scripts/repair-fixtures.js`)

**DX Boost**

- One-line plugin repairs
- Validated schema structure
- Aligned to real-world developer workflows

---

## Cross References

- [README](./README.md) — Project overview, architecture, CLI and configuration details
- [pluginContracts.js](./src/core/plugin-contracts.js) — Interface contracts for loader, embedder, retriever, LLM
- [diagnostic-reporter.js](./src/utils/ci/diagnostic-reporter.js) — CI error helper
- [repair-fixtures.js](./scripts/repair-fixtures.js) — Auto-regeneration of mocks

---

## License

Licensed under the **GPL-3.0 License** — see [LICENSE](./LICENSE) for full terms.
