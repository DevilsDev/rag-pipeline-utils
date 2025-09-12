# Claude Instructions for @DevilsDev/rag-pipeline-utils

## Project Overview

Enterprise-grade JavaScript RAG toolkit with plugin ecosystem, DAG workflow engine, AI/ML orchestration, CLI interface, and enterprise features including multi-tenancy, SSO, and audit logging.

## Golden Principles (ALWAYS FOLLOW)

1. **Enterprise first**: secure by default, observable, reversible, and cost-aware
2. **Profitability**: prioritise improvements with measurable user or platform value
3. **Modularity**: strict boundaries. Everything replaceable behind contracts
4. **Simplicity with discipline**: small composable units, explicit data flow, predictable failure modes
5. **Fast feedback**: streaming where useful, tight CI gates, cheap local iteration

## Architecture Rules (CRITICAL)

### Layer Separation (ENFORCE STRICTLY)

```
Core runtime (src/core/) ← Base layer
AI/ML (src/ai/) ← Cannot import CLI or enterprise
CLI & DX (src/cli/) ← Cannot import enterprise
Plugin ecosystem (src/plugins/, src/ecosystem/)
Enterprise (src/enterprise/) ← Top layer only
```

**VIOLATIONS FORBIDDEN:**

- Core cannot depend on CLI or enterprise
- AI cannot import CLI
- Plugins depend only on contracts
- Cross-layer imports via relative paths are prohibited

### Folder Structure (MAINTAIN EXACTLY)

```
src/
├── core/             # Pipeline engine, contracts, DAG, performance, observability
├── ai/               # AI/ML orchestration, embeddings, inference, caching
├── cli/              # CLI commands, interactive wizard, doctor
├── plugins/          # First-party plugins
├── ecosystem/        # Marketplace, discovery, analytics hub
├── enterprise/       # SSO, audit logging, multi-tenant features
├── config/           # Config loader and schema validation
├── dag/              # DAG workflow engine
└── utils/            # Shared helpers: logger, retry, scaffolder
```

## Code Standards (NON-NEGOTIABLE)

### Module System

- **CommonJS ONLY** (`require()`/`module.exports`)
- NO ES modules (`import`/`export`) - causes test failures
- Maintain `module.exports.default = module.exports` pattern

### Code Style

- ESLint + Prettier enforced. Zero `any` without explicit reason
- Functions < 40 lines, complexity < 10
- Naming: `lowerCamelCase` functions/vars, `UpperCamelCase` classes, `CONSTANT_CASE` constants
- Imports limited: >12 requires decomposition or justification
- Structured logging only, via repo logger
- Errors explicit and contextual, never swallowed

### File Size Limits

- Single files must not exceed 1000 lines
- Functions must not exceed 40 lines
- If ai/index.js exceeds limits, decompose into separate modules

## Testing Requirements (MANDATORY)

### Test Structure

- Mirror source structure under `__tests__/`
- Unit tests: `__tests__/unit/`
- Integration tests: `__tests__/integration/`
- Contract tests for plugin validation

### Test Standards

- Jest framework with CommonJS
- 100% critical path coverage required
- No hanging tests (use proper async/await patterns)
- Mock timers for deterministic testing
- Cleanup in `afterEach` hooks

### DAG Engine Testing

- All 63 DAG tests must pass
- Retry logic, cycle detection, error handling
- Non-critical node failures with graceful degradation
- Proper handling of `undefined` return values

## Security (ZERO TOLERANCE)

### Vulnerability Management

- Dependabot enabled with weekly updates
- Critical vulnerabilities block builds
- `npm audit` in CI pipeline
- No secrets in code/tests (env vars only)

### Input Validation

- Validate all inputs at boundaries
- Sanitise logs, never log sensitive data
- `child_process` with timeouts and sanitised input
- Plugin sandboxing with declared permissions

## Plugin Ecosystem Rules

### Required Plugin Methods

- **Loader**: `load(source, options)`
- **Embedder**: `embed(text, options)`
- **Retriever**: `retrieve(query, options)`
- **LLM**: `generate(prompt, options)` (NOT `ask`)
- **Reranker**: `rerank(results, query, options)`

### Plugin Standards

