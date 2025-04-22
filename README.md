# @DevilsDev/rag-pipeline-utils



# RAG Pipeline Utils

> Modular utilities for building Retrieval-Augmented Generation (RAG) pipelines, with CI-verified plugin contracts and mockable interfaces.

[![CI](https://github.com/DevilsDev/rag-pipeline-utils/actions/workflows/ci.yml/badge.svg)](https://github.com/DevilsDev/rag-pipeline-utils/actions)
[![codecov](https://codecov.io/gh/DevilsDev/rag-pipeline-utils/branch/main/graph/badge.svg)](https://codecov.io/gh/DevilsDev/rag-pipeline-utils)
![Release](https://img.shields.io/github/v/release/DevilsDev/rag-pipeline-utils?label=release)
![License](https://img.shields.io/github/license/devilsdev/rag-pipeline-utils)
![Release Review Passed](https://github.com/DevilsDev/rag-pipeline-utils/actions/workflows/enforce-release-review.yml/badge.svg?branch=main)
[![Blog & Changelog Generator](https://github.com/DevilsDev/rag-pipeline-utils/actions/workflows/post-release-generate-blog.yml/badge.svg)](https://github.com/DevilsDev/rag-pipeline-utils/actions/workflows/post-release-generate-blog.yml)






## Description

`@devilsdev/rag-pipeline-utils` provides a clean, extensible, and test-friendly foundation for constructing robust RAG pipelines using a plugin-based architecture. It enables developers to plug in their own document loaders, embedders, retrievers, and LLMs via configuration, and includes a CLI, mock contract verification, schema validation, and test harnesses to ensure production-readiness.

## Key Features

- **Plugin Contracts**: Runtime and CI verification of plugin interfaces (loader, embedder, retriever, llm).
- **CLI Support**: Easily run `ingest` and `query` commands using `.ragrc.json` configuration.
- **Test Fixtures**: Snapshot, fallback, and structured reranker validation.
- **Schema Enforcement**: `.ragrc.json` schema validation to catch config issues early.
- **Mock Repair Utilities**: Auto-fix for missing or broken mock implementations.
- **Modular Design**: Drop-in plugin support using custom class-based implementations.

## Benefits of This Modular Design

- **Extensibility**: Developers can inject their own loader, retriever, or LLM logic without modifying the core.
- **Testability**: Mocks and CI tools validate contract adherence for reliable test coverage.
- **Decoupling**: Each plugin can be independently implemented and swapped in via `.ragrc.json`.
- **CI Resilience**: The CI pipeline includes linting, contract verification, and test coverage enforcement.

## Installation

```bash
npm install @devilsdev/rag-pipeline-utils
```

## Basic Usage

1. Create a `.ragrc.json` config:

```json
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
    "openai": "./src/mocks/openai-llm.js"
  },
  "namespace": "demo-namespace",
  "pipeline": ["loader", "embedder", "retriever"]
}
```

2. Run an ingestion:

```bash
node bin/cli.js ingest ./docs/sample.pdf
```

3. Run a query:

```bash
node bin/cli.js query "What is in the document?"
```

## Plugin Contracts

Each plugin must implement the following interface:

| Type      | Required Methods                            |
| --------- | ------------------------------------------- |
| loader    | `load(filePath)`                          |
| embedder  | `embed(documents)`, `embedQuery(query)` |
| retriever | `store(vectors)`, `search(queryVector)` |
| llm       | `ask(prompt)`                             |

## Folder Structure

```text
/project-root
├── /src
│   ├── /routes
│   ├── /services
│   ├── /utils
│   └── app.js
├── /scripts
│   ├── setup.js
│   ├── ci-runner.js
│   └── repair-fixtures.js
├── /__tests__
│   ├── /fixtures
│   ├── /unit
│   ├── /integration
├── /public
├── README.md
├── USE_CASES.md
├── CHANGELOG.md
└── .env.example
```



## Why Use This?

- **Developer Experience**: Fast iteration, full contract CI
- **Pluggable Design**: Swap in your stack (OpenAI, Pinecone, Langchain, etc.)
- **Minimal & Modular**: Clean separation of concerns
- **Prod-ready**: 100% test coverage, schema validation, CLI control



## Use Cases

Explore real-world DevX-focused examples in [USE_CASES.md](./Use-Cases.md), including:

- Mock-driven plugin TDD
- CI-based interface validation
- Multivendor ingestion and search
- Runtime swap of LLM, retrievers, or embedders
- Bootstrap pipelines with auto-repairable defaults



## Contributing

We welcome contributions via PRs, especially new mock providers, validation helpers, and runtime extensions. Please follow the test + CI conventions before submitting.



## Contributors Guide

For active maintainers and collaborators:

- **Roadmap & Feature Planning**  
  See [.github/PROJECT_ROADMAP.md](.github/PROJECT_ROADMAP.md) for the implementation phases, priorities, and tracking tags for all major developer-facing features.

- **Milestone Tags**
  | Tag         | Description                        |
  |-------------|------------------------------------|
  | `phase-1`   | Foundation – testing, CI, tutorials |
  | `phase-2`   | Community, blog, discussions       |
  | `phase-3`   | CLI, VS Code tools, theming        |
  | `phase-4`   | i18n, integrations, case studies   |

_Note: This file is not included in public documentation builds._


## Manual Test Checklist

For full validation of roadmap sync, changelog automation, CI/CD, and blog generation:

➡️ [View Manual Test Checklist](scripts/manual-test-checklist.md)

## Manual CI Rollout

git commit --allow-empty -m "ci(test): trigger all CI workflows"
git push origin main


## License

This project is licensed under the **GNU GPL v3.0** License - see the [LICENSE](./LICENSE) file for details.

---

Built with ❤️ by [Ali Kahwaji].

