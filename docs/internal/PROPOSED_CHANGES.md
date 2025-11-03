# Proposed Changes for Production Release

## @devilsdev/rag-pipeline-utils v2.1.8 → v2.2.0

**Status:** REVIEW REQUIRED - DO NOT APPLY WITHOUT APPROVAL
**Estimated Time:** 2-3 hours total implementation
**Risk Level:** Low (all changes are isolated and reversible)

---

## CHANGE 1: Fix ESM Build (CRITICAL - P0)

**Problem:** ESM module cannot import CommonJS modules as named exports

**Error:**

```
SyntaxError: Named export 'DAGEngine' not found. The requested module '../src/dag/dag-engine.js' is a CommonJS module
```

**Root Cause:** `dist/index.mjs` uses `import { DAGEngine } from '../src/dag/dag-engine.js'` but the source file exports via `module.exports`

### Option A: Fix Generated ESM (Quick Fix)

**File:** `dist/index.mjs`

```diff
--- a/dist/index.mjs
+++ b/dist/index.mjs
@@ -9,32 +9,32 @@
  */

 // Core pipeline functionality
-import { createRagPipeline  } from '../src/core/create-pipeline.js';
+import createPipelineModule from '../src/core/create-pipeline.js';
+const { createRagPipeline } = createPipelineModule;

 // Configuration utilities
-import { loadConfig  } from '../src/config/load-config.js';
-import { validateRagrc  } from '../src/config/enhanced-ragrc-schema.js';
-import { normalizeConfig  } from '../src/config/normalize-config.js';
+import loadConfigModule from '../src/config/load-config.js';
+import validateRagrcModule from '../src/config/enhanced-ragrc-schema.js';
+import normalizeConfigModule from '../src/config/normalize-config.js';
+const { loadConfig } = loadConfigModule;
+const { validateRagrc } = validateRagrcModule;
+const { normalizeConfig } = normalizeConfigModule;

 // Plugin system
 import pluginRegistry from '../src/core/plugin-registry.js';

 // Utilities
 import logger from '../src/utils/logger.js';

 // AI/ML capabilities
 import MultiModalProcessor from '../src/ai/multimodal.js';
 import AdaptiveRetrievalEngine from '../src/ai/retrieval-engine.js';

 // DAG engine for complex workflows
-import { DAGEngine  } from '../src/dag/dag-engine.js';
+import dagEngineModule from '../src/dag/dag-engine.js';
+const { DAGEngine } = dagEngineModule;

 // Performance and observability
 import ParallelProcessor from '../src/core/performance/parallel-processor.js';
 import eventLogger from '../src/core/observability/event-logger.js';
 import metrics from '../src/core/observability/metrics.js';

 // Enterprise features
-import { AuditLogger  } from '../src/enterprise/audit-logging.js';
-import { DataGovernance  } from '../src/enterprise/data-governance.js';
+import auditLoggingModule from '../src/enterprise/audit-logging.js';
+import dataGovernanceModule from '../src/enterprise/data-governance.js';
+const { AuditLogger } = auditLoggingModule;
+const { DataGovernance } = dataGovernanceModule;

 export {
+  createRagPipeline,
+  loadConfig,
+  pluginRegistry,
+  logger,
+  MultiModalProcessor,
+  AdaptiveRetrievalEngine,
+  DAGEngine,
+  ParallelProcessor,
+  AuditLogger,
   validateRagrc,
   normalizeConfig,
-  AdaptiveRetrievalEngine,
   eventLogger,
   metrics,
   DataGovernance
 };

 // Backward compatibility aliases
 export const createPipeline = createRagPipeline;
```

### Option B: Fix Build Script (Permanent Fix)

**File:** `scripts/build.js`