- Metadata mandatory in plugin manifest
- Contract tests for certification
- Permissions declared and enforced
- Third-party plugins sandboxed
- Metrics via approved interfaces only

## AI/ML Layer Rules

### Decomposition Required

- Split `src/ai/index.js` into separate modules:
  - `orchestrator.js` - ModelTrainingOrchestrator
  - `retrieval-engine.js` - AdaptiveRetrievalEngine
  - `multimodal.js` - MultiModalProcessor
  - `federation.js` - FederatedLearningCoordinator

### Performance Requirements

- Caches bounded with TTL
- Connection pooling and lazy loading
- Streaming inference support
- Document keys and invalidation strategies

## CLI Standards

### Command Structure

- Commands: `ingest`, `query`, `dag run`, `wizard`, `doctor`, `plugin`, `ai-ml`
- All commands support `--help` with examples
- Cold start overhead increase ≤ 200ms
- Lazy load commands for performance

### Doctor Command Requirements

- Validate module systems and FS bottlenecks
- Check plugin configuration
- Verify observability setup
- Report performance metrics

## Enterprise Features (PRODUCTION-READY)

### Multi-tenancy

- Tenant isolation at all boundaries
- Resource quotas and workspace management
- Isolated data and configuration per tenant

### SSO Integration

- SAML 2.0, OAuth2, Active Directory support
- Token expiry, refresh, RBAC mapping
- Security-sensitive actions logged immutably

### Audit Logging

- Compliance-grade activity tracking
- Immutable logs for regulatory compliance
- GDPR/CCPA data privacy compliance

## Observability (MANDATORY)

### Logging

- Structured JSON logs only
- Respect log level configuration
- Performance metrics and error tracking
- No sensitive data in logs

### Monitoring

- Prometheus metrics integration
- Grafana dashboards for visualization
- Alert thresholds for critical metrics
- Health check endpoints

## Development Workflow

### Commands

- `npm test` - Run all tests with coverage
- `npm run lint` - ESLint validation
- `npm run lint:fix` - Auto-fix linting issues
- `npm run security:audit` - Security vulnerability scan
- `npm run format` - Prettier code formatting

### Git Workflow

- Husky pre-commit hooks enabled
- ESLint errors block commits
- Lint-staged on staged files
- Conventional commit messages

### CI/CD Requirements

- All tests must pass before merge
- Security audit in pipeline
- Dependency vulnerability scanning
- Performance regression testing

## Error Handling Patterns

### DAG Engine

- Node errors re-thrown unchanged
- Validation errors wrapped once with precise message
- Timeout errors re-thrown as-is
- Multiple errors aggregated with original causes

### Retry Logic

- Injectable sleep function for testing
- Exponential backoff with configurable multiplier
- Global and per-node retry configurations
- Circuit breakers for resilience

## Performance Standards

### Concurrency

- Respect `RAG_MAX_CONCURRENCY` environment variable
- Semaphore-based execution limiting
- Streaming support with backpressure
- Cancellation token support

### Memory Management

- Bounded caches with TTL
- Cleanup in error paths
- Resource pooling where appropriate
- Memory leak prevention

## Documentation Requirements

### Code Documentation

- JSDoc for all public APIs
- README with setup and usage examples
- Architecture decision records (ADRs)
- Plugin development guides

### User Documentation

- CLI help text with examples
- Configuration schema documentation
- Troubleshooting guides
- Performance tuning guides

## Breaking Changes Policy

### Backward Compatibility

- Maintain existing public API
- Migration tooling for breaking changes
- Feature flags for risky changes
- Rollback procedures documented

### Versioning

- Semantic versioning strictly followed
- Contract versioning for plugins
- Deprecation warnings before removal
- Clear upgrade paths provided

## Quality Gates (MUST PASS)

1. All 63 DAG tests passing
2. Zero ESLint errors
3. Security audit clean
4. Performance benchmarks met
5. Documentation updated
6. Contract tests passing
7. Integration tests green

## Emergency Procedures

### Rollback Process

- Immediate rollback capability
- Database migration rollbacks
- Configuration rollbacks
- Monitoring during rollback

### Incident Response

- Error tracking and alerting
- Performance degradation detection
- Security incident procedures
- Communication protocols

