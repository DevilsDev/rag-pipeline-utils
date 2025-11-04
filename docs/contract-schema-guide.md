# Contract Schema Guide

## Overview

The RAG Pipeline Utils uses JSON Schema to validate plugin contracts, ensuring consistency and preventing errors before plugins are loaded. This guide explains how contract schema validation works and how to create valid contracts.

## Schema Location

The contract schema is defined in `contracts/contract-schema.json` and follows the [JSON Schema Draft-07 specification](http://json-schema.org/draft-07/schema#).

## Schema Validation Features

### Automatic Validation

Contract schema validation is **enabled by default** and runs automatically when:

1. The PluginRegistry is initialized
2. Contracts are loaded from the `contracts/` directory
3. Each contract file is validated against the schema

### Environment-Aware Behavior

**Development Mode** (`NODE_ENV !== 'production'`)

- Invalid contracts **throw an error** immediately (fail fast)
- Schema validation errors are detailed and include paths
- Helps catch issues early during development

**Production Mode** (`NODE_ENV === 'production'`)

- Invalid contracts **log an error** but continue (fail open)
- System remains operational even with invalid contracts
- Errors are logged to console for monitoring

## Required Contract Fields

All plugin contracts must include these fields:

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "type": "loader",
  "version": "1.0.0",
  "title": "Loader Contract",
  "description": "Contract for loader plugins",
  "methods": [...],
  "properties": {...},
  "required": [...]
}
```

### Field Descriptions

| Field         | Type   | Description                   | Validation                                                                                      |
| ------------- | ------ | ----------------------------- | ----------------------------------------------------------------------------------------------- |
| `$schema`     | string | JSON Schema specification URI | Optional                                                                                        |
| `type`        | string | Plugin type identifier        | **Required**. Must be one of: `loader`, `embedder`, `retriever`, `llm`, `reranker`, `evaluator` |
| `version`     | string | Contract version              | **Required**. Must follow semantic versioning: `X.Y.Z`                                          |
| `title`       | string | Human-readable contract title | **Required**. Minimum 1 character                                                               |
| `description` | string | Contract description          | **Required**. Minimum 1 character                                                               |
| `methods`     | array  | Method specifications         | **Required**. Minimum 1 method                                                                  |
| `properties`  | object | Property specifications       | **Required**. Minimum 1 property                                                                |
| `required`    | array  | Required method names         | **Required**. Minimum 1 method                                                                  |

## Methods Array Schema

Each method in the `methods` array must include:

```json
{
  "name": "methodName",
  "parameters": ["param1", "param2"],
  "returns": "returnDescription"
}
```

### Method Validation Rules

- **name**: Valid JavaScript identifier (alphanumeric + underscore, must start with letter or underscore)

  - Valid: `load`, `embed`, `get_documents`, `processData`
  - Invalid: `invalid-name`, `123start`, `my method`

- **parameters**: Array of parameter names (same naming rules as method names)

- **returns**: Non-empty string describing the return type

## Properties Object Schema

The `properties` object defines detailed specifications for each method:

```json
{
  "load": {
    "type": "function",
    "description": "Load documents from source",
    "parameters": {
      "type": "object",
      "properties": {
        "source": {
          "type": "string",
          "description": "Source path or identifier"
        }
      },
      "required": ["source"]
    },
    "returns": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "id": { "type": "string" },
          "content": { "type": "string" },
          "metadata": { "type": "object" }
        },
        "required": ["id", "content"]
      }
    }
  }
}
```

### Property Field Requirements

Each property must include:

- **type**: Property type (must be `function`, `string`, `number`, `boolean`, `object`, or `array`)
- **description**: Non-empty description of the property

For function properties, you can optionally include:

- **parameters**: Parameter schema (JSON Schema format)
- **returns**: Return value schema (JSON Schema format)

### Property Key Validation

Property keys must be valid JavaScript identifiers (same rules as method names).

## Required Array Schema

The `required` array lists method names that plugins **must** implement:

```json
{
  "required": ["load", "validate"]
}
```

### Requirements

- Minimum 1 required method
- All values must be valid JavaScript identifiers
- All values must be unique
- Methods listed here should match entries in both `methods` and `properties`

## Complete Example: Loader Contract

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "type": "loader",
  "version": "1.0.0",
  "title": "Loader Contract",
  "description": "Contract for loader plugins that load documents from various sources",
  "methods": [
    {
      "name": "load",
      "parameters": ["source"],
      "returns": "documents"
    }
  ],
  "properties": {
    "load": {
      "type": "function",
      "description": "Load documents from the specified source",
      "parameters": {
        "type": "object",
        "properties": {
          "source": {
            "type": "string",
            "description": "Source path, URL, or identifier for the documents"
          }
        },
        "required": ["source"]
      },
      "returns": {
        "type": "array",
        "description": "Array of loaded documents",
        "items": {
          "type": "object",
          "properties": {
            "id": {
              "type": "string",
              "description": "Unique document identifier"
            },
            "content": {
              "type": "string",
              "description": "Document content"
            },
            "metadata": {
              "type": "object",
              "description": "Additional document metadata"
            }
          },
          "required": ["id", "content"]
        }
      }
    }
  },
  "required": ["load"]
}
```