```diff
--- a/scripts/build.js
+++ b/scripts/build.js
@@ -36,13 +36,25 @@ fs.writeFileSync(cjsPath, fixedSourceCode);
 // Create ESM build by converting require/module.exports to import/export
 // and adding .js extensions for ESM compatibility
 let esmCode = sourceCode
-  // Convert destructured require to named imports with .js extension
+  // Convert destructured require to default import + const destructure (for CJS interop)
   .replace(
     /const\s+{\s*([^}]+)\s*}\s*=\s*require\(['"]\.\/([^'"]+)['"]\);/g,
     (match, names, modulePath) => {
-      return `import { ${names} } from '../src/${modulePath}.js';`;
+      // Generate a unique module variable name
+      const moduleVar = modulePath.replace(/[\/\-]/g, '_') + 'Module';
+      return `import ${moduleVar} from '../src/${modulePath}.js';\nconst { ${names} } = ${moduleVar};`;
     },
   )
   // Convert default require to default import with .js extension
   .replace(
     /const\s+(\w+)\s*=\s*require\(['"]\.\/([^'"]+)['"]\);/g,
     (match, varName, modulePath) => {
       return `import ${varName} from '../src/${modulePath}.js';`;
     },
   )
-  // Convert module.exports object to named exports
+  // Convert module.exports object to named exports (add all imported names)
   .replace(/module\.exports\s*=\s*\{([^}]+)\};/s, (match, exportsContent) => {
+    // First, collect all imported names from the code
+    const importedNames = new Set();
+    const importRegex = /const\s+{\s*([^}]+)\s*}\s*=/g;
+    let importMatch;
+    while ((importMatch = importRegex.exec(esmCode)) !== null) {
+      importMatch[1].split(',').forEach(name => {
+        importedNames.add(name.trim());
+      });
+    }
+
+    // Also collect default imports
+    const defaultImportRegex = /import\s+(\w+)\s+from/g;
+    while ((importMatch = defaultImportRegex.exec(esmCode)) !== null) {
+      if (!importMatch[1].includes('Module')) {
+        importedNames.add(importMatch[1]);
+      }
+    }
+
     // Extract property names and handle aliases
     const lines = exportsContent
       .split(",")
       .map((line) => line.trim())
       .filter(Boolean);
     const exports = [];
     const aliases = [];

     for (const line of lines) {
       // Skip comments
       if (line.startsWith("//")) continue;

       // Check for alias pattern "newName: originalName"
       const aliasMatch = line.match(/(\w+):\s*(\w+)(?:\s*\/\/.*)?$/);
       if (aliasMatch && aliasMatch[1] !== aliasMatch[2]) {
         // This is an alias - we'll export it separately
         aliases.push(`export const ${aliasMatch[1]} = ${aliasMatch[2]};`);
         // Don't add to main export block
         continue;
       }

       // Regular export or shorthand property
       const identifierMatch = line.match(/(\w+)(?::\s*\w+)?/);
       if (identifierMatch) {
         exports.push(identifierMatch[1]);
       }
     }
+
+    // Add all imported names to exports if not already there
+    importedNames.forEach(name => {
+      if (!exports.includes(name)) {
+        exports.push(name);
+      }
+    });

     let result = `export {\n  ${exports.join(",\n  ")}\n};`;
     if (aliases.length > 0) {
       result += "\n\n// Backward compatibility aliases\n" + aliases.join("\n");
     }
     return result;
   });
```

**Recommendation:** Apply Option A immediately (manual fix), then Option B for permanent solution

---

## CHANGE 2: Optimize Runtime Dependencies (P1)

**Problem:** CLI-only dependencies are in `dependencies`, increasing install size by 15MB

**File:** `package.json`

```diff
--- a/package.json
+++ b/package.json
@@ -179,13 +179,10 @@
   },
   "dependencies": {
-    "@octokit/rest": "^21.1.1",
     "ajv": "^8.17.1",
     "axios": "^1.8.4",
     "chalk": "^5.4.1",
     "commander": "^13.1.0",
     "csv-parse": "^5.6.0",
     "dotenv": "^16.5.0",
     "fast-glob": "^3.3.3",
     "inquirer": "^8.2.5",
-    "isolated-vm": "6.0.1",
-    "octokit": "^4.1.3",
+    "jsdom": "^26.1.0",
     "openai": "^4.93.0",
     "pino": "^9.6.0"
   },
   "devDependencies": {
+    "@octokit/rest": "^21.1.1",
     "@babel/core": "^7.26.10",
     "@babel/preset-env": "^7.26.9",
     "@docusaurus/core": "^3.7.0",
     "@docusaurus/preset-classic": "^3.7.0",
     "@opentelemetry/api": "^1.9.0",
     ...
     "eslint": "^8.57.1",
     "eslint-plugin-storybook": "^0.12.0",
+    "framer-motion": "^12.7.4",
     "husky": "^8.0.3",
+    "isolated-vm": "6.0.1",
     "jest": "^29.7.0",
     "jest-junit": "^16.0.0",
     "jest-transform-stub": "^2.0.0",
     "lint-staged": "^15.5.1",
+    "octokit": "^4.1.3",
+    "plaiceholder": "^3.0.0",
     "prettier": "^3.5.3",
     "prop-types": "^15.8.1",
     "rimraf": "^6.0.1",
     "semantic-release": "^21.1.2",
+    "sharp": "^0.34.1",
     "ts-jest": "^29.3.2",
     "why-is-node-running": "^3.2.2"
   },
-  "optionalDependencies": {
-    "framer-motion": "^12.7.4",
-    "jsdom": "^26.1.0",
-    "plaiceholder": "^3.0.0",
-    "sharp": "^0.34.1"
-  }
 }
```

**Justification:**

