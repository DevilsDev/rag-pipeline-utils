/**
 * @fileoverview Unit tests for StructuredLogger
 * Tests correlation tracking, log formatting, and metrics collection
 *
 * @author DevilsDev Team
 * @since 2.1.8
 */

const {
  StructuredLogger,
  createLogger,
  logger: defaultLogger,
} = require("../../../src/utils/structured-logger.js");

describe("StructuredLogger", () => {
  let mockConsole;
  let testLogger;

  beforeEach(() => {
    // Mock console methods
    mockConsole = {
      log: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    };
    global.console = mockConsole;

    testLogger = createLogger({
      serviceName: "test-service",
      environment: "test",
      logLevel: "debug",
      outputFormat: "json",
      enableCorrelation: true,
      enableMetrics: true,
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe("Basic logging functionality", () => {
    test("should log messages at different levels", () => {
      testLogger.error("Error message", { errorCode: "E001" });
      testLogger.warn("Warning message", { component: "test" });
      testLogger.info("Info message", { userId: "123" });
      testLogger.debug("Debug message", { details: "extra" });

      expect(mockConsole.log).toHaveBeenCalledTimes(4);

      // Check error log structure
      const errorLog = JSON.parse(mockConsole.log.mock.calls[0][0]);
      expect(errorLog).toMatchObject({
        level: "error",
        message: "Error message",
        service: "test-service",
        environment: "test",
        errorCode: "E001",
      });
      expect(errorLog.timestamp).toBeDefined();
      expect(errorLog.pid).toBeDefined();
      expect(errorLog.hostname).toBeDefined();
    });

    test("should respect log level filtering", () => {
      const infoLogger = createLogger({
        logLevel: "info",
        outputFormat: "json",
      });

      infoLogger.debug("Debug message");
      infoLogger.trace("Trace message");
      infoLogger.info("Info message");
      infoLogger.warn("Warning message");

      expect(mockConsole.log).toHaveBeenCalledTimes(2); // Only info and warn
    });

    test("should handle error objects properly", () => {
      const testError = new Error("Test error");
      testError.code = "TEST_ERROR";

      testLogger.error("Operation failed", { error: testError });

      const logEntry = JSON.parse(mockConsole.log.mock.calls[0][0]);
      expect(logEntry.error).toMatchObject({
        name: "Error",
        message: "Test error",
        code: "TEST_ERROR",
      });
      expect(logEntry.error.stack).toBeDefined();
    });
  });

  describe("Correlation tracking", () => {
    test("should generate correlation IDs", async () => {
      await testLogger.withCorrelation(null, async () => {
        testLogger.info("Test message");
      });

      const logEntry = JSON.parse(mockConsole.log.mock.calls[0][0]);
      expect(logEntry.correlationId).toBeDefined();
      expect(logEntry.requestId).toBeDefined();
      expect(typeof logEntry.correlationId).toBe("string");
    });

    test("should use provided correlation ID", async () => {
      const customId = "custom-correlation-id";

      await testLogger.withCorrelation(customId, async () => {
        testLogger.info("Test message");
      });

      const logEntry = JSON.parse(mockConsole.log.mock.calls[0][0]);
      expect(logEntry.correlationId).toBe(customId);
    });

    test("should track request duration", async () => {
      await testLogger.withCorrelation(null, async () => {
        // Simulate some work
        await new Promise((resolve) => setTimeout(resolve, 10));
        testLogger.info("Test message");
      });

      const logEntry = JSON.parse(mockConsole.log.mock.calls[0][0]);
      expect(logEntry.requestDuration).toBeGreaterThan(0);
    });

    test("should handle nested correlation contexts", async () => {
      await testLogger.withCorrelation("outer", async () => {
        testLogger.info("Outer message");

        await testLogger.withCorrelation("inner", async () => {
          testLogger.info("Inner message");
        });

        testLogger.info("Outer message 2");
      });

      const logs = mockConsole.log.mock.calls.map((call) =>
        JSON.parse(call[0]),
      );

      expect(logs[0].correlationId).toBe("outer");
      expect(logs[1].correlationId).toBe("inner");
      expect(logs[2].correlationId).toBe("outer");
    });
  });

  describe("Child loggers", () => {
    test("should create child logger with additional context", () => {
      const childLogger = testLogger.child({
        component: "test-component",
        userId: "123",
      });

      childLogger.info("Child message", { action: "test" });

      const logEntry = JSON.parse(mockConsole.log.mock.calls[0][0]);
      expect(logEntry).toMatchObject({
        message: "Child message",
        component: "test-component",
        userId: "123",
        action: "test",
      });
    });

    test("should support nested child loggers", () => {
      const parentChild = testLogger.child({ component: "parent" });
      const nestedChild = parentChild.child({ subComponent: "nested" });

      nestedChild.info("Nested message", { data: "test" });

      const logEntry = JSON.parse(mockConsole.log.mock.calls[0][0]);
      expect(logEntry).toMatchObject({
        component: "parent",
        subComponent: "nested",
        data: "test",
      });
    });
  });

  describe("Output formats", () => {
    test("should format logs for console output", () => {
      const consoleLogger = createLogger({
        outputFormat: "console",
        enableCorrelation: false,
      });

      consoleLogger.info("Test message", { extra: "data" });

      const output = mockConsole.log.mock.calls[0][0];
      expect(output).toMatch(/\[INFO\]/);
      expect(output).toMatch(/Test message/);
      expect(output).toMatch(/"extra":"data"/);
    });

    test("should include correlation ID in console format", async () => {
      const consoleLogger = createLogger({
        outputFormat: "console",
        enableCorrelation: true,
      });

      await consoleLogger.withCorrelation("test-id", async () => {
        consoleLogger.info("Test message");
      });

      const output = mockConsole.log.mock.calls[0][0];
      expect(output).toMatch(/\[test-id\]/);
    });
  });

  describe("Metrics collection", () => {
    test("should track logging metrics", () => {
      testLogger.resetMetrics();

      testLogger.info("Info message");
      testLogger.warn("Warning message");
      testLogger.error("Error message");

      const metrics = testLogger.getMetrics();
      expect(metrics.logsWritten).toBe(3);
      expect(metrics.errorCount).toBe(1);
      expect(metrics.warnCount).toBe(1);
      expect(metrics.avgLatency).toBeGreaterThan(0);
    });

    test("should reset metrics", () => {
      testLogger.info("Test message");
      testLogger.resetMetrics();

      const metrics = testLogger.getMetrics();
      expect(metrics.logsWritten).toBe(0);
      expect(metrics.errorCount).toBe(0);
      expect(metrics.warnCount).toBe(0);
    });
  });

  describe("Error handling", () => {
    test("should handle write failures gracefully", () => {
      // Mock console.log to throw
      mockConsole.log = jest.fn(() => {
        throw new Error("Write failed");
      });
      mockConsole.error = jest.fn();

      testLogger.info("Test message");

      expect(mockConsole.error).toHaveBeenCalledWith(
        "Logger write failed:",
        "Write failed",
      );
      expect(mockConsole.error).toHaveBeenCalledWith(
        "Original message:",
        "Test message",
      );
    });

    test("should continue working after write failures", () => {
      // First call fails, second succeeds
      mockConsole.log = jest
        .fn()
        .mockImplementationOnce(() => {
          throw new Error("Write failed");
        })
        .mockImplementationOnce(() => {});
      mockConsole.error = jest.fn();

      testLogger.info("Failed message");
      testLogger.info("Success message");

      expect(mockConsole.error).toHaveBeenCalled();
      expect(mockConsole.log).toHaveBeenCalledTimes(2);
    });
  });

  describe("Configuration options", () => {
    test("should disable correlation when configured", () => {
      const noCorrelationLogger = createLogger({
        enableCorrelation: false,
      });

      noCorrelationLogger.info("Test message");

      const logEntry = JSON.parse(mockConsole.log.mock.calls[0][0]);
      expect(logEntry.correlationId).toBeUndefined();
      expect(logEntry.requestId).toBeUndefined();
    });

    test("should disable metrics when configured", () => {
      const noMetricsLogger = createLogger({
        enableMetrics: false,
      });

      noMetricsLogger.info("Test message");
      const metrics = noMetricsLogger.getMetrics();

      expect(metrics.logsWritten).toBe(0);
    });
  });

  describe("Default logger", () => {
    test("should provide working default logger", () => {
      defaultLogger.info("Default logger test");

      expect(mockConsole.log).toHaveBeenCalled();
      const logEntry = JSON.parse(mockConsole.log.mock.calls[0][0]);
      expect(logEntry.service).toBe("rag-pipeline-utils");
    });
  });
});
