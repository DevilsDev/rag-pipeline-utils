# Error Message Style Guide

This guide establishes standards for writing clear, helpful, and consistent error messages across the RAG Pipeline Utils codebase.

## Principles

### 1. Be Specific

**Do**: Provide specific information about what went wrong
**Don't**: Use vague, generic error messages

```javascript
// ❌ Bad
throw new Error("Invalid input");

// ✅ Good
throw createError(ERROR_CODES.CONFIG_INVALID_TYPE, {
  field: "pipeline.stages",
  expected: "array",
  actual: "string",
  currentValue: input,
});
```

### 2. Be Actionable

**Do**: Tell users what they can do to fix the problem
**Don't**: Just state the problem without solutions

```javascript
// ❌ Bad
"Configuration file not found";

// ✅ Good
createError(ERROR_CODES.CONFIG_NOT_FOUND, {
  path: ".ragrc.json",
});
// Automatically includes suggestions:
// 1. Create a .ragrc.json file in the project root
// 2. Specify the config path using --config flag
// 3. Run 'rag-pipeline init' to create a default configuration
```

### 3. Provide Context

**Do**: Include relevant values and state information
**Don't**: Hide context that could help debugging

```javascript
// ❌ Bad
throw new Error("Plugin failed");

// ✅ Good
throw createError(ERROR_CODES.PLUGIN_EXECUTION_FAILED, {
  plugin: "embedder-openai",
  reason: error.message,
  input: JSON.stringify(input).slice(0, 100),
  details: error.stack,
});
```

### 4. Use Consistent Format

**Do**: Use the error formatter for all errors
**Don't**: Mix different error formats

```javascript
// ❌ Bad - inconsistent formats
throw new Error("File not found: " + path);
throw new Error(`Missing config field '${field}'`);
throw "Plugin error"; // Never throw strings

// ✅ Good - consistent format
throw createError(ERROR_CODES.FS_FILE_NOT_FOUND, { path });
throw createError(ERROR_CODES.CONFIG_MISSING_REQUIRED, { field });
throw createError(ERROR_CODES.PLUGIN_EXECUTION_FAILED, { plugin, reason });
```

### 5. Link to Documentation

**Do**: Reference relevant documentation
**Don't**: Expect users to search for answers

```javascript
// Documentation links are automatically included in error templates
const error = createError(ERROR_CODES.CONFIG_VALIDATION_FAILED, {
  reason: "Invalid schema",
});
// Includes: Documentation: https://docs.rag-pipeline-utils.dev/configuration.md#schema-validation
```

---

## Error Message Structure

### Message Template Format

```javascript
{
  message: "Clear description of the problem with {placeholders}",
  suggestions: [
    "Specific action user can take",
    "Alternative solution",
    "Command to run: npm install {package}"
  ],
  documentation: "relative/path/to/docs.md#section"
}
```

### Message Components

1. **Error Code**: Unique identifier (e.g., `CONFIG_NOT_FOUND`)
2. **Message**: Clear description with context
3. **Suggestions**: 2-5 actionable steps
4. **Documentation**: Link to relevant docs
5. **Context**: Key-value pairs of relevant data

---

## Writing Guidelines

### Messages

#### Be Concise

```javascript
// ❌ Too verbose
"The configuration file that you specified could not be found in the filesystem at the path that was provided";

// ✅ Concise
"Configuration file not found at '{path}'";
```

#### Use Active Voice

```javascript
// ❌ Passive
"The plugin could not be loaded";

// ✅ Active
"Failed to load plugin '{plugin}'";
```

#### Avoid Jargon

```javascript
// ❌ Technical jargon
"Module resolution failed for CommonJS require()";

// ✅ Clear
"Plugin '{plugin}' not found";
```

#### Include Variables

```javascript
// ❌ Generic
"Invalid type";

// ✅ Specific
"Invalid type for '{field}': expected {expected}, got {actual}";
```

---

### Suggestions

#### Order by Likelihood

```javascript
suggestions: [
  "Most likely solution first",
  "Alternative solution",
  "Less common solution",
  "Last resort / contact support",
];
```

#### Be Specific

```javascript
// ❌ Vague
suggestions: ["Fix the configuration", "Check the file"];

// ✅ Specific
suggestions: [
  "Add the 'metadata.name' field to your .ragrc.json",
  "Verify the file exists: ls -la .ragrc.json",
  "Run 'rag-pipeline validate' to check for more errors",
];
```

#### Include Commands

```javascript
suggestions: [
  "Install the plugin: npm install @rag-pipeline/embedder-openai",
  "Check version: npm list @rag-pipeline/embedder-openai",
  "Verify configuration: rag-pipeline validate",
];
```

#### Show Examples

```javascript
suggestions: [
  "Change '{field}' to type {expected}",
  'Example: "pipeline": { "stages": ["fetch", "process"] }',
  "Review configuration examples at: docs/configuration.md",
];
```

