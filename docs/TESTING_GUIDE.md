# 🧪 Comprehensive Testing Guide

## Overview

The RAG Pipeline Utils project features an enterprise-grade testing infrastructure designed to ensure reliability, performance, and security across all components. This guide covers our multi-layered testing approach and how to run, extend, and maintain the test suite.

## Test Architecture

### Test Categories

Our testing strategy encompasses multiple layers:

1. **Unit Tests** (`__tests__/unit/`) - Component-level testing
2. **Integration Tests** (`__tests__/integration/`) - Cross-component workflows
3. **Performance Tests** (`__tests__/performance/`) - Load and latency testing
4. **Security Tests** (`__tests__/security/`) - Plugin isolation and vulnerability testing
5. **Property-Based Tests** (`__tests__/property/`) - Automated fuzz testing
6. **Load Tests** (`__tests__/load/`) - Concurrent user simulation
7. **End-to-End Tests** (`__tests__/e2e/`) - Real data integration
8. **Compatibility Tests** (`__tests__/compatibility/`) - Cross-platform validation

### Test Coverage Metrics

| Component | Current Coverage | Target |
|-----------|------------------|---------|
| Plugin Contracts | 100% | 100% |
| Streaming Features | 85% | 90% |
| CLI Enhancements | 90% | 95% |
| Script Utilities | 80% | 85% |
| Error Handling | 90% | 95% |
| **Overall** | **90%** | **95%** |

## Running Tests

### Local Development

```bash
# Run all tests
npm test

# Run specific test categories
npm run test:unit
npm run test:integration
npm run test:performance
npm run test:security

# Run tests with coverage
npm run test:coverage

# Run tests in watch mode
npm run test:watch

# Run property-based tests with custom iterations
PROPERTY_TEST_ITERATIONS=1000 npm run test:property
```

### CI/CD Pipeline

Our comprehensive CI/CD pipeline runs automatically on:
- Push to `main` or `develop` branches
- Pull requests
- Manual workflow dispatch

```bash
# Trigger manual test run
gh workflow run comprehensive-testing.yml \
  --field test_type=all \
  --field generate_reports=true \
  --field parallel_jobs=4
```

### Test Categories in Detail

#### Unit Tests
- **Plugin Contract Validation**: Ensures all plugins implement required interfaces
- **Streaming Functionality**: Token-level streaming, backpressure, error handling
- **CLI Features**: New flags, error messages, interactive modes
- **DAG Engine**: Cycle detection, error propagation, topology validation
- **Script Utilities**: Validation, dry-run logic, retry mechanisms

#### Integration Tests
- **End-to-End Streaming**: Complete pipeline with streaming output
- **Plugin Interoperability**: Cross-plugin data flow validation
- **Middleware Integration**: Retry logic, logging, reranking workflows

#### Performance Tests
- **Large Dataset Processing**: Up to 10,000 documents
- **Concurrent Pipeline Execution**: Multiple simultaneous queries
- **Memory Management**: Backpressure and resource optimization
- **Latency Benchmarks**: Response time targets and regression detection

#### Security Tests
- **Plugin Sandboxing**: Isolation and scope pollution prevention
- **Input Sanitization**: XSS, injection, and malformed data handling
- **Access Control**: File system and network restrictions
- **Vulnerability Detection**: Automated security scanning

#### Property-Based Tests
- **Contract Invariants**: Automated validation of plugin contracts
- **Edge Case Discovery**: Fuzz testing with random inputs
- **Data Flow Consistency**: Cross-component integration properties
- **Error Propagation**: Failure mode validation

## Test Utilities and Helpers

### Core Test Helpers (`__tests__/utils/test-helpers.js`)

```javascript
import { TestDataGenerator, ValidationHelper, ErrorSimulator } from '../utils/test-helpers.js';

// Generate test data
const documents = TestDataGenerator.generateDocuments(100);
const vectors = TestDataGenerator.generateVectors(50);

// Validate plugin contracts
const isValid = ValidationHelper.validateLLMContract(plugin);

// Simulate errors
const errorStream = ErrorSimulator.createFailingStream('network-error');
```

