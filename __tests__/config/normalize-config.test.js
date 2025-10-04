/**
 * Tests for config normalization functionality
 * Ensures consistent configuration shape and validation
 */

const { normalizeConfig } = require("../../src/config/normalize-config.js");
const { validateRagrc } = require("../../src/config/enhanced-ragrc-schema.js");

describe("Config Normalization", () => {
  describe("normalizeConfig", () => {
    test("should normalize pipeline from object to array", () => {
      const config = {
        pipeline: {
          loader: { name: "file-loader" },
          embedder: { name: "openai-embedder" },
        },
      };

      const normalized = normalizeConfig(config);

      expect(normalized.pipeline).toBeInstanceOf(Array);
      expect(normalized.pipeline).toHaveLength(2);
      expect(normalized.pipeline[0]).toEqual({
        stage: "loader",
        name: "file-loader",
      });
      expect(normalized.pipeline[1]).toEqual({
        stage: "embedder",
        name: "openai-embedder",
      });
    });

    test("should preserve pipeline when already an array", () => {
      const config = {
        pipeline: [
          { stage: "loader", name: "file-loader" },
          { stage: "embedder", name: "openai-embedder" },
        ],
      };

      const normalized = normalizeConfig(config);

      expect(normalized.pipeline).toEqual(config.pipeline);
    });

    test("should add default namespace when missing", () => {
      const config = {
        pipeline: [{ stage: "loader", name: "file-loader" }],
      };

      const normalized = normalizeConfig(config);

      expect(normalized.namespace).toBe("default");
    });

    test("should preserve existing namespace", () => {
      const config = {
        namespace: "custom",
        pipeline: [{ stage: "loader", name: "file-loader" }],
      };

      const normalized = normalizeConfig(config);

      expect(normalized.namespace).toBe("custom");
    });

    test("should strip unknown top-level keys", () => {
      const config = {
        pipeline: [{ stage: "loader", name: "file-loader" }],
        unknownKey: "should be removed",
        anotherUnknown: { nested: "object" },
      };

      const normalized = normalizeConfig(config);

      expect(normalized.unknownKey).toBeUndefined();
      expect(normalized.anotherUnknown).toBeUndefined();
      expect(normalized.pipeline).toBeDefined();
    });

    test("should handle legacy format conversion", () => {
      const legacyConfig = {
        plugins: {
          loader: "file-loader",
          embedder: "openai-embedder",
        },
      };

      const normalized = normalizeConfig(legacyConfig);

      expect(normalized.pipeline).toBeInstanceOf(Array);
      expect(normalized.pipeline).toHaveLength(2);
      expect(
        normalized.pipeline.find((p) => p.stage === "loader"),
      ).toBeDefined();
      expect(
        normalized.pipeline.find((p) => p.stage === "embedder"),
      ).toBeDefined();
    });

    test("should throw error for null or undefined config", () => {
      expect(() => normalizeConfig(null)).toThrow(
        "Configuration must be a non-null object",
      );
      expect(() => normalizeConfig(undefined)).toThrow(
        "Configuration must be a non-null object",
      );
    });

    test("should throw error for non-object config", () => {
      expect(() => normalizeConfig("string")).toThrow(
        "Configuration must be a non-null object",
      );
      expect(() => normalizeConfig(123)).toThrow(
        "Configuration must be a non-null object",
      );
      expect(() => normalizeConfig([])).toThrow(
        "Configuration must be a non-null object",
      );
    });

    test("should preserve valid configuration properties", () => {
      const config = {
        pipeline: [{ stage: "loader", name: "file-loader" }],
        metadata: { name: "test-project" },
        performance: { parallel: { enabled: true } },
        observability: { logging: { level: "info" } },
      };

      const normalized = normalizeConfig(config);

      expect(normalized.metadata).toEqual(config.metadata);
      expect(normalized.performance).toEqual(config.performance);
      expect(normalized.observability).toEqual(config.observability);
    });

    test("should handle complex pipeline configurations", () => {
      const config = {
        pipeline: {
          loader: {
            name: "file-loader",
            config: { path: "./docs" },
          },
          embedder: {
            name: "openai-embedder",
            config: { model: "text-embedding-ada-002" },
          },
          retriever: {
            name: "vector-retriever",
            config: { topK: 5 },
          },
        },
      };

      const normalized = normalizeConfig(config);

      expect(normalized.pipeline).toHaveLength(3);
      expect(normalized.pipeline[0]).toEqual({
        stage: "loader",
        name: "file-loader",
        config: { path: "./docs" },
      });
      expect(normalized.pipeline[1]).toEqual({
        stage: "embedder",
        name: "openai-embedder",
        config: { model: "text-embedding-ada-002" },
      });
      expect(normalized.pipeline[2]).toEqual({
        stage: "retriever",
        name: "vector-retriever",
        config: { topK: 5 },
      });
    });
  });

  describe("Integrated validation with normalization", () => {
    test("should validate and normalize in single call", () => {
      const config = {
        pipeline: {
          loader: { name: "file-loader" },
          embedder: { name: "openai-embedder" },
        },
        metadata: {
          name: "test-project",
          version: "1.0.0",
        },
      };

      const result = validateRagrc(config);

      expect(result.valid).toBe(true);
      expect(result.normalized).toBeDefined();
      expect(result.normalized.pipeline).toBeInstanceOf(Array);
      expect(result.normalized.namespace).toBe("default");
    });

    test("should return validation errors for invalid normalized config", () => {
      const config = {
        pipeline: {
          loader: { name: 123 }, // Invalid: name should be string
        },
      };

      const result = validateRagrc(config);

      expect(result.valid).toBe(false);
      expect(result.errors).toBeDefined();
      expect(result.normalized).toBeDefined(); // Still returns normalized version
    });

    test("should handle normalization errors gracefully", () => {
      const result = validateRagrc(null);

      expect(result.valid).toBe(false);
      expect(result.errors).toBeDefined();
      expect(result.errors[0].message).toContain(
        "Configuration must be a non-null object",
      );
    });

    test("should validate complex normalized configurations", () => {
      const config = {
        pipeline: {
          loader: {
            name: "file-loader",
            version: "1.0.0",
            config: { path: "./docs" },
          },
          embedder: {
            name: "openai-embedder",
            version: "2.0.0",
            config: {
              model: "text-embedding-ada-002",
              apiKey: "${OPENAI_API_KEY}",
            },
          },
        },
        metadata: {
          name: "test-rag-pipeline",
          version: "1.0.0",
          description: "Test RAG pipeline configuration",
        },
        performance: {
          parallel: {
            enabled: true,
            maxConcurrency: 3,
          },
          caching: {
            enabled: true,
            maxSize: 1000,
            ttl: 3600,
          },
        },
        observability: {
          logging: {
            level: "info",
            structured: true,
          },
          metrics: {
            enabled: true,
            interval: 60000,
          },
        },
      };

      const result = validateRagrc(config);

      expect(result.valid).toBe(true);
      expect(result.normalized.pipeline).toHaveLength(2);
      expect(result.normalized.namespace).toBe("default");
      expect(result.normalized.metadata.name).toBe("test-rag-pipeline");
    });
  });

  describe("Edge cases and error handling", () => {
    test("should handle empty pipeline object", () => {
      const config = {
        pipeline: {},
      };

      const normalized = normalizeConfig(config);

      expect(normalized.pipeline).toEqual([]);
    });

    test("should handle empty pipeline array", () => {
      const config = {
        pipeline: [],
      };

      const normalized = normalizeConfig(config);

      expect(normalized.pipeline).toEqual([]);
    });

    test("should handle missing pipeline property", () => {
      const config = {
        metadata: { name: "test" },
      };

      const normalized = normalizeConfig(config);

      expect(normalized.pipeline).toEqual([]);
      expect(normalized.namespace).toBe("default");
    });

    test("should preserve nested configuration objects", () => {
      const config = {
        pipeline: [{ stage: "loader", name: "file-loader" }],
        performance: {
          parallel: {
            enabled: true,
            maxConcurrency: 5,
            batchSize: 10,
          },
          streaming: {
            enabled: false,
            bufferSize: 1000,
          },
        },
      };

      const normalized = normalizeConfig(config);

      expect(normalized.performance).toEqual(config.performance);
    });

    test("should handle mixed valid and invalid keys", () => {
      const config = {
        pipeline: [{ stage: "loader", name: "file-loader" }],
        metadata: { name: "valid" },
        invalidKey1: "remove me",
        performance: { parallel: { enabled: true } },
        invalidKey2: { nested: "also remove" },
        observability: { logging: { level: "debug" } },
      };

      const normalized = normalizeConfig(config);

      expect(normalized.pipeline).toBeDefined();
      expect(normalized.metadata).toBeDefined();
      expect(normalized.performance).toBeDefined();
      expect(normalized.observability).toBeDefined();
      expect(normalized.invalidKey1).toBeUndefined();
      expect(normalized.invalidKey2).toBeUndefined();
    });
  });
});
