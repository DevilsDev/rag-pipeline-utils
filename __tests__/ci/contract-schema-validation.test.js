/**
 * Contract Schema Validation Tests
 * Ensures plugin contracts are valid and backward compatible before publishing
 */

const fs = require("fs").promises;
const path = require("path");
const { PluginRegistry } = require("../../src/core/plugin-registry");

describe("Contract Schema Validation", () => {
  let registry;
  const contractsDir = path.join(__dirname, "../../src/contracts");
  const pluginsDir = path.join(__dirname, "../../src/plugins");

  beforeEach(() => {
    registry = new PluginRegistry();
  });

  describe("Plugin Contract Schema Validation", () => {
    test("should validate all plugin contract schemas are well-formed", async () => {
      const contractFiles = await fs.readdir(contractsDir);
      const jsonFiles = contractFiles.filter((file) => file.endsWith(".json"));

      expect(jsonFiles.length).toBeGreaterThan(0);

      for (const file of jsonFiles) {
        const contractPath = path.join(contractsDir, file);
        const contractContent = await fs.readFile(contractPath, "utf8");

        // Should be valid JSON
        expect(() => JSON.parse(contractContent)).not.toThrow();

        const contract = JSON.parse(contractContent);

        // Should have required schema properties
        expect(contract).toHaveProperty("$schema");
        expect(contract).toHaveProperty("type");
        expect(contract).toHaveProperty("version");
        expect(contract).toHaveProperty("methods");

        // Version should be semantic version
        expect(contract.version).toMatch(/^\d+\.\d+\.\d+$/);

        // Methods should be properly defined
        expect(Array.isArray(contract.methods)).toBe(true);

        for (const method of contract.methods) {
          expect(method).toHaveProperty("name");
          expect(method).toHaveProperty("parameters");
          expect(method).toHaveProperty("returns");
          expect(typeof method.name).toBe("string");
          expect(Array.isArray(method.parameters)).toBe(true);
        }
      }
    });

    test("should validate plugin implementations match their contracts", async () => {
      const pluginTypes = [
        "loaders",
        "embedders",
        "retrievers",
        "llms",
        "rerankers",
      ];

      for (const type of pluginTypes) {
        const typeDir = path.join(pluginsDir, type);

        try {
          const pluginFiles = await fs.readdir(typeDir);
          const jsFiles = pluginFiles.filter(
            (file) => file.endsWith(".js") && !file.includes("mock"),
          );

          for (const file of jsFiles) {
            const pluginPath = path.join(typeDir, file);

            // Dynamic import to check plugin structure
            const plugin = require(pluginPath);

            // Should have metadata
            expect(plugin).toHaveProperty("metadata");
            expect(plugin.metadata).toHaveProperty("name");
            expect(plugin.metadata).toHaveProperty("version");
            expect(plugin.metadata).toHaveProperty("type");

            // Should match expected type
            expect(plugin.metadata.type).toBe(type.slice(0, -1)); // Remove 's' from plural

            // Should have required methods based on type
            const expectedMethods = getExpectedMethodsForType(type);
            for (const method of expectedMethods) {
              expect(plugin).toHaveProperty(method);
              expect(typeof plugin[method]).toBe("function");
            }
          }
        } catch (error) {
          if (error.code !== "ENOENT") {
            throw error;
          }
        }
      }
    });

    test("should validate contract backward compatibility", async () => {
      // Mock previous contract versions for testing
      const previousContracts = {
        "loader-contract.json": {
          version: "1.0.0",
          methods: [
            { name: "load", parameters: ["source"], returns: "documents" },
          ],
        },
        "embedder-contract.json": {
          version: "1.0.0",
          methods: [{ name: "embed", parameters: ["text"], returns: "vector" }],
        },
      };

      const currentContracts = {};

      // Load current contracts
      const contractFiles = await fs.readdir(contractsDir);
      for (const file of contractFiles.filter((f) => f.endsWith(".json"))) {
        const contractPath = path.join(contractsDir, file);
        const content = await fs.readFile(contractPath, "utf8");
        currentContracts[file] = JSON.parse(content);
      }

      // Check backward compatibility
      for (const [filename, previousContract] of Object.entries(
        previousContracts,
      )) {
        if (currentContracts[filename]) {
          const currentContract = currentContracts[filename];

          // Version should be greater or equal
          const prevVersion = parseVersion(previousContract.version);
          const currVersion = parseVersion(currentContract.version);

          expect(currVersion.major >= prevVersion.major).toBe(true);

          // If major version is same, should be backward compatible
          if (currVersion.major === prevVersion.major) {
            // All previous methods should still exist
            for (const prevMethod of previousContract.methods) {
              const currentMethod = currentContract.methods.find(
                (m) => m.name === prevMethod.name,
              );
              expect(currentMethod).toBeDefined();

              // Parameters should be compatible (same or fewer required params)
              expect(
                currentMethod.parameters.length >= prevMethod.parameters.length,
              ).toBe(true);
            }
          }
        }
      }
    });
  });

  describe("Plugin Registry Contract Enforcement", () => {
    test("should enforce contracts during plugin registration", () => {
      const mockPlugin = {
        metadata: {
          name: "test-loader",
          version: "1.0.0",
          type: "loader",
        },
        load: jest.fn(),
      };

      // Should register successfully with valid contract
      expect(() => {
        registry.register("loader", "test-loader", mockPlugin);
      }).not.toThrow();

      // Should reject plugin missing required methods
      const invalidPlugin = {
        metadata: {
          name: "invalid-loader",
          version: "1.0.0",
          type: "loader",
        },
        // Missing 'load' method
      };

      expect(() => {
        registry.register("loader", "invalid-loader", invalidPlugin);
      }).toThrow();
    });

    test("should validate plugin method signatures", () => {
      const pluginWithInvalidSignature = {
        metadata: {
          name: "invalid-embedder",
          version: "1.0.0",
          type: "embedder",
        },
        embed: "not a function", // Invalid - should be function
      };

      expect(() => {
        registry.register(
          "embedder",
          "invalid-embedder",
          pluginWithInvalidSignature,
        );
      }).toThrow();
    });
  });

  describe("Schema Evolution and Migration", () => {
    test("should handle schema version migrations", () => {
      const migrations = {
        "1.0.0": {
          "2.0.0": (oldContract) => {
            // Example migration: rename method
            const newContract = { ...oldContract };
            newContract.version = "2.0.0";

            const askMethod = newContract.methods.find((m) => m.name === "ask");
            if (askMethod) {
              askMethod.name = "generate";
            }

            return newContract;
          },
        },
      };

      const oldContract = {
        version: "1.0.0",
        methods: [{ name: "ask", parameters: ["prompt"], returns: "response" }],
      };

      const migratedContract = migrations["1.0.0"]["2.0.0"](oldContract);

      expect(migratedContract.version).toBe("2.0.0");
      expect(migratedContract.methods[0].name).toBe("generate");
    });

    test("should validate schema migration paths", () => {
      const validMigrationPath = ["1.0.0", "1.1.0", "2.0.0"];
      const invalidMigrationPath = ["1.0.0", "3.0.0"]; // Missing intermediate versions

      expect(isValidMigrationPath(validMigrationPath)).toBe(true);
      expect(isValidMigrationPath(invalidMigrationPath)).toBe(false);
    });
  });

  describe("Contract Publishing Validation", () => {
    test("should validate contracts before npm publish", async () => {
      const packageJson = require("../../package.json");

      // Should have proper version
      expect(packageJson.version).toMatch(/^\d+\.\d+\.\d+/);

      // Should have contract validation in pre-publish script
      expect(packageJson.scripts).toHaveProperty("prepublishOnly");

      // Should include contract files in published package
      if (packageJson.files) {
        expect(
          packageJson.files.some(
            (pattern) =>
              pattern.includes("contracts") ||
              pattern.includes("src/contracts"),
          ),
        ).toBe(true);
      }
    });

    test("should prevent publishing with breaking contract changes", () => {
      const breakingChanges = [
        {
          type: "method_removed",
          method: "load",
          plugin: "loader",
        },
        {
          type: "parameter_removed",
          method: "embed",
          parameter: "text",
          plugin: "embedder",
        },
        {
          type: "return_type_changed",
          method: "retrieve",
          from: "documents[]",
          to: "string",
          plugin: "retriever",
        },
      ];

      for (const change of breakingChanges) {
        expect(() => {
          validateContractChange(change);
        }).toThrow(/breaking change/i);
      }
    });

    test("should allow non-breaking contract changes", () => {
      const nonBreakingChanges = [
        {
          type: "method_added",
          method: "configure",
          plugin: "loader",
        },
        {
          type: "parameter_added",
          method: "embed",
          parameter: "options",
          optional: true,
          plugin: "embedder",
        },
        {
          type: "return_type_extended",
          method: "retrieve",
          added_fields: ["metadata", "score"],
          plugin: "retriever",
        },
      ];

      for (const change of nonBreakingChanges) {
        expect(() => {
          validateContractChange(change);
        }).not.toThrow();
      }
    });
  });

  describe("Contract Documentation Generation", () => {
    test("should generate contract documentation", async () => {
      const contracts = {};
      const contractFiles = await fs.readdir(contractsDir);

      for (const file of contractFiles.filter((f) => f.endsWith(".json"))) {
        const contractPath = path.join(contractsDir, file);
        const content = await fs.readFile(contractPath, "utf8");
        contracts[file] = JSON.parse(content);
      }

      const documentation = generateContractDocumentation(contracts);

      expect(documentation).toContain("# Plugin Contracts");
      expect(documentation).toContain("## Loader Contract");
      expect(documentation).toContain("## Embedder Contract");
      expect(documentation).toContain("### Methods");
      expect(documentation).toContain("### Parameters");
      expect(documentation).toContain("### Returns");
    });

    test("should generate TypeScript definitions from contracts", async () => {
      const mockContract = {
        type: "loader",
        version: "1.0.0",
        methods: [
          {
            name: "load",
            parameters: [
              { name: "source", type: "string", required: true },
              { name: "options", type: "object", required: false },
            ],
            returns: { type: "array", items: "Document" },
          },
        ],
      };

      const typeDefinitions = generateTypeDefinitions(mockContract);

      expect(typeDefinitions).toContain("interface LoaderPlugin");
      expect(typeDefinitions).toContain(
        "load(source: string, options?: object): Document[]",
      );
    });
  });
});

