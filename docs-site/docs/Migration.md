# Migration Guide

This guide helps you upgrade between versions of **@devilsdev/rag-pipeline-utils** and move from other RAG frameworks. The full list of changes in each release is in the [CHANGELOG](https://github.com/DevilsDev/rag-pipeline-utils/blob/main/CHANGELOG.md).

---

## **Version Migration**

### **Upgrading to v3.0.0**

```bash
npm install @devilsdev/rag-pipeline-utils@^3.0.0
```

3.0.0 removes what 2.x deprecated and changes the runtime requirements. The pipeline API, plugin contracts, configuration files and CLI commands don't change. Work through these in order; most projects need only the first two.

**1. Node.js 22 or later.** Node 18 and 20 have reached end of life, and CI tests Node 22 and 24. Check with `node --version`. If you can't upgrade Node yet, stay on 2.7.x, which runs on Node 18 and later.

**2. Install `openai` if you use `OpenAIConnector`.** The OpenAI SDK is now an optional peer dependency, so installs that don't use OpenAI skip it (a clean install is 47 MB instead of 58 MB):

```bash
npm install openai
```

Any version from 4.93 works, so a project that already uses `openai` keeps its own copy. You need it when your code creates an `OpenAIConnector`, or when your `.ragrc.json` uses `"name": "openai"` for the embedder or LLM. Without it, `generate()`, `embed()` and `generateStream()` reject with code `MISSING_DEPENDENCY`. The other connectors (Anthropic, Cohere, Ollama, `LocalEmbedder`) need nothing extra.

**3. Import experimental classes from `/experimental`.** These classes are no longer exported from the main entry:

`ModelTrainingOrchestrator`, `FederatedLearningCoordinator`, `MultiModalProcessor`, `AdaptiveRetrievalEngine`, `SSOManager`, `SAMLProvider`, `OAuth2Provider`, `ActiveDirectoryProvider`, `OIDCProvider`, `TenantManager`, `ResourceMonitor`, `DataGovernanceManager` / `DataGovernance`, `PluginSandbox` and `PluginCertification`.

```diff
- import { TenantManager } from "@devilsdev/rag-pipeline-utils";
+ import { TenantManager } from "@devilsdev/rag-pipeline-utils/experimental";
```

From the main entry they are now `undefined` in JavaScript and a compile error in TypeScript. To find the imports to change, search your code for the class names. Running your app or tests on 2.7.x with `--trace-deprecation` helps too: each `RAG_DEP_*` warning shows the first place your code constructs that class, once per class per run, but an import that is never constructed (or only used for `instanceof`) doesn't warn. 2.5.0 to 2.7.x export the same classes from both entries, so you can change the imports before upgrading.

**4. TypeScript: replace the removed types.** 2.7.0 corrected the declarations and deprecated the types below, because they didn't describe what the code reads or returns. 3.0.0 removes them:

| Removed                 | Use instead                                                   |
| ----------------------- | ------------------------------------------------------------- |
| `LoadConfigOptions`     | `loadConfig(path)` takes the file path as a string            |
| `LLMResponse`           | `LLMPlugin`; `generate()` returns the answer text             |
| `DAGNode`, `DAGOptions` | `Parameters<DAG["addNode"]>`, `Parameters<DAG["execute"]>[1]` |
| `ErrorFormatter`        | `typeof errorFormatter`                                       |
| `EvalResult`            | `Awaited<ReturnType<typeof evaluateRagDataset>>`              |
| `Document.embedding`    | `Document.vector`, the field the built-in retrievers read     |

**5. `PluginSandbox` needs `isolated-vm` 6.** If you installed the optional `isolated-vm` peer for the experimental `PluginSandbox`, upgrade it: `npm install isolated-vm@6`. Version 5 doesn't build on Node 24.

**Behaviour changes to check**:

- **`OpenAIConnector` retries timeouts.** A request the OpenAI SDK reports as a connection timeout is now retried up to the connector's `maxRetries` (default 3); 2.x failed it on the first attempt. Refused connections are retried as before. A request against an unresponsive server therefore takes longer to fail; lower `maxRetries` if you want it to fail fast.
- **No deprecation warnings.** The one-time `RAG_DEP_*` warnings are gone along with the deprecated exports, and importing the package no longer loads the experimental modules.

**To roll back**, install the last 2.x release: `npm install @devilsdev/rag-pipeline-utils@^2.7.1`.

### **Upgrading to v2.5.0**

```bash
npm install @devilsdev/rag-pipeline-utils@^2.5.0
```

**Package import fixed**: in clean installs, `require()` / `import` of 2.4.5 failed with `Cannot find module 'isolated-vm'`. In 2.5.0 `isolated-vm` is loaded only when `PluginSandbox` runs, and it is an optional peer dependency (as is `pino-pretty`). If you pinned 2.4.4 to work around this, you can upgrade.

**Experimental modules moved**: these classes are simulated or incomplete and now have their own entry point, `@devilsdev/rag-pipeline-utils/experimental`:

`ModelTrainingOrchestrator`, `FederatedLearningCoordinator`, `MultiModalProcessor`, `AdaptiveRetrievalEngine`, `SSOManager`, `SAMLProvider`, `OAuth2Provider`, `ActiveDirectoryProvider`, `OIDCProvider`, `TenantManager`, `ResourceMonitor`, `DataGovernanceManager` / `DataGovernance`, `PluginSandbox` and `PluginCertification`.

You can still import them from the main entry, but that use is deprecated. It emits a one-time `DeprecationWarning` (`RAG_DEP_*` codes), and the exports will be removed from the main entry in the next major release. To migrate, change the import path. Both entries share the same classes, so `instanceof` checks keep working.

```diff
- import { TenantManager } from "@devilsdev/rag-pipeline-utils";
+ import { TenantManager } from "@devilsdev/rag-pipeline-utils/experimental";
```

See [Experimental modules](./Experimental.md) for what each one actually does.

**Behaviour changes to check**:

- **Pipelines without an LLM**: `createRagPipeline` without an `llm` runs retrieval only and returns `answer: null` (it used to return `'ok'`). When an `llm` is configured, results always include `answer`.
- **Context recall needs a reference answer**: it now measures how much of a ground-truth answer the retrieved documents support. Pass the reference via `PipelineEvaluator.evaluate(result, { referenceAnswer })` or `run({ query, options: { evaluate: true, referenceAnswer } })`. Without one, `scores.contextRecall` is omitted and `metadata.metricsSkipped` lists it.
- **Grounding scores are higher**: citations, faithfulness, context precision and recall, groundedness, `PostGenerationGuard` and `SelfCritiqueChecker` now measure the share of a sentence's content words found in a document, instead of Jaccard similarity against the whole document. Expect noticeably higher scores for grounded answers. The default per-sentence threshold went from 0.3 to 0.5. Sentences whose numbers are not in the source are not grounded. Re-baseline any thresholds or dashboards that use these scores.
- **`RetrievalGuard` with `enforceACL`** now fails closed: when `context.userPermissions` is missing, documents are removed.
- **`DevServer` now listens**: `start()` binds port 3000 by default (pass `port: 0` for a free port), so existing callers may see `EADDRINUSE`. The default host is `127.0.0.1` (was `localhost`), and the default `watchPaths` is `[]`.
- **No default plugin registry**: `rag-pipeline hub` / `plugin` registry operations need `--registry <url>` or the `RAG_PLUGIN_REGISTRY` environment variable.
- **Removed CLI flags**: `--trace`, `--stats`, `--parallel`, `--streaming`, `--max-memory`, `--preview`, `--validate`, `--explain`, `--abort-timeout`, `--quiet` and `config show --format` had no effect and were removed. Remove them from scripts. (`query --trace`, `--stats`, `--streaming`, `--explain` and the global `--quiet` came back in 2.6.0 with working implementations.) See the [CLI reference](./CLI.md).
- **Prompts**: built-in connectors now put retrieved context in the user message as delimited, untrusted data. Answers may differ slightly.

**New in 2.5.0**: `options.signal` (an `AbortSignal`) on `run()` for cancellation; `FileVectorStore`; a working CLI workflow (`init`, `ingest`, `query`, `run`, `serve`); and `checkNumericConsistency`, `extractNumbers`, `detectInjection` and `PRICING_METADATA` exports. See the [API Reference](./API-Reference.md).

### **Upgrading from v2.0.x to v2.1.x**

**Breaking Changes**:

- Plugin contract standardization
- Configuration file format updates
- CLI command restructuring

**Migration Steps**:

1. **Update Package**:

```bash
npm update @devilsdev/rag-pipeline-utils
```

2. **Update Configuration**:

```bash
# Backup existing config
cp .ragrc.json .ragrc.json.backup

# There is no automated config migration command: edit .ragrc.json by hand
# (format in the CLI reference), then check it
rag-pipeline validate
```

3. **Update Plugin Registrations**:

LLM plugins implement `generate(query, docs, options)`. `pluginRegistry.register()` is asynchronous, and a registered plugin needs a `metadata` object with `name`, `version` and `type`.

```javascript
const { pluginRegistry } = require("@devilsdev/rag-pipeline-utils");

// v2.0.x (deprecated)
// { ask: async (prompt) => { ... } }

// current
await pluginRegistry.register("llm", "my-llm", {
  metadata: { name: "my-llm", version: "1.0.0", type: "llm" },
  async generate(query, docs, options = {}) {
    /* implementation; honour options.signal for cancellation */
    return "answer text";
  },
});
```

4. **Update Evaluation Scripts**:

Since 2.7.0, `rag-pipeline eval tests.json` runs a test set from the CLI (see
[CLI](./CLI.md#eval)). In code, evaluate through the library (see [Evaluation](./Evaluation.md)):

```javascript no-run
const {
  createRagPipeline,
  PipelineEvaluator,
} = require("@devilsdev/rag-pipeline-utils");

const pipeline = createRagPipeline({ embedder, retriever, llm });
const evaluator = new PipelineEvaluator();

for (const { prompt, expected } of testCases) {
  const result = await pipeline.run({ query: prompt });
  const report = evaluator.evaluate(
    { query: prompt, answer: result.answer, results: result.results },
    { referenceAnswer: expected },
  );
  console.log(prompt, report.scores);
}
```

### **Upgrading from v1.x to v2.x**

**Major Changes**:

- Complete plugin architecture overhaul
- New streaming support
- Enhanced evaluation framework

**Migration Checklist**:

1. **Install New Version**:

```bash
npm uninstall @devilsdev/rag-pipeline-utils
npm install @devilsdev/rag-pipeline-utils@^2
```

2. **Migrate Configuration**:

The CLI reads a `.ragrc.json` whose `pipeline` array lists one entry per stage. Generate a starting point with `rag-pipeline init --template <name>`; API keys come from environment variables (for example `OPENAI_API_KEY`), not from the file.

```json
{
  "pipeline": [
    { "stage": "loader", "name": "auto" },
    { "stage": "embedder", "name": "local" },
    {
      "stage": "retriever",
      "name": "file-store",
      "config": { "path": ".rag/index.json" }
    }
  ]
}
```

3. **Update Code**:

There is no `RAGPipeline` class. Build a pipeline from component instances with `createRagPipeline`:

```javascript
// v1.x (removed): new RAGPipeline({ openaiKey, pineconeKey })

// v2.x
const {
  createRagPipeline,
  OpenAIConnector,
  MemoryRetriever,
} = require("@devilsdev/rag-pipeline-utils");

const openai = new OpenAIConnector(); // reads OPENAI_API_KEY
const pipeline = createRagPipeline({
  embedder: openai,
  retriever: new MemoryRetriever(),
  llm: openai,
});

const result = await pipeline.run({ query: "What is RAG?" });
console.log(result.answer);
```

4. **Update Plugin Development**:

Plugins are plain objects or classes that implement the stage's method. There is no `BaseLoader` base class.

```javascript
// v2.x loader plugin
class MyLoader {
  async load(filePath, options = {}) {
    return [
      {
        id: filePath,
        content: "...",
        metadata: { source: filePath },
      },
    ];
  }
}
```

---

## **Framework Migration**

### **Migrating from LangChain**

The `OpenAIConnector` examples in this section need the OpenAI SDK: `npm install openai`.

**Key Differences**:

- Plugin-based vs. chain-based architecture
- Built-in evaluation framework
- Streaming support built in

The pipeline exposes `run()` (plus `cleanup()` and `cacheStats()`). To load, embed, index or generate outside a run, call the component directly.

**Migration Steps**:

1. **Embeddings**:

```python
# LangChain
from langchain.embeddings import OpenAIEmbeddings
embeddings = OpenAIEmbeddings()
vectors = embeddings.embed_documents(texts)
```

```javascript no-run
// @devilsdev/rag-pipeline-utils
const { OpenAIConnector } = require("@devilsdev/rag-pipeline-utils");

const embedder = new OpenAIConnector();
const vectors = await Promise.all(texts.map((t) => embedder.embed(t)));
```

2. **Vector Stores**:

```python
# LangChain
from langchain.vectorstores import Pinecone
vectorstore = Pinecone.from_documents(docs, embeddings)
results = vectorstore.similarity_search(query)
```

```javascript no-run
// @devilsdev/rag-pipeline-utils
const { MemoryRetriever } = require("@devilsdev/rag-pipeline-utils");

const retriever = new MemoryRetriever();
await retriever.store(
  docs.map((d, i) => ({ id: d.id, content: d.content, vector: vectors[i] })),
);
const results = await retriever.retrieve({
  queryVector: await embedder.embedQuery(query),
  topK: 5,
});
```

For a vector index that persists to disk, use `FileVectorStore`. For PostgreSQL or Qdrant, use the built-in `PgVectorRetriever` or `QdrantRetriever` (`pgvector` or `qdrant` in `.ragrc.json`; see [PostgreSQL with pgvector](./Concepts-Connectors.md#postgresql-with-pgvector) and [Qdrant](./Concepts-Connectors.md#qdrant)). Other hosted databases need a custom retriever plugin (see [Plugins](./Plugins.md)).

3. **LLM Integration**:

```python
# LangChain
from langchain.llms import OpenAI
llm = OpenAI(temperature=0.7)
response = llm(prompt)
```

```javascript no-run
// @devilsdev/rag-pipeline-utils
const { OpenAIConnector } = require("@devilsdev/rag-pipeline-utils");

const llm = new OpenAIConnector({ model: "gpt-4o-mini", temperature: 0.7 });
const response = await llm.generate(prompt, []);
```

### **Migrating from Haystack**

**Architecture Mapping**:

- Haystack Nodes → RAG Pipeline Plugins
- Haystack Pipelines → `createRagPipeline` (or a `.ragrc.json` `pipeline` array for the CLI)
- Haystack Document Stores → RAG Retrievers

**Migration Example**:

```python
# Haystack
from haystack import Pipeline
from haystack.nodes import EmbeddingRetriever, FARMReader

pipeline = Pipeline()
pipeline.add_node(component=retriever, name="Retriever", inputs=["Query"])
pipeline.add_node(component=reader, name="Reader", inputs=["Retriever"])
```

```javascript no-run
// @devilsdev/rag-pipeline-utils
const pipeline = createRagPipeline({
  embedder, // e.g. new OllamaConnector()
  retriever, // e.g. new MemoryRetriever(), FileVectorStore, PgVectorRetriever or QdrantRetriever
  llm, // e.g. new OllamaConnector()
});
```

### **Migrating from Custom Solutions**

**Common Migration Patterns**:

1. **Custom Vector Search**:

A retriever plugin implements `store(docs)` and `retrieve({ query, queryVector, topK, signal })`. The pipeline embeds the query with the configured embedder and passes `queryVector` in.

```javascript
// Custom implementation wrapped as a retriever plugin
class CustomRetriever {
  constructor() {
    this.docs = [];
  }

  async store(docs) {
    this.docs.push(...docs);
  }

  async retrieve({ queryVector, topK = 5 }) {
    return this.docs
      .map((d) => ({ ...d, score: cosineSimilarity(queryVector, d.vector) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, topK)
      .map(({ id, content, score, metadata }) => ({
        id,
        content,
        score,
        metadata,
      }));
  }
}
```

2. **Custom Chunking Logic**:

Use the built-in `ChunkingEngine`, or keep your own function inside a loader plugin:

```javascript
// Custom implementation
function chunkDocument(text, chunkSize = 1000) {
  const sentences = text.split(".");
  const chunks = [];
  let currentChunk = "";

  for (const sentence of sentences) {
    if (currentChunk.length + sentence.length > chunkSize) {
      chunks.push(currentChunk);
      currentChunk = sentence;
    } else {
      currentChunk += sentence;
    }
  }

  return chunks;
}

// Use it from a loader plugin
class CustomLoader {
  async load(filePath) {
    const text = await fs.promises.readFile(filePath, "utf8");
    return chunkDocument(text).map((content, i) => ({
      id: `${filePath}#${i}`,
      content,
      metadata: { source: filePath },
    }));
  }
}
```

---

## **Data Migration**

### **Vector Store Migration**

**CLI Index**:

The CLI has no `export` or `import` command. Its index is a single JSON file
(the `file-store` retriever's `config.path`, `.rag/index.json` by default),
so you can copy it, or rebuild it from your source documents after changing
the embedder or retriever:

```bash
# Re-index from source documents into the newly configured store
rag-pipeline ingest ./docs --rebuild
```

**Cross-Platform Migration**:

There is no built-in migrator between vector databases. Re-embed and store your documents with the new retriever, or copy stored records between retrievers yourself. For example, from a `FileVectorStore` index into another retriever that accepts the same vectors:

```javascript no-run
const { FileVectorStore } = require("@devilsdev/rag-pipeline-utils");