## Branching Strategy (GOOGLE-STYLE)

### Branch Types and Naming

```
main                    # Production-ready code, protected
develop                 # Integration branch for features
feature/JIRA-123-desc   # Feature branches from develop
hotfix/JIRA-456-desc    # Critical fixes from main
release/v2.1.0          # Release preparation branches
workflow/redesign-arch  # Major architectural changes
```

### Branch Protection Rules

- **main**: Requires PR approval, status checks, no direct pushes
- **develop**: Requires PR approval, all tests must pass
- **feature/\***: Must be up-to-date with develop before merge
- **hotfix/\***: Emergency-only, requires immediate review

### Merge Strategy

- **Squash and merge** for feature branches (clean history)
- **Merge commit** for releases (preserve branch context)
- **Rebase and merge** for hotfixes (linear history)
- Delete feature branches after successful merge

### Branch Lifecycle

1. Create feature branch from `develop`
2. Implement changes with atomic commits
3. Rebase on latest `develop` before PR
4. Code review with required approvals
5. Automated testing and security checks
6. Squash merge to `develop`
7. Delete feature branch

## Commit Message Standards (CONVENTIONAL COMMITS)

### Format (MANDATORY)

```
<type>[optional scope]: <description>

[optional body]

[optional footer(s)]
```

### Types (REQUIRED)

- `feat`: New feature for users
- `fix`: Bug fix for users
- `docs`: Documentation changes
- `style`: Code style changes (formatting, etc.)
- `refactor`: Code refactoring without feature changes
- `perf`: Performance improvements
- `test`: Adding or updating tests
- `build`: Build system or dependency changes
- `ci`: CI/CD configuration changes
- `chore`: Maintenance tasks

### Scope Examples

- `feat(dag)`: DAG engine features
- `fix(cli)`: CLI bug fixes
- `docs(api)`: API documentation
- `test(plugins)`: Plugin testing
- `perf(ai)`: AI/ML performance improvements

### Examples (FOLLOW EXACTLY)

```
feat(dag): add retry logic with exponential backoff

Implement configurable retry mechanism for failed nodes with:
- Global and per-node retry configuration
- Exponential backoff with jitter
- Circuit breaker pattern for resilience

Closes #123

fix(cli): resolve doctor command hanging on Windows

The doctor command was hanging due to subprocess not being properly
terminated on Windows systems.

Breaking change: Updated Node.js requirement to >=18

BREAKING CHANGE: Node.js 16 is no longer supported
```

### Commit Rules

- Use imperative mood ("add" not "added")
- First line ≤ 72 characters
- Body lines ≤ 100 characters
- Reference issues/PRs in footer
- Mark breaking changes explicitly

## Google-Style Architecture Principles

### System Design Philosophy

1. **Composition over Inheritance**: Favor plugin composition
2. **Dependency Inversion**: Depend on abstractions, not concretions
3. **Single Responsibility**: Each module has one clear purpose
4. **Open/Closed Principle**: Open for extension, closed for modification
5. **Interface Segregation**: Small, focused interfaces
6. **Dependency Injection**: Explicit dependency management

### Google SRE Principles Integration

```javascript
// Reliability Patterns
class DAGEngine {
  constructor(options = {}) {
    this.circuitBreaker = new CircuitBreaker(options.circuitBreaker);
    this.retryPolicy = new RetryPolicy(options.retry);
    this.metrics = new MetricsCollector(options.metrics);
    this.healthCheck = new HealthChecker(options.health);
  }
}

// Observability First
const logger = require('./utils/structured-logger');
const metrics = require('./utils/metrics');

function executeNode(node) {
  const span = tracer.startSpan(`dag.node.${node.id}`);
  const timer = metrics.timer('node_execution_duration');

  try {
    logger.info('Node execution started', { nodeId: node.id });
    const result = await node.run();
    metrics.counter('node_execution_success').inc();
    return result;
  } catch (error) {
    logger.error('Node execution failed', { nodeId: node.id, error });
    metrics.counter('node_execution_failure').inc();
    throw error;
  } finally {
    timer.end();
    span.finish();
  }
}
```

### Error Handling (GOOGLE SRE STYLE)

