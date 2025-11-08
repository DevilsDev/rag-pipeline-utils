---
sidebar_position: 30
---

# Changelog

All notable changes to RAG Pipeline Utils are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [2.3.1] - 2024-11-08

### Added

- 🎯 **Interactive Documentation Tools**
  - Code Playground with live examples
  - Configuration Generator wizard
  - Performance Calculator for cost estimation
- 📊 **Enhanced Performance Benchmarks**
  - Real-world throughput measurements
  - Latency percentiles (P50, P95, P99)
  - Scaling recommendations for different workloads
- 🔒 **Advanced Security Features**
  - JWT validation with replay attack protection
  - Multi-layer input sanitization
  - Path traversal defense with iterative URL decoding

### Changed

- 📚 **Documentation Improvements**
  - Added "Since version" tags to all API methods
  - Comprehensive behavior descriptions
  - Architecture diagrams with Mermaid
  - Plugin development guide with complete examples

### Fixed

- 🐛 **Security Fixes**
  - Improved JWT replay protection race condition handling
  - Enhanced path traversal detection (up to 5 decoding iterations)
  - Fixed command injection vulnerabilities in sanitizer

### Performance

- ⚡ **Optimization**
  - OpenAI embedder batch processing: 500-800 texts/sec
  - HNSW index queries: 300-500 queries/sec
  - Full pipeline end-to-end: 1.5-3 queries/sec

---

## [2.3.0] - 2024-10-15

### Added

- 🔄 **Reranker Plugin Support**
  - Context reranking capabilities
  - Relevance scoring improvements
  - Cross-encoder integration
- 🎨 **Evaluation Dashboard**
  - Real-time performance metrics
  - Visual evaluation reports
  - A/B testing support

### Changed

- ♻️ **API Refinements**
  - Standardized plugin contract interfaces
  - Improved error messages with context
  - Enhanced type definitions

### Deprecated

- ⚠️ `createPipeline` alias (use `createRagPipeline` instead)
  - Will be removed in v3.0.0
  - Migration path documented

---

## [2.2.0] - 2024-09-20

### Added

- 🚀 **Enterprise Edition Features**
  - Multi-modal processing (text, images, audio, video)
  - Federated learning support
  - Adaptive retrieval with reinforcement learning
  - Model training orchestration
- 🔐 **Security Enhancements**
  - JWTValidator with replay protection
  - InputSanitizer with XSS/SQL injection defense
  - Algorithm confusion attack prevention
- 📈 **Observability**
  - Distributed tracing with OpenTelemetry
  - Custom metrics collection
  - Audit logging for compliance
- 🏢 **Enterprise Operations**
  - Multi-tenant data isolation
  - Resource quotas and governance
  - Immutable audit logs

### Changed

- 🔧 **Configuration System**
  - Support for environment variable interpolation
  - Schema validation with detailed error messages
  - Hot-reload for development workflows

### Performance

- ⚡ **Improvements**
  - Parallel embedding processing (5x faster)
  - Vector search optimization (3x faster with HNSW)
  - LRU caching for embeddings (80-90% hit rate)

---

## [2.1.0] - 2024-08-10

### Added

- 🔀 **DAG Workflow Engine**
  - Direct acyclic graph execution
  - Parallel task processing
  - Dependency resolution
  - Comprehensive error handling with retry logic
- 🔌 **Plugin System Enhancements**
  - Hot-swappable plugins
  - Runtime validation
  - Plugin versioning support
- 📊 **Evaluation Framework**
  - Automated quality metrics
  - Ground truth comparison
  - Performance regression testing

### Changed

- 🏗️ **Architecture Improvements**
  - SOLID principles compliance
  - Dependency injection for all components
  - Improved modularity

### Fixed

- 🐛 **Bug Fixes**
  - Memory leak in embedding cache
  - Race condition in parallel processing
  - Incorrect chunking at document boundaries

---

## [2.0.0] - 2024-06-15

### Added

- 🎉 **Complete Plugin Architecture Overhaul**
  - Modular plugin system with type safety
  - Plugin registry for component management
  - Support for custom loaders, embedders, retrievers, LLMs
- 🌊 **Streaming Support**
  - Token-by-token LLM responses
  - Real-time feedback for long-running queries
  - AsyncIterator interface
