/**
 * Contract Compliance Test Suite
 *
 * Tests that all plugin implementations comply with their contract specifications.
 * Validates metadata, required methods, method signatures, and return types.
 */

const ContractValidator = require("../../src/utils/contract-validator");
const path = require("path");

// Import valid plugins
const ValidLoaderPlugin = require("./mock-plugins/valid-loader");
const ValidEmbedderPlugin = require("./mock-plugins/valid-embedder");
const ValidRetrieverPlugin = require("./mock-plugins/valid-retriever");
const ValidLLMPlugin = require("./mock-plugins/valid-llm");
const ValidRerankerPlugin = require("./mock-plugins/valid-reranker");

// Import invalid plugins
const InvalidLoaderMissingMethod = require("./mock-plugins/invalid-loader-missing-method");
const InvalidLoaderMissingMetadata = require("./mock-plugins/invalid-loader-missing-metadata");
const InvalidLoaderWrongType = require("./mock-plugins/invalid-loader-wrong-type");
const InvalidRetrieverMissingMethod = require("./mock-plugins/invalid-retriever-missing-method");
const InvalidEmbedderNotFunction = require("./mock-plugins/invalid-embedder-not-function");

describe("Contract Compliance Test Suite", () => {
  let validator;

  beforeAll(() => {
    const contractsDir = path.join(process.cwd(), "contracts");
    validator = new ContractValidator({ contractsDir });
  });

  describe("ContractValidator Initialization", () => {
    it("should create validator instance", () => {
      expect(validator).toBeInstanceOf(ContractValidator);
    });

    it("should have contractsDir property", () => {
      expect(validator.contractsDir).toBeDefined();
      expect(validator.contractsDir).toContain("contracts");
    });
  });

  describe("Contract Loading", () => {
    it("should load loader contract", () => {
      const contract = validator.loadContract("loader");

      expect(contract).toBeDefined();
      expect(contract.type).toBe("loader");
      expect(contract.version).toBe("1.0.0");
      expect(contract.required).toContain("load");
    });

    it("should load embedder contract", () => {
      const contract = validator.loadContract("embedder");

      expect(contract).toBeDefined();
      expect(contract.type).toBe("embedder");
      expect(contract.required).toContain("embed");
    });

    it("should load retriever contract", () => {
      const contract = validator.loadContract("retriever");

      expect(contract).toBeDefined();
      expect(contract.type).toBe("retriever");
      expect(contract.required).toContain("store");
      expect(contract.required).toContain("retrieve");
    });

    it("should load llm contract", () => {
      const contract = validator.loadContract("llm");

      expect(contract).toBeDefined();
      expect(contract.type).toBe("llm");
      expect(contract.required).toContain("generate");
    });

    it("should load reranker contract", () => {
      const contract = validator.loadContract("reranker");

      expect(contract).toBeDefined();
      expect(contract.type).toBe("reranker");
      expect(contract.required).toContain("rerank");
    });

    it("should throw error for non-existent contract", () => {
      expect(() => validator.loadContract("nonexistent")).toThrow(
        /Contract not found/,
      );
    });

    it("should load all contracts", () => {
      const contracts = validator.loadAllContracts();

      expect(contracts).toBeDefined();
      expect(contracts.loader).toBeDefined();
      expect(contracts.embedder).toBeDefined();
      expect(contracts.retriever).toBeDefined();
      expect(contracts.llm).toBeDefined();
      expect(contracts.reranker).toBeDefined();
    });
  });

  describe("Metadata Validation", () => {
    let loaderContract;

    beforeAll(() => {
      loaderContract = validator.loadContract("loader");
    });

    it("should validate correct metadata", () => {
      const plugin = new ValidLoaderPlugin();
      const result = validator.validateMetadata(plugin, loaderContract);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it("should detect missing name", () => {
      const plugin = { version: "1.0.0", type: "loader" };
      const result = validator.validateMetadata(plugin, loaderContract);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain(
        'Plugin must have a valid "name" property (non-empty string)',
      );
    });

    it("should detect missing version", () => {
      const plugin = { name: "Test", type: "loader" };
      const result = validator.validateMetadata(plugin, loaderContract);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain(
        'Plugin must have a valid "version" property (non-empty string)',
      );
    });

    it("should detect type mismatch", () => {
      const plugin = new InvalidLoaderWrongType();
      const result = validator.validateMetadata(plugin, loaderContract);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain(
        'Plugin type "embedder" does not match contract type "loader"',
      );
    });

    it("should detect null plugin", () => {
      const result = validator.validateMetadata(null, loaderContract);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain("Plugin is null or undefined");
    });

    it("should detect empty string name", () => {
      const plugin = { name: "", version: "1.0.0", type: "loader" };
      const result = validator.validateMetadata(plugin, loaderContract);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain(
        'Plugin must have a valid "name" property (non-empty string)',
      );
    });
  });

  describe("Required Methods Validation", () => {
    it("should validate loader has load method", () => {
      const plugin = new ValidLoaderPlugin();
      const contract = validator.loadContract("loader");
      const result = validator.validateRequiredMethods(plugin, contract);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it("should detect missing load method", () => {
      const plugin = new InvalidLoaderMissingMethod();
      const contract = validator.loadContract("loader");
      const result = validator.validateRequiredMethods(plugin, contract);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Required method "load" is missing');
    });

    it("should validate retriever has store and retrieve methods", () => {
      const plugin = new ValidRetrieverPlugin();
      const contract = validator.loadContract("retriever");
      const result = validator.validateRequiredMethods(plugin, contract);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it("should detect missing retrieve method", () => {
      const plugin = new InvalidRetrieverMissingMethod();
      const contract = validator.loadContract("retriever");
      const result = validator.validateRequiredMethods(plugin, contract);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Required method "retrieve" is missing');
    });

    it("should detect non-function method", () => {
      const plugin = new InvalidEmbedderNotFunction();
      const contract = validator.loadContract("embedder");
      const result = validator.validateRequiredMethods(plugin, contract);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain(
        'Required property "embed" must be a function',
      );
    });
  });

  describe("Method Signature Validation", () => {
    it("should validate loader method signatures", () => {
      const plugin = new ValidLoaderPlugin();
      const contract = validator.loadContract("loader");
      const result = validator.validateMethodSignatures(plugin, contract);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it("should validate embedder method signatures", () => {
      const plugin = new ValidEmbedderPlugin();
      const contract = validator.loadContract("embedder");
      const result = validator.validateMethodSignatures(plugin, contract);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it("should validate retriever method signatures", () => {
      const plugin = new ValidRetrieverPlugin();
      const contract = validator.loadContract("retriever");
      const result = validator.validateMethodSignatures(plugin, contract);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it("should handle missing methods gracefully", () => {
      const plugin = new InvalidLoaderMissingMethod();
      const contract = validator.loadContract("loader");
      const result = validator.validateMethodSignatures(plugin, contract);

      // Should not crash, just skip validation for missing methods
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });
  });

  describe("Complete Plugin Validation", () => {
    describe("Valid Plugins", () => {
      it("should validate valid loader plugin", () => {
        const plugin = new ValidLoaderPlugin();
        const contract = validator.loadContract("loader");
        const result = validator.validatePlugin(plugin, contract);

        expect(result.valid).toBe(true);
        expect(result.errors).toHaveLength(0);
        expect(result.details.metadata.valid).toBe(true);
        expect(result.details.requiredMethods.valid).toBe(true);
        expect(result.details.signatures.valid).toBe(true);
      });

      it("should validate valid embedder plugin", () => {
        const plugin = new ValidEmbedderPlugin();
        const contract = validator.loadContract("embedder");
        const result = validator.validatePlugin(plugin, contract);

        expect(result.valid).toBe(true);
        expect(result.errors).toHaveLength(0);
      });

      it("should validate valid retriever plugin", () => {
        const plugin = new ValidRetrieverPlugin();
        const contract = validator.loadContract("retriever");
        const result = validator.validatePlugin(plugin, contract);

        expect(result.valid).toBe(true);
        expect(result.errors).toHaveLength(0);
      });

      it("should validate valid llm plugin", () => {
        const plugin = new ValidLLMPlugin();
        const contract = validator.loadContract("llm");
        const result = validator.validatePlugin(plugin, contract);

        expect(result.valid).toBe(true);
        expect(result.errors).toHaveLength(0);
      });

      it("should validate valid reranker plugin", () => {
        const plugin = new ValidRerankerPlugin();
        const contract = validator.loadContract("reranker");
        const result = validator.validatePlugin(plugin, contract);

        expect(result.valid).toBe(true);
        expect(result.errors).toHaveLength(0);
      });
    });

    describe("Invalid Plugins", () => {
      it("should reject loader with missing method", () => {
        const plugin = new InvalidLoaderMissingMethod();
        const contract = validator.loadContract("loader");
        const result = validator.validatePlugin(plugin, contract);

        expect(result.valid).toBe(false);
        expect(result.errors).toContain('Required method "load" is missing');
      });

      it("should reject loader with missing metadata", () => {
        const plugin = new InvalidLoaderMissingMetadata();
        const contract = validator.loadContract("loader");
        const result = validator.validatePlugin(plugin, contract);

        expect(result.valid).toBe(false);
        expect(result.errors.length).toBeGreaterThan(0);
        expect(result.errors.some((e) => e.includes("name"))).toBe(true);
        expect(result.errors.some((e) => e.includes("version"))).toBe(true);
      });

      it("should reject loader with wrong type", () => {
        const plugin = new InvalidLoaderWrongType();
        const contract = validator.loadContract("loader");
        const result = validator.validatePlugin(plugin, contract);

        expect(result.valid).toBe(false);
        expect(result.errors).toContain(
          'Plugin type "embedder" does not match contract type "loader"',
        );
      });

      it("should reject retriever with missing retrieve method", () => {
        const plugin = new InvalidRetrieverMissingMethod();
        const contract = validator.loadContract("retriever");
        const result = validator.validatePlugin(plugin, contract);

        expect(result.valid).toBe(false);
        expect(result.errors).toContain(
          'Required method "retrieve" is missing',
        );
      });

      it("should reject embedder with non-function method", () => {
        const plugin = new InvalidEmbedderNotFunction();
        const contract = validator.loadContract("embedder");
        const result = validator.validatePlugin(plugin, contract);

        expect(result.valid).toBe(false);
        expect(result.errors).toContain(
          'Required property "embed" must be a function',
        );
      });
    });
  });

  describe("Batch Plugin Validation", () => {
    it("should validate multiple plugins", () => {
      const plugins = [
        new ValidLoaderPlugin(),
        new ValidEmbedderPlugin(),
        new ValidRetrieverPlugin(),
      ];
      const contracts = validator.loadAllContracts();
      const results = validator.validatePlugins(plugins, contracts);

      expect(results).toHaveLength(3);
      expect(results.every((r) => r.valid)).toBe(true);
    });

    it("should detect invalid plugins in batch", () => {
      const plugins = [
        new ValidLoaderPlugin(),
        new InvalidLoaderMissingMethod(),
        new ValidEmbedderPlugin(),
      ];
      const contracts = validator.loadAllContracts();
      const results = validator.validatePlugins(plugins, contracts);

      expect(results).toHaveLength(3);
      expect(results[0].valid).toBe(true);
      expect(results[1].valid).toBe(false);
      expect(results[2].valid).toBe(true);
    });

    it("should handle missing contract gracefully", () => {
      const plugins = [
        {
          name: "Unknown Plugin",
          version: "1.0.0",
          type: "unknown-type",
        },
      ];
      const contracts = validator.loadAllContracts();
      const results = validator.validatePlugins(plugins, contracts);

      expect(results).toHaveLength(1);
      expect(results[0].valid).toBe(false);
      expect(results[0].errors).toContain(
        "No contract found for plugin type: unknown-type",
      );
    });
  });

  describe("Validation Report Formatting", () => {
    it("should format passing validation report", () => {
      const plugin = new ValidLoaderPlugin();
      const contract = validator.loadContract("loader");
      const result = validator.validatePlugin(plugin, contract);
      const report = validator.formatValidationReport(result, "ValidLoader");

      expect(report).toContain("ValidLoader");
      expect(report).toContain("✓ PASS");
      expect(report).toContain("All validation checks passed");
    });

    it("should format failing validation report", () => {
      const plugin = new InvalidLoaderMissingMethod();
      const contract = validator.loadContract("loader");
      const result = validator.validatePlugin(plugin, contract);
      const report = validator.formatValidationReport(result, "InvalidLoader");

      expect(report).toContain("InvalidLoader");
      expect(report).toContain("✗ FAIL");
      expect(report).toContain("Errors:");
      expect(report).toContain("✗");
    });

    it("should format report with warnings", () => {
      const plugin = new ValidLoaderPlugin();
      const contract = validator.loadContract("loader");
      const result = validator.validatePlugin(plugin, contract);

      // Manually add warnings for testing
      result.warnings = ["Warning: Parameter naming suggestion"];

      const report = validator.formatValidationReport(result, "Plugin");

      expect(report).toContain("Warnings:");
      expect(report).toContain("⚠");
    });
  });

  describe("Contract Structure Validation", () => {
    it("should validate all contracts have required fields", () => {
      const contracts = validator.loadAllContracts();

      Object.entries(contracts).forEach(([type, contract]) => {
        expect(contract.type).toBe(type);
        expect(contract.version).toBeDefined();
        expect(contract.title).toBeDefined();
        expect(contract.description).toBeDefined();
        expect(contract.methods).toBeInstanceOf(Array);
        expect(contract.required).toBeInstanceOf(Array);
        expect(contract.properties).toBeInstanceOf(Object);
      });
    });

    it("should validate contract methods match required list", () => {
      const contracts = validator.loadAllContracts();

      Object.values(contracts).forEach((contract) => {
        const methodNames = contract.methods.map((m) => m.name);
        contract.required.forEach((requiredMethod) => {
          expect(methodNames).toContain(requiredMethod);
        });
      });
    });
  });

  describe("Edge Cases", () => {
    it("should handle plugin with extra methods", () => {
      const plugin = new ValidLoaderPlugin();
      plugin.extraMethod = () => "extra";

      const contract = validator.loadContract("loader");
      const result = validator.validatePlugin(plugin, contract);

      // Extra methods should not cause validation failure
      expect(result.valid).toBe(true);
    });

    it("should handle plugin with extra metadata", () => {
      const plugin = new ValidLoaderPlugin();
      plugin.author = "Test Author";
      plugin.license = "MIT";

      const contract = validator.loadContract("loader");
      const result = validator.validatePlugin(plugin, contract);

      // Extra metadata should not cause validation failure
      expect(result.valid).toBe(true);
    });

    it("should handle async methods correctly", async () => {
      const plugin = new ValidLoaderPlugin();
      const contract = validator.loadContract("loader");

      // Validate that async methods are still functions
      expect(typeof plugin.load).toBe("function");

      // Validate execution
      const data = await plugin.load("test-source");
      expect(Array.isArray(data)).toBe(true);
      expect(data.length).toBeGreaterThan(0);
    });
  });
});