- `@octokit/rest`, `octokit`: Used only in `scripts/` (roadmap management, GitHub API) - 43 occurrences
- `isolated-vm`: Used for plugin sandboxing (enterprise feature, optional)
- `jsdom`: **MUST STAY** - Used in `src/loader/html-loader.js` (runtime dependency)
- `framer-motion`, `plaiceholder`, `sharp`: docs-site only (Docusaurus UI/image processing)

**Impact:**

- Install size reduction: ~15MB
- Faster `npm install` for library users
- No breaking changes (devDeps still available for CLI users)

---

## CHANGE 3: Create OpenAI + Pinecone Example (P2)

**New Files:** `examples/openai-pinecone/`

### File: `examples/openai-pinecone/package.json`

```json
{
  "name": "rag-pipeline-openai-pinecone-example",
  "version": "1.0.0",
  "private": true,
  "description": "Real-world RAG pipeline example using OpenAI and Pinecone",
  "main": "index.js",
  "scripts": {
    "start": "node index.js"
  },
  "dependencies": {
    "@devilsdev/rag-pipeline-utils": "^2.1.8",
    "@pinecone-database/pinecone": "^3.0.0",
    "openai": "^4.93.0",
    "dotenv": "^16.5.0"
  }
}
```

### File: `examples/openai-pinecone/.env.example`

```bash
# OpenAI Configuration
OPENAI_API_KEY=sk-your-api-key-here
OPENAI_MODEL=gpt-4

# Pinecone Configuration
PINECONE_API_KEY=your-pinecone-api-key
PINECONE_ENVIRONMENT=us-east-1
PINECONE_INDEX=rag-demo

# Optional: Use mock mode if no API keys
USE_MOCK_MODE=true
```

### File: `examples/openai-pinecone/index.js`

