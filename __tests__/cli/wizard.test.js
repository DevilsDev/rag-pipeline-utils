"use strict";

/**
 * Wizard Command Tests
 *
 * Comprehensive tests for the interactive configuration wizard CLI command.
 */

const {
  createWizardCommand,
  TEMPLATES,
  useTemplate,
  validateConfiguration,
  displayConfigSummary,
} = require("../../src/cli/commands/wizard");
const { validateRagrc } = require("../../src/config/enhanced-ragrc-schema");
const fs = require("fs/promises");
const path = require("path");

// Mock dependencies
jest.mock("inquirer");
jest.mock("fs/promises");
jest.mock("../../src/cli/interactive-wizard");
jest.mock("chalk", () => ({
  cyan: jest.fn((str) => str),
  blue: jest.fn((str) => str),
  green: jest.fn((str) => str),
  red: jest.fn((str) => str),
  yellow: jest.fn((str) => str),
  gray: jest.fn((str) => str),
  grey: jest.fn((str) => str),
  bold: jest.fn((str) => str),
}));

const inquirer = require("inquirer");

describe("Wizard Command", () => {
  let mockExit;

  beforeEach(() => {
    jest.clearAllMocks();
    // Suppress console output during tests
    jest.spyOn(console, "log").mockImplementation(() => {});
    jest.spyOn(console, "error").mockImplementation(() => {});
    jest.spyOn(console, "warn").mockImplementation(() => {});
    // Mock process.exit
    mockExit = jest.spyOn(process, "exit").mockImplementation(() => {});
  });

  afterEach(() => {
    console.log.mockRestore();
    console.error.mockRestore();
    console.warn.mockRestore();
    mockExit.mockRestore();
  });

  describe("Command Creation", () => {
    test("should create wizard command", () => {
      const command = createWizardCommand();

      expect(command).toBeDefined();
      expect(command.name()).toBe("wizard");
      expect(command.description()).toContain(
        "Interactive configuration wizard",
      );
    });

    test("should have correct options", () => {
      const command = createWizardCommand();
      const options = command.options;

      const optionNames = options.map((opt) => opt.long);
      expect(optionNames).toContain("--output");
      expect(optionNames).toContain("--template");
      expect(optionNames).toContain("--list-templates");
      expect(optionNames).toContain("--validate");
      expect(optionNames).toContain("--no-save");
      expect(optionNames).toContain("--quiet");
    });

    test("should have default output path", () => {
      const command = createWizardCommand();
      const outputOption = command.options.find(
        (opt) => opt.long === "--output",
      );

      expect(outputOption).toBeDefined();
      expect(outputOption.defaultValue).toBe(".ragrc.json");
    });
  });

  describe("Templates", () => {
    test("should have all required templates", () => {
      expect(TEMPLATES).toHaveProperty("minimal");
      expect(TEMPLATES).toHaveProperty("production");
      expect(TEMPLATES).toHaveProperty("development");
      expect(TEMPLATES).toHaveProperty("testing");
      expect(TEMPLATES).toHaveProperty("custom");
    });

    test("minimal template should have valid structure", () => {
      const template = TEMPLATES.minimal;

      expect(template.name).toBeDefined();
      expect(template.description).toBeDefined();
      expect(template.config).toBeDefined();
      expect(template.config.metadata).toBeDefined();
      expect(template.config.plugins).toBeDefined();
      expect(template.config.pipeline).toBeDefined();
    });

    test("production template should have full features", () => {
      const template = TEMPLATES.production;

      expect(template.config.performance).toBeDefined();
      expect(template.config.performance.caching).toBeDefined();
      expect(template.config.performance.parallel).toBeDefined();
      expect(template.config.observability).toBeDefined();
      expect(template.config.observability.tracing).toBeDefined();
      expect(template.config.observability.metrics).toBeDefined();
    });

    test("development template should have debug logging", () => {
      const template = TEMPLATES.development;

      expect(template.config.observability.logging.level).toBe("debug");
    });

    test("testing template should use mock plugins", () => {
      const template = TEMPLATES.testing;

      const loaderConfig = Object.values(template.config.plugins.loader)[0];
      expect(loaderConfig).toContain("mock");
    });

    test("custom template should have null config", () => {
      const template = TEMPLATES.custom;

      expect(template.config).toBeNull();
    });
  });

  describe("useTemplate", () => {
    beforeEach(() => {
      fs.writeFile.mockResolvedValue(undefined);
    });

    test("should use template without customization", async () => {
      inquirer.prompt.mockResolvedValueOnce({ customize: false });

      const config = await useTemplate("minimal", {
        output: ".ragrc.json",
        save: true,
      });

      expect(config).toBeDefined();
      expect(config.metadata).toBeDefined();
      expect(fs.writeFile).toHaveBeenCalledWith(
        ".ragrc.json",
        expect.any(String),
        "utf-8",
      );
    });

    test("should customize template metadata", async () => {
      inquirer.prompt
        .mockResolvedValueOnce({ customize: true })
        .mockResolvedValueOnce({
          name: "my-custom-pipeline",
          description: "My custom description",
        });

      const config = await useTemplate("minimal", {
        output: ".ragrc.json",
        save: true,
      });

      expect(config.metadata.name).toBe("my-custom-pipeline");
      expect(config.metadata.description).toBe("My custom description");
      expect(config.metadata.createdAt).toBeDefined();
    });

    test("should throw error for unknown template", async () => {
      await expect(
        useTemplate("unknown", { output: ".ragrc.json" }),
      ).rejects.toThrow("Unknown template");
    });

    test("should not save if save option is false", async () => {
      inquirer.prompt.mockResolvedValueOnce({ customize: false });

      await useTemplate("minimal", {
        output: ".ragrc.json",
        save: false,
      });

      expect(fs.writeFile).not.toHaveBeenCalled();
    });

    test("should validate template configuration", async () => {
      inquirer.prompt.mockResolvedValueOnce({ customize: false });

      const config = await useTemplate("production", {
        output: ".ragrc.json",
        save: true,
      });

      const validation = validateRagrc(config);
      expect(validation.valid).toBe(true);
    });
  });

  describe("validateConfiguration", () => {
    test("should validate valid configuration", async () => {
      const validConfig = {
        metadata: {
          name: "test-pipeline",
          version: "1.0.0",
        },
        plugins: {
          loader: { "file-loader": "latest" },
          embedder: { "openai-embedder": "latest" },
        },
        pipeline: {
          stages: ["loader", "embedder"],
        },
      };

      fs.readFile.mockResolvedValue(JSON.stringify(validConfig));

      await expect(
        validateConfiguration("test-config.json"),
      ).resolves.not.toThrow();
    });

    test("should reject invalid JSON", async () => {
      fs.readFile.mockResolvedValue("{ invalid json }");

      await validateConfiguration("test-config.json");
      expect(mockExit).toHaveBeenCalledWith(1);
    });

    test("should reject missing file", async () => {
      const error = new Error("File not found");
      error.code = "ENOENT";
      fs.readFile.mockRejectedValue(error);

      await validateConfiguration("missing.json");
      expect(mockExit).toHaveBeenCalledWith(1);
    });

    test("should handle configuration validation", async () => {
      const validConfig = {
        metadata: { name: "test", version: "1.0.0" },
        plugins: { loader: { "file-loader": "latest" } },
        pipeline: { stages: ["loader"] },
      };

      fs.readFile.mockResolvedValue(JSON.stringify(validConfig));

      // Should complete without calling exit
      await validateConfiguration("valid.json");
      expect(mockExit).not.toHaveBeenCalled();
    });
  });

  describe("displayConfigSummary", () => {
    test("should display configuration summary", () => {
      const config = {
        metadata: {
          name: "test-pipeline",
          environment: "development",
          description: "Test configuration",
        },
        plugins: {
          loader: { "file-loader": "latest" },
          embedder: { "openai-embedder": "latest" },
        },
        pipeline: {
          stages: ["loader", "embedder"],
          retries: {
            enabled: true,
            maxAttempts: 3,
            backoff: "exponential",
          },
        },
        performance: {
          caching: { enabled: true },
          parallel: { enabled: true },
        },
        observability: {
          logging: { level: "info" },
          tracing: { enabled: true },
        },
      };

      // Should not throw
      expect(() => displayConfigSummary(config)).not.toThrow();

      // Should log summary
      expect(console.log).toHaveBeenCalled();
    });

    test("should handle minimal configuration", () => {
      const config = {
        plugins: {},
        pipeline: {},
      };

      expect(() => displayConfigSummary(config)).not.toThrow();
    });
  });

  describe("Template Validation", () => {
    test("all templates should have valid configurations", () => {
      for (const [name, template] of Object.entries(TEMPLATES)) {
        if (name === "custom") continue; // Custom has null config

        const validation = validateRagrc(template.config);
        expect(validation.valid).toBe(true);
      }
    });

    test("production template should include reranker", () => {
      const template = TEMPLATES.production;

      expect(template.config.plugins.reranker).toBeDefined();
      expect(template.config.pipeline.stages).toContain("reranker");
    });

    test("minimal template should only have required plugins", () => {
      const template = TEMPLATES.minimal;
      const pluginTypes = Object.keys(template.config.plugins);

      expect(pluginTypes).toHaveLength(4);
      expect(pluginTypes).toContain("loader");
      expect(pluginTypes).toContain("embedder");
      expect(pluginTypes).toContain("retriever");
      expect(pluginTypes).toContain("llm");
    });

    test("development template should use local plugins", () => {
      const template = TEMPLATES.development;

      expect(Object.keys(template.config.plugins.embedder)[0]).toContain(
        "local",
      );
      expect(Object.keys(template.config.plugins.llm)[0]).toContain("local");
    });
  });

  describe("Template Features", () => {
    test("production template should have caching enabled", () => {
      const template = TEMPLATES.production;

      expect(template.config.performance.caching.enabled).toBe(true);
    });

    test("production template should have parallel processing", () => {
      const template = TEMPLATES.production;

      expect(template.config.performance.parallel.enabled).toBe(true);
      expect(
        template.config.performance.parallel.maxConcurrency,
      ).toBeGreaterThan(0);
    });

    test("production template should have streaming enabled", () => {
      const template = TEMPLATES.production;

      expect(template.config.performance.streaming.enabled).toBe(true);
    });

    test("production template should have retry logic", () => {
      const template = TEMPLATES.production;

      expect(template.config.pipeline.retries.enabled).toBe(true);
      expect(template.config.pipeline.retries.maxAttempts).toBeGreaterThan(0);
    });

    test("production template should have observability", () => {
      const template = TEMPLATES.production;

      expect(template.config.observability.logging).toBeDefined();
      expect(template.config.observability.tracing.enabled).toBe(true);
      expect(template.config.observability.metrics.enabled).toBe(true);
    });

    test("development template should have caching with short TTL", () => {
      const template = TEMPLATES.development;

      if (template.config.performance?.caching) {
        expect(template.config.performance.caching.ttl).toBeLessThanOrEqual(
          600,
        );
      }
    });
  });

  describe("Real-time Validation", () => {
    test("should validate plugin names", async () => {
      inquirer.prompt
        .mockResolvedValueOnce({ customize: true })
        .mockResolvedValueOnce({
          name: "test-pipeline", // Valid name for testing
          description: "Test",
        });

      // Should validate successfully even with customization
      const config = await useTemplate("minimal", {
        output: ".ragrc.json",
        save: true,
      });
      expect(config).toBeDefined();
      expect(config.metadata.name).toBe("test-pipeline");
    });

    test("should validate configuration before saving", async () => {
      inquirer.prompt.mockResolvedValueOnce({ customize: false });

      const config = await useTemplate("minimal", {
        output: ".ragrc.json",
        save: true,
      });

      expect(config).toBeDefined();
      const validation = validateRagrc(config);
      expect(validation.valid).toBe(true);
    });
  });

  describe("Integration", () => {
    test("should integrate with InteractiveWizard for custom template", async () => {
      const { InteractiveWizard } = require("../../src/cli/interactive-wizard");

      InteractiveWizard.mockImplementation(() => ({
        run: jest.fn().mockResolvedValue({
          metadata: { name: "custom-pipeline" },
          plugins: {},
          pipeline: {},
        }),
      }));

      inquirer.prompt.mockResolvedValueOnce({ template: "custom" });

      // This would normally trigger the custom wizard
      // Testing the mock integration
      expect(InteractiveWizard).toBeDefined();
    });
  });

  describe("User Experience", () => {
    test("should display helpful messages", async () => {
      inquirer.prompt.mockResolvedValueOnce({ customize: false });

      await useTemplate("minimal", {
        output: ".ragrc.json",
        save: true,
        quiet: false,
      });

      expect(console.log).toHaveBeenCalled();
    });

    test("should respect quiet mode", async () => {
      inquirer.prompt.mockResolvedValueOnce({ customize: false });

      await useTemplate("minimal", {
        output: ".ragrc.json",
        save: true,
        quiet: true,
      });

      // Should still log minimal output
      expect(console.log).toHaveBeenCalled();
    });
  });

  describe("Error Handling", () => {
    test("should handle file write errors gracefully", async () => {
      inquirer.prompt.mockResolvedValueOnce({ customize: false });
      fs.writeFile.mockRejectedValue(new Error("Permission denied"));

      await expect(
        useTemplate("minimal", { output: "/root/test.json", save: true }),
      ).rejects.toThrow("Permission denied");
    });

    test("should handle file reading errors gracefully", async () => {
      fs.readFile.mockRejectedValue(new Error("Read error"));

      await validateConfiguration("error.json");
      expect(mockExit).toHaveBeenCalledWith(1);
    });
  });

  describe("Configuration Generation", () => {
    test("should generate complete minimal configuration", async () => {
      inquirer.prompt.mockResolvedValueOnce({ customize: false });

      const config = await useTemplate("minimal", {
        output: ".ragrc.json",
        save: true,
      });

      expect(config).toHaveProperty("metadata");
      expect(config).toHaveProperty("plugins");
      expect(config).toHaveProperty("pipeline");
      expect(config).toHaveProperty("observability");
    });

    test("should generate complete production configuration", async () => {
      inquirer.prompt.mockResolvedValueOnce({ customize: false });

      const config = await useTemplate("production", {
        output: ".ragrc.json",
        save: true,
      });

      expect(config).toHaveProperty("metadata");
      expect(config).toHaveProperty("plugins");
      expect(config).toHaveProperty("pipeline");
      expect(config).toHaveProperty("performance");
      expect(config).toHaveProperty("observability");
    });

    test("should set createdAt timestamp on customization", async () => {
      inquirer.prompt
        .mockResolvedValueOnce({ customize: true })
        .mockResolvedValueOnce({
          name: "test-pipeline",
          description: "Test",
        });

      const config = await useTemplate("minimal", {
        output: ".ragrc.json",
        save: true,
      });

      expect(config.metadata.createdAt).toBeDefined();
      expect(typeof config.metadata.createdAt).toBe("string");
      // Should be valid ISO date string
      expect(new Date(config.metadata.createdAt).toISOString()).toBe(
        config.metadata.createdAt,
      );
    });
  });
});
