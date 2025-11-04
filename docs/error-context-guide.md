# Error Context Management Guide

## Overview

The `ErrorContext` class provides centralized error handling, context management, and error reporting for DAG execution. It handles error creation with rich metadata, aggregation of multiple errors, preservation of error properties through transformations, and serialization for debugging and monitoring systems.

## Features

- **Rich Error Context**: Create errors with node IDs, timestamps, downstream impact analysis
- **Error Aggregation**: Combine multiple errors into a single reportable error
- **Property Preservation**: Maintain all error metadata through transformations
- **Error Serialization**: Convert errors to JSON for logging and monitoring
- **Cycle Detection**: Track and report cycle paths in DAG structures
- **Execution Control**: Determine if errors should halt DAG execution

## Installation

The ErrorContext module is part of the DAG execution system and is automatically available when using the DAG engine:

```javascript
const { DAG } = require("@devilsdev/rag-pipeline-utils");
const ErrorContext = require("@devilsdev/rag-pipeline-utils/src/dag/core/error-context");
```

## Basic Usage

### Creating Error Context

Create errors with rich context including node information and downstream impact:

```javascript
const ErrorContext = require("./src/dag/core/error-context");

const errorContext = new ErrorContext();

// Create a node error with downstream impact
const originalError = new Error("Database connection failed");
const nodeError = errorContext.createErrorContext("dbNode", originalError, {
  downstream: ["processData", "saveResults"],
  timestamp: Date.now(),
});

console.log(nodeError.message);
// Output: "Node dbNode execution failed: Database connection failed.
//          This affects downstream nodes: processData, saveResults"

console.log(nodeError.nodeId); // "dbNode"
console.log(nodeError.cause); // Original Error object
console.log(nodeError.timestamp); // Current timestamp
```

### Aggregating Multiple Errors

When multiple nodes fail, aggregate their errors for comprehensive reporting:

```javascript
const errorsMap = new Map([
  ["nodeA", new Error("Node A failed")],
  ["nodeB", new Error("Node B failed")],
  ["nodeC", new Error("Node C failed")],
]);

const aggregated = errorContext.aggregateErrors(errorsMap);

console.log(aggregated.message); // "Multiple execution errors"
console.log(aggregated.errors); // Array of 3 Error objects
```

### Preserving Error Context

Maintain error metadata when wrapping or transforming errors:

```javascript
const originalError = new Error("Processing failed");
originalError.nodeId = "processNode";
originalError.timestamp = Date.now();
originalError.cause = new Error("Root cause");

// Preserve context while adding new properties
const preserved = errorContext.preserveNodeContext(originalError, {
  retryCount: 3,
  maxRetries: 5,
});

console.log(preserved.nodeId); // 'processNode' (preserved)
console.log(preserved.timestamp); // Original timestamp (preserved)
console.log(preserved.retryCount); // 3 (added)
```

## Advanced Features

### Error Wrapping Policy

The ErrorContext implements a sophisticated error wrapping policy:

```javascript
// Node errors are not wrapped (returned unchanged)
const nodeError = new Error("Node A execution failed");
nodeError.nodeId = "A";
const wrapped1 = errorContext.wrapExecutionError(nodeError);
// wrapped1 === nodeError (unchanged)

// Validation errors are wrapped once
const validationError = new Error("DAG validation failed: cycle detected");
const wrapped2 = errorContext.wrapExecutionError(validationError);
// wrapped2.message === "DAG execution failed: DAG validation failed: cycle detected"

// Timeout errors are not wrapped
const timeoutError = new Error("Execution timeout");
const wrapped3 = errorContext.wrapExecutionError(timeoutError);
// wrapped3 === timeoutError (unchanged)
```

### Cycle Error Reporting

Create specialized errors for cycle detection:

```javascript
const cyclePath = ["fetchData", "processData", "validateData", "fetchData"];
const cycleError = errorContext.createCycleError(cyclePath);

console.log(cycleError.message);
// "Cycle detected involving node: fetchData -> processData -> validateData -> fetchData"

console.log(cycleError.cycle);
// ['fetchData', 'processData', 'validateData', 'fetchData']
```

### Error Serialization for Logging

Convert errors to structured JSON for logging and monitoring:

```javascript
const error = errorContext.createErrorContext(
  "apiNode",
  new Error("API request failed"),
  {
    downstream: ["processResponse", "updateCache"],
    timestamp: Date.now(),
  },
);

// Serialize to JSON
const json = errorContext.serializeError(error);
console.log(json);
// {
//   "message": "Node apiNode execution failed: API request failed. This affects downstream nodes: processResponse, updateCache",
//   "nodeId": "apiNode",
//   "timestamp": 1234567890,
//   "cause": {
//     "message": "API request failed",
//     "stack": "Error: API request failed\n    at ..."
//   },
//   "cycle": null,
//   "errors": null
// }

// Format error report (without serialization)
const report = errorContext.formatErrorReport(error);
// Returns a plain object (not stringified)
```

### Execution Control

Determine if an error should halt DAG execution:

```javascript
const criticalError = new Error("Critical node failed");
criticalError.nodeId = "criticalNode";

const shouldHalt = errorContext.shouldHaltExecution(criticalError, {
  continueOnError: false,
  isNonCritical: false,
});
console.log(shouldHalt); // true

const optionalError = new Error("Optional node failed");
optionalError.nodeId = "optionalNode";

const shouldHalt2 = errorContext.shouldHaltExecution(optionalError, {
  continueOnError: true,
  isNonCritical: true,
});
console.log(shouldHalt2); // false
```

