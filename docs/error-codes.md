# Error Code Reference

This document provides a comprehensive reference for all error codes in RAG Pipeline Utils, including their meanings, causes, and resolution steps.

## Error Code Format

Error codes follow the pattern: `CATEGORY_SPECIFIC_ERROR`

Categories:

- `CONFIG_*` - Configuration errors
- `PLUGIN_*` - Plugin errors
- `PIPELINE_*` - Pipeline execution errors
- `VALIDATION_*` - Validation errors
- `FS_*` - File system errors
- `NETWORK_*` - Network and API errors
- `HOT_RELOAD_*` - Hot reload errors
- `DAG_*` - DAG engine errors
- `AUTH_*` - Authentication/Authorization errors

---

## Configuration Errors (CONFIG\_\*)

### CONFIG_NOT_FOUND

**Meaning**: The configuration file (.ragrc.json) could not be found at the specified location.

**Common Causes**:

- Configuration file doesn't exist
- Incorrect file path specified
- Working directory is not project root

**Resolution**:

1. Create a `.ragrc.json` file in your project root
2. Use `--config` flag to specify path: `rag-pipeline --config ./path/to/config.json`
3. Run `rag-pipeline init` to generate a default configuration

**Example**:

```bash
# Create default config
rag-pipeline init

# Or specify custom path
rag-pipeline --config ./config/.ragrc.json
```

---

### CONFIG_INVALID_JSON

**Meaning**: The configuration file contains invalid JSON syntax.

**Common Causes**:

- Missing commas between properties
- Unclosed brackets or braces
- Invalid escape sequences
- Trailing commas (not allowed in JSON)

**Resolution**:

1. Use a JSON validator or linter
2. Check for syntax errors in your IDE
3. Validate using: `rag-pipeline validate`

**Example**:

```json
// ❌ Invalid - missing comma
{
  "metadata": {
    "name": "my-pipeline"
    "version": "1.0.0"
  }
}

// ✅ Valid
{
  "metadata": {
    "name": "my-pipeline",
    "version": "1.0.0"
  }
}
```

---

### CONFIG_VALIDATION_FAILED

**Meaning**: Configuration file is valid JSON but doesn't meet schema requirements.

**Common Causes**:

- Missing required fields
- Invalid field types
- Invalid values for constrained fields

**Resolution**:

1. Review validation errors in output
2. Check [Configuration Schema](./configuration.md#schema)
3. Run `rag-pipeline validate` for detailed errors

---

### CONFIG_MISSING_REQUIRED

**Meaning**: A required configuration field is missing.

**Common Causes**:

- Incomplete configuration file
- Following outdated examples
- Typo in field name

**Resolution**:

1. Add the missing field to your configuration
2. Check [Required Fields](./configuration.md#required-fields)
3. Use configuration template as reference

**Example**:

```json
// ❌ Missing required 'pipeline.stages'
{
  "metadata": {
    "name": "my-pipeline"
  }
}

// ✅ Complete
{
  "metadata": {
    "name": "my-pipeline"
  },
  "pipeline": {
    "stages": ["fetch", "process", "store"]
  }
}
```

---

### CONFIG_INVALID_TYPE

**Meaning**: A configuration field has the wrong type.

**Common Causes**:

- String instead of array
- Number instead of string
- Object instead of array

**Resolution**:

1. Convert field to expected type
2. Check [Field Types](./configuration.md#field-types)

**Example**:

```json
// ❌ stages should be array
{
  "pipeline": {
    "stages": "fetch,process,store"
  }
}

// ✅ Correct type
{
  "pipeline": {
    "stages": ["fetch", "process", "store"]
  }
}
```

---

### CONFIG_INVALID_VALUE

**Meaning**: A configuration value is outside allowed constraints.

**Common Causes**:

- Value outside min/max range
- Invalid enum value
- Invalid format (e.g., email, URL)

**Resolution**:

1. Check allowed values for the field
2. Review field constraints in documentation

---

## Plugin Errors (PLUGIN\_\*)

### PLUGIN_NOT_FOUND

**Meaning**: The specified plugin could not be located.

**Common Causes**:

- Plugin not installed
- Incorrect plugin name or path
- Plugin in wrong directory

**Resolution**:

1. Install plugin: `npm install @your-org/plugin-name`
2. Verify plugin path in configuration
3. Check for typos in plugin name

**Example**:

```bash
# Install plugin
npm install @rag-pipeline/embedder-openai

# Verify installation
npm list @rag-pipeline/embedder-openai
```

---

### PLUGIN_LOAD_FAILED

**Meaning**: Plugin file exists but failed to load.

**Common Causes**:

- Syntax errors in plugin code
- Missing plugin dependencies
- Module import/export errors

**Resolution**:

1. Check plugin file for syntax errors
2. Install plugin dependencies: `npm install`
3. Verify plugin exports valid module
4. Check error details for specific issue

---

### PLUGIN_INVALID_EXPORT

**Meaning**: Plugin doesn't export required structure.

**Common Causes**:

- Missing required methods
- Incorrect export format
- Plugin doesn't implement contract

**Resolution**:

1. Ensure plugin exports class or object
2. Implement required methods (execute, init, etc.)
3. Review [Plugin Contract](./plugins.md#contract)

**Example**:

```javascript
// ❌ Invalid - no execute method
module.exports = class MyPlugin {
  constructor() {}
};

// ✅ Valid
module.exports = class MyPlugin {
  async execute(input) {
    return { output: input };
  }
};
```

---

### PLUGIN_EXECUTION_FAILED

**Meaning**: Plugin threw an error during execution.

**Common Causes**:

- Invalid input data
- Plugin logic error
- Missing dependencies at runtime

**Resolution**:

1. Check input data format
2. Review plugin error logs
3. Test plugin in isolation
4. Enable verbose logging

---

### PLUGIN_CONTRACT_VIOLATION

**Meaning**: Plugin doesn't meet contract requirements.

**Common Causes**:

- Missing required methods
- Wrong return type
- Doesn't implement interface correctly

**Resolution**:

1. Implement all required methods
2. Return expected types
3. Review [Plugin Contract](./plugins.md#contract-requirements)
4. Run contract tests

---

### PLUGIN_DEPENDENCY_MISSING

**Meaning**: Plugin requires a dependency that isn't installed.

**Common Causes**:

- Incomplete npm install
- Peer dependency not installed
- Version mismatch

**Resolution**:

1. Install missing dependency: `npm install <dependency>`
2. Check plugin's package.json for requirements
3. Verify version compatibility

---

## Pipeline Errors (PIPELINE\_\*)

### PIPELINE_CREATION_FAILED

**Meaning**: Failed to create pipeline instance.

**Common Causes**:

- Invalid configuration
- Plugin loading failures
- Missing required stages

**Resolution**:

1. Validate configuration: `rag-pipeline validate`
2. Check all plugins are installed
3. Verify stage definitions
4. Review error details for specific cause

---

### PIPELINE_EXECUTION_FAILED

**Meaning**: Pipeline execution failed at a specific stage.

**Common Causes**:

- Invalid input data
- Plugin execution error
- Stage configuration issue

**Resolution**:

1. Check input data for the failing stage
2. Review plugin configuration
3. Enable verbose logging
4. Check previous stage outputs

**Example**:

```javascript
// Enable verbose logging
await pipeline.execute(input, {
  verbose: true,
  logLevel: "debug",
});
```

---

### PIPELINE_STAGE_FAILED

**Meaning**: A specific pipeline stage failed.

**Common Causes**:

- Plugin error
- Invalid stage input
- Unmet dependencies

**Resolution**:

1. Verify stage configuration
2. Check stage dependencies
3. Review plugin logs
4. Validate input data

---

### PIPELINE_INVALID_STAGE

**Meaning**: Stage configuration is invalid.

**Common Causes**:

- Unknown stage name
- Invalid stage definition
- Circular dependencies

**Resolution**:

1. Check stage name matches configuration
2. Verify stage definition format
3. Review [Stage Configuration](./pipeline.md#stages)

---

## Validation Errors (VALIDATION\_\*)

### VALIDATION_FAILED

**Meaning**: Data validation failed against schema.

**Common Causes**:

- Missing required fields
- Type mismatches
- Constraint violations

**Resolution**:

1. Review validation error details
2. Check data against schema
3. Fix reported issues

---

### VALIDATION_SCHEMA_ERROR

**Meaning**: The validation schema itself is invalid.

**Common Causes**:

- Malformed JSON schema
- Invalid schema syntax
- Unsupported schema features

**Resolution**:

1. Validate schema with JSON Schema validator
2. Check schema syntax
3. Use supported JSON Schema version

---

### VALIDATION_CONSTRAINT_ERROR

**Meaning**: Data violates a constraint (min/max, pattern, etc.).

**Common Causes**:

- Value outside range
- String doesn't match pattern
- Array length violation

**Resolution**:

1. Check constraint requirements
2. Adjust data to meet constraints
3. Review schema documentation

---

## File System Errors (FS\_\*)

### FS_FILE_NOT_FOUND

**Meaning**: Specified file doesn't exist.

**Common Causes**:

- Incorrect file path
- File was deleted
- Wrong working directory

**Resolution**:

1. Verify file path is correct
2. Check file exists: `ls <path>`
3. Use absolute path instead of relative
4. Check file permissions

---

### FS_DIRECTORY_NOT_FOUND

**Meaning**: Specified directory doesn't exist.

**Common Causes**:

- Directory not created
- Incorrect path
- Parent directory missing

**Resolution**:

1. Create directory: `mkdir -p <path>`
2. Verify path is correct
3. Check parent directory exists

---

### FS_PERMISSION_DENIED

**Meaning**: Insufficient permissions to access file/directory.

**Common Causes**:

- Read/write permissions not set
- Owned by different user
- SELinux/AppArmor restrictions

**Resolution**:

1. Check permissions: `ls -la <path>`
2. Grant permissions: `chmod +r <path>`
3. Run with appropriate user
4. Contact system administrator

---

## Network Errors (NETWORK\_\*)

### NETWORK_REQUEST_FAILED

**Meaning**: HTTP/API request failed.

**Common Causes**:

- Network connectivity issues
- Invalid URL
- API service down
- Authentication failure

**Resolution**:

1. Check network connectivity
2. Verify API endpoint URL
3. Check API key/credentials
4. Review API status page

---

### NETWORK_TIMEOUT

**Meaning**: Request exceeded timeout limit.

**Common Causes**:

- Slow network
- API server slow to respond
- Timeout set too low

**Resolution**:

1. Check network speed
2. Increase timeout setting
3. Try again later
4. Contact API provider

---

### NETWORK_INVALID_RESPONSE

**Meaning**: API returned invalid or unexpected response.

**Common Causes**:

- API format changed
- Server error
- Malformed JSON response

**Resolution**:

1. Check API documentation for format
2. Verify API version compatibility
3. Enable response logging
4. Report to API provider

---

## Hot Reload Errors (HOT*RELOAD*\*)

### HOT_RELOAD_FAILED

**Meaning**: Failed to hot reload plugin or configuration.

**Common Causes**:

- Syntax errors in modified file
- File outside watched paths
- Module cache issues

**Resolution**:

1. Check for syntax errors
2. Verify file is in watched paths
3. Try manual reload
4. Review error details

**Example**:

```javascript
// Manual reload
await hotReload.triggerReload("./src/plugins/my-plugin.js", "plugin");
```

---

### HOT_RELOAD_STATE_ERROR

**Meaning**: Failed to preserve or restore plugin state.

**Common Causes**:

- State not serializable
- Circular references in state
- Missing getState/setState methods

**Resolution**:

1. Ensure state is serializable
2. Implement getState/setState
3. Remove circular references
4. Disable state preservation if not needed

**Example**:

```javascript
// Implement state preservation
class MyPlugin {
  async getState() {
    return { count: this.count };
  }

  async setState(state) {
    this.count = state.count;
  }
}
```

---

### HOT_RELOAD_WATCH_ERROR

**Meaning**: File watcher encountered an error.

**Common Causes**:

- Too many watched files
- File system limitations
- Chokidar configuration issue

**Resolution**:

1. Reduce watched paths
2. Check system file watch limits
3. Adjust watch configuration
4. Review chokidar documentation

---

## DAG Errors (DAG\_\*)

### DAG_CYCLE_DETECTED

**Meaning**: Circular dependency detected in DAG.

**Common Causes**:

- Node A depends on B, B depends on A
- Indirect circular dependency
- Self-dependency

**Resolution**:

1. Review dependency chain
2. Remove circular dependencies
3. Restructure DAG topology
4. Use topological sort to verify

**Example**:

```javascript
// ❌ Circular dependency
dag.addEdge("A", "B");
dag.addEdge("B", "C");
dag.addEdge("C", "A"); // Creates cycle

// ✅ No cycle
dag.addEdge("A", "B");
dag.addEdge("B", "C");
dag.addEdge("A", "C"); // Valid
```

---

### DAG_NODE_NOT_FOUND

**Meaning**: Referenced DAG node doesn't exist.

**Common Causes**:

- Node not added to DAG
- Typo in node ID
- Node removed before execution

**Resolution**:

1. Verify node ID is correct
2. Add node before referencing
3. List all nodes: `dag.getNodes()`

---

### DAG_EXECUTION_FAILED

**Meaning**: DAG execution failed.

**Common Causes**:

- Node execution error
- Invalid topology
- Missing dependencies

**Resolution**:

1. Check node error logs
2. Verify DAG topology
3. Ensure all dependencies are met
4. Enable verbose logging

---

### DAG_INVALID_TOPOLOGY

**Meaning**: DAG topology is invalid.

**Common Causes**:

- No start nodes
- Unreachable nodes
- Invalid edge configuration

**Resolution**:

1. Verify at least one start node
2. Check all nodes are reachable
3. Review edge definitions
4. Use topology validation

---

## Authentication Errors (AUTH\_\*)

### AUTH_INVALID_TOKEN

**Meaning**: Authentication token is invalid.

**Common Causes**:

- Token malformed
- Invalid signature
- Wrong encoding

**Resolution**:

1. Check token format
2. Verify token signature
3. Ensure proper encoding
4. Generate new token

---

### AUTH_TOKEN_EXPIRED

**Meaning**: Authentication token has expired.

**Common Causes**:

- Token past expiration time
- Clock skew
- Token not refreshed

**Resolution**:

1. Generate new token
2. Increase token expiration
3. Implement token refresh
4. Check system clock

---

### AUTH_INSUFFICIENT_PERMISSIONS

**Meaning**: User lacks required permissions.

**Common Causes**:

- Missing role assignment
- Insufficient privileges
- Access policy restriction

**Resolution**:

1. Request required permissions
2. Check role assignments
3. Review access policies
4. Contact administrator

---

## General Errors

### UNKNOWN_ERROR

**Meaning**: An unexpected error occurred.

**Common Causes**:

- Unhandled exception
- Unexpected condition
- Bug in code

**Resolution**:

1. Check application logs
2. Enable verbose logging
3. Report issue with details
4. Include stack trace

---

## Getting Help

If you encounter an error not listed here or need additional help:

1. **Check Logs**: Enable verbose logging for more details
2. **Documentation**: Review relevant documentation sections
3. **GitHub Issues**: Search existing issues or create new one
4. **Community**: Ask in discussions or community forums

## Contributing

Help improve error messages:

1. Report unclear error messages
2. Suggest better resolution steps
3. Contribute documentation improvements
4. Submit pull requests with enhanced errors

## Related Documentation

- [Error Formatter API](./api/error-formatter.md)
- [Error Message Style Guide](./error-message-style-guide.md)
- [Troubleshooting Guide](./troubleshooting.md)
- [Configuration Reference](./configuration.md)