```javascript
// Error Budget and SLI/SLO Implementation
class ServiceLevelIndicator {
  constructor(name, target) {
    this.name = name;
    this.target = target; // e.g., 99.9%
    this.errorBudget = 1 - target;
  }

  recordSuccess() {
    metrics.counter(`sli_${this.name}_success`).inc();
  }

  recordFailure() {
    metrics.counter(`sli_${this.name}_failure`).inc();
  }
}

// Circuit Breaker Pattern
class CircuitBreaker {
  constructor(threshold = 5, timeout = 60000) {
    this.failureThreshold = threshold;
    this.timeout = timeout;
    this.state = "CLOSED"; // CLOSED, OPEN, HALF_OPEN
    this.failureCount = 0;
    this.lastFailureTime = null;
  }
}
```

## High-Level Implementation Guidelines

### Code Organization (GOOGLE STYLE)

```
src/
├── core/
│   ├── contracts/           # Interface definitions
│   ├── pipeline/           # Core pipeline engine
│   ├── observability/      # Metrics, logging, tracing
│   └── reliability/        # Circuit breakers, retries
├── ai/
│   ├── orchestrator/       # Training orchestration
│   ├── inference/          # Model inference engine
│   ├── retrieval/          # Retrieval algorithms
│   └── multimodal/         # Multi-modal processing
├── plugins/
│   ├── loaders/           # Data loading plugins
│   ├── embedders/         # Embedding plugins
│   ├── retrievers/        # Retrieval plugins
│   └── llms/              # LLM plugins
└── enterprise/
    ├── auth/              # SSO and authentication
    ├── audit/             # Audit logging
    └── tenancy/           # Multi-tenant features
```

### Design Patterns (MANDATORY)

1. **Factory Pattern**: Plugin instantiation
2. **Strategy Pattern**: Algorithm selection
3. **Observer Pattern**: Event handling
4. **Command Pattern**: CLI operations
5. **Decorator Pattern**: Middleware chains
6. **Adapter Pattern**: External service integration

### Performance Engineering

```javascript
// Lazy Loading Pattern
class PluginRegistry {
  constructor() {
    this.plugins = new Map();
    this.factories = new Map();
  }

  register(type, name, factory) {
    this.factories.set(`${type}:${name}`, factory);
  }

  get(type, name) {
    const key = `${type}:${name}`;
    if (!this.plugins.has(key)) {
      const factory = this.factories.get(key);
      this.plugins.set(key, factory());
    }
    return this.plugins.get(key);
  }
}

// Connection Pooling
class ConnectionPool {
  constructor(factory, options = {}) {
    this.factory = factory;
    this.maxSize = options.maxSize || 10;
    this.minSize = options.minSize || 2;
    this.available = [];
    this.inUse = new Set();
  }
}
```

### Monitoring and Alerting (SRE)

```javascript
// Service Level Objectives
const SLOs = {
  availability: 99.9, // 99.9% uptime
  latency_p95: 500, // 95th percentile < 500ms
  error_rate: 0.1, // < 0.1% error rate
  throughput: 1000, // > 1000 requests/minute
};

// Alert Definitions
const alerts = {
  high_error_rate: {
    condition: "error_rate > 1%",
    duration: "5m",
    severity: "critical",
  },
  high_latency: {
    condition: "latency_p95 > 1s",
    duration: "2m",
    severity: "warning",
  },
};
```

### Testing Strategy (GOOGLE STYLE)

```javascript
// Test Pyramid Implementation
describe("DAG Engine", () => {
  // Unit Tests (70%)
  describe("Node Execution", () => {
    it("should execute node with mocked dependencies", async () => {
      const mockNode = createMockNode();
      const result = await dagEngine.executeNode(mockNode);
      expect(result).toBeDefined();
    });
  });

  // Integration Tests (20%)
  describe("Plugin Integration", () => {
    it("should integrate with real plugin instances", async () => {
      const realPlugin = new TestPlugin();
      await dagEngine.registerPlugin(realPlugin);
      // Test real integration
    });
  });

  // E2E Tests (10%)
  describe("End-to-End Workflows", () => {
    it("should complete full RAG pipeline", async () => {
      // Test complete user journey
    });
  });
});

// Contract Testing
describe("Plugin Contracts", () => {
  pluginTypes.forEach((type) => {
    it(`should validate ${type} plugin contract`, () => {
      const schema = getPluginSchema(type);
      const plugin = getTestPlugin(type);
      expect(validateContract(plugin, schema)).toBe(true);
    });
  });
});
```