---

## Code Examples

### Creating Enhanced Errors

```javascript
const { createError, ERROR_CODES } = require("./utils/error-formatter");

// Simple error
throw createError(ERROR_CODES.PLUGIN_NOT_FOUND, {
  plugin: "my-plugin",
});

// Error with rich context
throw createError(ERROR_CODES.PLUGIN_EXECUTION_FAILED, {
  plugin: "embedder-openai",
  reason: "API key invalid",
  input: JSON.stringify(input),
  details: "Check your OPENAI_API_KEY environment variable",
});

// Wrapping existing error
try {
  await loadPlugin(path);
} catch (error) {
  throw wrapError(error, ERROR_CODES.PLUGIN_LOAD_FAILED, {
    plugin: pluginName,
    path: path,
    reason: error.message,
  });
}
```

### Formatting for Display

```javascript
const { formatErrorMessage, logError } = require("./utils/error-formatter");

// Format for console output
const formatted = formatErrorMessage(error, {
  includeSuggestions: true,
  includeDocumentation: true,
  includeStack: false,
});
console.error(formatted);

// Log with appropriate level
logError(error, logger);
// Automatically uses warn/error based on severity
```

### Custom Error Templates

```javascript
// Add new error template
ERROR_TEMPLATES[ERROR_CODES.CUSTOM_ERROR] = {
  message: "Custom error occurred: {reason}",
  suggestions: [
    "Check the logs for more details",
    "Verify configuration is correct",
    "Try restarting the application",
  ],
  documentation: "troubleshooting.md#custom-errors",
};
```

---

## Common Patterns

### Configuration Errors

```javascript
// Missing field
createError(ERROR_CODES.CONFIG_MISSING_REQUIRED, {
  field: "metadata.name",
  expectedType: "string",
});

// Invalid type
createError(ERROR_CODES.CONFIG_INVALID_TYPE, {
  field: "pipeline.stages",
  expected: "array",
  actual: typeof value,
  currentValue: JSON.stringify(value),
});

// Validation failed
createError(ERROR_CODES.CONFIG_VALIDATION_FAILED, {
  reason: validationResult.errors[0].message,
  requiredFields: "metadata.name, pipeline.stages",
});
```

### Plugin Errors

```javascript
// Plugin not found
createError(ERROR_CODES.PLUGIN_NOT_FOUND, {
  plugin: pluginName,
  path: attemptedPath,
});

// Execution failed
createError(ERROR_CODES.PLUGIN_EXECUTION_FAILED, {
  plugin: pluginName,
  reason: error.message,
  input: JSON.stringify(input).slice(0, 200),
  details: error.stack,
});

// Contract violation
createError(ERROR_CODES.PLUGIN_CONTRACT_VIOLATION, {
  plugin: pluginName,
  violation: "Missing execute() method",
  missingMethod: "execute",
  expectedType: "function",
});
```

### File System Errors

```javascript
// File not found
createError(ERROR_CODES.FS_FILE_NOT_FOUND, {
  path: absolutePath,
});

// Permission denied
createError(ERROR_CODES.FS_PERMISSION_DENIED, {
  path: filePath,
  operation: "read",
});
```

### Pipeline Errors

```javascript
// Stage failed
createError(ERROR_CODES.PIPELINE_STAGE_FAILED, {
  stage: stageName,
  reason: error.message,
  input: JSON.stringify(stageInput).slice(0, 200),
});

// Execution failed
createError(ERROR_CODES.PIPELINE_EXECUTION_FAILED, {
  stage: currentStage,
  reason: error.message,
  requiredStages: expectedStages.join(", "),
});
```

---

## Testing Error Messages

### Test Clarity

```javascript
test("should provide clear error for missing config", () => {
  const error = createError(ERROR_CODES.CONFIG_NOT_FOUND, {
    path: ".ragrc.json",
  });

  expect(error.message).toContain(".ragrc.json");
  expect(error.suggestions.length).toBeGreaterThan(0);
  expect(error.suggestions[0]).toMatch(/create|specify|run/i);
});
```

### Test Actionability

```javascript
test("should provide actionable suggestions", () => {
  const error = createError(ERROR_CODES.PLUGIN_NOT_FOUND, {
    plugin: "my-plugin",
  });

  const hasActionable = error.suggestions.some(
    (s) =>
      s.includes("npm install") || s.includes("check") || s.includes("verify"),
  );
  expect(hasActionable).toBe(true);
});
```

### Test Context

```javascript
test("should include relevant context", () => {
  const error = createError(ERROR_CODES.CONFIG_INVALID_TYPE, {
    field: "stages",
    expected: "array",
    actual: "string",
  });

  expect(error.message).toContain("stages");
  expect(error.message).toContain("array");
  expect(error.message).toContain("string");
});
```

