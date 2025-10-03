# Basic RAG Pipeline Example

This example demonstrates the fundamental concepts of building a RAG (Retrieval-Augmented Generation) pipeline using `@devilsdev/rag-pipeline-utils`.

## What This Example Shows

1. **Plugin Implementation** - How to create custom loader, embedder, and retriever plugins
2. **Plugin Registration** - How to register plugins with the plugin registry
3. **DAG Workflow** - Building multi-stage pipelines with dependency management
4. **Error Handling** - Proper validation and error handling patterns

## Prerequisites

- Node.js 18.0.0 or higher
- npm or yarn package manager

## Setup

Install dependencies:

```bash
npm install
```

## Run the Example

```bash
npm start
```

Or directly:

```bash
node index.js
```

## Expected Output

```
=== RAG Pipeline Example ===

✓ DAG validation passed

[INFO] Loading document { filePath: './sample-document.txt' }
[INFO] Embedding texts { count: 1 }
[INFO] Storing vectors { count: 1 }
[INFO] Retrieving similar documents { topK: 3 }

=== Pipeline Results ===

Document loaded: { source: './sample-document.txt', timestamp: '...' }
Embeddings generated: 1 vectors
Storage result: { stored: 1, totalStored: 1 }
Query results: [
  { score: 1, metadata: {...} },
  ...
]

✓ Pipeline completed in 45 ms
```

## Code Structure

### 1. Plugin Implementations

```javascript
// Loader plugin - loads and parses documents
class BasicTextLoader {
  async load(filePath) { ... }
}

// Embedder plugin - converts text to vectors
class MockEmbedder {
  async embed(texts) { ... }
}

// Retriever plugin - stores and retrieves vectors
class MockRetriever {
  async store(vectors, metadata) { ... }
  async retrieve(queryVector, topK) { ... }
}
```

### 2. Plugin Registration

```javascript
pluginRegistry.register("loader", "basic-text", new BasicTextLoader());
pluginRegistry.register("embedder", "mock", new MockEmbedder());
pluginRegistry.register("retriever", "mock", new MockRetriever());
```

### 3. DAG Pipeline

```javascript
const dag = new DAGEngine({ timeout: 30000 });

dag.addNode('load', async (input) => { ... });
dag.addNode('embed', async (document) => { ... });
dag.addNode('store', async (data) => { ... });
dag.addNode('query', async (data) => { ... });

dag.connect('load', 'embed');
dag.connect('embed', 'store');
dag.connect('store', 'query');

const results = await dag.execute({ filePath: './sample.txt' });
```

## Next Steps

To build a production RAG pipeline:

1. **Replace Mock Plugins** - Implement real plugins using:

   - OpenAI Embeddings API
   - Pinecone/Chroma/Weaviate vector database
   - LangChain loaders for various document types

2. **Add LLM Integration** - Add a language model node for query answering

3. **Error Handling** - Add retry logic and graceful degradation

4. **Configuration** - Use `.ragrc.json` for configuration management

5. **Observability** - Enable metrics and tracing for production monitoring

## Learn More

- [Main Documentation](../../README.md)
- [Plugin Development Guide](../../docs/PLUGIN_DEVELOPMENT.md)
- [DAG Engine Documentation](../../docs/DAG_ENGINE.md)
- [Configuration Schema](../../.ragrc.schema.json)

## Support

For issues or questions, please visit:

- [GitHub Issues](https://github.com/DevilsDev/rag-pipeline-utils/issues)
- [GitHub Discussions](https://github.com/DevilsDev/rag-pipeline-utils/discussions)