### Documentation Standards (GOOGLE STYLE)

````javascript
/**
 * Executes a DAG node with comprehensive error handling and observability.
 *
 * @param {DAGNode} node - The node to execute
 * @param {ExecutionContext} context - Execution context with dependencies
 * @returns {Promise<any>} The node execution result
 *
 * @throws {NodeExecutionError} When node execution fails
 * @throws {DependencyError} When required dependencies are missing
 *
 * @example
 * ```javascript
 * const node = new DAGNode('process', async (input) => {
 *   return processData(input);
 * });
 *
 * const result = await dagEngine.executeNode(node, context);
 * console.log('Result:', result);
 * ```
 *
 * @since 2.0.0
 * @see {@link DAGEngine#execute} for full DAG execution
 */
async executeNode(node, context) {
  // Implementation
}
````

### Security Implementation (ZERO-TRUST)

```javascript
// Input Validation
const Joi = require("joi");

const nodeSchema = Joi.object({
  id: Joi.string().alphanum().max(50).required(),
  run: Joi.function().required(),
  inputs: Joi.array().items(Joi.string()).default([]),
  outputs: Joi.array().items(Joi.string()).default([]),
});

// Plugin Sandboxing
class PluginSandbox {
  constructor(plugin, permissions = {}) {
    this.plugin = plugin;
    this.permissions = permissions;
    this.vm = new VM({
      timeout: permissions.timeout || 5000,
      sandbox: this.createSandbox(),
    });
  }

  createSandbox() {
    return {
      console: this.createSecureConsole(),
      require: this.createSecureRequire(),
      // Limited global access
    };
  }
}
```

## Release Management (GOOGLE STYLE)

### Release Process

1. **Feature Freeze**: No new features 1 week before release
2. **Release Candidate**: Create RC branch for testing
3. **Canary Deployment**: Deploy to 1% of traffic
4. **Gradual Rollout**: 5% → 25% → 50% → 100%
5. **Monitoring**: Watch SLIs/SLOs during rollout
6. **Rollback Plan**: Automated rollback on SLO violations

### Version Strategy

- **Major**: Breaking changes, architectural updates
- **Minor**: New features, backward compatible
- **Patch**: Bug fixes, security updates
- **Pre-release**: Alpha/beta versions for testing

## Documentation Instructions (MANDATORY)

### Documentation Philosophy

- **Documentation as Code**: All docs versioned with source code
- **Living Documentation**: Auto-generated from code annotations
- **User-Centric**: Written from user's perspective, not developer's
- **Searchable**: Structured for discoverability and navigation
- **Multilingual**: Support for internationalization where needed

### Documentation Types (ALL REQUIRED)

#### 1. Code Documentation (JSDoc Standard)

````javascript
/**
 * @fileoverview Core DAG engine for executing workflow graphs with retry logic,
 * error handling, and observability integration.
 *
 * @author DevilsDev Team
 * @since 2.0.0
 * @version 2.1.0
 */

