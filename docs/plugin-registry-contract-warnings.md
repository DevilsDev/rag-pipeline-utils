# Plugin Registry Contract Warnings

## Overview

The Plugin Registry includes intelligent contract warning functionality that helps developers identify missing contract specifications during development. These warnings provide actionable guidance on adding contracts to improve plugin reliability and maintainability.

## Features

- **One-time warnings**: Each contract type warns only once to avoid log spam
- **Environment-aware**: Warnings only appear in non-production environments
- **Configurable**: Can be disabled via configuration option
- **Helpful guidance**: Includes benefits of contracts and step-by-step instructions
- **Context-specific**: Tracks warnings separately for different contexts (load vs register)

## Contract Warning Behavior

### Development Environment

In development (NODE_ENV !== 'production'), the registry will log a detailed warning when:

1. **Loading contracts**: A contract file is missing during initialization
2. **Registering plugins**: A plugin is registered for a type without a contract

**Example Warning:**

```
╔════════════════════════════════════════════════════════════════════════════╗
║ [PLUGIN_REGISTRY] Missing Contract for 'loader' plugins                       ║
╠════════════════════════════════════════════════════════════════════════════╣
║ A contract specification was not found for the 'loader' plugin type.         ║
║                                                                            ║
║ Benefits of using contracts:                                              ║
║  • Ensures plugin compatibility across versions                           ║
║  • Validates required methods and properties                              ║
║  • Provides clear interface documentation                                 ║
║  • Catches errors early in development                                    ║
║  • Enables automated testing and validation                               ║
║                                                                            ║
║ To add a contract:                                                        ║
║  1. Create contracts/loader-contract.json                                   ║
║  2. Define required methods and their signatures                          ║
║  3. Run contract validation tests                                         ║
║                                                                            ║
║ Example contract structure:                                               ║
║  {                                                                         ║
║    "type": "loader",                                                         ║
║    "version": "1.0.0",                                                     ║
║    "required": ["methodName"],                                            ║
║    "properties": { /* method definitions */ }                             ║
║  }                                                                         ║
║                                                                            ║
║ See: docs/error-context-guide.md and __tests__/contracts/README.md        ║
║                                                                            ║
║ To disable these warnings:                                                ║
║  new PluginRegistry({ disableContractWarnings: true })                    ║
╚════════════════════════════════════════════════════════════════════════════╝
```

### Production Environment

In production (NODE_ENV === 'production'), **no warnings are logged** regardless of missing contracts. This ensures clean production logs and optimal performance.

### Test Environment

In test environments (NODE_ENV === 'test'), warnings are displayed to help catch missing contracts during automated testing.

## Configuration

### Disabling Warnings

You can disable contract warnings globally when creating a registry instance:

```javascript
const { PluginRegistry } = require("@devilsdev/rag-pipeline-utils");

const registry = new PluginRegistry({
  disableContractWarnings: true,
});
```

### Default Behavior

By default, warnings are **enabled** in non-production environments:

```javascript
const registry = new PluginRegistry();
// Warnings enabled in development/test, disabled in production
```

## API Reference

### checkContractExists(type)

Check if a contract exists for the given plugin type.

**Parameters:**

- `type` (string) - Plugin type (loader, embedder, retriever, llm, reranker)

**Returns:**

- `boolean` - True if contract exists, false otherwise

**Example:**

```javascript
const registry = new PluginRegistry();

if (registry.checkContractExists("loader")) {
  console.log("Loader contract is available");
} else {
  console.warn("Loader contract is missing");
}

// Check all contract types
const types = ["loader", "embedder", "retriever", "llm", "reranker"];
types.forEach((type) => {
  if (!registry.checkContractExists(type)) {
    console.warn(`Missing contract for: ${type}`);
  }
});
```

### \_warnMissingContract(type, context) [Private]

Internal method for logging one-time warnings about missing contracts.

**Parameters:**

- `type` (string) - Plugin type
- `context` (string) - Context where warning is generated ('load' or 'register')

**Behavior:**

- Only warns once per unique type+context combination
- Skips warning in production or when warnings disabled
- Logs detailed, formatted warning message

## Benefits of Using Contracts

### 1. Compatibility Assurance

Contracts ensure that plugins maintain a consistent interface across different versions, preventing breaking changes.

### 2. Method Validation

Required methods and properties are automatically validated during plugin registration, catching errors early.

### 3. Interface Documentation

Contracts serve as clear documentation of the plugin interface, making it easier for developers to implement compatible plugins.

### 4. Early Error Detection

Problems are caught during development and registration, not at runtime when users are affected.

### 5. Automated Testing

Contracts enable comprehensive automated testing and validation (see `__tests__/contracts/`).

## Adding a Contract

### Step 1: Create Contract File

Create a new JSON file in the `contracts/` directory:

```bash
touch contracts/my-plugin-type-contract.json
```