## Common Validation Errors

### 1. Missing Required Field

**Error:**

```
Contract schema validation failed for 'loader':
  - /: must have required property 'title'
```

**Fix:** Add the missing required field:

```json
{
  "title": "Loader Contract",
  ...
}
```

### 2. Invalid Version Format

**Error:**

```
Contract schema validation failed for 'loader':
  - /version: must match pattern "^\d+\.\d+\.\d+$"
```

**Fix:** Use semantic versioning (X.Y.Z):

```json
{
  "version": "1.0.0" // NOT "1.0" or "v1.0.0"
}
```

### 3. Invalid Plugin Type

**Error:**

```
Contract schema validation failed for 'loader':
  - /type: must be equal to one of the allowed values
```

**Fix:** Use one of the allowed plugin types:

```json
{
  "type": "loader" // Must be: loader, embedder, retriever, llm, reranker, or evaluator
}
```

### 4. Empty Methods Array

**Error:**

```
Contract schema validation failed for 'loader':
  - /methods: must NOT have fewer than 1 items
```

**Fix:** Add at least one method:

```json
{
  "methods": [
    {
      "name": "load",
      "parameters": ["source"],
      "returns": "documents"
    }
  ]
}
```

### 5. Invalid Method Name

**Error:**

```
Contract schema validation failed for 'loader':
  - /methods/0/name: must match pattern "^[a-zA-Z_][a-zA-Z0-9_]*$"
```

**Fix:** Use valid JavaScript identifier:

```json
{
  "methods": [
    {
      "name": "load_documents" // NOT "load-documents" or "load documents"
    }
  ]
}
```

## Configuration Options

### Disable Schema Validation

You can disable schema validation entirely (not recommended for production):

```javascript
const registry = new PluginRegistry({
  validateContractSchema: false,
});
```

### Disable Contract Warnings

To suppress contract-related warnings:

```javascript
const registry = new PluginRegistry({
  disableContractWarnings: true,
});
```

## Programmatic Validation

You can validate contracts programmatically:

```javascript
const { PluginRegistry } = require('@devilsdev/rag-pipeline-utils');

const registry = new PluginRegistry();

const myContract = {
  type: 'loader',
  version: '1.0.0',
  title: 'My Loader',
  description: 'Custom loader contract',
  methods: [...],
  properties: {...},
  required: [...]
};

const result = registry._validateContractAgainstSchema(myContract, 'loader');

if (!result.valid) {
  console.error('Validation errors:', result.errors);
  const formatted = registry._formatSchemaErrors(result.errors);
  console.error(formatted);
}
```

## Schema Evolution

When updating the contract schema:

1. **Add new optional fields** - Backward compatible
2. **Add new enum values** (e.g., new plugin types) - Backward compatible
3. **Make required fields optional** - Backward compatible
4. **Remove required fields** - Breaking change (requires version bump)
5. **Tighten validation rules** - Potentially breaking (test thoroughly)

Always test schema changes against all existing contracts:

```bash
npm test -- __tests__/contracts/contract-schema-validation.test.js
npm test -- __tests__/ci/contract-schema-validation.test.js
```

## Best Practices

1. **Always validate locally** before committing contract changes
2. **Use semantic versioning** for contract versions
3. **Document breaking changes** in contract descriptions
4. **Test with real plugins** to ensure compatibility
5. **Keep contracts backward compatible** when possible
6. **Use descriptive error messages** in custom validation
7. **Follow the schema examples** for consistency

## Integration with CI/CD

The contract schema validation runs automatically in CI pipelines:

```bash
npm test  # Includes contract validation tests
```

Failed validation in development mode will cause builds to fail, ensuring only valid contracts are published.

## Troubleshooting

### Schema Compilation Errors

If you see schema compilation errors:

```
[PLUGIN_REGISTRY] Warning: Failed to compile contract schema
```

Check that:

- `contracts/contract-schema.json` exists and is valid JSON
- No circular references in the schema
- All schema keywords are valid JSON Schema Draft-07

### Validation Not Running

If validation doesn't seem to be running:

1. Check `NODE_ENV` - validation is stricter in development
2. Verify `validateContractSchema` is not set to `false`
3. Check that `contract-schema.json` is present
4. Look for warnings in console output

### All Contracts Failing Validation

If all contracts suddenly fail validation:

1. Review recent changes to `contract-schema.json`
2. Check for overly strict new validation rules
3. Verify existing contracts against the schema manually
4. Consider reverting schema changes and updating gradually

## See Also

- [Plugin Registry Documentation](./plugin-registry-contract-warnings.md)
- [Error Context Guide](./error-context-guide.md)
- [Contract Testing Guide](../__tests__/contracts/README.md)
- [JSON Schema Specification](http://json-schema.org/draft-07/schema#)