### Visual Test Reporter (`__tests__/utils/test-reporter.js`)

```javascript
import TestReporter from '../utils/test-reporter.js';

const reporter = new TestReporter({
  outputDir: 'test-reports',
  enableVisualReports: true,
  enableCoverageReports: true,
  enablePerformanceReports: true
});

// Add test results
reporter.addTestResult({
  name: 'Plugin Contract Test',
  status: 'passed',
  duration: 150,
  category: 'Unit Tests'
});

// Generate reports
const reports = reporter.generateAllReports();
```

## Mock Implementations

### Updated Plugin Mocks

Our test suite includes comprehensive mock implementations:

#### LLM Mock (`__tests__/fixtures/src/mocks/openai-llm.js`)
- ✅ Updated to use `generate()` method (not deprecated `ask()`)
- ✅ Streaming support with async generators
- ✅ Token usage tracking and metrics
- ✅ Error simulation and edge case handling

#### Retriever Mock (`__tests__/fixtures/src/mocks/pinecone-retriever.js`)
- ✅ Updated to use `retrieve()` method (not deprecated `search()`)
- ✅ Async storage with metadata filtering
- ✅ Pagination and similarity scoring
- ✅ Configurable failure modes

#### Reranker Mock (`__tests__/fixtures/src/mocks/reranker.js`)
- ✅ Complete `rerank()` implementation
- ✅ Query relevance scoring with multiple factors
- ✅ Threshold filtering and metadata preservation
- ✅ Deterministic scoring for test reliability

## Performance Benchmarks

### Response Time Targets

| Operation | Excellent | Good | Acceptable | Poor |
|-----------|-----------|------|------------|------|
| Embedding | < 50ms | < 200ms | < 500ms | ≥ 500ms |
| Retrieval | < 100ms | < 300ms | < 1000ms | ≥ 1000ms |
| LLM Generation | < 200ms | < 1000ms | < 3000ms | ≥ 3000ms |
| Reranking | < 50ms | < 150ms | < 500ms | ≥ 500ms |

### Throughput Targets

| Component | Excellent | Good | Acceptable | Poor |
|-----------|-----------|------|------------|------|
| Document Processing | > 100 docs/sec | > 50 docs/sec | > 10 docs/sec | ≤ 10 docs/sec |
| Concurrent Queries | > 50 queries/sec | > 20 queries/sec | > 5 queries/sec | ≤ 5 queries/sec |
| Streaming Tokens | > 1000 tokens/sec | > 500 tokens/sec | > 100 tokens/sec | ≤ 100 tokens/sec |

## Security Testing

### Plugin Isolation Tests
- Global scope pollution prevention
- File system access restrictions
- Network request limitations
- Memory limit enforcement

### Input Validation Tests
- XSS prevention in user inputs
- SQL injection in query strings
- Path traversal in file operations
- Buffer overflow in large inputs

### Vulnerability Scanning
- Dependency audit with `npm audit`
- Static analysis with ESLint security rules
- Runtime monitoring for suspicious activity

## Compatibility Matrix

### Node.js Versions
- ✅ Node.js 16.x (LTS)
- ✅ Node.js 18.x (LTS)
- ✅ Node.js 20.x (Current)

### Operating Systems
- ✅ Ubuntu 20.04+ (Linux)
- ✅ Windows 10+ (Windows)
- ✅ macOS 11+ (Darwin)

### Feature Compatibility
- ✅ ES Modules and dynamic imports
- ✅ Async/await and async generators
- ✅ AbortController for cancellation
- ✅ Worker threads for parallel processing
- ✅ Crypto APIs for secure operations

## Visual Reports

### HTML Dashboard
Our test suite generates comprehensive HTML reports with:
- Interactive charts and graphs
- Coverage heatmaps
- Performance trend analysis
- Security audit results
- Compatibility matrix

### CI/CD Integration
- GitHub Actions workflow status
- Pull request comments with test summaries
- Automated badge generation
- Slack notifications for failures

