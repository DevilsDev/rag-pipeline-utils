# Migration Guide

This comprehensive migration guide helps you upgrade between versions of **@DevilsDev/rag-pipeline-utils** and migrate from other RAG frameworks. Whether you're upgrading from an older version or switching from another solution, this guide provides step-by-step instructions and best practices.

---

## **Version Migration**

### **Upgrading from v2.0.x to v2.1.x**

**Breaking Changes**:

- Plugin contract standardization
- Configuration file format updates
- CLI command restructuring

**Migration Steps**:

1. **Update Package**:

```bash
npm update @DevilsDev/rag-pipeline-utils
```

2. **Update Configuration**:

```bash
# Backup existing config
cp .ragrc.json .ragrc.json.backup

# Migrate configuration format
rag-pipeline config migrate --from 2.0 --to 2.1
```

3. **Update Plugin Registrations**:

```javascript
// v2.0.x (deprecated)
registry.register("llm", "openai", {
  ask: async (prompt) => {
    /* implementation */
  },
});

// v2.1.x (current)
registry.register("llm", "openai", {
  generate: async (prompt) => {
    /* implementation */
  },
});
```

4. **Update CLI Commands**:

```bash
# v2.0.x (deprecated)
rag-pipeline eval ./test-data.json

# v2.1.x (current)
rag-pipeline evaluate ./test-data.json
```

### **Upgrading from v1.x to v2.x**

**Major Changes**:

- Complete plugin architecture overhaul
- New streaming support
- Enhanced evaluation framework
- TypeScript-first approach

**Migration Checklist**:

1. **Install New Version**:

```bash
npm uninstall @DevilsDev/rag-pipeline-utils
npm install @DevilsDev/rag-pipeline-utils@^2.0.0
```

2. **Migrate Configuration**:

```json
// v1.x format
{
  "openai_api_key": "sk-...",
  "pinecone_api_key": "...",
  "chunk_size": 1000
}

// v2.x format
{
  "plugins": {
    "embedder": {
      "name": "openai",
      "config": {
        "apiKey": "${OPENAI_API_KEY}",
        "model": "text-embedding-ada-002"
      }
    },
    "retriever": {
      "name": "pinecone",
      "config": {
        "apiKey": "${PINECONE_API_KEY}",
        "environment": "us-west1-gcp"
      }
    }
  },
  "pipeline": {
    "chunkSize": 1000
  }
}
```

3. **Update Code**:

```javascript
// v1.x (deprecated)
import { RAGPipeline } from "@DevilsDev/rag-pipeline-utils";

const pipeline = new RAGPipeline({
  openaiKey: process.env.OPENAI_API_KEY,
  pineconeKey: process.env.PINECONE_API_KEY,
});

// v2.x (current)
import { createRagPipeline } from "@DevilsDev/rag-pipeline-utils";

const pipeline = createRagPipeline({
  embedder: { name: "openai" },
  retriever: { name: "pinecone" },
  llm: { name: "openai-gpt-4" },
});
```

4. **Update Plugin Development**:

```javascript
// v1.x plugin interface
class MyLoader {
  load(filePath) {
    return { content: '...', chunks: [...] };
  }
}

// v2.x plugin interface
class MyLoader extends BaseLoader {
  constructor() {
    super();
    this.name = 'my-loader';
    this.version = '1.0.0';
  }

  async load(filePath, options = {}) {
    return [{
      id: this.generateId(filePath),
      content: '...',
      metadata: {},
      chunks: [...]
    }];
  }
}
```

---

## **Framework Migration**

### **Migrating from LangChain**

**Key Differences**:

- Plugin-based vs. chain-based architecture
- Built-in evaluation framework
- Streaming-first design
- TypeScript-native

**Migration Steps**:

1. **Document Loaders**:

```python
# LangChain (Python)
from langchain.document_loaders import PyPDFLoader
loader = PyPDFLoader("document.pdf")
docs = loader.load()

# @DevilsDev/rag-pipeline-utils (JavaScript)
import { createRagPipeline } from '@DevilsDev/rag-pipeline-utils';
const pipeline = createRagPipeline({
  loader: { name: 'pdf' }
});
const docs = await pipeline.load('./document.pdf');
```

