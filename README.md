# rag-pipeline-utils


 ###### Version: 0.1.0
 ###### Path: /project-root
 ###### Description: Project folder structure for @DevDevil/rag-pipeline-utils
 ###### Author: Ali Kahwaji
 

/project-root
├── /src
│   ├── /core                        # Core pipeline orchestration
│   │   ├── plugin-registry.js       # Plugin registry system
│   │   └── create-pipeline.js       # Main RAG pipeline builder
│   ├── /embeddings                  # Embedding provider implementations
│   ├── /vector                      # Vector store adapters
│   ├── /runners                     # LLM runner implementations
│   ├── /utils                       # Stateless helpers and tools
│   ├── /interfaces                  # Shared plugin strategy interfaces
│   └── /config                      # Config schema and loader
├── /bin
│   └── cli.js                       # CLI entrypoint (ingest/query)
├── /__tests__
│   ├── /unit                        # Unit tests
│   │   └── core
│   │       └── plugin-registry.test.js
│   ├── /integration                 # E2E tests
│   └── /fixtures                    # Sample documents and mocks
├── /examples                        # CLI and API usage examples
├── /scripts
│   ├── validate-config.js           # JSON schema validation
│   └── ci-runner.js                 # Local fallback CI runner
├── .github
│   └── workflows
│       └── ci.yml                   # GitHub Actions CI pipeline
├── .env.example                     # Environment variable template
├── README.md                        # Documentation and usage
├── CHANGELOG.md                     # Semantic release history
├── package.json                     # NPM configuration
├── jest.config.js                   # Jest test runner config
└── server.js                        # Optional runtime entrypoint

---