/**
 * Executes a DAG node with comprehensive error handling and observability.
 *
 * This method implements the core execution logic for individual DAG nodes,
 * including retry mechanisms, circuit breaker patterns, and comprehensive
 * error reporting with downstream impact analysis.
 *
 * @param {DAGNode} node - The node to execute with run function and metadata
 * @param {ExecutionContext} context - Execution context containing:
 *   @param {Map} context.results - Map of completed node results
 *   @param {Map} context.errors - Map of node execution errors
 *   @param {Map} context.fwd - Forward adjacency map for dependencies
 *   @param {boolean} context.continueOnError - Whether to continue on failures
 *   @param {Set} context.requiredIds - Set of required node IDs
 *   @param {any} context.seed - Initial seed value for source nodes
 *
 * @returns {Promise<any>} The node execution result or undefined for failed optional nodes
 *
 * @throws {NodeExecutionError} When node execution fails and node is critical
 * @throws {DependencyError} When required dependencies are missing
 * @throws {ValidationError} When node configuration is invalid
 *
 * @example
 * ```javascript
 * // Basic node execution
 * const node = new DAGNode('process-data', async (input) => {
 *   return await processUserData(input);
 * });
 *
 * const context = {
 *   results: new Map(),
 *   errors: new Map(),
 *   fwd: buildAdjacencyMap(),
 *   continueOnError: false,
 *   requiredIds: new Set(['process-data']),
 *   seed: { userId: 123, data: 'sample' }
 * };
 *
 * try {
 *   const result = await dagEngine.executeNode(node, context);
 *   console.log('Processing completed:', result);
 * } catch (error) {
 *   console.error('Node execution failed:', error.message);
 * }
 * ```
 *
 * @example
 * ```javascript
 * // Node with retry configuration
 * const node = new DAGNode('api-call', async (input) => {
 *   return await fetchExternalAPI(input);
 * }, {
 *   maxRetries: 3,
 *   retryDelay: 1000,
 *   optional: false
 * });
 *
 * const result = await dagEngine.executeNode(node, context);
 * ```
 *
 * @since 2.0.0
 * @see {@link DAGEngine#execute} for full DAG execution
 * @see {@link DAGNode} for node configuration options
 * @see {@link ExecutionContext} for context structure
 *
 * @performance O(1) for node execution, O(n) for dependency resolution where n = input count
 * @complexity Cyclomatic complexity: 8 (within acceptable limits)
 */
async executeNode(node, context) {
  // Implementation details...
}

/**
 * @typedef {Object} ExecutionOptions
 * @property {number} [timeout=30000] - Global execution timeout in milliseconds
 * @property {number} [concurrency=5] - Maximum concurrent node executions
 * @property {boolean} [continueOnError=false] - Continue execution on non-critical failures
 * @property {boolean} [gracefulDegradation=false] - Enable graceful degradation mode
 * @property {string[]} [requiredNodes] - Array of required node IDs
 * @property {boolean} [retryFailedNodes=false] - Enable retry for failed nodes
 * @property {number} [maxRetries=3] - Maximum retry attempts per node
 */

/**
 * @typedef {Object} NodeMetrics
 * @property {number} executionTime - Node execution time in milliseconds
 * @property {number} retryCount - Number of retry attempts made
 * @property {string} status - Execution status: 'success' | 'failed' | 'skipped'
 * @property {Date} startTime - Execution start timestamp
 * @property {Date} endTime - Execution end timestamp
 */
````

#### 2. API Documentation (OpenAPI 3.0 Standard)

```yaml
# docs/api/dag-engine.yaml
openapi: 3.0.3
info:
  title: RAG Pipeline DAG Engine API
  description: |
    Enterprise-grade DAG execution engine for RAG pipelines with advanced
    error handling, retry mechanisms, and observability integration.

    ## Features
    - Topological execution with dependency resolution
    - Configurable retry logic with exponential backoff
    - Circuit breaker patterns for resilience
    - Comprehensive observability and metrics
    - Plugin ecosystem integration

  version: 2.1.0
  contact:
    name: DevilsDev Team
    url: https://github.com/DevilsDev/rag-pipeline-utils
    email: support@devilsdev.com
  license:
    name: MIT
    url: https://opensource.org/licenses/MIT

paths:
  /dag/execute:
    post:
      summary: Execute DAG workflow
      description: |
        Executes a complete DAG workflow with the provided configuration
        and input data. Supports various execution modes including graceful
        degradation and retry mechanisms.
      operationId: executeDag
      tags:
        - DAG Execution
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: "#/components/schemas/ExecutionRequest"
            examples:
              basic_execution:
                summary: Basic DAG execution
                value:
                  nodes:
                    - id: "load-data"
                      type: "loader"
                      config: { source: "database" }
                    - id: "process-data"
                      type: "processor"
                      config: { algorithm: "nlp" }
                  connections:
                    - from: "load-data"
                      to: "process-data"
                  options:
                    timeout: 30000
                    continueOnError: false
      responses:
        "200":
          description: DAG execution completed successfully
          content:
            application/json:
              schema:
                $ref: "#/components/schemas/ExecutionResult"
        "400":
          description: Invalid DAG configuration
        "500":
          description: DAG execution failed

components:
  schemas:
    ExecutionRequest:
      type: object
      required:
        - nodes
        - connections
      properties:
        nodes:
          type: array
          items:
            $ref: "#/components/schemas/DAGNode"
        connections:
          type: array
          items:
            $ref: "#/components/schemas/Connection"
        options:
          $ref: "#/components/schemas/ExecutionOptions"
```

