# @DevilsDev/rag-pipeline-utils

[![CI](https://github.com/DevilsDev/rag-pipeline-utils/actions/workflows/ci.yml/badge.svg)](https://github.com/DevilsDev/rag-pipeline-utils/actions)
[![npm version](https://badge.fury.io/js/%40devilsdev%2Frag-pipeline-utils.svg)](https://badge.fury.io/js/%40devilsdev%2Frag-pipeline-utils)
[![Enterprise Ready](https://img.shields.io/badge/Enterprise-Ready-green.svg)](https://github.com/DevilsDev/rag-pipeline-utils)
[![Node.js Version](https://img.shields.io/node/v/@devilsdev/rag-pipeline-utils.svg)](https://nodejs.org/)
[![License](https://img.shields.io/npm/l/@devilsdev/rag-pipeline-utils.svg)](https://github.com/DevilsDev/rag-pipeline-utils/blob/main/LICENSE)
[![codecov](https://codecov.io/gh/DevilsDev/rag-pipeline-utils/branch/main/graph/badge.svg)](https://codecov.io/gh/DevilsDev/rag-pipeline-utils)
[![Downloads](https://img.shields.io/npm/dm/@devilsdev/rag-pipeline-utils.svg)](https://www.npmjs.com/package/@devilsdev/rag-pipeline-utils)

> **Enterprise-grade RAG Pipeline Utils toolkit for Node.js** — Build production-ready Retrieval-Augmented Generation systems with modular plugins, streaming support, and comprehensive observability.

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
  "plugins": {
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
    "reranker": {
      "cohere": "@devilsdev/cohere-reranker"
    }
  },
  "pipeline": {
    "stages": ["loader", "embedder", "retriever", "llm"]
  },
  "performance": {
    "parallel": {
      "enabled": true,
      "maxConcurrency": 5,
      "batchSize": 10
    },
    "streaming": {
      "enabled": true,
      "maxMemoryMB": 512,
      "bufferSize": 100
    }
  },
  "observability": {
    "logging": {
      "level": "info",
      "structured": true
    },
    "metrics": {
      "enabled": true
    }
  }
}
```

## 🖥️ CLI Usage

### Document Ingestion

```bash
# Ingest single document
rag-pipeline ingest ./document.pdf --config .ragrc.json

# Ingest with validation and preview
rag-pipeline ingest ./document.pdf --validate --preview

# Ingest with streaming and performance monitoring
rag-pipeline ingest ./document.pdf --streaming --trace

# Ingest with parallel processing
rag-pipeline ingest ./document.pdf --parallel
```

### 3. Run your pipeline

```bash
# Ingest documents first
rag-pipeline ingest ./docs --config .ragrc.json

# Query your RAG pipeline
rag-pipeline query "What is the main topic?" --config .ragrc.json
```

## 🖥️ Advanced CLI Usage

### Querying

```bash
# Streaming query with real-time responses
rag-pipeline query "Explain RAG architecture" --llm openai --stream

# Query with custom retrieval parameters
rag-pipeline query "How does embedding work?" --top-k 5 --similarity-threshold 0.8
```

### Configuration Management

```bash
# Show current configuration
rag-pipeline config show --format json
rag-pipeline config show --section plugins

# Set configuration values
rag-pipeline config set performance.parallel.enabled true
rag-pipeline config set observability.logging.level debug

# Get configuration values
rag-pipeline config get plugins.loader
```

### System Diagnostics

```bash
# Run comprehensive diagnostics
rag-pipeline doctor

# Run specific diagnostic categories
rag-pipeline doctor --category plugins config performance

# Auto-fix detected issues
rag-pipeline doctor --auto-fix

# Save diagnostic report
rag-pipeline doctor --report ./diagnostic-report.json
```

### System Information

```bash
# Show system information
rag-pipeline info --system

# Show plugin information
rag-pipeline info --plugins

# Show configuration summary
rag-pipeline info --config
```

### Advanced Workflows

```bash
# Initialize with interactive wizard
rag-pipeline init --interactive

# Initialize with basic configuration
rag-pipeline init --no-interactive

# Validate configuration file
rag-pipeline validate --schema --plugins

# Generate shell completion
rag-pipeline completion bash > ~/.rag-pipeline-completion.bash
rag-pipeline completion zsh > ~/.rag-pipeline-completion.zsh

# Dry run mode for testing
rag-pipeline ingest ./document.pdf --dry-run
rag-pipeline query "test query" --dry-run

# Global configuration options
rag-pipeline --config ./custom-config.json query "What is RAG?"
rag-pipeline --verbose ingest ./document.pdf
```

## 🔌 Plugin Architecture

### Plugin Contracts

Each plugin type implements a standardized interface with runtime validation:

| Plugin Type   | Required Methods                          | Optional Methods                    | Description                          |
| ------------- | ----------------------------------------- | ----------------------------------- | ------------------------------------ |
| **Loader**    | `load(filePath)`                          | `validate()`, `getMetadata()`       | Document ingestion and parsing       |
| **Embedder**  | `embed(texts)`, `embedQuery(query)`       | `getDimensions()`, `getBatchSize()` | Text vectorization                   |
| **Retriever** | `store(vectors)`, `retrieve(queryVector)` | `delete()`, `update()`              | Vector storage and similarity search |
| **LLM**       | `generate(prompt)`, `stream(prompt)`      | `getTokenCount()`, `getModels()`    | Language model inference             |
| **Reranker**  | `rerank(query, documents)`                | `getScore()`                        | Result relevance optimization        |

### Plugin Development

```javascript
// Example: Custom embedder plugin
export class MyCustomEmbedder {
  constructor(options = {}) {
    this.apiKey = options.apiKey;
    this.model = options.model || "text-embedding-ada-002";
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
    name: "my-custom-embedder",
    version: "1.0.0",
    type: "embedder",
    description: "Custom embedding implementation",
  };
}
```

## 🌍 Environment Variables

Configure RAG Pipeline Utils behavior using environment variables:

### Logging Configuration

```bash
# Set logging level (debug, info, warn, error)
export LOG_LEVEL=info

# Enable pretty-printed logs for development
export RAG_PRETTY_LOGS=true

# Enable structured JSON logs for production
export RAG_STRUCTURED_LOGS=true

# Enable event-based logging for debugging
export RAG_EVENT_LOGS=true
```

### Performance & Memory

```bash
# Set maximum memory usage for streaming (MB)
export RAG_MAX_MEMORY_MB=512

# Configure parallel processing
export RAG_MAX_CONCURRENCY=5
export RAG_BATCH_SIZE=10

# Enable performance profiling
export RAG_ENABLE_PROFILING=true
```

### Plugin Configuration

```bash
# Custom plugin registry URLs
export RAG_PLUGIN_REGISTRY_URLS="https://registry1.com,https://registry2.com"

# Plugin cache directory
export RAG_PLUGIN_CACHE_DIR="./cache/plugins"

# Plugin authentication token
export RAG_PLUGIN_AUTH_TOKEN="your-token-here"
```

### Observability

```bash
# OpenTelemetry tracing endpoint
export RAG_TRACE_ENDPOINT="http://localhost:4317"

# Metrics export endpoint
export RAG_METRICS_ENDPOINT="http://localhost:9090"

# Enable distributed tracing
export RAG_ENABLE_TRACING=true
```

## 🔌 Plugin Discovery & Management

RAG Pipeline Utils provides helper functions for discovering and managing plugins:

### Plugin Discovery API

```javascript
const { registry } = require("@devilsdev/rag-pipeline-utils");

// List all plugins for a specific stage
const loaders = registry.list("loader");
console.log(
  "Available loaders:",
  loaders.map((p) => p.name),
);

// Check if a specific plugin exists
if (registry.has("embedder", "openai")) {
  console.log("OpenAI embedder is available");
}

// Get plugin implementation
const openaiEmbedder = registry.get("embedder", "openai");
```

### CLI Plugin Commands

```bash
# List available plugins by type
rag-pipeline plugin list --type loader
rag-pipeline plugin list --type embedder
rag-pipeline plugin list --type retriever
rag-pipeline plugin list --type llm
rag-pipeline plugin list --type reranker

# Search for plugins
rag-pipeline plugin search "openai"
rag-pipeline plugin search "pdf" --type loader

# Install plugins from registry
rag-pipeline plugin install @devilsdev/pdf-loader
rag-pipeline plugin install @devilsdev/openai-embedder --version 1.2.0

# Get plugin information
rag-pipeline plugin info @devilsdev/pdf-loader

# Validate plugin before publishing
rag-pipeline plugin validate ./my-custom-plugin

# Publish your own plugins
rag-pipeline plugin publish ./my-custom-plugin

# Initialize new plugin project
rag-pipeline plugin init my-new-plugin --type loader
```

### Plugin Registry Integration

```javascript
// Check plugin availability before use
const config = {
  plugins: {
    loader: {
      pdf: registry.has("loader", "pdf-loader")
        ? "pdf-loader"
        : "fallback-loader",
    },
  },
};

// Dynamic plugin discovery
const availableEmbedders = registry
  .list("embedder")
  .filter((p) => p.name.includes("openai"))
  .map((p) => p.name);

console.log("Available OpenAI embedders:", availableEmbedders);
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

# Build for distribution
npm run build

# Start development server
npm run dev
```

### Release Configuration

For automated NPM publishing on GitHub releases, ensure the following repository secret is configured:

- **`NPM_TOKEN`**: NPM access token with publish rights for the `@devilsdev/rag-pipeline-utils` package

To create an NPM token:

1. Login to [npmjs.com](https://www.npmjs.com)
2. Go to Access Tokens in your account settings
3. Generate a new "Automation" token with publish permissions
4. Add it as `NPM_TOKEN` in your GitHub repository secrets

The release workflow will automatically:

- Trigger on GitHub release publication
- Run lint, test, and build steps
- Publish to NPM registry

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