// Helper functions
function getExpectedMethodsForType(type) {
  const methodMap = {
    loaders: ["load"],
    embedders: ["embed"],
    retrievers: ["retrieve"],
    llms: ["generate"],
    rerankers: ["rerank"],
  };

  return methodMap[type] || [];
}

function parseVersion(version) {
  const [major, minor, patch] = version.split(".").map(Number);
  return { major, minor, patch };
}

function isValidMigrationPath(versions) {
  for (let i = 1; i < versions.length; i++) {
    const prev = parseVersion(versions[i - 1]);
    const curr = parseVersion(versions[i]);

    // Should be incremental version bump
    if (
      curr.major < prev.major ||
      (curr.major === prev.major && curr.minor < prev.minor) ||
      (curr.major === prev.major &&
        curr.minor === prev.minor &&
        curr.patch <= prev.patch)
    ) {
      return false;
    }

    // Should not skip major versions
    if (curr.major > prev.major + 1) {
      return false;
    }
  }

  return true;
}

function validateContractChange(change) {
  const breakingChangeTypes = [
    "method_removed",
    "parameter_removed",
    "return_type_changed",
    "parameter_type_changed",
  ];

  if (breakingChangeTypes.includes(change.type)) {
    throw new Error(
      `Breaking change detected: ${change.type} in ${change.plugin} plugin`,
    );
  }
}

