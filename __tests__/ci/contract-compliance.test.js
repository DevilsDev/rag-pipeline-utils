/**
 * CI Contract Compliance Test
 *
 * Validates that all mock plugins comply with their respective contracts.
 * This ensures contract integrity and catches drift between contracts and implementations.
 *
 * Fails fast on any contract violation to prevent broken plugins from being released.
 */

const fs = require("fs");
const path = require("path");

// Mock plugin imports
const MockLoader = require("../fixtures/mock-plugins/mock-loader");
const MockEmbedder = require("../fixtures/mock-plugins/mock-embedder");
const MockRetriever = require("../fixtures/mock-plugins/mock-retriever");
const MockLLM = require("../fixtures/mock-plugins/mock-llm");
const MockReranker = require("../fixtures/mock-plugins/mock-reranker");

// Contract paths
const CONTRACTS_DIR = path.join(__dirname, "..", "..", "contracts");

/**
 * Load contract JSON for a plugin type
 * @param {string} type - Plugin type (loader, embedder, retriever, llm, reranker)
 * @returns {object} Contract JSON object
 */
function loadContract(type) {
  const contractPath = path.join(CONTRACTS_DIR, `${type}-contract.json`);

  if (!fs.existsSync(contractPath)) {
    throw new Error(
      `Contract file not found for type '${type}': ${contractPath}`,
    );
  }

  const contractData = fs.readFileSync(contractPath, "utf8");
  return JSON.parse(contractData);
}

/**
 * Validate that a plugin instance implements all required methods from its contract
 * @param {object} plugin - Plugin instance to validate
 * @param {object} contract - Contract JSON object
 * @returns {object} Validation result with { valid: boolean, errors: string[] }
 */