#### 3. Architecture Documentation (ADR Format)

````markdown
# ADR-001: DAG Engine Retry Mechanism

## Status

Accepted

## Context

The DAG engine needs robust retry mechanisms to handle transient failures
in distributed environments. Current implementation lacks configurable
retry policies and circuit breaker patterns.

## Decision

Implement a comprehensive retry system with:

- Exponential backoff with jitter
- Per-node and global retry configuration
- Circuit breaker integration
- Retry budget management

## Consequences

### Positive

- Improved resilience to transient failures
- Configurable retry policies per use case
- Better observability of retry patterns
- Reduced manual intervention for transient issues

### Negative

- Increased complexity in error handling
- Potential for longer execution times
- Additional memory overhead for retry state

## Implementation

```javascript
class RetryPolicy {
  constructor(options = {}) {
    this.maxRetries = options.maxRetries || 3;
    this.baseDelay = options.baseDelay || 1000;
    this.maxDelay = options.maxDelay || 30000;
    this.multiplier = options.multiplier || 2;
    this.jitter = options.jitter || 0.1;
  }
}
```
````

## Alternatives Considered

1. Simple fixed-delay retry - rejected due to thundering herd issues
2. External retry service - rejected due to complexity and latency
3. No retry mechanism - rejected due to reliability requirements

````

#### 4. User Documentation (Markdown Standard)
```markdown
# RAG Pipeline Utils - User Guide

## Quick Start

### Installation
```bash
npm install @devilsdev/rag-pipeline-utils
````

### Basic Usage

```javascript
const { createRagPipeline } = require("@devilsdev/rag-pipeline-utils");

// Create a basic RAG pipeline
const pipeline = createRagPipeline({
  loader: "file-loader",
  embedder: "openai-embedder",
  retriever: "vector-retriever",
  llm: "openai-llm",
});

// Execute the pipeline
const result = await pipeline.execute({
  query: "What is machine learning?",
  documents: ["./docs/ml-intro.pdf"],
});

console.log(result.answer);
```

## Advanced Configuration

### DAG Workflow Engine

The DAG engine allows you to create complex workflows with dependencies:

```javascript
const { DAG } = require("@devilsdev/rag-pipeline-utils");

const dag = new DAG();

// Add nodes
dag.addNode("load", async (input) => {
  return await loadDocuments(input.sources);
});

dag.addNode("embed", async (documents) => {
  return await embedDocuments(documents);
});

dag.addNode("store", async (embeddings) => {
  return await storeEmbeddings(embeddings);
});

// Connect nodes
dag.connect("load", "embed");
dag.connect("embed", "store");

// Execute with options
const result = await dag.execute(
  {
    sources: ["./data/*.pdf"],
  },
  {
    timeout: 60000,
    retryFailedNodes: true,
    maxRetries: 3,
  },
);
```

### Error Handling

```javascript
try {
  const result = await dag.execute(input);
} catch (error) {
  if (error.nodeId) {
    console.error(`Node ${error.nodeId} failed:`, error.message);
  } else {
    console.error("DAG execution failed:", error.message);
  }
}
```

## Troubleshooting

### Common Issues

#### DAG Execution Hangs

**Problem**: DAG execution appears to hang indefinitely.

**Causes**:

- Circular dependencies in the DAG
- Nodes waiting for unavailable dependencies
- Infinite loops in node execution

**Solutions**:

```javascript
// 1. Validate DAG before execution
try {
  dag.validate();
} catch (error) {
  console.error('DAG validation failed:', error.message);
}

// 2. Set execution timeout
const result = await dag.execute(input, { timeout: 30000 });

// 3. Use the doctor command
npx rag-pipeline doctor --check-dag
```

````

