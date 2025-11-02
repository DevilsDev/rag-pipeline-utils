/**
 * Version: 1.1.0
 * Description: Schema validation tests for .ragrc.json using AJV and external fixtures
 * Author: Ali Kahwaji
 * File: __tests__/unit/config/validate-schema.test.js
 */

const { readFileSync } = require("fs");
const { resolve } = require("path");
const {
  validateRagrcSchema,
  validatePluginSchema,
} = require("../../../src/config/validate-schema.js");

const readFixture = (name) => {
  const filePath = resolve(
    "__tests__/fixtures",
    name.replace(".ragrc", "-ragrc"),
  );
  return JSON.parse(readFileSync(filePath, "utf-8"));
};

describe("validateRagrcSchema", () => {
  test("passes with valid structured plugin schema", () => {
    const config = readFixture("valid-ragrc.json");
    const result = validateRagrcSchema(config);
    expect(result.valid).toBe(true);
    expect(result.errors).toBeUndefined(); // updated: null => undefined
  });

  test("fails with missing pipeline", () => {
    const config = {
      loader: { pdf: "./src/mocks/pdf-loader.js" },
      namespace: "no-pipeline",
    };
    const result = validateRagrcSchema(config);
    expect(result.valid).toBe(false);
    expect(result.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          keyword: "required",
          params: expect.objectContaining({ missingProperty: "pipeline" }),
        }),
      ]),
    );
  });

  test("fails with non-object plugin sections", () => {
    const config = {
      loader: "./src/invalid.js", // should be object
      embedder: { openai: "./src/mocks/openai-embedder.js" },
      retriever: { pinecone: "./src/mocks/pinecone-retriever.js" },
      llm: { openai: "./src/mocks/openai-llm.js" },
      pipeline: ["loader"],
      namespace: "invalid-section",
    };
    const result = validateRagrcSchema(config);
    expect(result.valid).toBe(false);
    expect(result.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ instancePath: "/loader" }),
      ]),
    );
  });

  test("fails with non-string namespace", () => {
    const config = {
      loader: { pdf: "./src/mocks/pdf-loader.js" },
      embedder: { openai: "./src/mocks/openai-embedder.js" },
      retriever: { pinecone: "./src/mocks/pinecone-retriever.js" },
      llm: { openai: "./src/mocks/openai-llm.js" },
      pipeline: ["loader"],
      namespace: 12345,
    };
    const result = validateRagrcSchema(config);
    expect(result.valid).toBe(false);
    expect(result.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ instancePath: "/namespace" }),
      ]),
    );
  });
});

describe("validatePluginSchema (subset)", () => {
  test("passes with plugin-only valid structure", () => {
    const config = {
      loader: { pdf: "./src/mocks/pdf-loader.js" },
      embedder: { openai: "./src/mocks/openai-embedder.js" },
      retriever: { pinecone: "./src/mocks/pinecone-retriever.js" },
      llm: { openai: "./src/mocks/openai-llm.js" },
    };
    const result = validatePluginSchema(config);
    expect(result.valid).toBe(true);
  });

  test("fails when plugin section is missing", () => {
    const config = {
      embedder: { openai: "./mock.js" },
      retriever: { pinecone: "./mock.js" },
      llm: { openai: "./mock.js" },
    };
    const result = validatePluginSchema(config);
    expect(result.valid).toBe(false);
    expect(result.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          instancePath: "",
          message: expect.stringContaining("must have required property"),
        }),
      ]),
    );
  });

  test("fails when plugin paths are not strings", () => {
    const config = {
      loader: { pdf: 12345 },
      embedder: { openai: "./mock.js" },
      retriever: { pinecone: "./mock.js" },
      llm: { openai: "./mock.js" },
    };
    const result = validatePluginSchema(config);
    expect(result.valid).toBe(false);
    expect(result.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ instancePath: "/loader/pdf" }),
      ]),
    );
  });
});