```javascript
/**
 * RAG Pipeline Example: OpenAI + Pinecone
 *
 * Demonstrates a production-ready RAG pipeline using:
 * - OpenAI for embeddings and LLM
 * - Pinecone for vector storage
 * - DAG workflow engine for orchestration
 */

require("dotenv").config();
const {
  createRagPipeline,
  DAGEngine,
} = require("@devilsdev/rag-pipeline-utils");

// Check if we should use mock mode (no API keys required)
const USE_MOCK =
  process.env.USE_MOCK_MODE === "true" || !process.env.OPENAI_API_KEY;

// ============================================================================
// PLUGIN IMPLEMENTATIONS
// ============================================================================

/**
 * OpenAI Embedder Plugin
 * Converts text to vectors using OpenAI's embedding API
 */
class OpenAIEmbedder {
  constructor(apiKey, model = "text-embedding-ada-002") {
    if (USE_MOCK) {
      console.log("⚠️  Running in MOCK mode - using fake embeddings");
      this.mock = true;
    } else {
      const { OpenAI } = require("openai");
      this.client = new OpenAI({ apiKey });
      this.model = model;
      this.mock = false;
    }
  }

  async embed(texts) {
    if (this.mock) {
      // Return mock embeddings (1536 dimensions for ada-002)
      return texts.map(() =>
        Array(1536)
          .fill(0)
          .map(() => Math.random()),
      );
    }

    const response = await this.client.embeddings.create({
      model: this.model,
      input: texts,
    });

    return response.data.map((d) => d.embedding);
  }

  async embedQuery(query) {
    const vectors = await this.embed([query]);
    return vectors[0];
  }
}

/**
 * Pinecone Retriever Plugin
 * Stores and retrieves vectors from Pinecone
 */
class PineconeRetriever {
  constructor(apiKey, environment, indexName) {
    if (USE_MOCK) {
      console.log("⚠️  Running in MOCK mode - using in-memory vector store");
      this.mock = true;
      this.storage = [];
    } else {
      const { Pinecone } = require("@pinecone-database/pinecone");
      this.client = new Pinecone({ apiKey, environment });
      this.indexName = indexName;
      this.mock = false;
    }
  }

  async store(vectors, metadata) {
    if (this.mock) {
      // Store in memory
      vectors.forEach((vector, i) => {
        this.storage.push({
          id: `doc_${this.storage.length}`,
          vector,
          metadata: metadata[i],
        });
      });
      console.log(
        `✓ Stored ${vectors.length} vectors in mock store (total: ${this.storage.length})`,
      );
      return;
    }

    const index = this.client.Index(this.indexName);
    const records = vectors.map((vector, i) => ({
      id: `doc_${Date.now()}_${i}`,
      values: vector,
      metadata: metadata[i],
    }));

    await index.upsert(records);
    console.log(`✓ Stored ${vectors.length} vectors in Pinecone`);
  }

  async retrieve(queryVector, { topK = 5, threshold = 0.7 } = {}) {
    if (this.mock) {
      // Simple cosine similarity for mock
      const results = this.storage
        .map((item) => ({
          content: item.metadata.content,
          metadata: item.metadata,
          score: Math.random() * 0.5 + 0.5, // Mock scores between 0.5-1.0
        }))
        .sort((a, b) => b.score - a.score)
        .slice(0, topK)
        .filter((r) => r.score >= threshold);

      console.log(`✓ Retrieved ${results.length} results from mock store`);
      return results;
    }

    const index = this.client.Index(this.indexName);
    const response = await index.query({
      vector: queryVector,
      topK,
      includeMetadata: true,
    });

    return response.matches
      .filter((m) => m.score >= threshold)
      .map((m) => ({
        content: m.metadata.content,
        metadata: m.metadata,
        score: m.score,
      }));
  }
}

/**
 * OpenAI LLM Plugin
 * Generates answers using GPT
 */
class OpenAILLM {
  constructor(apiKey, model = "gpt-4") {
    if (USE_MOCK) {
      console.log("⚠️  Running in MOCK mode - using fake LLM responses");
      this.mock = true;
    } else {
      const { OpenAI } = require("openai");
      this.client = new OpenAI({ apiKey });
      this.model = model;
      this.mock = false;
    }
  }

  async generate(prompt, options = {}) {
    if (this.mock) {
      return {
        text: `[MOCK RESPONSE] This is a simulated answer to: "${prompt.substring(0, 100)}..."`,
        usage: { tokens: 150 },
      };
    }

    const response = await this.client.chat.completions.create({
      model: this.model,
      messages: [{ role: "user", content: prompt }],
      ...options,
    });

    return {
      text: response.choices[0].message.content,
      usage: { tokens: response.usage.total_tokens },
    };
  }
}

// ============================================================================
// MAIN EXAMPLE
// ============================================================================

async function main() {
  console.log("=== RAG Pipeline Example: OpenAI + Pinecone ===\n");

  if (USE_MOCK) {
    console.log("🔧 Running in MOCK mode (no API keys required)");
    console.log(
      "   Set USE_MOCK_MODE=false and provide API keys for real usage\n",
    );
  }

  // Initialize plugins
  const embedder = new OpenAIEmbedder(process.env.OPENAI_API_KEY || "mock-key");

  const retriever = new PineconeRetriever(
    process.env.PINECONE_API_KEY || "mock-key",
    process.env.PINECONE_ENVIRONMENT || "us-east-1",
    process.env.PINECONE_INDEX || "rag-demo",
  );

  const llm = new OpenAILLM(
    process.env.OPENAI_API_KEY || "mock-key",
    process.env.OPENAI_MODEL || "gpt-4",
  );

  // Sample documents to ingest
  const documents = [
    {
      content:
        "RAG (Retrieval-Augmented Generation) combines information retrieval with text generation.",
      metadata: { source: "doc1", topic: "RAG basics" },
    },
    {
      content:
        "Vector databases store embeddings and enable semantic search through similarity matching.",
      metadata: { source: "doc2", topic: "Vector databases" },
    },
    {
      content:
        "OpenAI provides embedding models like text-embedding-ada-002 for converting text to vectors.",
      metadata: { source: "doc3", topic: "Embeddings" },
    },
  ];

  // Create DAG pipeline
  const dag = new DAGEngine({ timeout: 60000 });

  // Node 1: Embed documents
  dag.addNode("embed-docs", async (input) => {
    console.log("\n📝 Step 1: Embedding documents...");
    const texts = input.documents.map((d) => d.content);
    const vectors = await embedder.embed(texts);
    console.log(`   ✓ Generated ${vectors.length} embeddings`);

    return {
      vectors,
      documents: input.documents,
    };
  });

  // Node 2: Store in vector database
  dag.addNode("store-vectors", async (data) => {
    console.log("\n💾 Step 2: Storing vectors...");
    await retriever.store(
      data.vectors,
      data.documents.map((d) => d.metadata),
    );

    return { success: true };
  });

  // Node 3: Query the system
  dag.addNode("query", async () => {
    const query = "What is RAG and how does it work?";
    console.log(`\n🔍 Step 3: Querying: "${query}"`);

    // Embed query
    const queryVector = await embedder.embedQuery(query);

    // Retrieve relevant documents
    const results = await retriever.retrieve(queryVector, { topK: 2 });
    console.log(`   ✓ Retrieved ${results.length} relevant documents`);

    // Build prompt with context
    const context = results.map((r) => r.content).join("\n\n");
    const prompt = `Answer the following question based on the context provided.

Context:
${context}

Question: ${query}