const source = new FileVectorStore({ path: ".rag/index.json" });
source.load();
// list() returns { id, content, metadata } without vectors, so re-embed:
const records = source.list();
const batch = await Promise.all(
  records.map(async (r) => ({
    ...r,
    vector: await embedder.embed(r.content),
  })),
);
await targetRetriever.store(batch);
```

### **Configuration Migration**

There is no automated configuration migration helper. Edit `.ragrc.json` by hand (or regenerate it with `rag-pipeline init --force`) and check the result with `rag-pipeline validate`. From code, `loadRagConfig()` and `validateRagrc()` load and validate a configuration.

---

## **Testing Migration**

### **Validation Strategy**

1. **Configuration Validation**:

```bash
# Validate migrated configuration and resolve every component
rag-pipeline validate

# List built-in components and custom plugins
rag-pipeline info --plugins
```

2. **Functionality Testing**:

```bash
# Show what would be done without executing
rag-pipeline --dry-run query "test query"

# Run a real query and inspect the passages and citations
rag-pipeline query "test query" --json
```

To score sample data, run `rag-pipeline eval tests.json` or use
`PipelineEvaluator` (see [Evaluation](./Evaluation.md)).

3. **Performance Comparison**:

`rag-pipeline ai benchmark` reports measured p50/p95/mean latency per stage. You can also time the same representative queries before and after migrating:

```bash
# Before migration
time rag-pipeline query "test query" --json > before-migration.json