### Step 2: Define Contract Structure

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "type": "my-plugin-type",
  "version": "1.0.0",
  "title": "My Plugin Type Contract",
  "description": "Contract for my-plugin-type plugins",
  "methods": [
    {
      "name": "myMethod",
      "parameters": ["param1", "param2"],
      "returns": "result"
    }
  ],
  "properties": {
    "myMethod": {
      "type": "function",
      "description": "Description of what the method does",
      "parameters": {
        "type": "object",
        "properties": {
          "param1": {
            "type": "string",
            "description": "First parameter"
          },
          "param2": {
            "type": "number",
            "description": "Second parameter"
          }
        },
        "required": ["param1"]
      },
      "returns": {
        "type": "object",
        "description": "Return value description"
      }
    }
  },
  "required": ["myMethod"]
}
```

### Step 3: Update Plugin Registry

Add the contract file to the `contractFiles` map in `src/core/plugin-registry.js`:

```javascript
const contractFiles = {
  loader: "loader-contract.json",
  embedder: "embedder-contract.json",
  retriever: "retriever-contract.json",
  llm: "llm-contract.json",
  reranker: "reranker-contract.json",
  "my-plugin-type": "my-plugin-type-contract.json", // Add this line
};
```

### Step 4: Add Validation Tests

Create tests in `__tests__/contracts/` to validate plugins against the contract:

```javascript
const ContractValidator = require("../../src/utils/contract-validator");

describe("MyPluginType Contract Validation", () => {
  let validator;
  let contract;

  beforeAll(() => {
    validator = new ContractValidator();
    contract = validator.loadContract("my-plugin-type");
  });

  it("should validate valid plugin", () => {
    const plugin = new MyValidPlugin();
    const result = validator.validatePlugin(plugin, contract);
    expect(result.valid).toBe(true);
  });

  // Add more tests...
});
```

### Step 5: Run Tests

```bash
npm test -- __tests__/contracts/
```

## Common Scenarios

### Scenario 1: Missing Contract During Development

**Symptom:** Detailed warning appears in console when starting application

**Solution:**

1. Review the warning message
2. Follow the instructions to create a contract
3. Run contract validation tests
4. Warnings will disappear once contract is added

### Scenario 2: Too Many Warnings

**Symptom:** Warnings appear multiple times during testing

**Solution:**

- Each contract type only warns once per context (load/register)
- If seeing multiple warnings, likely multiple contract types are missing
- Consider creating contracts for all plugin types you're using

### Scenario 3: Warnings in CI/CD

**Symptom:** Contract warnings appearing in CI logs

**Solution:**

- Add contracts for all plugin types used in your application
- Alternatively, disable warnings for CI:
  ```javascript
  const registry = new PluginRegistry({
    disableContractWarnings: process.env.CI === "true",
  });
  ```

### Scenario 4: Production Logs Cluttered

**Issue:** Worried about warnings in production

**Resolution:** Contract warnings are **automatically disabled** in production (NODE_ENV === 'production'), so this is not a concern.

## Testing Contract Warnings

### Verifying Warning Behavior

```javascript
describe("Contract Warnings", () => {
  let consoleWarnSpy;

  beforeEach(() => {
    consoleWarnSpy = jest.spyOn(console, "warn").mockImplementation();
  });

  afterEach(() => {
    consoleWarnSpy.mockRestore();
  });

  it("should warn in development", () => {
    process.env.NODE_ENV = "development";

    // Simulate missing contract
    const registry = new PluginRegistry({ disableContractWarnings: false });

    // Verify warning was called
    expect(consoleWarnSpy).toHaveBeenCalledWith(
      expect.stringContaining("Missing Contract"),
    );
  });

  it("should not warn in production", () => {
    process.env.NODE_ENV = "production";

    const registry = new PluginRegistry({ disableContractWarnings: false });

    expect(consoleWarnSpy).not.toHaveBeenCalled();
  });
});
```

## Best Practices

### 1. Always Add Contracts for Custom Plugin Types

When creating a new plugin type:

- Define the contract first (contract-driven development)
- Use the contract to guide plugin implementation
- Validate plugins against the contract during development

### 2. Keep Contracts in Version Control

- Commit contract files alongside code
- Track contract changes in git history
- Use contract versions to manage breaking changes

### 3. Run Contract Tests in CI

Ensure your CI pipeline runs contract validation tests:

```yaml
# .github/workflows/ci.yml
- name: Test
  run: npm test
  # This includes contract validation tests
```

### 4. Document Contract Requirements

In your plugin documentation, reference the contract specification:

```javascript
/**
 * MyLoader - Loads data from source
 *
 * @implements {LoaderContract} See contracts/loader-contract.json
 */
class MyLoader {
  // Implementation
}
```

### 5. Use Contract Validation in Development Tools

Integrate contract validation into development workflows:

```json
{
  "scripts": {
    "validate-contracts": "npm test -- __tests__/contracts/",
    "precommit": "npm run validate-contracts"
  }
}
```

## Troubleshooting

### Warning Not Appearing

**Check:**

1. NODE_ENV is set to development or test
2. disableContractWarnings is not set to true
3. Contract file actually doesn't exist in contracts/ directory

### Warning Appearing Multiple Times

**Check:**

1. Are you creating multiple registry instances?
2. Each instance tracks warnings independently
3. Use singleton pattern if needed:
   ```javascript
   // Use default export (singleton)
   const registry = require("@devilsdev/rag-pipeline-utils/src/core/plugin-registry");
   ```

### Contract Exists But Warning Still Shows

**Check:**

1. Contract file is named correctly: `{type}-contract.json`
2. Contract file contains valid JSON
3. Contract file is in the correct directory (`contracts/`)
4. Type name in contract matches the plugin type

## Related Documentation

- [Contract Compliance Tests](../../__tests__/contracts/README.md)
- [Contract Validator API](../../src/utils/contract-validator.js)
- [Error Context Guide](./error-context-guide.md)
- [Plugin Development Guide](./CONTRIBUTING.md)

## Support

For issues or questions:

1. Check existing contracts in `/contracts/` for examples
2. Review test cases in `__tests__/contracts/`
3. See ContractValidator usage in `src/utils/contract-validator.js`
4. Open an issue on GitHub if problems persist
