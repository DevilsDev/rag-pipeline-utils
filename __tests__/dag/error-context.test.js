/**
 * Unit tests for ErrorContext class
 * Tests error handling, context management, and error reporting functionality
 */

const ErrorContext = require("../../src/dag/core/error-context.js");

describe("ErrorContext", () => {
  let errorContext;

  beforeEach(() => {
    errorContext = new ErrorContext();
  });

  describe("constructor", () => {
    it("should create an ErrorContext instance", () => {
      expect(errorContext).toBeInstanceOf(ErrorContext);
    });
  });

  describe("createErrorContext", () => {
    it("should create error with node ID and timestamp", () => {
      const originalError = new Error("Something failed");
      const timestamp = Date.now();

      const nodeError = errorContext.createErrorContext(
        "nodeA",
        originalError,
        {
          timestamp,
        },
      );

      expect(nodeError).toBeInstanceOf(Error);
      expect(nodeError.message).toBe(
        "Node nodeA execution failed: Something failed",
      );
      expect(nodeError.nodeId).toBe("nodeA");
      expect(nodeError.timestamp).toBe(timestamp);
      expect(nodeError.cause).toBe(originalError);
    });

    it("should include downstream nodes in error message", () => {
      const originalError = new Error("Processing failed");
      const nodeError = errorContext.createErrorContext(
        "nodeA",
        originalError,
        {
          downstream: ["nodeB", "nodeC"],
        },
      );

      expect(nodeError.message).toBe(
        "Node nodeA execution failed: Processing failed. This affects downstream nodes: nodeB, nodeC",
      );
    });

    it("should not include downstream suffix when no downstream nodes", () => {
      const originalError = new Error("Terminal failure");
      const nodeError = errorContext.createErrorContext(
        "nodeA",
        originalError,
        {
          downstream: [],
        },
      );

      expect(nodeError.message).toBe(
        "Node nodeA execution failed: Terminal failure",
      );
      expect(nodeError.message).not.toContain("downstream");
    });

    it("should use current timestamp when not provided", () => {
      const beforeTimestamp = Date.now();
      const originalError = new Error("Test error");
      const nodeError = errorContext.createErrorContext("nodeA", originalError);
      const afterTimestamp = Date.now();

      expect(nodeError.timestamp).toBeGreaterThanOrEqual(beforeTimestamp);
      expect(nodeError.timestamp).toBeLessThanOrEqual(afterTimestamp);
    });

    it("should preserve original error as cause", () => {
      const originalError = new Error("Root cause");
      originalError.customProperty = "custom value";

      const nodeError = errorContext.createErrorContext("nodeA", originalError);

      expect(nodeError.cause).toBe(originalError);
      expect(nodeError.cause.customProperty).toBe("custom value");
    });
  });

  describe("aggregateErrors", () => {
    it("should return null for empty errors map", () => {
      const errorsMap = new Map();
      const result = errorContext.aggregateErrors(errorsMap);

      expect(result).toBeNull();
    });

    it("should return single error unchanged", () => {
      const singleError = new Error("Single failure");
      singleError.nodeId = "nodeA";
      const errorsMap = new Map([["nodeA", singleError]]);

      const result = errorContext.aggregateErrors(errorsMap);

      expect(result).toBe(singleError);
      expect(result.message).toBe("Single failure");
    });

    it("should aggregate multiple errors", () => {
      const error1 = new Error("Error 1");
      error1.cause = new Error("Root cause 1");
      const error2 = new Error("Error 2");
      error2.cause = new Error("Root cause 2");

      const errorsMap = new Map([
        ["nodeA", error1],
        ["nodeB", error2],
      ]);

      const aggregated = errorContext.aggregateErrors(errorsMap);

      expect(aggregated.message).toBe("Multiple execution errors");
      expect(aggregated.errors).toHaveLength(2);
      expect(aggregated.errors[0].message).toBe("Root cause 1");
      expect(aggregated.errors[1].message).toBe("Root cause 2");
    });

    it("should use error itself if cause is not present", () => {
      const error1 = new Error("Error 1");
      const error2 = new Error("Error 2");

      const errorsMap = new Map([
        ["nodeA", error1],
        ["nodeB", error2],
      ]);

      const aggregated = errorContext.aggregateErrors(errorsMap);

      expect(aggregated.errors).toHaveLength(2);
      expect(aggregated.errors[0]).toBe(error1);
      expect(aggregated.errors[1]).toBe(error2);
    });

    it("should handle three or more errors", () => {
      const errorsMap = new Map([
        ["nodeA", new Error("Error A")],
        ["nodeB", new Error("Error B")],
        ["nodeC", new Error("Error C")],
      ]);

      const aggregated = errorContext.aggregateErrors(errorsMap);

      expect(aggregated.message).toBe("Multiple execution errors");
      expect(aggregated.errors).toHaveLength(3);
    });
  });

  describe("preserveNodeContext", () => {
    it("should preserve nodeId from original error", () => {
      const original = new Error("Original error");
      original.nodeId = "nodeA";
      original.timestamp = 12345;

      const preserved = errorContext.preserveNodeContext(original);

      expect(preserved.message).toBe("Original error");
      expect(preserved.nodeId).toBe("nodeA");
      expect(preserved.timestamp).toBe(12345);
    });

    it("should preserve all standard error properties", () => {
      const original = new Error("Original error");
      original.nodeId = "nodeA";
      original.timestamp = 12345;
      original.cause = new Error("Cause error");
      original.cycle = ["A", "B", "C"];
      original.errors = [new Error("Sub error 1")];

      const preserved = errorContext.preserveNodeContext(original);

      expect(preserved.nodeId).toBe("nodeA");
      expect(preserved.timestamp).toBe(12345);
      expect(preserved.cause).toBe(original.cause);
      expect(preserved.cycle).toEqual(["A", "B", "C"]);
      expect(preserved.errors).toEqual(original.errors);
    });

    it("should add additional context without overwriting existing properties", () => {
      const original = new Error("Original error");
      original.nodeId = "nodeA";

      const preserved = errorContext.preserveNodeContext(original, {
        retryCount: 3,
        nodeId: "nodeB", // Should NOT overwrite existing nodeId
      });

      expect(preserved.nodeId).toBe("nodeA"); // Original preserved
      expect(preserved.retryCount).toBe(3); // New property added
    });

    it("should handle errors without any special properties", () => {
      const original = new Error("Simple error");

      const preserved = errorContext.preserveNodeContext(original);

      expect(preserved.message).toBe("Simple error");
      expect(preserved.nodeId).toBeUndefined();
      expect(preserved.timestamp).toBeUndefined();
    });

    it("should add context properties that do not exist", () => {
      const original = new Error("Original error");

      const preserved = errorContext.preserveNodeContext(original, {
        attemptNumber: 2,
        maxAttempts: 5,
      });

      expect(preserved.attemptNumber).toBe(2);
      expect(preserved.maxAttempts).toBe(5);
    });
  });

  describe("formatErrorReport", () => {
    it("should format basic error report", () => {
      const error = new Error("Test error");
      error.nodeId = "nodeA";
      error.timestamp = 12345;

      const report = errorContext.formatErrorReport(error);

      expect(report.message).toBe("Test error");
      expect(report.nodeId).toBe("nodeA");
      expect(report.timestamp).toBe(12345);
      expect(report.cause).toBeNull();
      expect(report.cycle).toBeNull();
      expect(report.errors).toBeNull();
    });

    it("should include cause information", () => {
      const cause = new Error("Root cause");
      const error = new Error("Test error");
      error.cause = cause;

      const report = errorContext.formatErrorReport(error);

      expect(report.cause).toBeDefined();
      expect(report.cause.message).toBe("Root cause");
      expect(report.cause.stack).toBeDefined();
    });

    it("should include cycle information", () => {
      const error = new Error("Cycle detected");
      error.cycle = ["A", "B", "C", "A"];

      const report = errorContext.formatErrorReport(error);

      expect(report.cycle).toEqual(["A", "B", "C", "A"]);
    });

    it("should include nested errors", () => {
      const error = new Error("Multiple errors");
      error.errors = [new Error("Sub error 1"), new Error("Sub error 2")];

      const report = errorContext.formatErrorReport(error);

      expect(report.errors).toHaveLength(2);
      expect(report.errors[0].message).toBe("Sub error 1");
      expect(report.errors[1].message).toBe("Sub error 2");
      expect(report.errors[0].stack).toBeDefined();
      expect(report.errors[1].stack).toBeDefined();
    });

    it("should handle error without special properties", () => {
      const error = new Error("Simple error");

      const report = errorContext.formatErrorReport(error);

      expect(report.message).toBe("Simple error");
      expect(report.nodeId).toBeNull();
      expect(report.timestamp).toBeNull();
      expect(report.cause).toBeNull();
      expect(report.cycle).toBeNull();
      expect(report.errors).toBeNull();
    });
  });

  describe("serializeError", () => {
    it("should serialize error to JSON string", () => {
      const error = new Error("Test error");
      error.nodeId = "nodeA";
      error.timestamp = 12345;

      const json = errorContext.serializeError(error);

      expect(typeof json).toBe("string");
      const parsed = JSON.parse(json);
      expect(parsed.message).toBe("Test error");
      expect(parsed.nodeId).toBe("nodeA");
      expect(parsed.timestamp).toBe(12345);
    });

    it("should use custom indentation", () => {
      const error = new Error("Test error");
      const json = errorContext.serializeError(error, 4);

      expect(json).toContain("    "); // 4 spaces indentation
    });

    it("should serialize complex error with all properties", () => {
      const error = new Error("Complex error");
      error.nodeId = "nodeA";
      error.timestamp = 12345;
      error.cause = new Error("Root cause");
      error.cycle = ["A", "B"];
      error.errors = [new Error("Sub error")];

      const json = errorContext.serializeError(error);
      const parsed = JSON.parse(json);

      expect(parsed.nodeId).toBe("nodeA");
      expect(parsed.timestamp).toBe(12345);
      expect(parsed.cause.message).toBe("Root cause");
      expect(parsed.cycle).toEqual(["A", "B"]);
      expect(parsed.errors).toHaveLength(1);
    });
  });

  describe("wrapExecutionError", () => {
    it("should not wrap node errors (with nodeId)", () => {
      const nodeError = new Error("Node A execution failed: something broke");
      nodeError.nodeId = "A";

      const wrapped = errorContext.wrapExecutionError(nodeError);

      expect(wrapped).toBe(nodeError);
      expect(wrapped.message).toBe("Node A execution failed: something broke");
    });

    it('should not wrap node errors (starting with "Node ")', () => {
      const nodeError = new Error("Node A execution failed: something broke");

      const wrapped = errorContext.wrapExecutionError(nodeError);

      expect(wrapped).toBe(nodeError);
    });

    it("should wrap validation errors once", () => {
      const validationError = new Error(
        "DAG validation failed: cycle detected",
      );

      const wrapped = errorContext.wrapExecutionError(validationError);

      expect(wrapped.message).toBe(
        "DAG execution failed: DAG validation failed: cycle detected",
      );
      expect(wrapped).not.toBe(validationError);
    });

    it("should preserve cycle information when wrapping", () => {
      const cycleError = new Error("Cycle detected");
      cycleError.cycle = ["A", "B", "C"];

      const wrapped = errorContext.wrapExecutionError(cycleError);

      expect(wrapped.message).toBe("DAG execution failed: Cycle detected");
      expect(wrapped.cycle).toEqual(["A", "B", "C"]);
    });

    it("should preserve errors array when wrapping aggregate errors", () => {
      const aggregateError = new Error("Multiple errors");
      aggregateError.errors = [new Error("Error 1"), new Error("Error 2")];

      const wrapped = errorContext.wrapExecutionError(aggregateError);

      expect(wrapped.message).toBe("DAG execution failed: Multiple errors");
      expect(wrapped.errors).toEqual(aggregateError.errors);
    });

    it("should not wrap timeout errors", () => {
      const timeoutError = new Error("Execution timeout");

      const wrapped = errorContext.wrapExecutionError(timeoutError);

      expect(wrapped).toBe(timeoutError);
      expect(wrapped.message).toBe("Execution timeout");
    });

    it('should not wrap "no sink nodes" errors', () => {
      const sinkError = new Error(
        "DAG has no sink nodes - no final output available",
      );

      const wrapped = errorContext.wrapExecutionError(sinkError);

      expect(wrapped).toBe(sinkError);
    });

    it("should wrap other errors with context preservation", () => {
      const genericError = new Error("Something unexpected");
      genericError.timestamp = 12345;

      const wrapped = errorContext.wrapExecutionError(genericError);

      expect(wrapped.message).toBe(
        "DAG execution failed: Something unexpected",
      );
      expect(wrapped.timestamp).toBe(12345);
    });

    it("should not wrap errors with nodeId property", () => {
      const nodeError = new Error("Something unexpected");
      nodeError.nodeId = "nodeA";
      nodeError.timestamp = 12345;

      const wrapped = errorContext.wrapExecutionError(nodeError);

      // Node errors are returned unchanged
      expect(wrapped).toBe(nodeError);
      expect(wrapped.message).toBe("Something unexpected");
      expect(wrapped.nodeId).toBe("nodeA");
    });
  });

  describe("createCycleError", () => {
    it("should create cycle error with path", () => {
      const cyclePath = ["A", "B", "C"];

      const error = errorContext.createCycleError(cyclePath);

      expect(error.message).toBe("Cycle detected involving node: A -> B -> C");
      expect(error.cycle).toEqual(["A", "B", "C"]);
    });

    it("should handle single node cycle", () => {
      const error = errorContext.createCycleError(["A", "A"]);

      expect(error.message).toBe("Cycle detected involving node: A -> A");
      expect(error.cycle).toEqual(["A", "A"]);
    });

    it("should handle complex cycle paths", () => {
      const cyclePath = ["start", "middle1", "middle2", "end", "middle1"];

      const error = errorContext.createCycleError(cyclePath);

      expect(error.message).toBe(
        "Cycle detected involving node: start -> middle1 -> middle2 -> end -> middle1",
      );
      expect(error.cycle).toEqual(cyclePath);
    });
  });

  describe("shouldHaltExecution", () => {
    it("should halt on validation errors", () => {
      const validationError = new Error(
        "DAG validation failed: invalid structure",
      );

      const shouldHalt = errorContext.shouldHaltExecution(validationError);

      expect(shouldHalt).toBe(true);
    });

    it("should halt on cycle errors", () => {
      const cycleError = new Error("Cycle detected");
      cycleError.cycle = ["A", "B", "A"];

      const shouldHalt = errorContext.shouldHaltExecution(cycleError);

      expect(shouldHalt).toBe(true);
    });

    it("should halt on timeout errors", () => {
      const timeoutError = new Error("Execution timeout");

      const shouldHalt = errorContext.shouldHaltExecution(timeoutError);

      expect(shouldHalt).toBe(true);
    });

    it("should halt on critical node errors", () => {
      const nodeError = new Error("Node failed");
      nodeError.nodeId = "criticalNode";

      const shouldHalt = errorContext.shouldHaltExecution(nodeError, {
        continueOnError: false,
        isNonCritical: false,
      });

      expect(shouldHalt).toBe(true);
    });

    it("should not halt on non-critical node errors", () => {
      const nodeError = new Error("Node failed");
      nodeError.nodeId = "optionalNode";

      const shouldHalt = errorContext.shouldHaltExecution(nodeError, {
        continueOnError: false,
        isNonCritical: true,
      });

      expect(shouldHalt).toBe(false);
    });

    it("should not halt when continueOnError is enabled", () => {
      const nodeError = new Error("Node failed");
      nodeError.nodeId = "someNode";

      const shouldHalt = errorContext.shouldHaltExecution(nodeError, {
        continueOnError: true,
        isNonCritical: false,
      });

      expect(shouldHalt).toBe(false);
    });

    it("should not halt on generic errors without special properties", () => {
      const genericError = new Error("Some error");

      const shouldHalt = errorContext.shouldHaltExecution(genericError);

      expect(shouldHalt).toBe(false);
    });
  });

  describe("integration scenarios", () => {
    it("should handle complete error lifecycle", () => {
      // 1. Create error context
      const originalError = new Error("Database connection failed");
      const nodeError = errorContext.createErrorContext(
        "dbNode",
        originalError,
        {
          downstream: ["processData", "saveResults"],
          timestamp: 12345,
        },
      );

      expect(nodeError.nodeId).toBe("dbNode");
      expect(nodeError.cause).toBe(originalError);

      // 2. Preserve context when wrapping
      const preserved = errorContext.preserveNodeContext(nodeError, {
        retryCount: 3,
      });

      expect(preserved.nodeId).toBe("dbNode");
      expect(preserved.retryCount).toBe(3);

      // 3. Format for reporting
      const report = errorContext.formatErrorReport(preserved);

      expect(report.nodeId).toBe("dbNode");
      expect(report.timestamp).toBe(12345);

      // 4. Serialize for logging
      const json = errorContext.serializeError(preserved);

      expect(json).toContain("dbNode");
      expect(json).toContain("Database connection failed");
    });

    it("should aggregate and serialize multiple errors", () => {
      const error1 = errorContext.createErrorContext(
        "nodeA",
        new Error("Error A"),
        {
          downstream: ["nodeC"],
        },
      );
      const error2 = errorContext.createErrorContext(
        "nodeB",
        new Error("Error B"),
        {
          downstream: ["nodeD"],
        },
      );

      const errorsMap = new Map([
        ["nodeA", error1],
        ["nodeB", error2],
      ]);

      const aggregated = errorContext.aggregateErrors(errorsMap);

      expect(aggregated.message).toBe("Multiple execution errors");
      expect(aggregated.errors).toHaveLength(2);

      const json = errorContext.serializeError(aggregated);
      const parsed = JSON.parse(json);

      expect(parsed.errors).toHaveLength(2);
    });

    it("should handle cycle detection and reporting", () => {
      const cyclePath = [
        "fetchData",
        "processData",
        "validateData",
        "fetchData",
      ];
      const cycleError = errorContext.createCycleError(cyclePath);

      expect(cycleError.cycle).toEqual(cyclePath);

      const shouldHalt = errorContext.shouldHaltExecution(cycleError);

      expect(shouldHalt).toBe(true);

      const wrapped = errorContext.wrapExecutionError(cycleError);

      expect(wrapped.message).toContain("DAG execution failed");
      expect(wrapped.cycle).toEqual(cyclePath);

      const report = errorContext.formatErrorReport(wrapped);

      expect(report.cycle).toEqual(cyclePath);
    });
  });
});