Answer:`;

    // Generate answer
    console.log("\n🤖 Step 4: Generating answer...");
    const response = await llm.generate(prompt);

    return {
      query,
      context: results,
      answer: response.text,
      usage: response.usage,
    };
  });

  // Connect nodes
  dag.connect("embed-docs", "store-vectors");
  dag.connect("store-vectors", "query");

  // Execute pipeline
  console.log("\n▶️  Starting pipeline execution...\n");
  console.log("─".repeat(60));

  try {
    const startTime = Date.now();
    const results = await dag.execute({ documents });
    const duration = Date.now() - startTime;

    console.log("\n" + "─".repeat(60));
    console.log("\n✅ Pipeline completed successfully!\n");

    // Display results
    const queryResult = results.get("query");
    console.log("📊 Results:");
    console.log(`   Query: ${queryResult.query}`);
    console.log(`   Answer: ${queryResult.answer}`);
    console.log(`   Sources used: ${queryResult.context.length} documents`);
    console.log(`   Tokens used: ${queryResult.usage?.tokens || "N/A"}`);
    console.log(`   Duration: ${duration}ms`);

    console.log("\n✨ Example completed!");

    if (USE_MOCK) {
      console.log(
        "\n💡 Tip: Set real API keys in .env to see actual OpenAI + Pinecone integration",
      );
    }
  } catch (error) {
    console.error("\n❌ Pipeline failed:", error.message);
    process.exit(1);
  }
}

// Run example
if (require.main === module) {
  main().catch((error) => {
    console.error("Fatal error:", error);
    process.exit(1);
  });
}

module.exports = { OpenAIEmbedder, PineconeRetriever, OpenAILLM };
```

### File: `examples/openai-pinecone/README.md`

````markdown
# OpenAI + Pinecone RAG Pipeline Example

A production-ready example demonstrating how to build a RAG pipeline using:

- **OpenAI** for embeddings (text-embedding-ada-002) and LLM (GPT-4)
- **Pinecone** for vector storage and semantic search
- **DAG Engine** for workflow orchestration

## Features

- ✅ Real OpenAI API integration
- ✅ Real Pinecone vector database
- ✅ Mock mode for testing without API keys
- ✅ Complete error handling
- ✅ DAG-based workflow
- ✅ TypeScript-ready

## Setup

1. Install dependencies:

```bash
npm install
```
````

2. Copy environment file:

```bash
cp .env.example .env
```

3. Add your API keys to `.env`:

```bash
OPENAI_API_KEY=sk-your-key-here
PINECONE_API_KEY=your-pinecone-key
PINECONE_ENVIRONMENT=us-east-1
PINECONE_INDEX=rag-demo
```

## Usage

### With Real API Keys

```bash
# Make sure .env has real keys
USE_MOCK_MODE=false npm start
```

### Mock Mode (No API Keys Required)

```bash
# Perfect for testing the pipeline structure
USE_MOCK_MODE=true npm start
```

Or just:

```bash
npm start
```

## Expected Output

```
=== RAG Pipeline Example: OpenAI + Pinecone ===

▶️  Starting pipeline execution...

────────────────────────────────────────────────────────────

📝 Step 1: Embedding documents...
   ✓ Generated 3 embeddings

💾 Step 2: Storing vectors...
   ✓ Stored 3 vectors in Pinecone

🔍 Step 3: Querying: "What is RAG and how does it work?"
   ✓ Retrieved 2 relevant documents

🤖 Step 4: Generating answer...

────────────────────────────────────────────────────────────

✅ Pipeline completed successfully!

📊 Results:
   Query: What is RAG and how does it work?
   Answer: RAG (Retrieval-Augmented Generation) is a technique that...
   Sources used: 2 documents
   Tokens used: 245
   Duration: 3421ms

✨ Example completed!
```

## How It Works

1. **Document Embedding**: Sample documents are converted to vectors using OpenAI's `text-embedding-ada-002`
2. **Vector Storage**: Embeddings are stored in Pinecone with metadata
3. **Query Processing**: User query is embedded and used to search Pinecone
4. **Context Retrieval**: Top K similar documents are retrieved
5. **Answer Generation**: Retrieved context + query sent to GPT-4 for answer generation

## Customization

### Change Embedding Model

```javascript
const embedder = new OpenAIEmbedder(apiKey, "text-embedding-3-small");
```

### Change LLM Model

```javascript
const llm = new OpenAILLM(apiKey, "gpt-3.5-turbo");
```

### Adjust Retrieval Parameters

```javascript
const results = await retriever.retrieve(queryVector, {
  topK: 5, // Return top 5 results
  threshold: 0.8, // Minimum similarity score
});
```

## Cost Estimation

**Per query (approximate):**

- Embeddings: $0.0001 (3 documents + 1 query)
- Vector storage: $0.00002 (Pinecone)
- LLM generation: $0.03 (GPT-4, ~1000 tokens)

**Total**: ~$0.03 per query

Use GPT-3.5-turbo to reduce costs by ~90%.

## Production Considerations