# After migration
time rag-pipeline query "test query" --json > after-migration.json
```

### **Rollback Strategy**

**Backup Before Migration**:

```bash
# Back up the index directory (default file-store path is .rag/index.json)
cp -r .rag .rag.pre-migration

# Backup configuration
cp .ragrc.json .ragrc.json.pre-migration
```

**Rollback Process**:

```bash
# Restore the index
rm -rf .rag && cp -r .rag.pre-migration .rag

# Restore configuration
cp .ragrc.json.pre-migration .ragrc.json

# Downgrade package if needed (pin the version you came from)
npm install @devilsdev/rag-pipeline-utils@^2.7.1
```

---

## **Migration Tools & Utilities**

### **Checking a Migrated Project**

The CLI has no `migration` command and the library has no migration API. After migrating, check the project with:

```bash
rag-pipeline validate   # config schema and component resolution
rag-pipeline doctor     # plugins, environment, API keys, index status
```

---

## **Migration Checklist**

### **Pre-Migration**

- [ ] Backup all data and configurations
- [ ] Document current system architecture
- [ ] Identify custom plugins and integrations
- [ ] Run baseline performance tests
- [ ] Prepare rollback strategy

### **During Migration**

- [ ] Follow migration guide step-by-step
- [ ] Validate each migration step
- [ ] Test functionality after each major change
- [ ] Monitor for errors and warnings
- [ ] Document any custom modifications needed

### **Post-Migration**

- [ ] Run comprehensive functionality tests
- [ ] Compare performance metrics
- [ ] Validate data integrity
- [ ] Update documentation and team training
- [ ] Monitor system stability
- [ ] Clean up old backups and temporary files

---

## **Migration Support**

### **Common Migration Issues**

1. **Plugin Compatibility**: Some v1.x plugins may not work with v2.x
2. **Configuration Format**: Manual updates may be required for complex configs
3. **Score Changes**: 2.5.0 grounding and context-recall scores are not comparable with earlier releases
4. **API Changes**: Some programmatic APIs have changed signatures

### **Getting Help**

- **Issues**: [GitHub Issues](https://github.com/DevilsDev/rag-pipeline-utils/issues)
- **Discussions**: [GitHub Discussions](https://github.com/DevilsDev/rag-pipeline-utils/discussions)

---

_For additional support, consult the [Troubleshooting Guide](./Troubleshooting.md)._