## Integration with DAG Engine

The ErrorContext is automatically used by the DAG engine:

```javascript
const { DAG } = require("@devilsdev/rag-pipeline-utils");

const dag = new DAG();

// Add nodes
dag.addNode("fetchData", async (input) => {
  // If this fails, ErrorContext will wrap it
  const response = await fetch("https://api.example.com/data");
  return response.json();
});

dag.addNode("processData", async (data) => {
  // Processing logic
  return processedData;
});

dag.connect("fetchData", "processData");

try {
  await dag.execute();
} catch (error) {
  // Error comes with rich context
  console.log(error.message); // Includes node ID and downstream impact
  console.log(error.nodeId); // The node that failed
  console.log(error.timestamp); // When it failed
  console.log(error.cause); // Original error
}
```

## Complete Example: Error Handling Lifecycle

```javascript
const ErrorContext = require("./src/dag/core/error-context");
const errorContext = new ErrorContext();

// 1. Create error context
const originalError = new Error("Database connection timeout");
const nodeError = errorContext.createErrorContext("dbNode", originalError, {
  downstream: ["processData", "saveResults", "sendNotification"],
  timestamp: Date.now(),
});

// 2. Preserve context when wrapping
const preserved = errorContext.preserveNodeContext(nodeError, {
  retryCount: 3,
  lastAttempt: new Date().toISOString(),
});

// 3. Check if execution should halt
const shouldHalt = errorContext.shouldHaltExecution(preserved, {
  continueOnError: false,
  isNonCritical: false,
});

if (shouldHalt) {
  // 4. Format for reporting
  const report = errorContext.formatErrorReport(preserved);

  // 5. Serialize for logging
  const json = errorContext.serializeError(preserved);

  // Send to logging/monitoring system
  console.error("Critical error detected:", json);

  // Or use the structured report
  await monitoring.sendAlert({
    severity: "critical",
    nodeId: report.nodeId,
    message: report.message,
    timestamp: report.timestamp,
    downstreamImpact: ["processData", "saveResults", "sendNotification"],
  });
}
```

## Error Properties Reference

### Standard Error Properties

| Property    | Type     | Description                             |
| ----------- | -------- | --------------------------------------- |
| `message`   | string   | Error message with context              |
| `nodeId`    | string   | ID of the node that failed              |
| `timestamp` | number   | Unix timestamp of failure               |
| `cause`     | Error    | Original error object                   |
| `cycle`     | string[] | Cycle path (for cycle errors)           |
| `errors`    | Error[]  | Array of errors (for aggregated errors) |

### Example Error Object

```javascript
{
  message: "Node processData execution failed: Invalid input format. This affects downstream nodes: saveResults, notify",
  nodeId: "processData",
  timestamp: 1704067200000,
  cause: Error("Invalid input format"),
  cycle: null,
  errors: null,
  // Custom properties can be added via preserveNodeContext
  retryCount: 2,
  maxRetries: 5
}
```

## Best Practices

### 1. Always Use createErrorContext for Node Failures

```javascript
// Good
const nodeError = errorContext.createErrorContext("nodeA", error, {
  downstream: downstreamNodes,
  timestamp: Date.now(),
});

// Bad
const nodeError = new Error(`Node ${nodeId} failed`);
nodeError.nodeId = nodeId; // Missing cause, timestamp, downstream info
```

### 2. Preserve Context Through Transformations

```javascript
// Good
const wrapped = errorContext.preserveNodeContext(originalError, {
  additionalContext: "value",
});

// Bad
const wrapped = new Error(originalError.message);
// Lost: nodeId, timestamp, cause, cycle, errors
```

### 3. Use Serialization for Logging

```javascript
// Good - Structured logging
logger.error("Node failure", {
  error: errorContext.formatErrorReport(error),
});

// Bad - Loses metadata
logger.error(error.message);
```

### 4. Check Execution Control

```javascript
// Good
if (errorContext.shouldHaltExecution(error, options)) {
  throw error;
} else {
  logger.warn('Non-critical error', error);
  continue;
}

// Bad - No execution control
throw error; // Always halts
```

## API Reference

See the [ErrorContext JSDoc comments](../src/dag/core/error-context.js) for detailed API documentation.

## Testing

The ErrorContext includes comprehensive test coverage. See [error-context.test.js](../__tests__/dag/error-context.test.js) for examples.

Run tests:

```bash
npm test -- __tests__/dag/error-context.test.js
```

## Performance Considerations

- Error context creation is lightweight (O(1))
- Error aggregation scales linearly with error count (O(n))
- Serialization involves JSON.stringify - consider for high-frequency logging
- Error preservation creates new objects - minimal memory impact

## Migration Guide

If you have existing error handling code, migrate to ErrorContext:

### Before

```javascript
const nodeErr = new Error(`Node ${nodeId} execution failed: ${e.message}`);
nodeErr.nodeId = nodeId;
nodeErr.timestamp = Date.now();
nodeErr.cause = e;
```

### After

```javascript
const nodeErr = errorContext.createErrorContext(nodeId, e, {
  downstream: downstreamNodes,
  timestamp: Date.now(),
});
```

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md) for guidelines on contributing to the ErrorContext module.

## License

This module is part of @devilsdev/rag-pipeline-utils and is subject to the same license.