#### 5. Plugin Documentation Template
```markdown
# Plugin Name

## Overview
Brief description of what this plugin does and its use cases.

## Installation
```bash
npm install plugin-name
````

## Configuration

```javascript
const config = {
  // Required parameters
  apiKey: process.env.API_KEY,
  endpoint: "https://api.example.com",

  // Optional parameters
  timeout: 30000,
  retries: 3,
  batchSize: 100,
};
```

## API Reference

### Methods

#### `methodName(param1, param2, options)`

Description of what this method does.

**Parameters:**

- `param1` (string): Description of parameter
- `param2` (object): Description of parameter
- `options` (object, optional): Configuration options

**Returns:**

- `Promise<ResultType>`: Description of return value

**Example:**

```javascript
const result = await plugin.methodName("input", { key: "value" });
```

## Error Handling

List of possible errors and how to handle them.

## Performance Considerations

Guidelines for optimal performance.

## Examples

Comprehensive examples showing different use cases.

````

### Documentation Standards (ENFORCE STRICTLY)

#### Writing Guidelines
1. **Clarity**: Write for your audience's technical level
2. **Completeness**: Cover all public APIs and common use cases
3. **Accuracy**: Keep docs synchronized with code changes
4. **Examples**: Provide working code examples for all features
5. **Searchability**: Use consistent terminology and keywords

#### Code Examples Requirements
```javascript
// ✅ GOOD: Complete, runnable example
const { DAG } = require('@devilsdev/rag-pipeline-utils');

async function createProcessingPipeline() {
  const dag = new DAG();

  dag.addNode('validate', async (input) => {
    if (!input.data) throw new Error('Missing data');
    return input;
  });

  dag.addNode('process', async (input) => {
    return { processed: input.data.toUpperCase() };
  });

  dag.connect('validate', 'process');

  try {
    const result = await dag.execute({ data: 'hello world' });
    console.log(result); // { processed: 'HELLO WORLD' }
    return result;
  } catch (error) {
    console.error('Pipeline failed:', error.message);
    throw error;
  }
}

// ❌ BAD: Incomplete, non-runnable example
const dag = new DAG();
dag.addNode('process', someFunction);
const result = dag.execute(input);
````

#### Documentation Review Process

1. **Technical Review**: Code accuracy and completeness
2. **Editorial Review**: Grammar, clarity, and style
3. **User Testing**: Validate examples work as documented
4. **Accessibility Review**: Ensure docs are accessible to all users

### Documentation Tools and Automation

#### Required Tools

- **JSDoc**: For code documentation generation
- **TypeDoc**: For TypeScript documentation (if applicable)
- **Swagger/OpenAPI**: For API documentation
- **Docusaurus**: For user-facing documentation site
- **PlantUML**: For architecture diagrams

#### Automation Requirements

```yaml
# .github/workflows/docs.yml
name: Documentation
on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main]

jobs:
  docs-build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: "18"

      - name: Install dependencies
        run: npm ci

      - name: Generate API docs
        run: npm run docs:api

      - name: Build documentation site
        run: npm run docs:build

      - name: Validate documentation
        run: npm run docs:validate

      - name: Deploy to GitHub Pages
        if: github.ref == 'refs/heads/main'
        uses: peaceiris/actions-gh-pages@v3
        with:
          github_token: ${{ secrets.GITHUB_TOKEN }}
          publish_dir: ./docs/build
```

### Documentation Maintenance

#### Update Triggers (MANDATORY)

- **Code Changes**: Update docs for any API changes
- **New Features**: Document before feature release
- **Bug Fixes**: Update troubleshooting guides
- **Performance Changes**: Update performance guidelines
- **Security Updates**: Update security documentation

#### Documentation Metrics

- **Coverage**: % of public APIs documented
- **Freshness**: Days since last update
- **Usage**: Page views and user engagement
- **Feedback**: User satisfaction scores
- **Accuracy**: Error rate in examples

#### Quality Gates

1. All public APIs must have JSDoc comments
2. All examples must be tested and working
3. Breaking changes must have migration guides
4. New features must have user documentation
5. Documentation must pass accessibility checks

---

**REMEMBER: These instructions are binding. Any deviation requires explicit justification and approval. Enterprise-grade quality is non-negotiable.**
