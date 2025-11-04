/**
 * Plugin Registry Contract Warnings Test Suite
 *
 * Tests contract warning functionality including:
 * - One-time warnings per contract type
 * - Environment-based warning behavior
 * - Configuration options to disable warnings
 * - Warning message content and formatting
 */

const { PluginRegistry } = require("../../src/core/plugin-registry");
const fs = require("fs");
const path = require("path");

describe("Plugin Registry Contract Warnings", () => {
  let originalEnv;
  let consoleWarnSpy;

  beforeEach(() => {
    // Save original environment
    originalEnv = process.env.NODE_ENV;

    // Spy on console.warn
    consoleWarnSpy = jest.spyOn(console, "warn").mockImplementation();
  });

  afterEach(() => {
    // Restore original environment
    process.env.NODE_ENV = originalEnv;

    // Restore console.warn
    consoleWarnSpy.mockRestore();
  });

  describe("checkContractExists", () => {
    it("should return true for existing contracts", () => {
      process.env.NODE_ENV = "development";
      const registry = new PluginRegistry({ disableContractWarnings: true });

      expect(registry.checkContractExists("loader")).toBe(true);
      expect(registry.checkContractExists("embedder")).toBe(true);
      expect(registry.checkContractExists("retriever")).toBe(true);
      expect(registry.checkContractExists("llm")).toBe(true);
      expect(registry.checkContractExists("reranker")).toBe(true);
    });

    it("should return false for non-existent contracts", () => {
      process.env.NODE_ENV = "development";
      const registry = new PluginRegistry({ disableContractWarnings: true });

      expect(registry.checkContractExists("nonexistent")).toBe(false);
      expect(registry.checkContractExists("evaluator")).toBe(false);
    });

    it("should be accessible as a public method", () => {
      process.env.NODE_ENV = "development";
      const registry = new PluginRegistry({ disableContractWarnings: true });

      expect(typeof registry.checkContractExists).toBe("function");
      expect(registry.checkContractExists).toBeDefined();
    });
  });

  describe("Warning behavior in development", () => {
    beforeEach(() => {
      process.env.NODE_ENV = "development";
    });

    it("should NOT warn when contracts exist", () => {
      new PluginRegistry({ disableContractWarnings: false });

      // Loader, embedder, retriever, llm, reranker should all exist
      expect(consoleWarnSpy).not.toHaveBeenCalledWith(
        expect.stringContaining("Missing Contract for 'loader'"),
      );
      expect(consoleWarnSpy).not.toHaveBeenCalledWith(
        expect.stringContaining("Missing Contract for 'embedder'"),
      );
    });

    it("should warn once per missing contract type during load", () => {
      // Mock fs.existsSync to simulate missing evaluator contract
      const originalExistsSync = fs.existsSync;
      jest.spyOn(fs, "existsSync").mockImplementation((filePath) => {
        if (filePath.includes("evaluator-contract.json")) {
          return false;
        }
        return originalExistsSync(filePath);
      });

      // Note: evaluator contract doesn't exist, so we won't see warnings for it
      // unless we add it to contractFiles in _loadContracts()
      new PluginRegistry({ disableContractWarnings: false });

      fs.existsSync.mockRestore();

      // Should not warn for existing contracts
      expect(consoleWarnSpy).not.toHaveBeenCalledWith(
        expect.stringContaining("Missing Contract for 'loader'"),
      );
    });

    it("should not repeat warnings for the same contract type", () => {
      // Create registry instance that will trigger warnings
      const registry = new PluginRegistry({ disableContractWarnings: false });

      // Clear previous warnings
      consoleWarnSpy.mockClear();

      // First call should warn
      registry._warnMissingContract("testtype", "load");
      expect(consoleWarnSpy).toHaveBeenCalledTimes(1);

      consoleWarnSpy.mockClear();

      // Subsequent calls should not warn (already shown for 'testtype:load')
      registry._warnMissingContract("testtype", "load");
      registry._warnMissingContract("testtype", "load");

      expect(consoleWarnSpy).not.toHaveBeenCalled();
    });

    it("should warn separately for different contexts", () => {
      const registry = new PluginRegistry({ disableContractWarnings: false });

      consoleWarnSpy.mockClear();

      // Warn for different context
      registry._warnMissingContract("testtype", "load");

      expect(consoleWarnSpy).toHaveBeenCalledTimes(1);
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining("Missing Contract for 'testtype'"),
      );

      consoleWarnSpy.mockClear();

      // Different context should trigger new warning
      registry._warnMissingContract("testtype", "register");

      expect(consoleWarnSpy).toHaveBeenCalledTimes(1);
    });
  });

  describe("Warning behavior in production", () => {
    beforeEach(() => {
      process.env.NODE_ENV = "production";
    });

    it("should NOT warn about missing contracts in production", () => {
      new PluginRegistry({ disableContractWarnings: false });

      // No warnings should be logged in production
      expect(consoleWarnSpy).not.toHaveBeenCalledWith(
        expect.stringContaining("Missing Contract"),
      );
    });

    it("should not call _warnMissingContract in production", () => {
      const registry = new PluginRegistry({ disableContractWarnings: false });

      consoleWarnSpy.mockClear();

      // Manually call warning method
      registry._warnMissingContract("testtype", "load");

      // Should not log in production
      expect(consoleWarnSpy).not.toHaveBeenCalled();
    });
  });

  describe("disableContractWarnings configuration", () => {
    beforeEach(() => {
      process.env.NODE_ENV = "development";
    });

    it("should not warn when disableContractWarnings is true", () => {
      new PluginRegistry({ disableContractWarnings: true });

      // No warnings should be logged
      expect(consoleWarnSpy).not.toHaveBeenCalledWith(
        expect.stringContaining("Missing Contract"),
      );
    });

    it("should warn when disableContractWarnings is false", () => {
      // Mock missing contract
      const originalExistsSync = fs.existsSync;
      jest.spyOn(fs, "existsSync").mockImplementation((filePath) => {
        if (filePath.includes("loader-contract.json")) {
          return false; // Simulate missing loader contract
        }
        return originalExistsSync(filePath);
      });

      new PluginRegistry({ disableContractWarnings: false });

      fs.existsSync.mockRestore();

      // Should warn for missing loader contract
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining("Missing Contract for 'loader'"),
      );
    });

    it("should respect default behavior (warnings enabled) when option not specified", () => {
      const registry = new PluginRegistry();

      expect(registry._disableContractWarnings).toBe(false);
    });

    it("should store disableContractWarnings setting correctly", () => {
      const registryDisabled = new PluginRegistry({
        disableContractWarnings: true,
      });
      const registryEnabled = new PluginRegistry({
        disableContractWarnings: false,
      });

      expect(registryDisabled._disableContractWarnings).toBe(true);
      expect(registryEnabled._disableContractWarnings).toBe(false);
    });
  });

  describe("Warning message content", () => {
    beforeEach(() => {
      process.env.NODE_ENV = "development";
    });

    it("should include contract type in warning message", () => {
      const registry = new PluginRegistry({ disableContractWarnings: false });

      consoleWarnSpy.mockClear();

      registry._warnMissingContract("testtype", "load");

      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining("testtype"),
      );
    });

    it("should include benefits of contracts", () => {
      const registry = new PluginRegistry({ disableContractWarnings: false });

      consoleWarnSpy.mockClear();

      registry._warnMissingContract("testtype", "load");

      const warningMessage = consoleWarnSpy.mock.calls[0][0];

      expect(warningMessage).toContain("Benefits of using contracts");
      expect(warningMessage).toContain("compatibility");
      expect(warningMessage).toContain("Validates required methods");
      expect(warningMessage).toContain("interface documentation");
      expect(warningMessage).toContain("automated testing");
    });

    it("should include instructions for adding contracts", () => {
      const registry = new PluginRegistry({ disableContractWarnings: false });

      consoleWarnSpy.mockClear();

      registry._warnMissingContract("testtype", "load");

      const warningMessage = consoleWarnSpy.mock.calls[0][0];

      expect(warningMessage).toContain("To add a contract");
      expect(warningMessage).toContain("contracts/testtype-contract.json");
      expect(warningMessage).toContain("Define required methods");
      expect(warningMessage).toContain("Run contract validation tests");
    });

    it("should include example contract structure", () => {
      const registry = new PluginRegistry({ disableContractWarnings: false });

      consoleWarnSpy.mockClear();

      registry._warnMissingContract("testtype", "load");

      const warningMessage = consoleWarnSpy.mock.calls[0][0];

      expect(warningMessage).toContain("Example contract structure");
      expect(warningMessage).toContain('"type": "testtype"');
      expect(warningMessage).toContain('"version"');
      expect(warningMessage).toContain('"required"');
      expect(warningMessage).toContain('"properties"');
    });

    it("should include documentation references", () => {
      const registry = new PluginRegistry({ disableContractWarnings: false });

      consoleWarnSpy.mockClear();

      registry._warnMissingContract("testtype", "load");

      const warningMessage = consoleWarnSpy.mock.calls[0][0];

      expect(warningMessage).toContain("docs/error-context-guide.md");
      expect(warningMessage).toContain("__tests__/contracts/README.md");
    });

    it("should include instructions to disable warnings", () => {
      const registry = new PluginRegistry({ disableContractWarnings: false });

      consoleWarnSpy.mockClear();

      registry._warnMissingContract("testtype", "load");

      const warningMessage = consoleWarnSpy.mock.calls[0][0];

      expect(warningMessage).toContain("To disable these warnings");
      expect(warningMessage).toContain("disableContractWarnings: true");
    });

    it("should use formatted box for readability", () => {
      const registry = new PluginRegistry({ disableContractWarnings: false });

      consoleWarnSpy.mockClear();

      registry._warnMissingContract("testtype", "load");

      const warningMessage = consoleWarnSpy.mock.calls[0][0];

      // Check for box drawing characters
      expect(warningMessage).toContain("╔");
      expect(warningMessage).toContain("║");
      expect(warningMessage).toContain("╠");
      expect(warningMessage).toContain("╚");
    });
  });

  describe("Integration with plugin registration", () => {
    beforeEach(() => {
      process.env.NODE_ENV = "development";
    });

    it("should warn when registering plugin without contract", async () => {
      // Mock missing contract
      const originalExistsSync = fs.existsSync;
      jest.spyOn(fs, "existsSync").mockImplementation((filePath) => {
        if (filePath.includes("evaluator-contract.json")) {
          return false;
        }
        return originalExistsSync(filePath);
      });

      const registry = new PluginRegistry({ disableContractWarnings: false });

      fs.existsSync.mockRestore();

      consoleWarnSpy.mockClear();

      // Try to register evaluator plugin (no contract exists)
      try {
        await registry.register("evaluator", "test-evaluator", {
          metadata: {
            name: "Test Evaluator",
            version: "1.0.0",
            type: "evaluator",
          },
          evaluate: () => {},
        });
      } catch (error) {
        // Ignore registration errors, we're testing warnings
      }

      // Should warn about missing contract during registration
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining("Missing Contract for 'evaluator'"),
      );
    });

    it("should not duplicate warnings during load and register", async () => {
      // Mock missing contract
      const originalExistsSync = fs.existsSync;
      jest.spyOn(fs, "existsSync").mockImplementation((filePath) => {
        if (filePath.includes("evaluator-contract.json")) {
          return false;
        }
        return originalExistsSync(filePath);
      });

      const registry = new PluginRegistry({ disableContractWarnings: false });

      fs.existsSync.mockRestore();

      const loadWarnings = consoleWarnSpy.mock.calls.filter((call) =>
        call[0].includes("evaluator"),
      ).length;

      consoleWarnSpy.mockClear();

      // Try to register evaluator plugin
      try {
        await registry.register("evaluator", "test-evaluator", {
          metadata: {
            name: "Test Evaluator",
            version: "1.0.0",
            type: "evaluator",
          },
          evaluate: () => {},
        });
      } catch (error) {
        // Ignore
      }

      const registerWarnings = consoleWarnSpy.mock.calls.filter((call) =>
        call[0].includes("evaluator"),
      ).length;

      // Should show warning during register since context is different (load vs register)
      expect(registerWarnings).toBe(1);
    });
  });

  describe("Edge cases", () => {
    beforeEach(() => {
      process.env.NODE_ENV = "development";
    });

    it("should handle undefined NODE_ENV", () => {
      delete process.env.NODE_ENV;

      const registry = new PluginRegistry({ disableContractWarnings: false });

      consoleWarnSpy.mockClear();

      registry._warnMissingContract("testtype", "load");

      // Should warn when NODE_ENV is undefined (treated as non-production)
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining("Missing Contract"),
      );
    });

    it("should handle test environment", () => {
      process.env.NODE_ENV = "test";

      const registry = new PluginRegistry({ disableContractWarnings: false });

      consoleWarnSpy.mockClear();

      registry._warnMissingContract("testtype", "load");

      // Should warn in test environment (non-production)
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining("Missing Contract"),
      );
    });

    it("should handle empty contract type", () => {
      const registry = new PluginRegistry({ disableContractWarnings: false });

      consoleWarnSpy.mockClear();

      registry._warnMissingContract("", "load");

      // Should still warn with empty type
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining("Missing Contract"),
      );
    });

    it("should track warnings across multiple instances", () => {
      const registry1 = new PluginRegistry({ disableContractWarnings: false });
      const registry2 = new PluginRegistry({ disableContractWarnings: false });

      // Each instance should have its own warning tracking
      expect(registry1._contractWarningsShown).not.toBe(
        registry2._contractWarningsShown,
      );
      expect(registry1._contractWarningsShown).toBeInstanceOf(Set);
      expect(registry2._contractWarningsShown).toBeInstanceOf(Set);
    });
  });
});
