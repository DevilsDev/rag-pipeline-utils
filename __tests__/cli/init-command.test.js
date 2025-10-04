/**
 * Tests for CLI init command to ensure it generates valid configurations
 */

const fs = require("fs/promises");
const path = require("path");
const { validateRagrc } = require("../../src/config/enhanced-ragrc-schema.js");

// Mock the enhanced CLI commands
const { EnhancedCLI } = require("../../src/cli/enhanced-cli-commands.js");

describe("CLI Init Command", () => {
  let tempDir;
  let configPath;

  beforeEach(async () => {
    // Create temporary directory for test configs
    tempDir = path.join(__dirname, "..", "__temp__", `test-${Date.now()}`);
    await fs.mkdir(tempDir, { recursive: true });
    configPath = path.join(tempDir, ".ragrc.json");
  });

  afterEach(async () => {
    // Clean up temporary files
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  describe("createBasicConfig", () => {
    test("should generate valid normalized configuration", async () => {
      const cli = new EnhancedCLI();

      await cli.createBasicConfig(configPath);

      // Verify file was created
      const configExists = await fs
        .access(configPath)
        .then(() => true)
        .catch(() => false);
      expect(configExists).toBe(true);

      // Read and parse the generated config
      const configContent = await fs.readFile(configPath, "utf-8");
      const config = JSON.parse(configContent);

      // Validate the configuration
      const validation = validateRagrc(config);
      expect(validation.valid).toBe(true);
      expect(validation.errors).toBeUndefined();
    });

    test("should generate config with canonical pipeline structure", async () => {
      const cli = new EnhancedCLI();

      await cli.createBasicConfig(configPath);

      const configContent = await fs.readFile(configPath, "utf-8");
      const config = JSON.parse(configContent);

      // Check pipeline structure
      expect(config.pipeline).toBeInstanceOf(Array);
      expect(config.pipeline.length).toBeGreaterThan(0);

      // Verify each pipeline stage has required properties
      config.pipeline.forEach((stage) => {
        expect(stage).toHaveProperty("stage");
        expect(stage).toHaveProperty("name");
        expect(stage).toHaveProperty("version");
        expect(typeof stage.stage).toBe("string");
        expect(typeof stage.name).toBe("string");
        expect(typeof stage.version).toBe("string");
      });
    });

    test("should include default namespace", async () => {
      const cli = new EnhancedCLI();

      await cli.createBasicConfig(configPath);

      const configContent = await fs.readFile(configPath, "utf-8");
      const config = JSON.parse(configContent);

      expect(config.namespace).toBe("default");
    });

    test("should include required metadata", async () => {
      const cli = new EnhancedCLI();

      await cli.createBasicConfig(configPath);

      const configContent = await fs.readFile(configPath, "utf-8");
      const config = JSON.parse(configContent);

      expect(config.metadata).toBeDefined();
      expect(config.metadata.name).toBeDefined();
      expect(config.metadata.version).toBeDefined();
      expect(config.metadata.description).toBeDefined();
      expect(config.metadata.createdAt).toBeDefined();

      // Verify createdAt is a valid ISO date
      expect(() => new Date(config.metadata.createdAt)).not.toThrow();
    });

    test("should include performance and observability sections", async () => {
      const cli = new EnhancedCLI();

      await cli.createBasicConfig(configPath);

      const configContent = await fs.readFile(configPath, "utf-8");
      const config = JSON.parse(configContent);

      // Check performance section
      expect(config.performance).toBeDefined();
      expect(config.performance.parallel).toBeDefined();
      expect(config.performance.caching).toBeDefined();

      // Check observability section
      expect(config.observability).toBeDefined();
      expect(config.observability.logging).toBeDefined();
      expect(config.observability.logging.level).toBe("info");
    });

    test("should generate config that passes schema validation", async () => {
      const cli = new EnhancedCLI();

      await cli.createBasicConfig(configPath);

      const configContent = await fs.readFile(configPath, "utf-8");
      const config = JSON.parse(configContent);

      // Validate against schema
      const validation = validateRagrc(config);

      if (!validation.valid) {
        console.error("Validation errors:", validation.errors);
      }

      expect(validation.valid).toBe(true);
    });

    test("should include standard pipeline stages", async () => {
      const cli = new EnhancedCLI();

      await cli.createBasicConfig(configPath);

      const configContent = await fs.readFile(configPath, "utf-8");
      const config = JSON.parse(configContent);

      const stages = config.pipeline.map((p) => p.stage);
      expect(stages).toContain("loader");
      expect(stages).toContain("embedder");
      expect(stages).toContain("retriever");
      expect(stages).toContain("llm");
    });

    test("should set reasonable default values", async () => {
      const cli = new EnhancedCLI();

      await cli.createBasicConfig(configPath);

      const configContent = await fs.readFile(configPath, "utf-8");
      const config = JSON.parse(configContent);

      // Check default performance settings
      expect(config.performance.parallel.enabled).toBe(false);
      expect(config.performance.parallel.maxConcurrency).toBe(3);
      expect(config.performance.caching.enabled).toBe(false);
      expect(config.performance.caching.maxSize).toBe(1000);
      expect(config.performance.caching.ttl).toBe(3600);

      // Check default observability settings
      expect(config.observability.logging.level).toBe("info");
      expect(config.observability.logging.structured).toBe(true);
    });
  });

  describe("Integration with validation system", () => {
    test("should create config that loads successfully with loadRagConfig", async () => {
      const { loadRagConfig } = require("../../src/config/load-config.js");
      const cli = new EnhancedCLI();

      await cli.createBasicConfig(configPath);

      // Should load without throwing
      expect(async () => {
        const config = loadRagConfig(tempDir);
        expect(config).toBeDefined();
        expect(config.pipeline).toBeInstanceOf(Array);
        expect(config.namespace).toBe("default");
      }).not.toThrow();
    });

    test("should create config that passes doctor validation", async () => {
      const cli = new EnhancedCLI();

      await cli.createBasicConfig(configPath);

      // Simulate doctor validation
      const configContent = await fs.readFile(configPath, "utf-8");
      const config = JSON.parse(configContent);

      const validation = validateRagrc(config);
      expect(validation.valid).toBe(true);

      // Check that normalized config is equivalent to original
      expect(validation.normalized).toEqual(config);
    });
  });

  describe("Error handling", () => {
    test("should handle invalid output path gracefully", async () => {
      const cli = new EnhancedCLI();
      const invalidPath = "/invalid/path/that/does/not/exist/.ragrc.json";

      await expect(cli.createBasicConfig(invalidPath)).rejects.toThrow();
    });
  });
});