2. **Embeddings**:

```python
# LangChain
from langchain.embeddings import OpenAIEmbeddings
embeddings = OpenAIEmbeddings()
vectors = embeddings.embed_documents(texts)

# @DevilsDev/rag-pipeline-utils
const pipeline = createRagPipeline({
  embedder: { name: 'openai' }
});
const vectors = await pipeline.embed(texts);
```

3. **Vector Stores**:

```python
# LangChain
from langchain.vectorstores import Pinecone
vectorstore = Pinecone.from_documents(docs, embeddings)
results = vectorstore.similarity_search(query)

# @DevilsDev/rag-pipeline-utils
const pipeline = createRagPipeline({
  retriever: { name: 'pinecone' }
});
await pipeline.index(docs);
const results = await pipeline.retrieve(query);
```

4. **LLM Integration**:

```python
# LangChain
from langchain.llms import OpenAI
llm = OpenAI(temperature=0.7)
response = llm(prompt)

# @DevilsDev/rag-pipeline-utils
const pipeline = createRagPipeline({
  llm: {
    name: 'openai-gpt-4',
    config: { temperature: 0.7 }
  }
});
const response = await pipeline.generate(prompt);
```

### **Migrating from Haystack**

**Architecture Mapping**:

- Haystack Nodes → RAG Pipeline Plugins
- Haystack Pipelines → RAG Pipeline Configurations
- Haystack Document Stores → RAG Retrievers

**Migration Example**:

```python
# Haystack
from haystack import Pipeline
from haystack.nodes import EmbeddingRetriever, FARMReader

pipeline = Pipeline()
pipeline.add_node(component=retriever, name="Retriever", inputs=["Query"])
pipeline.add_node(component=reader, name="Reader", inputs=["Retriever"])

# @DevilsDev/rag-pipeline-utils
const pipeline = createRagPipeline({
  retriever: { name: 'elasticsearch' },
  llm: { name: 'huggingface-bert' }
});
```

### **Migrating from Custom Solutions**

**Common Migration Patterns**:

1. **Custom Vector Search**:

```javascript
// Custom implementation
class CustomVectorSearch {
  async search(query, vectors) {
    // Custom similarity calculation
    const similarities = vectors.map((v) => cosineSimilarity(query, v));
    return similarities.sort((a, b) => b.score - a.score).slice(0, 5);
  }
}

// Migrate to plugin
class CustomRetriever extends BaseRetriever {
  constructor() {
    super();
    this.name = "custom-vector-search";
    this.version = "1.0.0";
  }

  async retrieve(query, options = {}) {
    const queryVector = await this.embedder.embed(query);
    const results = await this.search(queryVector, this.vectors);
    return results.map((r) => ({
      id: r.id,
      content: r.content,
      score: r.score,
      metadata: r.metadata,
    }));
  }
}
```

2. **Custom Chunking Logic**:

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

// Migrate to loader plugin
class CustomLoader extends BaseLoader {
  chunkText(text, options) {
    // Integrate existing chunking logic
    return chunkDocument(text, options.chunkSize);
  }
}
```

---

## **Data Migration**

### **Vector Store Migration**

**Export from Existing System**:

```bash
# Export vectors and metadata
rag-pipeline export \
  --source pinecone \
  --index old-index \
  --output vectors-backup.json \
  --include-metadata
```

**Import to New System**:

```bash
# Import to new vector store
rag-pipeline import \
  --target chroma \
  --input vectors-backup.json \
  --create-index \
  --batch-size 1000
```

**Cross-Platform Migration**:

```javascript
// Migration script
import { createMigrator } from "@DevilsDev/rag-pipeline-utils";

const migrator = createMigrator({
  source: {
    type: "pinecone",
    config: {
      /* source config */
    },
  },
  target: {
    type: "weaviate",
    config: {
      /* target config */
    },
  },
});

