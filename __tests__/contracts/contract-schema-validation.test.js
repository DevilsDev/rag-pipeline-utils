/**
 * Contract Schema Validation Test Suite
 *
 * Tests JSON schema validation for plugin contracts including:
 * - Valid contract validation
 * - Invalid contract rejection
 * - Schema error formatting
 * - Configuration options for validation
 */

const { PluginRegistry } = require("../../src/core/plugin-registry");
const Ajv = require("ajv");
const fs = require("fs");
const path = require("path");

describe("Contract Schema Validation", () => {
  let originalEnv;

  beforeEach(() => {
    originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = "development";
  });

  afterEach(() => {
    process.env.NODE_ENV = originalEnv;
  });

  describe("Schema Loading", () => {
    it("should load contract schema successfully", () => {
      const registry = new PluginRegistry({
        disableContractWarnings: true,
      });

      expect(registry._contractSchema).toBeDefined();
      expect(registry._contractSchema).not.toBeNull();
      expect(registry._contractSchema.$schema).toBe(
        "http://json-schema.org/draft-07/schema#",
      );
    });

    it("should have required schema properties", () => {
      const registry = new PluginRegistry({
        disableContractWarnings: true,
      });

      expect(registry._contractSchema.type).toBe("object");
      expect(registry._contractSchema.required).toContain("type");
      expect(registry._contractSchema.required).toContain("version");
      expect(registry._contractSchema.required).toContain("title");
      expect(registry._contractSchema.required).toContain("description");
      expect(registry._contractSchema.required).toContain("methods");
      expect(registry._contractSchema.required).toContain("properties");
      expect(registry._contractSchema.required).toContain("required");
    });

    it("should initialize Ajv instance", () => {
      const registry = new PluginRegistry({
        disableContractWarnings: true,
      });

      expect(registry._ajv).toBeInstanceOf(Ajv);
    });

    it("should handle missing schema file gracefully", () => {
      // Mock fs.existsSync to simulate missing schema
      const originalExistsSync = fs.existsSync;
      jest.spyOn(fs, "existsSync").mockImplementation((filePath) => {
        if (filePath.includes("contract-schema.json")) {
          return false;
        }
        return originalExistsSync(filePath);
      });

      const registry = new PluginRegistry({
        disableContractWarnings: true,
      });

      fs.existsSync.mockRestore();

      expect(registry._contractSchema).toBeNull();
    });
  });

  describe("Valid Contract Validation", () => {
    it("should validate loader contract successfully", () => {
      const registry = new PluginRegistry({
        disableContractWarnings: true,
      });

      const loaderContract = registry._contracts.get("loader");

      expect(loaderContract).toBeDefined();
      expect(loaderContract.type).toBe("loader");
      expect(loaderContract.version).toMatch(/^\d+\.\d+\.\d+$/);
    });

    it("should validate embedder contract successfully", () => {
      const registry = new PluginRegistry({
        disableContractWarnings: true,
      });

      const embedderContract = registry._contracts.get("embedder");

      expect(embedderContract).toBeDefined();
      expect(embedderContract.type).toBe("embedder");
    });

    it("should validate retriever contract successfully", () => {
      const registry = new PluginRegistry({
        disableContractWarnings: true,
      });

      const retrieverContract = registry._contracts.get("retriever");

      expect(retrieverContract).toBeDefined();
      expect(retrieverContract.type).toBe("retriever");
      expect(retrieverContract.required).toContain("store");
      expect(retrieverContract.required).toContain("retrieve");
    });

    it("should validate llm contract successfully", () => {
      const registry = new PluginRegistry({
        disableContractWarnings: true,
      });

      const llmContract = registry._contracts.get("llm");

      expect(llmContract).toBeDefined();
      expect(llmContract.type).toBe("llm");
    });

    it("should validate reranker contract successfully", () => {
      const registry = new PluginRegistry({
        disableContractWarnings: true,
      });

      const rerankerContract = registry._contracts.get("reranker");

      expect(rerankerContract).toBeDefined();
      expect(rerankerContract.type).toBe("reranker");
    });
  });

  describe("Invalid Contract Validation", () => {
    it("should reject contract with missing required field", () => {
      const registry = new PluginRegistry({
        disableContractWarnings: true,
      });

      const invalidContract = {
        type: "loader",
        version: "1.0.0",
        // Missing title
        description: "Test contract",
        methods: [
          { name: "load", parameters: ["source"], returns: "documents" },
        ],
        properties: { load: { type: "function", description: "Load" } },
        required: ["load"],
      };

      const result = registry._validateContractAgainstSchema(
        invalidContract,
        "loader",
      );

      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it("should reject contract with invalid version format", () => {
      const registry = new PluginRegistry({
        disableContractWarnings: true,
      });

      const invalidContract = {
        type: "loader",
        version: "1.0", // Should be x.y.z
        title: "Test Contract",
        description: "Test contract",
        methods: [
          { name: "load", parameters: ["source"], returns: "documents" },
        ],
        properties: { load: { type: "function", description: "Load" } },
        required: ["load"],
      };

      const result = registry._validateContractAgainstSchema(
        invalidContract,
        "loader",
      );

      expect(result.valid).toBe(false);
    });

    it("should reject contract with invalid plugin type", () => {
      const registry = new PluginRegistry({
        disableContractWarnings: true,
      });

      const invalidContract = {
        type: "invalid-type",
        version: "1.0.0",
        title: "Test Contract",
        description: "Test contract",
        methods: [
          { name: "load", parameters: ["source"], returns: "documents" },
        ],
        properties: { load: { type: "function", description: "Load" } },
        required: ["load"],
      };

      const result = registry._validateContractAgainstSchema(
        invalidContract,
        "invalid-type",
      );

      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      // Check that error is related to the type field
      expect(
        result.errors.some(
          (e) =>
            e.instancePath === "/type" ||
            e.dataPath === "/type" ||
            e.message.includes("enum") ||
            e.message.includes("allowed"),
        ),
      ).toBe(true);
    });

    it("should reject contract with empty methods array", () => {
      const registry = new PluginRegistry({
        disableContractWarnings: true,
      });

      const invalidContract = {
        type: "loader",
        version: "1.0.0",
        title: "Test Contract",
        description: "Test contract",
        methods: [], // Should have at least one method
        properties: { load: { type: "function", description: "Load" } },
        required: ["load"],
      };

      const result = registry._validateContractAgainstSchema(
        invalidContract,
        "loader",
      );

      expect(result.valid).toBe(false);
    });

    it("should reject contract with empty properties object", () => {
      const registry = new PluginRegistry({
        disableContractWarnings: true,
      });

      const invalidContract = {
        type: "loader",
        version: "1.0.0",
        title: "Test Contract",
        description: "Test contract",
        methods: [
          { name: "load", parameters: ["source"], returns: "documents" },
        ],
        properties: {}, // Should have at least one property
        required: ["load"],
      };

      const result = registry._validateContractAgainstSchema(
        invalidContract,
        "loader",
      );

      expect(result.valid).toBe(false);
    });

    it("should reject contract with empty required array", () => {
      const registry = new PluginRegistry({
        disableContractWarnings: true,
      });

      const invalidContract = {
        type: "loader",
        version: "1.0.0",
        title: "Test Contract",
        description: "Test contract",
        methods: [
          { name: "load", parameters: ["source"], returns: "documents" },
        ],
        properties: { load: { type: "function", description: "Load" } },
        required: [], // Should have at least one required method
      };

      const result = registry._validateContractAgainstSchema(
        invalidContract,
        "loader",
      );

      expect(result.valid).toBe(false);
    });

    it("should reject contract with invalid method name", () => {
      const registry = new PluginRegistry({
        disableContractWarnings: true,
      });

      const invalidContract = {
        type: "loader",
        version: "1.0.0",
        title: "Test Contract",
        description: "Test contract",
        methods: [
          {
            name: "invalid-name",
            parameters: ["source"],
            returns: "documents",
          },
        ],
        properties: {
          "invalid-name": { type: "function", description: "Load" },
        },
        required: ["invalid-name"],
      };

      const result = registry._validateContractAgainstSchema(
        invalidContract,
        "loader",
      );

      expect(result.valid).toBe(false);
    });
  });

  describe("Error Formatting", () => {
    it("should format schema errors clearly", () => {
      const registry = new PluginRegistry({
        disableContractWarnings: true,
      });

      const invalidContract = {
        type: "invalid-type",
        version: "1.0",
        // Missing required fields
        methods: [],
        properties: {},
        required: [],
      };

      const result = registry._validateContractAgainstSchema(
        invalidContract,
        "loader",
      );
      const formatted = registry._formatSchemaErrors(result.errors);

      expect(formatted).toContain("/");
      expect(typeof formatted).toBe("string");
      expect(formatted.length).toBeGreaterThan(0);
    });

    it("should handle empty errors array", () => {
      const registry = new PluginRegistry({
        disableContractWarnings: true,
      });

      const formatted = registry._formatSchemaErrors([]);

      expect(formatted).toBe("Unknown schema validation error");
    });

    it("should include error paths in formatted output", () => {
      const registry = new PluginRegistry({
        disableContractWarnings: true,
      });

      const invalidContract = {
        type: "loader",
        version: "1.0.0",
        title: "Test",
        description: "Test",
        methods: [],
        properties: { load: { type: "function", description: "Load" } },
        required: ["load"],
      };

      const result = registry._validateContractAgainstSchema(
        invalidContract,
        "loader",
      );
      const formatted = registry._formatSchemaErrors(result.errors);

      expect(formatted).toContain("/methods");
    });
  });

  describe("Configuration Options", () => {
    it("should disable schema validation when configured", () => {
      const registry = new PluginRegistry({
        disableContractWarnings: true,
        validateContractSchema: false,
      });

      const invalidContract = {
        type: "invalid",
        // Missing many required fields
      };

      const result = registry._validateContractAgainstSchema(
        invalidContract,
        "loader",
      );

      // Should pass when validation is disabled
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it("should enable schema validation by default", () => {
      const registry = new PluginRegistry({
        disableContractWarnings: true,
      });

      expect(registry._validateContractSchema).toBe(true);
    });

    it("should respect validateContractSchema option", () => {
      const registryEnabled = new PluginRegistry({
        disableContractWarnings: true,
        validateContractSchema: true,
      });
      const registryDisabled = new PluginRegistry({
        disableContractWarnings: true,
        validateContractSchema: false,
      });

      expect(registryEnabled._validateContractSchema).toBe(true);
      expect(registryDisabled._validateContractSchema).toBe(false);
    });
  });

  describe("Schema Validation in Development vs Production", () => {
    it("should throw on invalid contract in development", () => {
      process.env.NODE_ENV = "development";

      // Create invalid contract file
      const invalidPath = path.join(
        __dirname,
        "../fixtures/invalid-contract-test.json",
      );

      const originalReadFileSync = fs.readFileSync;
      const originalExistsSync = fs.existsSync;

      jest.spyOn(fs, "existsSync").mockImplementation((filePath) => {
        if (filePath.includes("invalid-contract-test.json")) {
          return true;
        }
        return originalExistsSync(filePath);
      });

      jest
        .spyOn(fs, "readFileSync")
        .mockImplementation((filePath, encoding) => {
          if (filePath.includes("loader-contract.json")) {
            return JSON.stringify({
              type: "loader",
              version: "invalid", // Invalid version format
              title: "Test",
              description: "Test",
              methods: [],
              properties: {},
              required: [],
            });
          }
          return originalReadFileSync(filePath, encoding);
        });

      expect(() => {
        new PluginRegistry({
          disableContractWarnings: true,
        });
      }).toThrow(/Contract schema validation failed/);

      fs.existsSync.mockRestore();
      fs.readFileSync.mockRestore();
    });

    it("should log error but continue in production", () => {
      process.env.NODE_ENV = "production";

      const consoleErrorSpy = jest.spyOn(console, "error").mockImplementation();

      const originalReadFileSync = fs.readFileSync;

      jest
        .spyOn(fs, "readFileSync")
        .mockImplementation((filePath, encoding) => {
          if (filePath.includes("loader-contract.json")) {
            return JSON.stringify({
              type: "loader",
              version: "invalid",
              title: "Test",
              description: "Test",
              methods: [],
              properties: {},
              required: [],
            });
          }
          return originalReadFileSync(filePath, encoding);
        });

      // Should not throw in production
      expect(() => {
        new PluginRegistry({
          disableContractWarnings: true,
        });
      }).not.toThrow();

      fs.readFileSync.mockRestore();
      consoleErrorSpy.mockRestore();
    });
  });

  describe("Schema Consistency", () => {
    it("should validate that all existing contracts match schema", () => {
      const registry = new PluginRegistry({
        disableContractWarnings: true,
      });

      const contractTypes = [
        "loader",
        "embedder",
        "retriever",
        "llm",
        "reranker",
      ];

      contractTypes.forEach((type) => {
        const contract = registry._contracts.get(type);
        if (contract) {
          const result = registry._validateContractAgainstSchema(
            contract,
            type,
          );
          expect(result.valid).toBe(true);
        }
      });
    });

    it("should ensure all contracts have semantic versioning", () => {
      const registry = new PluginRegistry({
        disableContractWarnings: true,
      });

      const contracts = Array.from(registry._contracts.values());

      contracts.forEach((contract) => {
        expect(contract.version).toMatch(/^\d+\.\d+\.\d+$/);
      });
    });

    it("should ensure all contracts have required methods", () => {
      const registry = new PluginRegistry({
        disableContractWarnings: true,
      });

      const contracts = Array.from(registry._contracts.values());

      contracts.forEach((contract) => {
        expect(contract.methods).toBeInstanceOf(Array);
        expect(contract.methods.length).toBeGreaterThan(0);
        expect(contract.required).toBeInstanceOf(Array);
        expect(contract.required.length).toBeGreaterThan(0);
      });
    });

    it("should ensure method names are valid identifiers", () => {
      const registry = new PluginRegistry({
        disableContractWarnings: true,
      });

      const contracts = Array.from(registry._contracts.values());

      contracts.forEach((contract) => {
        contract.methods.forEach((method) => {
          // Valid JavaScript identifier pattern
          expect(method.name).toMatch(/^[a-zA-Z_][a-zA-Z0-9_]*$/);
        });
      });
    });
  });

  describe("Integration with Contract Loading", () => {
    it("should load and validate all contracts on initialization", () => {
      const registry = new PluginRegistry({
        disableContractWarnings: true,
      });

      // All contracts should be loaded and validated
      expect(registry._contracts.size).toBeGreaterThan(0);
      expect(registry._contracts.has("loader")).toBe(true);
      expect(registry._contracts.has("embedder")).toBe(true);
      expect(registry._contracts.has("retriever")).toBe(true);
    });

    it("should handle corrupted contract JSON gracefully", () => {
      const originalReadFileSync = fs.readFileSync;

      jest
        .spyOn(fs, "readFileSync")
        .mockImplementation((filePath, encoding) => {
          if (filePath.includes("llm-contract.json")) {
            return "invalid json {{{";
          }
          return originalReadFileSync(filePath, encoding);
        });

      const consoleWarnSpy = jest.spyOn(console, "warn").mockImplementation();

      // Should not throw, just warn
      expect(() => {
        new PluginRegistry({
          disableContractWarnings: false,
        });
      }).not.toThrow();

      fs.readFileSync.mockRestore();
      consoleWarnSpy.mockRestore();
    });
  });
});