## Writing New Tests

### Unit Test Template

```javascript
import { jest } from '@jest/globals';
import { TestDataGenerator, ValidationHelper } from '../utils/test-helpers.js';

describe('Component Name', () => {
  let component;

  beforeEach(() => {
    component = new ComponentClass();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should handle valid input correctly', async () => {
    // Arrange
    const input = TestDataGenerator.generateValidInput();
    
    // Act
    const result = await component.process(input);
    
    // Assert
    expect(result).toBeDefined();
    expect(ValidationHelper.validateOutput(result)).toBe(true);
  });

  it('should handle edge cases gracefully', async () => {
    const edgeCases = [null, undefined, '', [], {}];
    
    for (const testCase of edgeCases) {
      const result = await component.process(testCase);
      expect(result).toBeDefined();
    }
  });
});
```

### Property-Based Test Template

```javascript
describe('Property-Based Tests', () => {
  it('should maintain invariant properties', async () => {
    for (let i = 0; i < 100; i++) {
      const randomInput = generateRandomInput();
      const result = await component.process(randomInput);
      
      // Property assertions
      expect(result).toHaveProperty('requiredField');
      expect(typeof result.requiredField).toBe('string');
      expect(result.requiredField.length).toBeGreaterThan(0);
    }
  });
});
```

## Best Practices

### Test Organization
1. **Group related tests** in describe blocks
2. **Use descriptive test names** that explain the scenario
3. **Follow AAA pattern** (Arrange, Act, Assert)
4. **Mock external dependencies** to ensure test isolation
5. **Use test helpers** to reduce code duplication

### Performance Testing
1. **Set realistic timeouts** for async operations
2. **Use performance.now()** for accurate timing
3. **Test with various data sizes** to identify bottlenecks
4. **Monitor memory usage** during long-running tests
5. **Establish baseline metrics** for regression detection

### Security Testing
1. **Test with malicious inputs** to verify sanitization
2. **Validate access controls** for sensitive operations
3. **Check for information leakage** in error messages
4. **Test plugin isolation** to prevent cross-contamination
5. **Audit dependencies** regularly for vulnerabilities

## Troubleshooting

### Common Issues

#### Test Timeouts
```bash
# Increase timeout for long-running tests
jest --testTimeout=30000
```

#### Memory Issues
```bash
# Run tests with increased memory
node --max-old-space-size=4096 node_modules/.bin/jest
```

#### Mock Import Issues
```javascript
// Use dynamic imports for ES modules
const { mockFunction } = await import('../mocks/mock-module.js');
```

### Debug Mode
```bash
# Run tests with debug output
DEBUG=rag-pipeline:* npm test

# Run specific test with verbose output
npm test -- --verbose --testNamePattern="specific test name"
```

## Contributing

### Adding New Tests
1. Identify the test category (unit, integration, performance, etc.)
2. Create test file in appropriate directory
3. Follow naming convention: `component-name.test.js`
4. Include both positive and negative test cases
5. Add performance benchmarks if applicable
6. Update this documentation

### Test Review Checklist
- [ ] Tests cover both happy path and edge cases
- [ ] Mocks are properly isolated and don't affect other tests
- [ ] Performance tests have realistic expectations
- [ ] Security tests validate actual vulnerabilities
- [ ] Documentation is updated with new test patterns

## Continuous Improvement

Our testing strategy evolves continuously:

### Completed Improvements
- ✅ Plugin contract compliance (100%)
- ✅ Streaming feature coverage (85%)
- ✅ Visual HTML reporting
- ✅ Property-based testing framework
- ✅ CI/CD automation with parallel execution

### Planned Enhancements
- [ ] Mutation testing for test quality validation
- [ ] Visual regression testing for UI components
- [ ] Chaos engineering for resilience testing
- [ ] A/B testing framework for feature validation
- [ ] Real-time monitoring integration

---

For questions or contributions to the testing infrastructure, please refer to our [Contributing Guide](../CONTRIBUTING.md) or open an issue in the repository.