await migrator.migrate({
  batchSize: 500,
  parallel: 3,
  validateIntegrity: true,
});
```

### **Configuration Migration**

**Automated Migration Tool**:

```bash
# Migrate configuration files
rag-pipeline migrate-config \
  --from ./old-config.json \
  --to ./.ragrc.json \
  --format v2.1 \
  --validate
```

**Manual Migration**:

```javascript
// Migration helper
import { migrateConfig } from "@DevilsDev/rag-pipeline-utils";

const oldConfig = require("./old-config.json");
const newConfig = migrateConfig(oldConfig, {
  targetVersion: "2.1.0",
  preserveCustomFields: true,
  updatePluginNames: true,
});

fs.writeFileSync("./.ragrc.json", JSON.stringify(newConfig, null, 2));
```

---

## **Testing Migration**

### **Validation Strategy**

1. **Configuration Validation**:

```bash
# Validate migrated configuration
rag-pipeline config validate --strict

# Test plugin loading
rag-pipeline plugins list --validate
```

2. **Functionality Testing**:

```bash
# Test basic pipeline operations
rag-pipeline query "test query" --dry-run

# Run evaluation on sample data
rag-pipeline evaluate ./test-queries.json --metrics bleu,rouge
```

3. **Performance Comparison**:

```bash
# Benchmark before migration
rag-pipeline benchmark --baseline --output before-migration.json

# Benchmark after migration
rag-pipeline benchmark --compare before-migration.json
```

### **Rollback Strategy**

**Backup Before Migration**:

```bash
# Create complete backup
rag-pipeline export --all --output pre-migration-backup.json

# Backup configuration
cp .ragrc.json .ragrc.json.pre-migration
```

**Rollback Process**:

```bash
# Restore from backup
rag-pipeline import pre-migration-backup.json --overwrite

# Restore configuration
cp .ragrc.json.pre-migration .ragrc.json

# Downgrade package if needed
npm install @DevilsDev/rag-pipeline-utils@1.9.0
```

---

## **Migration Tools & Utilities**

### **Built-in Migration Commands**

```bash
# Check migration requirements
rag-pipeline migration check --target-version 2.1.0

# Generate migration plan
rag-pipeline migration plan --from 2.0.5 --to 2.1.0

# Execute migration
rag-pipeline migration execute --plan migration-plan.json

# Verify migration
rag-pipeline migration verify --post-migration-tests
```

### **Custom Migration Scripts**

```javascript
// Custom migration script
import {
  createMigrationPlan,
  executeMigration,
  validateMigration,
} from "@DevilsDev/rag-pipeline-utils";

async function migrateProject() {
  // 1. Create migration plan
  const plan = await createMigrationPlan({
    from: "2.0.5",
    to: "2.1.0",
    projectPath: process.cwd(),
  });

  console.log("Migration plan:", plan);

  // 2. Execute migration
  const result = await executeMigration(plan, {
    backup: true,
    validateEachStep: true,
    rollbackOnFailure: true,
  });

  // 3. Validate migration
  const validation = await validateMigration({
    testSuite: "./migration-tests.json",
    performanceBaseline: "./baseline-metrics.json",
  });

  if (validation.success) {
    console.log("Migration completed successfully!");
  } else {
    console.error("Migration validation failed:", validation.errors);
  }
}

migrateProject().catch(console.error);
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
3. **Performance Changes**: New architecture may have different performance characteristics
4. **API Changes**: Some programmatic APIs have changed signatures

### **Getting Help**

- **Migration Documentation**: [Complete migration docs](https://docs.rag-pipeline-utils.dev/migration)
- **Community Forum**: [Ask migration questions](https://community.rag-pipeline-utils.dev)
- **Professional Services**: [Enterprise migration support](mailto:migration@devilsdev.com)

---

_This migration guide ensures smooth transitions between versions and frameworks. For additional support, consult the [Troubleshooting Guide](./Troubleshooting.md) or contact our migration specialists._