- 📦 **Core API**
  - `createRagPipeline` factory function
  - `pipeline.query()` for retrieval-augmented generation
  - `pipeline.ingest()` for document processing
- 🔧 **Configuration Management**
  - `.ragrc.json` configuration files
  - Schema validation
  - Environment-safe secrets handling

### Changed

- 🔄 **Breaking Changes from v1.x**
  - Complete API redesign
  - Plugin-based architecture (no more hardcoded integrations)
  - TypeScript-first approach
  - New configuration format

### Migration

- 📖 See [Migration Guide](/docs/Migration) for upgrading from v1.x

---

## [1.5.2] - 2024-04-20

### Fixed

- 🐛 **Bug Fixes**
  - Fixed OpenAI API timeout handling
  - Corrected Pinecone metadata filtering
  - Resolved memory issues with large documents

### Changed

- 📚 **Documentation**
  - Updated examples for OpenAI API v1
  - Added troubleshooting guide
  - Improved error messages

---

## [1.5.0] - 2024-03-15

### Added

- 📄 **Document Loaders**
  - PDF support with text extraction
  - Markdown parsing
  - HTML content extraction
- 🔍 **Enhanced Retrieval**
  - Hybrid search (vector + keyword)
  - Metadata filtering
  - Result reranking

### Changed

- ⚡ **Performance**
  - 40% faster embedding generation
  - Reduced memory footprint
  - Improved batch processing

---

## [1.0.0] - 2024-01-10

### Added

- 🎯 **Initial Release**
  - Basic RAG pipeline implementation
  - OpenAI integration
  - Pinecone vector storage
  - Simple query interface
  - CLI tool for basic operations

---

## Version History Summary

| Version   | Release Date | Type  | Key Features                                     |
| --------- | ------------ | ----- | ------------------------------------------------ |
| **2.3.1** | 2024-11-08   | Patch | Interactive tools, enhanced docs, security fixes |
| **2.3.0** | 2024-10-15   | Minor | Reranker support, evaluation dashboard           |
| **2.2.0** | 2024-09-20   | Minor | Enterprise features, multi-modal, security       |
| **2.1.0** | 2024-08-10   | Minor | DAG engine, plugin enhancements                  |
| **2.0.0** | 2024-06-15   | Major | Complete plugin architecture, streaming          |
| **1.5.2** | 2024-04-20   | Patch | Bug fixes, documentation                         |
| **1.5.0** | 2024-03-15   | Minor | Document loaders, hybrid search                  |
| **1.0.0** | 2024-01-10   | Major | Initial release                                  |

---

## Upgrade Paths

### From v2.2.x to v2.3.x

- ✅ **Fully backward compatible**
- No breaking changes
- Optional: Adopt reranker plugin for improved relevance

### From v2.1.x to v2.2.x

- ✅ **Backward compatible**
- New enterprise features opt-in
- Security enhancements automatically active

### From v2.0.x to v2.1.x

- ⚠️ **Minor breaking changes**
- Plugin contract standardization (see [Migration Guide](/docs/Migration))
- CLI command updates

### From v1.x to v2.x

- 🚨 **Major breaking changes**
- Complete API redesign
- Requires code migration (see [Migration Guide](/docs/Migration))

---

## Breaking Changes Timeline

### Scheduled for v3.0.0 (Planned Q2 2025)

- ❌ **Removal of deprecated APIs:**
  - `createPipeline` alias (use `createRagPipeline`)
  - Legacy plugin registration format
  - Old configuration file format
- 🔄 **New requirements:**
  - Node.js 20+ required (dropping 18.x support)
  - Minimum TypeScript 5.0 for type safety

---

## Reporting Issues

Found a bug or have a feature request?

- 🐛 [Report bugs](https://github.com/DevilsDev/rag-pipeline-utils/issues/new?template=bug_report.md)
- ✨ [Request features](https://github.com/DevilsDev/rag-pipeline-utils/issues/new?template=feature_request.md)
- 💬 [Start a discussion](https://github.com/DevilsDev/rag-pipeline-utils/discussions)

---

## Contributing

See our [Contributing Guide](https://github.com/DevilsDev/rag-pipeline-utils/blob/main/CONTRIBUTING.md) for information on how to contribute to RAG Pipeline Utils.

---

_This changelog is maintained according to [Keep a Changelog](https://keepachangelog.com/) principles._
