# Contract Compliance Tests

This directory contains comprehensive contract validation tests for all plugin types in the RAG pipeline utilities.

## Overview

Contract compliance tests ensure that all plugin implementations adhere to their respective contract specifications defined in `/contracts/`. These tests validate:

- **Metadata structure**: Plugin name, version, and type
- **Required methods**: Presence and function type validation
- **Method signatures**: Parameter counts and naming conventions
- **Return types**: Expected return value structures
- **Contract schema**: All contracts must conform to the JSON schema defined in `contracts/contract-schema.json`

## Related Documentation

- **[Contract Schema Guide](../../docs/contract-schema-guide.md)** - Complete guide to contract schema validation, including field requirements, validation rules, and error troubleshooting
- **[Plugin Registry Warnings](../../docs/plugin-registry-contract-warnings.md)** - Documentation about contract warnings in development mode

## Test Structure

```
__tests__/contracts/
├── contract-compliance.test.js        # Plugin implementation validation
├── contract-schema-validation.test.js # Contract schema validation (30 tests)
├── invalid-contracts/                 # Invalid contract examples
│   ├── empty-methods-array.json
│   ├── invalid-plugin-type.json
│   ├── invalid-version-format.json
│   └── missing-required-field.json
├── mock-plugins/                      # Test plugins
│   ├── valid-loader.js
│   ├── valid-embedder.js
│   ├── valid-retriever.js
│   ├── valid-llm.js
│   ├── valid-reranker.js
│   ├── invalid-loader-missing-method.js
│   ├── invalid-loader-missing-metadata.js
│   ├── invalid-loader-wrong-type.js
│   ├── invalid-retriever-missing-method.js
│   └── invalid-embedder-not-function.js
└── README.md                          # This file
```

## Running Tests

### Run all contract tests

```bash
npm test -- __tests__/contracts/
```

### Run specific test suites

```bash
# Contract compliance tests (plugin implementation validation)
npm test -- __tests__/contracts/contract-compliance.test.js

# Contract schema validation tests (JSON schema validation)
npm test -- __tests__/contracts/contract-schema-validation.test.js
```

### Run with coverage

```bash
npm test -- __tests__/contracts/ --coverage
```

## Test Coverage

The contract compliance test suite includes **45 comprehensive tests** covering:

### Contract Loading (9 tests)

- Loading individual contracts (loader, embedder, retriever, llm, reranker)
- Loading all contracts at once
- Error handling for missing contracts

### Metadata Validation (6 tests)

- Valid metadata structure
- Missing name detection
- Missing version detection
- Type mismatch detection
- Null plugin handling
- Empty string validation

### Required Methods Validation (5 tests)

- Method presence validation
- Missing method detection
- Non-function property detection
- Multiple required methods (retriever)

### Method Signature Validation (4 tests)

- Parameter count validation
- Parameter naming validation
- Missing method handling

### Complete Plugin Validation (10 tests)

- Valid plugin validation for all types (5 tests)
- Invalid plugin rejection for various violations (5 tests)

### Batch Validation (3 tests)

- Multiple plugin validation
- Mixed valid/invalid plugin detection
- Missing contract handling

### Report Formatting (3 tests)

- Passing validation reports
- Failing validation reports
- Warning formatting

### Contract Structure (2 tests)

- Required field validation
- Method-requirement consistency

### Edge Cases (3 tests)

- Extra methods handling
- Extra metadata handling
- Async method validation

## CI Integration

Contract tests are automatically executed in the CI pipeline via GitHub Actions:

- **Workflow**: `.github/workflows/ci.yml`
- **Trigger**: Push to main/develop, pull requests
- **Node versions**: 18, 20, 22
- **Test command**: `npm test`

### CI Failure Conditions

The CI build will **fail** if:

- Any plugin violates its contract specification
- Required methods are missing
- Metadata is incomplete or incorrect
- Method signatures don't match contract expectations

## Creating New Mock Plugins

When adding new plugin types or test cases:

### Valid Plugin Template

```javascript
class ValidPluginName {
  constructor() {
    this.name = "Plugin Name";
    this.version = "1.0.0";
    this.type = "plugin-type"; // Must match contract type
  }

  // Implement all required methods from contract
  async requiredMethod(params) {
    // Implementation
  }
}

module.exports = ValidPluginName;
```

### Invalid Plugin Templates

