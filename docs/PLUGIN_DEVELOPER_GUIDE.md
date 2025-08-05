# Plugin Developer Guide

A comprehensive guide for developing plugins for the RAG Pipeline Utils system.

## Table of Contents

1. [Overview](#overview)
2. [Plugin Architecture](#plugin-architecture)
3. [Getting Started](#getting-started)
4. [Plugin Types](#plugin-types)
5. [Creating Your First Plugin](#creating-your-first-plugin)
6. [Plugin Contracts](#plugin-contracts)
7. [Testing Strategies](#testing-strategies)
8. [Common Pitfalls](#common-pitfalls)
9. [Debugging Tips](#debugging-tips)
10. [Best Practices](#best-practices)
11. [Publishing Plugins](#publishing-plugins)

## Overview

The RAG Pipeline Utils system uses a plugin-based architecture that allows developers to extend functionality by implementing custom loaders, embedders, retrievers, LLMs, and rerankers. This guide will walk you through creating robust, production-ready plugins.

### Why Plugins?

- **Modularity**: Each component has a single responsibility
- **Extensibility**: Easy to add new implementations without modifying core code
- **Testability**: Plugins can be tested in isolation
- **Flexibility**: Mix and match different implementations
- **Community**: Share and reuse plugins across projects

## Plugin Architecture

The plugin system is built around several key concepts:

### Plugin Registry
The central registry manages all plugin instances and enforces contracts at registration time.

### Plugin Contracts
Each plugin type has a defined contract specifying required and optional methods with their signatures.

### Runtime Validation
Plugins are validated when registered to ensure they implement required methods.

### Configuration-Driven Loading
Plugins are loaded dynamically based on `.ragrc.json` configuration.

## Getting Started

### Prerequisites

- Node.js v18+
- Basic understanding of async/await and ES modules
- Familiarity with the RAG pipeline concept

### Quick Start with Scaffolding

The fastest way to create a new plugin is using the built-in scaffolding tool:

```bash
# Scaffold a new LLM plugin
npx rag-pipeline init plugin llm my-custom-llm --author "Your Name" --namespace "@your-org"

# Scaffold an embedder plugin
npx rag-pipeline init plugin embedder my-embedder --description "Custom embedding service"
```

This generates a complete plugin structure with:
- Main implementation file
- Test suite
- Mock implementation
- Configuration example
- Documentation
- Package.json

## Plugin Types

### 1. Loader Plugins
**Purpose**: Load and parse documents from various sources

**Required Methods**:
- `load(filePath: string): Promise<Array<{chunk: () => string[]}>>`

**Use Cases**:
- PDF parsing
- Web scraping
- Database queries
- API data fetching

### 2. Embedder Plugins
**Purpose**: Convert text into vector embeddings

**Required Methods**:
- `embed(chunks: string[]): Promise<number[][]>`
- `embedQuery(query: string): Promise<number[]>`

**Use Cases**:
- OpenAI embeddings
- Hugging Face models
- Custom embedding services
- Local embedding models

### 3. Retriever Plugins
**Purpose**: Store and retrieve vectors from vector databases

**Required Methods**:
- `store(vectors: number[][]): Promise<void>`
- `retrieve(queryVector: number[]): Promise<string[]>`

**Use Cases**:
- Pinecone integration
- Weaviate client
- ChromaDB connector
- In-memory vector store

### 4. LLM Plugins
**Purpose**: Generate responses using language models

**Required Methods**:
- `generate(prompt: string, context: string[]): Promise<string>`

**Optional Methods**:
- `generateStream(prompt: string, context: string[]): AsyncIterable<string>`

**Use Cases**:
- OpenAI GPT models
- Anthropic Claude
- Local LLMs (Ollama)
- Custom API endpoints

### 5. Reranker Plugins
**Purpose**: Reorder retrieved documents by relevance

**Required Methods**:
- `rerank(query: string, documents: string[]): Promise<string[]>`

**Use Cases**:
- Cross-encoder models
- LLM-based reranking
- Custom scoring algorithms

## Creating Your First Plugin

Let's create a simple custom LLM plugin step by step:

### Step 1: Scaffold the Plugin

```bash
npx rag-pipeline init plugin llm echo-llm --author "Your Name"
```

### Step 2: Implement the Plugin

```javascript
// src/echo-llm.js
export class EchoLLM {
  constructor(options = {}) {
    this.prefix = options.prefix || '[ECHO]';
    this.delay = options.delay || 100;
  }

  async generate(prompt, context) {
    // Simulate processing delay
    await new Promise(resolve => setTimeout(resolve, this.delay));
    
    const contextSummary = context.length > 0 
      ? `Context: ${context.join(' | ')}` 
      : 'No context provided';
    
    return `${this.prefix} ${contextSummary}. Query: "${prompt}"`;
  }

  // Optional: Implement streaming
  async* generateStream(prompt, context) {
    const response = await this.generate(prompt, context);
    const words = response.split(' ');
    
    for (const word of words) {
      await new Promise(resolve => setTimeout(resolve, 50));
      yield word + ' ';
    }
  }
}

export default EchoLLM;
```

### Step 3: Add Tests

```javascript
// __tests__/echo-llm.test.js
import { EchoLLM } from '../src/echo-llm.js';

describe('EchoLLM', () => {
  let llm;

  beforeEach(() => {
    llm = new EchoLLM({ prefix: '[TEST]', delay: 0 });
  });

  test('should generate response with context', async () => {
    const result = await llm.generate('Hello', ['doc1', 'doc2']);
    expect(result).toContain('[TEST]');
    expect(result).toContain('Hello');
    expect(result).toContain('doc1 | doc2');
  });

  test('should support streaming', async () => {
    const tokens = [];
    for await (const token of llm.generateStream('Hi', [])) {
      tokens.push(token);
    }
    expect(tokens.length).toBeGreaterThan(0);
    expect(tokens.join('')).toContain('Hi');
  });
});
```

### Step 4: Configure and Test

```json
// .ragrc.json
{
  "loader": {
    "pdf": "./src/mocks/pdf-loader.js"
  },
  "embedder": {
    "openai": "./src/mocks/openai-embedder.js"
  },
  "retriever": {
    "pinecone": "./src/mocks/pinecone-retriever.js"
  },
  "llm": {
    "echo": "./path/to/echo-llm/src/echo-llm.js"
  },
  "namespace": "test-namespace",
  "pipeline": ["loader", "embedder", "retriever"]
}
```

## Plugin Contracts

### Contract Validation

The system automatically validates plugins at registration time:

```javascript
// This will throw an error if methods are missing
registry.register('llm', 'my-llm', new MyLLM());
```

### Method Signatures

All plugin methods should follow the documented signatures:

```javascript
// ✅ Correct signature
async generate(prompt, context) {
  // Implementation
}

// ❌ Wrong signature - will cause runtime errors
async generate(input) {
  // Implementation
}
```

### Error Handling

Always implement proper error handling:

```javascript
async generate(prompt, context) {
  try {
    if (!prompt || typeof prompt !== 'string') {
      throw new Error('Invalid prompt: expected non-empty string');
    }
    
    // Your implementation
    return result;
  } catch (error) {
    throw new Error(`LLM generation failed: ${error.message}`);
  }
}
```

## Testing Strategies

### Unit Testing

Test each method in isolation:

```javascript
describe('MyPlugin', () => {
  test('should handle valid input', async () => {
    const result = await plugin.method(validInput);
    expect(result).toBeDefined();
  });

  test('should reject invalid input', async () => {
    await expect(plugin.method(null)).rejects.toThrow();
  });
});
```

### Integration Testing

Test with the pipeline:

```javascript
import { createRagPipeline } from '@devilsdev/rag-pipeline-utils';

test('should work in pipeline', async () => {
  const pipeline = createRagPipeline({
    loader: 'test-loader',
    embedder: 'test-embedder',
    retriever: 'test-retriever',
    llm: 'my-plugin'
  });

  const result = await pipeline.query('test query');
  expect(result).toBeDefined();
});
```

### Mock Testing

Use mocks for external dependencies:

```javascript
jest.mock('external-api');

test('should handle API failures', async () => {
  externalAPI.mockRejectedValue(new Error('API down'));
  await expect(plugin.method('input')).rejects.toThrow();
});
```

## Common Pitfalls

### 1. Incorrect Method Signatures

```javascript
// ❌ Wrong - doesn't match contract
async embed(text) {
  return this.api.embed(text);
}

// ✅ Correct - matches contract
async embed(chunks) {
  if (!Array.isArray(chunks)) {
    throw new Error('embed() expects an array of strings');
  }
  return this.api.embed(chunks);
}
```

### 2. Missing Error Handling

```javascript
// ❌ Wrong - no error handling
async retrieve(vector) {
  return this.db.search(vector);
}

// ✅ Correct - proper error handling
async retrieve(vector) {
  try {
    if (!Array.isArray(vector)) {
      throw new Error('retrieve() expects a vector array');
    }
    return await this.db.search(vector);
  } catch (error) {
    throw new Error(`Retrieval failed: ${error.message}`);
  }
}
```

### 3. Blocking Operations

```javascript
// ❌ Wrong - synchronous operation
load(filePath) {
  return fs.readFileSync(filePath);
}

// ✅ Correct - asynchronous operation
async load(filePath) {
  try {
    const content = await fs.promises.readFile(filePath, 'utf-8');
    return this.parseContent(content);
  } catch (error) {
    throw new Error(`Failed to load file: ${error.message}`);
  }
}
```

### 4. Memory Leaks

```javascript
// ❌ Wrong - potential memory leak
constructor() {
  this.cache = new Map();
  // No cleanup mechanism
}

// ✅ Correct - proper cleanup
constructor(options = {}) {
  this.cache = new Map();
  this.maxCacheSize = options.maxCacheSize || 1000;
}

async someMethod(input) {
  // Implement cache size limit
  if (this.cache.size >= this.maxCacheSize) {
    this.cache.clear();
  }
  // ... rest of implementation
}
```

## Debugging Tips

### 1. Enable Logging

```javascript
import { logger } from '@devilsdev/rag-pipeline-utils/utils/logger.js';

export class MyPlugin {
  async method(input) {
    logger.debug('MyPlugin.method called', { input });
    
    try {
      const result = await this.process(input);
      logger.info('MyPlugin.method completed', { resultLength: result.length });
      return result;
    } catch (error) {
      logger.error('MyPlugin.method failed', { error: error.message, input });
      throw error;
    }
  }
}
```

### 2. Validate Inputs Early

```javascript
async method(input) {
  // Add detailed validation
  if (input === null || input === undefined) {
    throw new Error('Input cannot be null or undefined');
  }
  
  if (typeof input !== 'string') {
    throw new Error(`Expected string input, got ${typeof input}`);
  }
  
  if (input.trim().length === 0) {
    throw new Error('Input cannot be empty string');
  }
  
  // Continue with processing
}
```

### 3. Use Development Mode

```javascript
export class MyPlugin {
  constructor(options = {}) {
    this.debug = options.debug || process.env.NODE_ENV === 'development';
  }

  async method(input) {
    if (this.debug) {
      console.log('Debug: method called with', input);
    }
    
    // Implementation
  }
}
```

## Best Practices

### 1. Configuration Management

```javascript
export class MyPlugin {
  constructor(options = {}) {
    // Provide sensible defaults
    this.apiKey = options.apiKey || process.env.MY_API_KEY;
    this.timeout = options.timeout || 30000;
    this.retries = options.retries || 3;
    
    // Validate required options
    if (!this.apiKey) {
      throw new Error('API key is required');
    }
  }
}
```

### 2. Resource Management

```javascript
export class MyPlugin {
  constructor(options = {}) {
    this.client = new APIClient(options);
  }

  async cleanup() {
    if (this.client) {
      await this.client.close();
    }
  }
}
```

### 3. Performance Optimization

```javascript
export class MyPlugin {
  constructor(options = {}) {
    this.cache = new Map();
    this.batchSize = options.batchSize || 100;
  }

  async embed(chunks) {
    // Batch processing for better performance
    const results = [];
    for (let i = 0; i < chunks.length; i += this.batchSize) {
      const batch = chunks.slice(i, i + this.batchSize);
      const batchResults = await this.processBatch(batch);
      results.push(...batchResults);
    }
    return results;
  }
}
```

### 4. Streaming Support

```javascript
export class MyLLM {
  async generate(prompt, context) {
    // Non-streaming implementation
    const response = await this.api.complete(prompt, context);
    return response.text;
  }

  async* generateStream(prompt, context) {
    // Streaming implementation
    const stream = await this.api.streamComplete(prompt, context);
    
    for await (const chunk of stream) {
      if (chunk.text) {
        yield chunk.text;
      }
    }
  }
}
```

## Publishing Plugins

### 1. Package Structure

```
my-plugin/
├── src/
│   └── my-plugin.js
├── __tests__/
│   └── my-plugin.test.js
├── mocks/
│   └── my-plugin-mock.js
├── README.md
├── package.json
└── .ragrc.example.json
```

### 2. Package.json Configuration

```json
{
  "name": "@your-org/my-plugin",
  "version": "1.0.0",
  "type": "module",
  "main": "src/my-plugin.js",
  "files": ["src/", "mocks/", "README.md", ".ragrc.example.json"],
  "peerDependencies": {
    "@devilsdev/rag-pipeline-utils": "^2.0.0"
  },
  "keywords": ["rag", "pipeline", "plugin", "ai"]
}
```

### 3. Documentation

Include comprehensive documentation:
- Clear installation instructions
- Usage examples
- Configuration options
- API reference
- Troubleshooting guide

### 4. Testing

Ensure comprehensive test coverage:
- Unit tests for all methods
- Integration tests with the pipeline
- Error handling tests
- Performance tests for large inputs

## Conclusion

Creating plugins for RAG Pipeline Utils is straightforward when following these guidelines. The plugin system is designed to be flexible while maintaining consistency and reliability. 

For additional help:
- Check the [examples directory](../examples/) for reference implementations
- Join our [Discord community](https://discord.gg/rag-pipeline-utils)
- Submit issues on [GitHub](https://github.com/DevilsDev/rag-pipeline-utils)

Happy plugin development! 🚀
