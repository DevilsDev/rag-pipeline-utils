# @DevilsDev/rag-pipeline-utils

[![CI](https://github.com/DevilsDev/rag-pipeline-utils/actions/workflows/ci.yml/badge.svg)](https://github.com/DevilsDev/rag-pipeline-utils/actions)
[![npm version](https://img.shields.io/npm/v/@devilsdev/rag-pipeline-utils.svg)](https://www.npmjs.com/package/@devilsdev/rag-pipeline-utils)
[![Node.js Version](https://img.shields.io/node/v/@devilsdev/rag-pipeline-utils.svg)](https://nodejs.org/)
[![License](https://img.shields.io/npm/l/@devilsdev/rag-pipeline-utils.svg)](https://github.com/DevilsDev/rag-pipeline-utils/blob/main/LICENSE)
[![codecov](https://codecov.io/gh/DevilsDev/rag-pipeline-utils/branch/main/graph/badge.svg)](https://codecov.io/gh/DevilsDev/rag-pipeline-utils)
[![Downloads](https://img.shields.io/npm/dm/@devilsdev/rag-pipeline-utils.svg)](https://www.npmjs.com/package/@devilsdev/rag-pipeline-utils)

> **Enterprise-grade RAG pipeline toolkit for Node.js** — Build production-ready Retrieval-Augmented Generation systems with modular plugins, streaming support, and comprehensive observability.

## Overview

`@devilsdev/rag-pipeline-utils` is a modular toolkit for building scalable RAG (Retrieval-Augmented Generation) pipelines in Node.js. Designed for enterprise applications, it provides a plugin-based architecture with built-in streaming, performance optimization, observability, and comprehensive testing utilities.







## ✨ Key Features

### 🔌 **Plugin Architecture**
- **Modular Components**: Swap loaders, embedders, retrievers, LLMs, and rerankers without code changes
- **Contract Validation**: Runtime and CI verification of plugin interfaces
- **Plugin Marketplace**: Discover and publish community plugins
- **Hot-swappable**: Change components via configuration without restarts

### 🚀 **Performance & Scalability**
- **Streaming Support**: Real-time token streaming for LLM responses
- **Parallel Processing**: Concurrent embedding and retrieval operations
- **Memory Safeguards**: Automatic backpressure and memory management
- **Benchmarking Tools**: Built-in performance measurement and optimization

### 📊 **Enterprise Observability**
- **Structured Logging**: Comprehensive event tracking and debugging
- **Metrics Collection**: Performance counters, histograms, and gauges
- **Distributed Tracing**: OpenTelemetry-compatible request tracing
- **Health Monitoring**: Built-in diagnostics and system health checks

### 🛠️ **Developer Experience**
- **CLI Tools**: Full-featured command-line interface
- **Interactive Wizard**: Guided pipeline setup and configuration
- **Plugin Scaffolding**: Generate new plugins with best practices
- **Comprehensive Testing**: Unit, integration, and contract testing utilities

### 🔒 **Production Ready**
- **Schema Validation**: Strict configuration validation with JSON Schema
- **Error Handling**: Robust error recovery and reporting
- **Type Safety**: Full TypeScript support and JSDoc annotations
- **CI/CD Integration**: GitHub Actions workflows and automated testing

### 🛡️ **Enterprise Security**
- **Zero Critical Vulnerabilities**: 98→17 vulnerabilities eliminated (83% reduction)
- **Automated Security Monitoring**: GitHub Dependabot with weekly vulnerability scans
- **CI/CD Security Integration**: Build failure on critical vulnerabilities
- **Compliance Ready**: OWASP, NIST, and CIS security standards
- **Dependency Validation**: Automated license and security compliance checking
- **Security Audit Tools**: Built-in `npm run security:audit` and reporting

## 📦 Installation

### Prerequisites
- **Node.js** 18.0.0 or higher
- **npm** or **yarn** package manager

### Install via npm
```bash
npm install -g @devilsdev/rag-pipeline-utils
```

### Install as project dependency
```bash
npm install @devilsdev/rag-pipeline-utils
```

## 🚀 Quick Start

### 1. Initialize a new RAG pipeline
```bash
rag-pipeline init
```
This launches an interactive wizard to configure your pipeline with preferred plugins.

### 2. Configure your pipeline
Create a `.ragrc.json` configuration file:

```json
{
  "loader": {
    "pdf": "@devilsdev/pdf-loader",
    "markdown": "@devilsdev/markdown-loader"
  },
  "embedder": {
    "openai": "@devilsdev/openai-embedder"
  },
  "retriever": {
    "chroma": "@devilsdev/chroma-retriever"
  },
  "llm": {
    "openai": "@devilsdev/openai-llm"
  },
  "pipeline": {
    "loader": "pdf",
    "embedder": "openai",
    "retriever": "chroma",
    "llm": "openai"
  },
  "performance": {
    "maxConcurrency": 5,
    "enableStreaming": true,
    "enableObservability": true
  }
}
```

## 🖥️ CLI Usage

### Document Ingestion
```bash
# Ingest documents with automatic plugin detection
rag-pipeline ingest ./docs --loader pdf --embedder openai --retriever chroma

# Ingest with streaming and performance monitoring
rag-pipeline ingest ./docs --stream --benchmark --trace

# Batch ingest multiple document types
rag-pipeline ingest ./docs/**/*.{pdf,md,txt} --parallel --batch-size 10
```

### Querying
```bash
# Basic query
rag-pipeline query "What is vector search?" --llm openai

# Streaming query with real-time responses
rag-pipeline query "Explain RAG architecture" --llm openai --stream

# Query with custom retrieval parameters
rag-pipeline query "How does embedding work?" --top-k 5 --similarity-threshold 0.8
```

### Advanced Workflows
```bash
# Run complex DAG pipelines
rag-pipeline dag run ./examples/academic-rag.yaml

# Interactive pipeline builder
rag-pipeline wizard

# System diagnostics and health check
rag-pipeline doctor

# Plugin management
rag-pipeline plugin list
rag-pipeline plugin install @community/custom-embedder
rag-pipeline plugin scaffold my-custom-loader
```

## 🔌 Plugin Architecture

### Plugin Contracts
Each plugin type implements a standardized interface with runtime validation:

| Plugin Type | Required Methods | Optional Methods | Description |
|-------------|------------------|------------------|-------------|
| **Loader** | `load(filePath)` | `validate()`, `getMetadata()` | Document ingestion and parsing |
| **Embedder** | `embed(texts)`, `embedQuery(query)` | `getDimensions()`, `getBatchSize()` | Text vectorization |
| **Retriever** | `store(vectors)`, `retrieve(queryVector)` | `delete()`, `update()` | Vector storage and similarity search |
| **LLM** | `generate(prompt)`, `stream(prompt)` | `getTokenCount()`, `getModels()` | Language model inference |
| **Reranker** | `rerank(query, documents)` | `getScore()` | Result relevance optimization |

### Plugin Development
```javascript
// Example: Custom embedder plugin
export class MyCustomEmbedder {
  constructor(options = {}) {
    this.apiKey = options.apiKey;
    this.model = options.model || 'text-embedding-ada-002';
  }

  async embed(texts) {
    // Implementation for batch embedding
    return vectors;
  }

  async embedQuery(query) {
    // Implementation for single query embedding
    return vector;
  }

  // Plugin metadata (required)
  static metadata = {
    name: 'my-custom-embedder',
    version: '1.0.0',
    type: 'embedder',
    description: 'Custom embedding implementation'
  };
}
```

## 🏗️ Architecture Overview

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   CLI Interface │────│  Pipeline Engine │────│ Plugin Registry │
└─────────────────┘    └──────────────────┘    └─────────────────┘
                                │
                ┌───────────────┼───────────────┐
                │               │               │
        ┌───────▼──────┐ ┌──────▼──────┐ ┌─────▼─────┐
        │ Observability│ │Performance  │ │   DAG     │
        │   System     │ │ Optimizer   │ │  Engine   │
        └──────────────┘ └─────────────┘ └───────────┘
                │               │               │
        ┌───────▼──────┐ ┌──────▼──────┐ ┌─────▼─────┐
        │   Logging    │ │  Streaming  │ │Workflow   │
        │   Tracing    │ │  Parallel   │ │Execution  │
        │   Metrics    │ │  Memory     │ │Validation │
        └──────────────┘ └─────────────┘ └───────────┘
```

## 📁 Project Structure

```
@devilsdev/rag-pipeline-utils/
├── bin/
│   └── cli.js                 # CLI entry point
├── src/
│   ├── cli/                   # Command-line interface
│   │   ├── enhanced-cli-commands.js
│   │   ├── interactive-wizard.js
│   │   ├── doctor-command.js
│   │   └── plugin-marketplace-commands.js
│   ├── core/                  # Core pipeline engine
│   │   ├── create-pipeline.js
│   │   ├── plugin-registry.js
│   │   ├── plugin-contracts.js
│   │   ├── observability/     # Monitoring & logging
│   │   ├── performance/       # Optimization tools
│   │   └── plugin-marketplace/
│   ├── config/                # Configuration management
│   │   ├── load-config.js
│   │   └── enhanced-ragrc-schema.js
│   ├── dag/                   # DAG workflow engine
│   │   └── dag-engine.js
│   ├── utils/                 # Utility functions
│   │   ├── logger.js
│   │   ├── retry.js
│   │   └── plugin-scaffolder.js
│   └── mocks/                 # Development mocks
├── __tests__/                 # Test suites
│   ├── unit/
│   ├── integration/
│   └── fixtures/
├── docs/                      # Documentation
├── examples/                  # Usage examples
├── scripts/                   # Build & maintenance
├── .ragrc.schema.json        # Configuration schema
├── package.json
└── README.md
```



## 📚 Configuration

### Environment Variables
```bash
# OpenAI Configuration
OPENAI_API_KEY=your_openai_api_key
OPENAI_MODEL=gpt-4

# Vector Database Configuration
PINECONE_API_KEY=your_pinecone_key
PINECONE_ENVIRONMENT=us-west1-gcp

# Performance Settings
RAG_MAX_CONCURRENCY=5
RAG_BATCH_SIZE=10
RAG_ENABLE_STREAMING=true
```

### Advanced Configuration
```json
{
  "pipeline": {
    "loader": "pdf",
    "embedder": "openai",
    "retriever": "chroma",
    "llm": "openai",
    "reranker": "cross-encoder"
  },
  "performance": {
    "maxConcurrency": 5,
    "batchSize": 10,
    "enableStreaming": true,
    "enableObservability": true,
    "maxMemoryMB": 512,
    "tokenLimit": 100000
  },
  "observability": {
    "enableLogging": true,
    "enableTracing": true,
    "enableMetrics": true,
    "logLevel": "info",
    "exportFormat": "json"
  },
  "plugins": {
    "marketplace": {
      "registryUrl": "https://registry.rag-pipeline.dev",
      "autoUpdate": false,
      "allowPrerelease": false
    }
  }
}
```

## 🚀 Use Cases

### Enterprise Document Processing
- **Legal Document Analysis**: Process contracts, agreements, and legal documents
- **Technical Documentation**: Index API docs, manuals, and knowledge bases
- **Research Papers**: Academic literature search and analysis
- **Customer Support**: FAQ automation and ticket resolution

### Development Workflows
- **Code Documentation**: Generate and maintain code documentation
- **API Integration**: Semantic search across API documentation
- **Knowledge Management**: Team knowledge base and onboarding
- **Content Generation**: Automated content creation and editing

### Industry Applications
- **Healthcare**: Medical literature search and clinical decision support
- **Finance**: Financial document analysis and compliance
- **Education**: Personalized learning and content recommendation
- **E-commerce**: Product search and recommendation systems

## 🤝 Contributing

We welcome contributions from the community! Here's how you can help:

### Development Setup
```bash
# Clone the repository
git clone https://github.com/DevilsDev/rag-pipeline-utils.git
cd rag-pipeline-utils

# Install dependencies
npm install

# Run tests
npm test

# Run linting
npm run lint

# Start development server
npm run dev
```

### Contribution Guidelines
- **Plugin Development**: Create new plugins following our [Plugin Developer Guide](./docs/PLUGIN_DEVELOPER_GUIDE.md)
- **Bug Reports**: Use GitHub Issues with detailed reproduction steps
- **Feature Requests**: Discuss new features in GitHub Discussions
- **Documentation**: Help improve docs and examples
- **Testing**: Add tests for new features and bug fixes

### Community
- 💬 [GitHub Discussions](https://github.com/DevilsDev/rag-pipeline-utils/discussions) - Questions and community chat
- 🐛 [GitHub Issues](https://github.com/DevilsDev/rag-pipeline-utils/issues) - Bug reports and feature requests
- 📖 [Documentation](https://devilsdev.github.io/rag-pipeline-utils/) - Comprehensive guides and API docs
- 🔌 [Plugin Marketplace](https://registry.rag-pipeline.dev) - Community plugins and extensions

## 📄 License

This project is licensed under the **Apache License 2.0** - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- Built with ❤️ by [Ali Kahwaji](https://github.com/alikahwaji) and the DevilsDev team
- Inspired by the open-source AI/ML community
- Special thanks to all [contributors](https://github.com/DevilsDev/rag-pipeline-utils/graphs/contributors)

---

<div align="center">
  <strong>Ready to build your next RAG application?</strong><br>
  <a href="#-installation">Get Started</a> • 
  <a href="https://devilsdev.github.io/rag-pipeline-utils/">Documentation</a> • 
  <a href="https://github.com/DevilsDev/rag-pipeline-utils/discussions">Community</a>
</div>