function validatePluginContract(plugin, contract) {
  const errors = [];

  // Validate plugin has metadata
  if (!plugin.metadata) {
    errors.push("Plugin must have metadata property");
  } else {
    // Validate metadata fields
    if (!plugin.metadata.name) {
      errors.push("Plugin metadata must include name");
    }
    if (!plugin.metadata.version) {
      errors.push("Plugin metadata must include version");
    }
    if (!plugin.metadata.type) {
      errors.push("Plugin metadata must include type");
    }
    if (plugin.metadata.type !== contract.type) {
      errors.push(
        `Plugin type '${plugin.metadata.type}' does not match contract type '${contract.type}'`,
      );
    }
  }

  // Validate required methods exist
  if (contract.required && Array.isArray(contract.required)) {
    contract.required.forEach((methodName) => {
      if (typeof plugin[methodName] !== "function") {
        errors.push(`Plugin must implement required method '${methodName}'`);
      }
    });
  }

  // Validate method signatures from contract.methods
  if (contract.methods && Array.isArray(contract.methods)) {
    contract.methods.forEach((methodSpec) => {
      const methodName = methodSpec.name;

      if (typeof plugin[methodName] !== "function") {
        errors.push(
          `Plugin must implement method '${methodName}' as defined in contract`,
        );
      } else {
        // Validate function accepts the expected number of parameters
        const expectedParamCount = methodSpec.parameters
          ? methodSpec.parameters.length
          : 0;
        const actualParamCount = plugin[methodName].length;

        // Allow functions to accept more parameters (optional params) but not fewer
        if (actualParamCount < expectedParamCount) {
          errors.push(
            `Method '${methodName}' accepts ${actualParamCount} parameters but contract requires at least ${expectedParamCount}`,
          );
        }
      }
    });
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Test helper to validate a plugin instance against its contract
 * @param {string} type - Plugin type
 * @param {object} PluginClass - Plugin class constructor
 */
function testPluginCompliance(type, PluginClass) {
  describe(`${type} plugin contract compliance`, () => {
    let plugin;
    let contract;

    beforeAll(() => {
      // Load contract
      try {
        contract = loadContract(type);
      } catch (error) {
        throw new Error(
          `Failed to load contract for ${type}: ${error.message}`,
        );
      }

      // Instantiate plugin
      plugin = new PluginClass();
    });

    it("should load contract successfully", () => {
      expect(contract).toBeDefined();
      expect(contract.type).toBe(type);
    });

    it("should have valid metadata", () => {
      expect(plugin.metadata).toBeDefined();
      expect(plugin.metadata.name).toBeTruthy();
      expect(plugin.metadata.version).toBeTruthy();
      expect(plugin.metadata.type).toBe(type);
    });

    it("should implement all required methods", () => {
      const validation = validatePluginContract(plugin, contract);

      if (!validation.valid) {
        // Fail fast: log all errors and fail the test
        console.error(`\n❌ Contract compliance failed for ${type} plugin:`);
        validation.errors.forEach((error) => {
          console.error(`  - ${error}`);
        });
      }

      expect(validation.valid).toBe(true);
      expect(validation.errors).toEqual([]);
    });

    it("should have correctly typed methods", () => {
      if (contract.methods) {
        contract.methods.forEach((methodSpec) => {
          const method = plugin[methodSpec.name];
          expect(typeof method).toBe("function");
        });
      }
    });

    it("should match contract version requirements", () => {
      expect(contract.version).toBeDefined();
      expect(typeof contract.version).toBe("string");

      // Validate semver format
      const semverPattern = /^\d+\.\d+\.\d+$/;
      expect(contract.version).toMatch(semverPattern);
    });
  });
}

// Run compliance tests for all plugin types
describe("CI Contract Compliance Suite", () => {
  describe("Mock Plugin Contract Validation", () => {
    // Test each plugin type
    testPluginCompliance("loader", MockLoader);
    testPluginCompliance("embedder", MockEmbedder);
    testPluginCompliance("retriever", MockRetriever);
    testPluginCompliance("llm", MockLLM);
    testPluginCompliance("reranker", MockReranker);
  });

  describe("Contract File Integrity", () => {
    const requiredContracts = [
      "loader",
      "embedder",
      "retriever",
      "llm",
      "reranker",
    ];

    it("should have all required contract files present", () => {
      const missingContracts = [];

      requiredContracts.forEach((type) => {
        const contractPath = path.join(CONTRACTS_DIR, `${type}-contract.json`);
        if (!fs.existsSync(contractPath)) {
          missingContracts.push(type);
        }
      });

      if (missingContracts.length > 0) {
        console.error(
          `\n❌ Missing contract files for: ${missingContracts.join(", ")}`,
        );
      }

      expect(missingContracts).toEqual([]);
    });

    it("should have valid JSON in all contract files", () => {
      const invalidContracts = [];

      requiredContracts.forEach((type) => {
        try {
          loadContract(type);
        } catch (error) {
          invalidContracts.push({ type, error: error.message });
        }
      });

      if (invalidContracts.length > 0) {
        console.error("\n❌ Invalid contract files:");
        invalidContracts.forEach(({ type, error }) => {
          console.error(`  - ${type}: ${error}`);
        });
      }

      expect(invalidContracts).toEqual([]);
    });
  });

  describe("Fail-Fast Validation", () => {
    it("should detect missing methods immediately", () => {
      // Create a mock plugin with missing methods
      class BrokenPlugin {
        constructor() {
          this.metadata = {
            name: "broken-plugin",
            version: "1.0.0",
            type: "loader",
          };
        }
        // Missing load() method
      }

      const brokenPlugin = new BrokenPlugin();
      const contract = loadContract("loader");
      const validation = validatePluginContract(brokenPlugin, contract);

      expect(validation.valid).toBe(false);
      expect(validation.errors.length).toBeGreaterThan(0);
      expect(validation.errors.some((e) => e.includes("load"))).toBe(true);
    });

    it("should detect type mismatches immediately", () => {
      // Create a mock plugin with wrong type
      class WrongTypePlugin {
        constructor() {
          this.metadata = {
            name: "wrong-type",
            version: "1.0.0",
            type: "embedder", // Wrong type
          };
        }

        async load() {
          return [];
        }
      }

      const wrongPlugin = new WrongTypePlugin();
      const contract = loadContract("loader");
      const validation = validatePluginContract(wrongPlugin, contract);

      expect(validation.valid).toBe(false);
      expect(validation.errors.some((e) => e.includes("type"))).toBe(true);
    });

    it("should detect missing metadata immediately", () => {
      // Create a mock plugin without metadata
      class NoMetadataPlugin {
        async load() {
          return [];
        }
      }

      const noMetadataPlugin = new NoMetadataPlugin();
      const contract = loadContract("loader");
      const validation = validatePluginContract(noMetadataPlugin, contract);

      expect(validation.valid).toBe(false);
      expect(validation.errors.some((e) => e.includes("metadata"))).toBe(true);
    });
  });
});