---

## Anti-Patterns

### Don't Use Generic Messages

```javascript
// ❌ Bad
throw new Error("An error occurred");
throw new Error("Something went wrong");
throw new Error("Invalid input");
throw new Error("Failed");

// ✅ Good
throw createError(ERROR_CODES.PLUGIN_EXECUTION_FAILED, {
  plugin: name,
  reason: specificReason,
  input: data,
});
```

### Don't Hide Context

```javascript
// ❌ Bad - swallowing important information
try {
  await loadPlugin(path);
} catch (error) {
  throw new Error("Plugin load failed");
}

// ✅ Good - preserving context
try {
  await loadPlugin(path);
} catch (error) {
  throw wrapError(error, ERROR_CODES.PLUGIN_LOAD_FAILED, {
    plugin: pluginName,
    path: path,
    details: error.message,
  });
}
```

### Don't Blame Users

```javascript
// ❌ Bad - accusatory
"You provided an invalid configuration";
"Your plugin is broken";

// ✅ Good - neutral and helpful
"Configuration validation failed: {reason}";
"Plugin execution failed: {reason}";
```

### Don't Use Technical Jargon

```javascript
// ❌ Bad
"Unhandled promise rejection in async iterator";
"ENOENT: syscall open";
"Module resolution failed for ESM";

// ✅ Good
"File not found: {path}";
"Failed to load plugin: {plugin}";
"Configuration file not accessible";
```

---

## Localization Considerations

While not currently implemented, keep these in mind for future localization:

1. **Use template strings** with placeholders
2. **Avoid concatenation** of translated strings
3. **Keep suggestions** as separate array items
4. **Store documentation links** separately

```javascript
// ✅ Localization-friendly
{
  message: "File not found: {path}",
  suggestions: [
    "Verify the file path is correct",
    "Check file permissions"
  ]
}
```

---

## Review Checklist

Before committing error messages, verify:

- [ ] Error has unique, descriptive code
- [ ] Message is specific and includes context
- [ ] 2-5 actionable suggestions provided
- [ ] Documentation link is included
- [ ] Variables use placeholders (e.g., `{field}`)
- [ ] Suggestions are ordered by likelihood
- [ ] Examples or commands are provided where helpful
- [ ] Message is concise (under 100 characters)
- [ ] Tone is neutral and helpful
- [ ] No technical jargon or blame language
- [ ] Error template is added to ERROR_TEMPLATES
- [ ] Tests verify message clarity

---

## Resources

- [Error Codes Reference](./error-codes.md)
- [Error Formatter API](./api/error-formatter.md)
- [Troubleshooting Guide](./troubleshooting.md)
- [Contributing Guidelines](../CONTRIBUTING.md)

---

## Continuous Improvement

Error messages should evolve based on user feedback:

1. **Track Common Errors**: Monitor which errors occur most
2. **Gather Feedback**: Ask users if error messages were helpful
3. **Improve Suggestions**: Update based on what actually works
4. **Add Examples**: Include real-world examples in documentation
5. **Update Documentation**: Keep error code docs current

---

## Examples of Excellent Error Messages

### Example 1: Configuration Error

```javascript
Error [CONFIG_MISSING_REQUIRED]: Missing required configuration field: 'metadata.name'

Suggestions:
  1. Add the 'metadata.name' field to your .ragrc.json
  2. Check the configuration examples in documentation
  3. Required type: string

Documentation: https://docs.rag-pipeline-utils.dev/configuration.md#required-fields
```

### Example 2: Plugin Error

```javascript
Error [PLUGIN_NOT_FOUND]: Plugin 'embedder-openai' not found

Suggestions:
  1. Check if the plugin is installed: npm list embedder-openai
  2. Install the plugin: npm install @rag-pipeline/embedder-openai
  3. Verify the plugin path in configuration: ./plugins/embedder-openai
  4. Check for typos in the plugin name

Documentation: https://docs.rag-pipeline-utils.dev/plugins.md#installation
```

### Example 3: Execution Error

```javascript
Error [PIPELINE_EXECUTION_FAILED]: Pipeline execution failed at stage 'process': Invalid input format

Suggestions:
  1. Check input data format for stage 'process'
  2. Review plugin configuration for this stage
  3. Enable verbose logging: pipeline.execute({ verbose: true })
  4. Check previous stage outputs

Documentation: https://docs.rag-pipeline-utils.dev/pipeline.md#execution-errors
```

---

## Contributing

To improve this style guide:

1. Submit pull requests with clarifications
2. Add examples from real-world use cases
3. Suggest better error message patterns
4. Report error messages that need improvement

---

## Version History

- v2.4.0: Initial error message style guide
- v2.4.1: Added localization considerations
- v2.4.2: Expanded code examples and anti-patterns
