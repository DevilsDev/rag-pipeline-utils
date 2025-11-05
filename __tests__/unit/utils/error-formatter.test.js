"use strict";

/**
 * Error Formatter Tests
 *
 * Tests for enhanced error formatting and messaging
 */

const {
  ERROR_CODES,
  ERROR_TEMPLATES,
  EnhancedError,
  createError,
  wrapError,
  formatError,
  formatErrorMessage,
  isEnhancedError,
  getErrorSeverity,
  logError,
} = require("../../../src/utils/error-formatter");

describe("Error Formatter", () => {
  describe("ERROR_CODES", () => {
    test("should have all expected error codes", () => {
      expect(ERROR_CODES).toBeDefined();
      expect(ERROR_CODES.CONFIG_NOT_FOUND).toBe("CONFIG_NOT_FOUND");
      expect(ERROR_CODES.PLUGIN_NOT_FOUND).toBe("PLUGIN_NOT_FOUND");
      expect(ERROR_CODES.PIPELINE_EXECUTION_FAILED).toBe(
        "PIPELINE_EXECUTION_FAILED",
      );
    });

    test("should have unique error codes", () => {
      const codes = Object.values(ERROR_CODES);
      const uniqueCodes = new Set(codes);
      expect(codes.length).toBe(uniqueCodes.size);
    });
  });

  describe("ERROR_TEMPLATES", () => {
    test("should have template for each error code", () => {
      // Check a few key templates exist
      expect(ERROR_TEMPLATES[ERROR_CODES.CONFIG_NOT_FOUND]).toBeDefined();
      expect(ERROR_TEMPLATES[ERROR_CODES.PLUGIN_NOT_FOUND]).toBeDefined();
      expect(ERROR_TEMPLATES[ERROR_CODES.UNKNOWN_ERROR]).toBeDefined();
    });

    test("should have required fields in templates", () => {
      const template = ERROR_TEMPLATES[ERROR_CODES.CONFIG_NOT_FOUND];
      expect(template).toHaveProperty("message");
      expect(template).toHaveProperty("suggestions");
      expect(template).toHaveProperty("documentation");
      expect(Array.isArray(template.suggestions)).toBe(true);
    });
  });

  describe("EnhancedError", () => {
    test("should create enhanced error with code", () => {
      const error = new EnhancedError(ERROR_CODES.CONFIG_NOT_FOUND, {
        path: ".ragrc.json",
      });

      expect(error).toBeInstanceOf(Error);
      expect(error).toBeInstanceOf(EnhancedError);
      expect(error.code).toBe(ERROR_CODES.CONFIG_NOT_FOUND);
      expect(error.context).toEqual({ path: ".ragrc.json" });
    });

    test("should format message with context", () => {
      const error = new EnhancedError(ERROR_CODES.PLUGIN_NOT_FOUND, {
        plugin: "my-plugin",
      });

      expect(error.message).toContain("my-plugin");
    });

    test("should include suggestions", () => {
      const error = new EnhancedError(ERROR_CODES.CONFIG_NOT_FOUND, {
        path: ".ragrc.json",
      });

      expect(Array.isArray(error.suggestions)).toBe(true);
      expect(error.suggestions.length).toBeGreaterThan(0);
    });

    test("should include documentation reference", () => {
      const error = new EnhancedError(ERROR_CODES.CONFIG_NOT_FOUND);

      expect(error.documentation).toBeDefined();
      expect(typeof error.documentation).toBe("string");
    });

    test("should include timestamp", () => {
      const error = new EnhancedError(ERROR_CODES.UNKNOWN_ERROR);

      expect(error.timestamp).toBeDefined();
      expect(new Date(error.timestamp)).toBeInstanceOf(Date);
    });

    test("should store original error", () => {
      const original = new Error("Original error");
      const error = new EnhancedError(
        ERROR_CODES.PLUGIN_LOAD_FAILED,
        { plugin: "test" },
        original,
      );

      expect(error.originalError).toBe(original);
    });

    test("should convert to JSON", () => {
      const error = new EnhancedError(ERROR_CODES.CONFIG_NOT_FOUND, {
        path: ".ragrc.json",
      });

      const json = error.toJSON();

      expect(json).toHaveProperty("name");
      expect(json).toHaveProperty("code");
      expect(json).toHaveProperty("message");
      expect(json).toHaveProperty("suggestions");
      expect(json).toHaveProperty("documentation");
      expect(json).toHaveProperty("context");
      expect(json).toHaveProperty("timestamp");
      expect(json).toHaveProperty("stack");
    });

    test("should get formatted message", () => {
      const error = new EnhancedError(ERROR_CODES.CONFIG_NOT_FOUND, {
        path: ".ragrc.json",
      });

      const formatted = error.getFormattedMessage();

      expect(formatted).toContain("CONFIG_NOT_FOUND");
      expect(formatted).toContain(".ragrc.json");
      expect(formatted).toContain("Suggestions:");
    });
  });

  describe("formatError", () => {
    test("should format error with context", () => {
      const result = formatError(ERROR_CODES.CONFIG_NOT_FOUND, {
        path: "/path/to/.ragrc.json",
      });

      expect(result.code).toBe(ERROR_CODES.CONFIG_NOT_FOUND);
      expect(result.message).toContain("/path/to/.ragrc.json");
      expect(Array.isArray(result.suggestions)).toBe(true);
      expect(result.documentation).toBeDefined();
    });

    test("should replace all placeholders in message", () => {
      const result = formatError(ERROR_CODES.PLUGIN_NOT_FOUND, {
        plugin: "my-plugin",
        path: "./plugins/my-plugin.js",
      });

      expect(result.message).toContain("my-plugin");
      expect(result.message).not.toContain("{plugin}");
    });

    test("should replace placeholders in suggestions", () => {
      const result = formatError(ERROR_CODES.PLUGIN_NOT_FOUND, {
        plugin: "my-plugin",
      });

      const hasPluginName = result.suggestions.some((s) =>
        s.includes("my-plugin"),
      );
      expect(hasPluginName).toBe(true);
    });

    test("should handle missing context gracefully", () => {
      const result = formatError(ERROR_CODES.CONFIG_NOT_FOUND);

      expect(result.message).toBeDefined();
      expect(result.suggestions).toBeDefined();
    });

    test("should fall back to UNKNOWN_ERROR for invalid code", () => {
      const result = formatError("INVALID_CODE");

      expect(result.message).toContain("unexpected error");
    });
  });

  describe("formatErrorMessage", () => {
    test("should format complete error message", () => {
      const error = new EnhancedError(ERROR_CODES.CONFIG_NOT_FOUND, {
        path: ".ragrc.json",
      });

      const formatted = formatErrorMessage(error);

      expect(formatted).toContain("Error [CONFIG_NOT_FOUND]");
      expect(formatted).toContain("Suggestions:");
      expect(formatted).toContain("Documentation:");
    });

    test("should format with includeCode option", () => {
      const error = new EnhancedError(ERROR_CODES.CONFIG_NOT_FOUND);

      const withCode = formatErrorMessage(error, { includeCode: true });
      const withoutCode = formatErrorMessage(error, { includeCode: false });

      expect(withCode).toContain("[CONFIG_NOT_FOUND]");
      expect(withoutCode).not.toContain("[CONFIG_NOT_FOUND]");
    });

    test("should format with includeSuggestions option", () => {
      const error = new EnhancedError(ERROR_CODES.CONFIG_NOT_FOUND);

      const withSuggestions = formatErrorMessage(error, {
        includeSuggestions: true,
      });
      const withoutSuggestions = formatErrorMessage(error, {
        includeSuggestions: false,
      });

      expect(withSuggestions).toContain("Suggestions:");
      expect(withoutSuggestions).not.toContain("Suggestions:");
    });

    test("should format with includeDocumentation option", () => {
      const error = new EnhancedError(ERROR_CODES.CONFIG_NOT_FOUND);

      const withDocs = formatErrorMessage(error, {
        includeDocumentation: true,
      });
      const withoutDocs = formatErrorMessage(error, {
        includeDocumentation: false,
      });

      expect(withDocs).toContain("Documentation:");
      expect(withoutDocs).not.toContain("Documentation:");
    });

    test("should format with includeContext option", () => {
      const error = new EnhancedError(ERROR_CODES.CONFIG_NOT_FOUND, {
        path: ".ragrc.json",
        line: 42,
      });

      const withContext = formatErrorMessage(error, { includeContext: true });
      const withoutContext = formatErrorMessage(error, {
        includeContext: false,
      });

      expect(withContext).toContain("Context:");
      expect(withContext).toContain("path");
      expect(withoutContext).not.toContain("Context:");
    });

    test("should format with includeStack option", () => {
      const error = new EnhancedError(ERROR_CODES.CONFIG_NOT_FOUND);

      const withStack = formatErrorMessage(error, { includeStack: true });
      const withoutStack = formatErrorMessage(error, { includeStack: false });

      expect(withStack).toContain("Stack Trace:");
      expect(withoutStack).not.toContain("Stack Trace:");
    });

    test("should handle regular Error objects", () => {
      const error = new Error("Regular error");

      const formatted = formatErrorMessage(error);

      expect(formatted).toContain("Regular error");
    });
  });

  describe("createError", () => {
    test("should create enhanced error", () => {
      const error = createError(ERROR_CODES.PLUGIN_NOT_FOUND, {
        plugin: "my-plugin",
      });

      expect(error).toBeInstanceOf(EnhancedError);
      expect(error.code).toBe(ERROR_CODES.PLUGIN_NOT_FOUND);
      expect(error.context.plugin).toBe("my-plugin");
    });

    test("should create error with original error", () => {
      const original = new Error("Original");
      const error = createError(
        ERROR_CODES.PLUGIN_LOAD_FAILED,
        { plugin: "test" },
        original,
      );

      expect(error.originalError).toBe(original);
    });
  });

  describe("wrapError", () => {
    test("should wrap existing error", () => {
      const original = new Error("File not found");
      const wrapped = wrapError(original, ERROR_CODES.FS_FILE_NOT_FOUND, {
        path: "/test/file.txt",
      });

      expect(wrapped).toBeInstanceOf(EnhancedError);
      expect(wrapped.originalError).toBe(original);
      expect(wrapped.context.originalMessage).toBe("File not found");
      expect(wrapped.context.path).toBe("/test/file.txt");
    });

    test("should preserve original stack trace", () => {
      const original = new Error("Original error");
      const wrapped = wrapError(original, ERROR_CODES.UNKNOWN_ERROR);

      expect(wrapped.originalError.stack).toBe(original.stack);
    });
  });

  describe("isEnhancedError", () => {
    test("should return true for EnhancedError", () => {
      const error = new EnhancedError(ERROR_CODES.CONFIG_NOT_FOUND);

      expect(isEnhancedError(error)).toBe(true);
    });

    test("should return false for regular Error", () => {
      const error = new Error("Regular error");

      expect(isEnhancedError(error)).toBe(false);
    });

    test("should return false for non-error values", () => {
      expect(isEnhancedError(null)).toBe(false);
      expect(isEnhancedError(undefined)).toBe(false);
      expect(isEnhancedError({})).toBe(false);
      expect(isEnhancedError("error")).toBe(false);
    });
  });

  describe("getErrorSeverity", () => {
    test("should return critical for critical errors", () => {
      expect(getErrorSeverity(ERROR_CODES.PIPELINE_CREATION_FAILED)).toBe(
        "critical",
      );
      expect(getErrorSeverity(ERROR_CODES.CONFIG_NOT_FOUND)).toBe("critical");
      expect(getErrorSeverity(ERROR_CODES.FS_PERMISSION_DENIED)).toBe(
        "critical",
      );
    });

    test("should return warning for warning-level errors", () => {
      expect(getErrorSeverity(ERROR_CODES.HOT_RELOAD_FAILED)).toBe("warning");
      expect(getErrorSeverity(ERROR_CODES.HOT_RELOAD_STATE_ERROR)).toBe(
        "warning",
      );
    });

    test("should return error for standard errors", () => {
      expect(getErrorSeverity(ERROR_CODES.PLUGIN_NOT_FOUND)).toBe("error");
      expect(getErrorSeverity(ERROR_CODES.VALIDATION_FAILED)).toBe("error");
    });
  });

  describe("logError", () => {
    let mockLogger;

    beforeEach(() => {
      mockLogger = {
        error: jest.fn(),
        warn: jest.fn(),
        info: jest.fn(),
      };
    });

    test("should log enhanced error with suggestions", () => {
      const error = new EnhancedError(ERROR_CODES.CONFIG_NOT_FOUND, {
        path: ".ragrc.json",
      });

      logError(error, mockLogger);

      expect(mockLogger.error).toHaveBeenCalled();
      const logged = mockLogger.error.mock.calls[0][0];
      expect(logged).toContain("CONFIG_NOT_FOUND");
      expect(logged).toContain("Suggestions:");
    });

    test("should log critical errors with stack trace", () => {
      const error = new EnhancedError(ERROR_CODES.PIPELINE_CREATION_FAILED, {
        reason: "Invalid configuration",
      });

      logError(error, mockLogger);

      expect(mockLogger.error).toHaveBeenCalled();
      const logged = mockLogger.error.mock.calls[0][0];
      expect(logged).toContain("Stack Trace:");
    });

    test("should log warnings with warn level", () => {
      const error = new EnhancedError(ERROR_CODES.HOT_RELOAD_FAILED, {
        path: "./plugin.js",
        reason: "Syntax error",
      });

      logError(error, mockLogger);

      expect(mockLogger.warn).toHaveBeenCalled();
    });

    test("should log regular errors", () => {
      const error = new Error("Regular error");

      logError(error, mockLogger);

      expect(mockLogger.error).toHaveBeenCalled();
    });

    test("should use console by default", () => {
      const consoleSpy = jest.spyOn(console, "error").mockImplementation();
      const error = new EnhancedError(ERROR_CODES.UNKNOWN_ERROR);

      logError(error);

      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });
  });

  describe("Context Replacement", () => {
    test("should replace multiple placeholders", () => {
      const result = formatError(ERROR_CODES.CONFIG_INVALID_TYPE, {
        field: "pipeline.stages",
        expected: "array",
        actual: "string",
        currentValue: '"invalid"',
      });

      expect(result.message).toContain("pipeline.stages");
      expect(result.message).toContain("array");
      expect(result.message).toContain("string");
    });

    test("should handle missing placeholders gracefully", () => {
      const result = formatError(ERROR_CODES.PLUGIN_NOT_FOUND, {
        plugin: "test-plugin",
        // path is missing
      });

      expect(result.message).toContain("test-plugin");
      // Should still include suggestions even with missing context
      expect(result.suggestions.length).toBeGreaterThan(0);
    });

    test("should handle complex context values", () => {
      const result = formatError(ERROR_CODES.VALIDATION_FAILED, {
        reason: "Invalid schema",
        errors: JSON.stringify([
          { field: "name", message: "Required" },
          { field: "type", message: "Invalid type" },
        ]),
      });

      expect(result.message).toContain("Invalid schema");
    });
  });

  describe("Error Message Clarity", () => {
    test("should provide actionable suggestions for config errors", () => {
      const error = createError(ERROR_CODES.CONFIG_NOT_FOUND, {
        path: ".ragrc.json",
      });

      const hasActionable = error.suggestions.some(
        (s) =>
          s.includes("Create") || s.includes("Run") || s.includes("Specify"),
      );
      expect(hasActionable).toBe(true);
    });

    test("should provide actionable suggestions for plugin errors", () => {
      const error = createError(ERROR_CODES.PLUGIN_NOT_FOUND, {
        plugin: "my-plugin",
      });

      const hasInstall = error.suggestions.some((s) =>
        s.includes("npm install"),
      );
      expect(hasInstall).toBe(true);
    });

    test("should provide debugging steps for execution errors", () => {
      const error = createError(ERROR_CODES.PLUGIN_EXECUTION_FAILED, {
        plugin: "test-plugin",
        reason: "Invalid input",
      });

      const hasDebug = error.suggestions.some(
        (s) =>
          s.includes("debug") || s.includes("check") || s.includes("verify"),
      );
      expect(hasDebug).toBe(true);
    });
  });

  describe("Documentation Links", () => {
    test("should include documentation links for all errors", () => {
      const codes = [
        ERROR_CODES.CONFIG_NOT_FOUND,
        ERROR_CODES.PLUGIN_NOT_FOUND,
        ERROR_CODES.PIPELINE_EXECUTION_FAILED,
        ERROR_CODES.HOT_RELOAD_FAILED,
      ];

      codes.forEach((code) => {
        const error = createError(code);
        expect(error.documentation).toBeDefined();
        expect(error.documentation.length).toBeGreaterThan(0);
      });
    });

    test("should have valid documentation paths", () => {
      const error = createError(ERROR_CODES.CONFIG_NOT_FOUND);

      expect(error.documentation).toMatch(/\.md/);
      expect(error.documentation).not.toContain(" ");
    });
  });

  describe("Error Serialization", () => {
    test("should serialize to JSON correctly", () => {
      const error = createError(ERROR_CODES.PLUGIN_NOT_FOUND, {
        plugin: "my-plugin",
        path: "./plugins/my-plugin.js",
      });

      const json = JSON.stringify(error);
      const parsed = JSON.parse(json);

      expect(parsed.code).toBe(ERROR_CODES.PLUGIN_NOT_FOUND);
      expect(parsed.context.plugin).toBe("my-plugin");
    });

    test("should include original error in JSON", () => {
      const original = new Error("Original error");
      const error = createError(
        ERROR_CODES.UNKNOWN_ERROR,
        { reason: "Something went wrong" },
        original,
      );

      const json = error.toJSON();

      expect(json.originalError).toBeDefined();
      expect(json.originalError.message).toBe("Original error");
    });
  });
});