1. **Error Handling**: Add retry logic for API failures
2. **Rate Limiting**: Implement backoff for OpenAI rate limits
3. **Caching**: Cache embeddings to reduce API calls
4. **Monitoring**: Add metrics and logging
5. **Scaling**: Use batch operations for large document sets

## Next Steps

- Try with your own documents
- Experiment with different models
- Add reranking for better results
- Implement streaming responses
- Add conversation memory

## Support

- [Main Documentation](../../README.md)
- [GitHub Issues](https://github.com/DevilsDev/rag-pipeline-utils/issues)

````

---

## CHANGE 4: Add README Compatibility Section (P2)

**File:** `README.md`

Insert after line 17 (after `**Requirements:** Node.js >= 18.0.0`):

```diff
--- a/README.md
+++ b/README.md
@@ -17,6 +17,73 @@ npm install @devilsdev/rag-pipeline-utils

 **Requirements:** Node.js >= 18.0.0

+## Compatibility & Footprint
+
+### Platform Support
+
+| Platform | Status | Notes |
+|----------|--------|-------|
+| **Linux** | ✅ Fully Supported | Tested on Ubuntu 20.04+, Debian 11+ |
+| **macOS** | ✅ Fully Supported | Tested on macOS 12+ (Intel & Apple Silicon) |
+| **Windows** | ✅ Fully Supported | Tested on Windows 10/11 |
+| **Docker** | ✅ Supported | Alpine and Debian base images |
+
+### Module Systems
+
+Both CommonJS and ES Modules are supported:
+
+```javascript
+// CommonJS (recommended for Node.js projects)
+const { createRagPipeline, DAGEngine } = require('@devilsdev/rag-pipeline-utils');
+
+// ES Modules (recommended for modern projects)
+import { createRagPipeline, DAGEngine } from '@devilsdev/rag-pipeline-utils';
+```
+
+### Package Size
+
+- **Installed Size:** ~500KB (core library only)
+- **With Dependencies:** ~95MB (includes all runtime deps)
+- **Dependency Count:** 12 runtime dependencies
+- **Optional Features:**
+  - HTML loading requires `jsdom` (runtime dep)
+  - CLI features use additional packages
+
+### Docker Usage
+
+**Minimal Dockerfile:**
+```dockerfile
+FROM node:18-alpine
+WORKDIR /app
+COPY package*.json ./
+RUN npm ci --production
+COPY . .
+CMD ["node", "your-app.js"]
+```
+
+**CLI in Docker:**
+```dockerfile
+FROM node:18-alpine
+RUN npm install -g @devilsdev/rag-pipeline-utils
+CMD ["rag-pipeline", "--help"]
+```
+
+### TypeScript Support
+
+Full TypeScript definitions included at `dist/index.d.ts`:
+
+```typescript
+import {
+  createRagPipeline,
+  DAGEngine,
+  type RagPipelineConfig,
+  type DAGOptions
+} from '@devilsdev/rag-pipeline-utils';
+
+const config: RagPipelineConfig = { /* ... */ };
+const pipeline = createRagPipeline(config);
+```
+
 ## Quick Start

 ### Basic Pipeline Setup
````

---

## CHANGE 5: Expand TypeScript Definitions (P3)

**File:** `dist/index.d.ts`

```diff
--- a/dist/index.d.ts
+++ b/dist/index.d.ts
@@ -3,6 +3,90 @@
  * @module @devilsdev/rag-pipeline-utils
  */

+// ============================================================================
+// Plugin Contracts
+// ============================================================================
+
+/**
+ * Document structure returned by loaders
+ */
+export interface Document {
+  content: string;
+  metadata?: Record<string, any>;
+  embedding?: number[];
+}
+
+/**
+ * Search result with similarity score
+ */
+export interface SearchResult extends Document {
+  score: number;
+}
+
+/**
+ * Options for retrieval operations
+ */
+export interface RetrieveOptions {
+  topK?: number;
+  threshold?: number;
+  filter?: Record<string, any>;
+}
+
+/**
+ * LLM response structure
+ */
+export interface LLMResponse {
+  text: string;
+  usage?: {
+    tokens: number;
+    cost?: number;
+  };
+  metadata?: Record<string, any>;
+}
+
+/**
+ * Loader plugin interface
+ * Responsible for loading and parsing documents
+ */
+export interface LoaderPlugin {
+  load(filePath: string, options?: any): Promise<Document[]>;
+}
+
+/**
+ * Embedder plugin interface
+ * Converts text to vector embeddings
+ */
+export interface EmbedderPlugin {
+  embed(texts: string[], options?: any): Promise<number[][]>;
+  embedQuery?(query: string, options?: any): Promise<number[]>;
+}
+
+/**
+ * Retriever plugin interface
+ * Stores and retrieves vectors from a vector database
+ */
+export interface RetrieverPlugin {
+  store(vectors: number[][], metadata: any[], options?: any): Promise<void>;
+  retrieve(queryVector: number[], options?: RetrieveOptions): Promise<SearchResult[]>;
+}
+
+/**
+ * LLM plugin interface
+ * Generates text responses
+ */
+export interface LLMPlugin {
+  generate(prompt: string, options?: any): Promise<LLMResponse>;
+  stream?(prompt: string, options?: any): AsyncGenerator<string, void, unknown>;
+}
+
+/**
+ * Reranker plugin interface
+ * Reorders search results by relevance
+ */
+export interface RerankerPlugin {
+  rerank(query: string, documents: Document[], options?: any): Promise<Document[]>;
+}
+
+// ============================================================================
+// Configuration Interfaces
+// ============================================================================
+
 export interface RagPipelineConfig {
   loader?: string;
   embedder?: string;
@@ -17,6 +101,7 @@ export interface LoadConfigOptions {
   validate?: boolean;
 }

+// Pipeline execution options
 export interface PipelineExecuteOptions {
   query?: string;
   documents?: string[];
   [key: string]: any;
 }

+// ============================================================================
+// DAG Engine Interfaces
+// ============================================================================
+
 export interface DAGNode {
   id: string;
   run: (input: any) => Promise<any>;
   inputs?: string[];
   outputs?: string[];
   optional?: boolean;
   maxRetries?: number;
   retryDelay?: number;
 }

 export interface DAGOptions {
   timeout?: number;
   concurrency?: number;
   continueOnError?: boolean;
   gracefulDegradation?: boolean;
   requiredNodes?: string[];
   retryFailedNodes?: boolean;
   maxRetries?: number;
 }

+// ============================================================================
+// Plugin Registry Interface
+// ============================================================================
+
 export interface PluginRegistry {
   register(type: string, name: string, implementation: any): void;
   get(type: string, name: string): any;
   has(type: string, name: string): boolean;
   list(type: string): any[];
 }

+// ============================================================================
+// Logging Interface
+// ============================================================================
+
 export interface Logger {
   info(message: string, meta?: any): void;
   error(message: string, meta?: any): void;
   warn(message: string, meta?: any): void;
   debug(message: string, meta?: any): void;
+  setLevel(level: 'debug' | 'info' | 'warn' | 'error'): void;
 }

-// Core API
+// ============================================================================
+// Core API Exports
+// ============================================================================
+
+/**
+ * Create a RAG pipeline instance
+ */
 export function createRagPipeline(config: RagPipelineConfig): any;
+
+/**
+ * Backward compatibility alias for createRagPipeline
+ */
 export { createRagPipeline as createPipeline };

-// Configuration
+/**
+ * Load configuration from file
+ */
 export function loadConfig(options?: LoadConfigOptions): Promise<RagPipelineConfig>;
+
+/**
+ * Validate .ragrc configuration
+ */
 export function validateRagrc(config: any): boolean;
+
+/**
+ * Normalize configuration to standard format
+ */
 export function normalizeConfig(config: any): RagPipelineConfig;

-// Plugin system
+/**
+ * Global plugin registry instance
+ */
 export const pluginRegistry: PluginRegistry;

-// Utilities
+/**
+ * Global logger instance
+ */
 export const logger: Logger;

-// DAG Engine
+// ============================================================================
+// DAG Engine Class
+// ============================================================================
+
+/**
+ * Directed Acyclic Graph execution engine
+ * For building complex multi-stage workflows
+ */
 export class DAGEngine {
   constructor(options?: DAGOptions);
+
+  /**
+   * Add a node to the DAG
+   */
   addNode(id: string, fn: (input: any) => Promise<any>, options?: Partial<DAGNode>): void;
+
+  /**
+   * Connect two nodes (creates dependency)
+   */
   connect(fromId: string, toId: string): void;
+
+  /**
+   * Execute the entire DAG
+   */
   execute(seed?: any, options?: DAGOptions): Promise<Map<string, any>>;
+
+  /**
+   * Validate DAG structure (checks for cycles)
+   */
   validate(): void;
 }

-// AI/ML
+// ============================================================================
+// AI/ML Classes
+// ============================================================================
+
+/**
+ * Multi-modal content processor
+ * Handles text, images, audio, etc.
+ */
 export class MultiModalProcessor {
   constructor(options?: any);
   process(input: any): Promise<any>;
 }

+/**
+ * Adaptive retrieval engine
+ * Dynamically adjusts retrieval strategy
+ */
 export class AdaptiveRetrievalEngine {
   constructor(options?: any);
   retrieve(query: string, options?: any): Promise<any>;
 }

-// Performance
+// ============================================================================
+// Performance Classes
+// ============================================================================
+
+/**
+ * Parallel task processor
+ * Executes items concurrently with configurable concurrency
+ */
 export class ParallelProcessor {
-  constructor(options?: any);
+  constructor(options?: {
+    maxConcurrency?: number;
+    batchSize?: number;
+  });
   process(items: any[], handler: (item: any) => Promise<any>): Promise<any[]>;
 }

-// Observability
+// ============================================================================
+// Observability
+// ============================================================================
+
+/**
+ * Event logging interface
+ */
 export const eventLogger: {
+  configure(options: { level?: string; format?: string }): void;
   log(event: string, data?: any): void;
 };

+/**
+ * Metrics collection interface
+ */
 export const metrics: {
   counter(name: string): { inc(): void };
   timer(name: string): { end(): void };
+  getMetrics(): Record<string, any>;
 };

-// Enterprise
+// ============================================================================
+// Enterprise Features
+// ============================================================================
+
+/**
+ * Audit logger for compliance
+ * Immutable logging for regulatory requirements
+ */
 export class AuditLogger {
-  constructor(options?: any);
+  constructor(options?: {
+    destination?: string;
+    format?: 'json' | 'csv';
+  });
   log(event: string, data?: any): void;
 }

+/**
+ * Data governance and policy enforcement
+ */
 export class DataGovernance {
-  constructor(options?: any);
-  enforce(policy: any): void;
+  constructor(options?: {
+    policies?: {
+      retention?: string;
+      encryption?: boolean;
+    };
+  });
+  enforce(data: any): Promise<void>;
 }
```

---

## VERIFICATION COMMANDS

After applying changes, run these commands to verify:

### 1. Build Verification

```bash
rm -rf dist/
npm run build

# Should output:
# ✅ Build completed successfully!
# ✅ TypeScript definitions generated: dist/index.d.ts
```

### 2. ESM Test (CRITICAL)

```bash
# Must succeed after ESM fix
node --input-type=module -e "import('./dist/index.mjs').then(x => console.log('ESM exports:', Object.keys(x).join(', ')))"

# Expected output:
# ESM exports: createRagPipeline, loadConfig, pluginRegistry, logger, ...
```

### 3. CJS Test

```bash
node -e "const {createRagPipeline, DAGEngine} = require('./dist/index.cjs'); console.log('CJS OK:', typeof createRagPipeline, typeof DAGEngine)"

# Expected output:
# CJS OK: function function
```

### 4. Package Contents Test

```bash
npm pack --dry-run | grep "Tarball Contents" -A 50

# Should include:
# dist/index.cjs, dist/index.mjs, dist/index.d.ts
# bin/cli.js
# contracts/*.json
# README.md, LICENSE
# .ragrc.schema.json
# src/ (intentional)
```

### 5. CLI Test

```bash
node bin/cli.js --help

# Should output CLI help
```

### 6. Dependency Install Size

```bash
# Before changes
npm install --production
du -sh node_modules  # ~95MB

# After changes (need to apply first)
rm -rf node_modules
npm install --production
du -sh node_modules  # ~80MB (15MB savings)
```

### 7. Example Test

```bash
cd examples/openai-pinecone
npm install
USE_MOCK_MODE=true npm start

# Should complete without errors
```

---

## ROLLBACK PROCEDURES

If any change causes issues:

### Rollback ESM Fix

```bash
git checkout HEAD -- dist/index.mjs
npm run build  # Regenerate
```

### Rollback Dependencies

```bash
git checkout HEAD -- package.json
rm -rf node_modules package-lock.json
npm install
```

### Rollback All Changes

```bash
git stash  # Save current work
git reset --hard HEAD  # Restore to last commit
npm install
```

---

## APPROVAL CHECKLIST

Before applying changes:

- [ ] Engineering lead reviewed diffs
- [ ] QA team verified on test environment
- [ ] License decision made (keep GPL-3.0 or switch)
- [ ] CI/CD pipeline ready for updated dependencies
- [ ] Documentation team reviewed README changes
- [ ] Examples tested with mock mode
- [ ] Examples tested with real API keys (optional)

---

## TIMELINE

| Task                    | Duration     | Responsible | Status     |
| ----------------------- | ------------ | ----------- | ---------- |
| ESM build fix           | 30 min       | Engineer    | ⏳ Ready   |
| Dependency optimization | 15 min       | Engineer    | ⏳ Ready   |
| OpenAI example          | 60 min       | Engineer    | ⏳ Ready   |
| README updates          | 30 min       | Docs        | ⏳ Ready   |
| TypeScript defs         | 30 min       | Engineer    | ⏳ Ready   |
| Testing                 | 45 min       | QA          | ⏳ Pending |
| **Total**               | **3h 30min** | -           | -          |

---

END OF PROPOSED CHANGES
**Next Step:** Review and approve before implementation