**Missing Method:**

```javascript
class InvalidPluginMissingMethod {
  constructor() {
    this.name = "Invalid Plugin";
    this.version = "1.0.0";
    this.type = "plugin-type";
  }
  // Missing required method - contract violation
}
```

**Missing Metadata:**

```javascript
class InvalidPluginMissingMetadata {
  constructor() {
    // Missing name, version, type
  }

  async requiredMethod(params) {
    // Implementation
  }
}
```

**Wrong Type:**

```javascript
class InvalidPluginWrongType {
  constructor() {
    this.name = "Invalid Plugin";
    this.version = "1.0.0";
    this.type = "wrong-type"; // Doesn't match contract
  }

  async requiredMethod(params) {
    // Implementation
  }
}
```

## Contract Validator API

The `ContractValidator` class in `src/utils/contract-validator.js` provides:

### Loading Contracts

```javascript
const validator = new ContractValidator();

// Load single contract
const loaderContract = validator.loadContract("loader");

// Load all contracts
const allContracts = validator.loadAllContracts();
```

### Validating Plugins

```javascript
// Validate single plugin
const result = validator.validatePlugin(myPlugin, contract);
if (!result.valid) {
  console.error("Errors:", result.errors);
}

// Validate multiple plugins
const plugins = [plugin1, plugin2, plugin3];
const results = validator.validatePlugins(plugins, allContracts);
```

### Generating Reports

```javascript
const result = validator.validatePlugin(plugin, contract);
const report = validator.formatValidationReport(result, "MyPlugin");
console.log(report);
```

## Adding New Plugin Types

To add a new plugin type:

1. **Create contract**: Add `new-type-contract.json` to `/contracts/`
2. **Create valid plugin**: Add `valid-new-type.js` to mock-plugins/
3. **Create invalid plugins**: Add test cases for common violations
4. **Add tests**: Update contract-compliance.test.js with new test cases

### Example Contract Structure

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "type": "new-type",
  "version": "1.0.0",
  "title": "New Type Contract",
  "description": "Contract for new type plugins",
  "methods": [
    {
      "name": "methodName",
      "parameters": ["param1", "param2"],
      "returns": "returnType"
    }
  ],
  "properties": {
    "methodName": {
      "type": "function",
      "description": "Method description",
      "parameters": {
        /* JSON Schema */
      },
      "returns": {
        /* JSON Schema */
      }
    }
  },
  "required": ["methodName"]
}
```

## Debugging Failed Tests

### Common Failure Scenarios

**Missing Method:**

```
✗ Required method "methodName" is missing
```

**Solution**: Implement the missing method on your plugin class

**Type Mismatch:**

```
✗ Plugin type "wrong-type" does not match contract type "expected-type"
```

**Solution**: Ensure `this.type` matches the contract type

**Missing Metadata:**

```
✗ Plugin must have a valid "name" property (non-empty string)
✗ Plugin must have a valid "version" property (non-empty string)
```

**Solution**: Add name and version properties in constructor

**Non-Function Method:**

```
✗ Required property "methodName" must be a function
```

**Solution**: Ensure the property is a function, not a string or object

### Verbose Test Output

For detailed error messages:

```bash
npm test -- __tests__/contracts/ --verbose
```

## Best Practices

1. **Always validate locally** before pushing
2. **Run full test suite** when modifying contracts
3. **Keep mock plugins simple** - focus on contract compliance
4. **Document contract changes** in commit messages
5. **Test both valid and invalid cases** for new plugin types
6. **Use meaningful test names** that describe the validation scenario

## Related Documentation

- [Contract Specifications](/contracts/)
- [Error Context Guide](/docs/error-context-guide.md)
- [Plugin Registry Contract Warnings](/docs/plugin-registry-contract-warnings.md)
- [Contributing Guide](/docs/CONTRIBUTING.md)

## Test Metrics

- **Total Tests**: 45
- **Test Suites**: 1
- **Coverage**: 100% of contract validation logic
- **Execution Time**: ~2 seconds
- **Node Versions Tested**: 18, 20, 22

## Support

For questions or issues related to contract validation:

1. Check existing test cases in `contract-compliance.test.js`
2. Review contract specifications in `/contracts/`
3. See ContractValidator API in `src/utils/contract-validator.js`
4. Open an issue on GitHub if problems persist