function generateContractDocumentation(contracts) {
  let doc = "# Plugin Contracts\n\n";
  doc +=
    "This document describes the contracts that all plugins must implement.\n\n";

  for (const [filename, contract] of Object.entries(contracts)) {
    const pluginType = contract.type || filename.replace("-contract.json", "");
    doc += `## ${pluginType.charAt(0).toUpperCase() + pluginType.slice(1)} Contract\n\n`;
    doc += `**Version:** ${contract.version}\n\n`;

    if (contract.methods) {
      doc += "### Methods\n\n";

      for (const method of contract.methods) {
        doc += `#### ${method.name}\n\n`;
        doc += `**Parameters:** ${method.parameters.join(", ")}\n\n`;
        doc += `**Returns:** ${method.returns}\n\n`;
      }
    }
  }

  return doc;
}

function generateTypeDefinitions(contract) {
  const interfaceName = `${contract.type.charAt(0).toUpperCase() + contract.type.slice(1)}Plugin`;
  let typedef = `interface ${interfaceName} {\n`;

  for (const method of contract.methods) {
    const params = method.parameters
      .map((p) => {
        const optional = !p.required ? "?" : "";
        return `${p.name}${optional}: ${p.type}`;
      })
      .join(", ");

    const returnType =
      method.returns.type === "array"
        ? `${method.returns.items}[]`
        : method.returns.type || method.returns;

    typedef += `  ${method.name}(${params}): ${returnType};\n`;
  }

  typedef += "}\n";
  return typedef;
}
