"use strict";

const { MCPServer } = require("../../../src/mcp/mcp-server");
const { MCPToolBuilder } = require("../../../src/mcp/mcp-tool-builder");

describe("MCPToolBuilder", () => {
  let builder;

  beforeEach(() => {
    builder = new MCPToolBuilder({
      toolName: "test_tool",
      toolDescription: "A test tool",
    });
  });

  describe("buildToolDefinition()", () => {
    test("returns valid schema with name, description, input_schema", () => {
      const def = builder.buildToolDefinition();
      expect(def.name).toBe("test_tool");
      expect(def.description).toBe("A test tool");
      expect(def.input_schema).toBeDefined();
      expect(def.input_schema.type).toBe("object");
      expect(def.input_schema.required).toContain("query");
    });

    test("includes query, topK, stream, citations, evaluate properties", () => {
      const def = builder.buildToolDefinition();
      const props = def.input_schema.properties;
      expect(props.query).toBeDefined();
      expect(props.query.type).toBe("string");
      expect(props.topK).toBeDefined();
      expect(props.topK.type).toBe("number");
      expect(props.stream).toBeDefined();
      expect(props.stream.type).toBe("boolean");
      expect(props.citations).toBeDefined();
      expect(props.citations.type).toBe("boolean");
      expect(props.evaluate).toBeDefined();
      expect(props.evaluate.type).toBe("boolean");
    });

    test("respects capabilities to exclude properties", () => {
      const def = builder.buildToolDefinition({
        capabilities: { stream: false, citations: false, evaluate: false },
      });
      const props = def.input_schema.properties;
      expect(props.stream).toBeUndefined();
      expect(props.citations).toBeUndefined();
      expect(props.evaluate).toBeUndefined();
      // query and topK should always be present
      expect(props.query).toBeDefined();
      expect(props.topK).toBeDefined();
    });

    test("sets maxTopK on topK property when provided", () => {
      const def = builder.buildToolDefinition({
        capabilities: { maxTopK: 20 },
      });
      expect(def.input_schema.properties.topK.maximum).toBe(20);
    });
  });

  describe("buildMultipleTools()", () => {
    test("returns array of tool definitions", () => {
      const defs = builder.buildMultipleTools([
        { name: "tool_a", description: "Tool A" },
        { name: "tool_b", description: "Tool B" },
      ]);
      expect(defs.length).toBe(2);
      expect(defs[0].name).toBe("tool_a");
      expect(defs[1].name).toBe("tool_b");
    });

    test("throws if not given an array", () => {
      expect(() => builder.buildMultipleTools("not-array")).toThrow(TypeError);
    });
  });
});

describe("MCPServer", () => {
  let server;
  let mockPipeline;

  beforeEach(() => {
    mockPipeline = {
      run: jest.fn().mockResolvedValue({
        answer: "The answer is 42",
        results: [{ content: "doc1" }],
      }),
    };
    server = new MCPServer();
  });

  describe("registerPipeline()", () => {
    test("registers pipeline by name", () => {
      server.registerPipeline("my_tool", mockPipeline);
      const defs = server.getToolDefinitions();
      expect(defs.length).toBe(1);
      expect(defs[0].name).toBe("my_tool");
    });

    test("throws for invalid name", () => {
      expect(() => server.registerPipeline("", mockPipeline)).toThrow(
        TypeError,
      );
      expect(() => server.registerPipeline(null, mockPipeline)).toThrow(
        TypeError,
      );
    });

    test("throws for pipeline without run method", () => {
      expect(() => server.registerPipeline("test", {})).toThrow(TypeError);
      expect(() =>
        server.registerPipeline("test", { run: "not-a-function" }),
      ).toThrow(TypeError);
    });
  });

  describe("getToolDefinitions()", () => {
    test("returns array of tool schemas", () => {
      server.registerPipeline("tool1", mockPipeline);
      server.registerPipeline("tool2", mockPipeline);

      const defs = server.getToolDefinitions();
      expect(Array.isArray(defs)).toBe(true);
      expect(defs.length).toBe(2);
      expect(defs[0]).toHaveProperty("name");
      expect(defs[0]).toHaveProperty("input_schema");
    });

    test("returns empty array when no pipelines registered", () => {
      expect(server.getToolDefinitions()).toEqual([]);
    });
  });

  describe("handleToolUse()", () => {
    test("calls pipeline.run with correct params", async () => {
      server.registerPipeline("my_tool", mockPipeline);

      const result = await server.handleToolUse("my_tool", {
        query: "What is the answer?",
        topK: 3,
        citations: true,
      });

      expect(mockPipeline.run).toHaveBeenCalledWith({
        query: "What is the answer?",
        options: { topK: 3, citations: true },
      });
      expect(result.type).toBe("text");
      expect(typeof result.text).toBe("string");
    });

    test("returns formatted result", async () => {
      server.registerPipeline("my_tool", mockPipeline);
      const result = await server.handleToolUse("my_tool", { query: "test" });
      expect(result).toHaveProperty("type", "text");
      expect(result).toHaveProperty("text");
    });

    test("throws for unknown tool name", async () => {
      await expect(
        server.handleToolUse("nonexistent", { query: "test" }),
      ).rejects.toThrow(/Unknown tool/);
    });

    test("throws for missing query parameter", async () => {
      server.registerPipeline("my_tool", mockPipeline);
      await expect(server.handleToolUse("my_tool", {})).rejects.toThrow(
        /query is required/,
      );
    });

    test("throws for empty query string", async () => {
      server.registerPipeline("my_tool", mockPipeline);
      await expect(
        server.handleToolUse("my_tool", { query: "   " }),
      ).rejects.toThrow(/query is required/);
    });

    test("emits tool_use event", async () => {
      const handler = jest.fn();
      server.on("tool_use", handler);
      server.registerPipeline("my_tool", mockPipeline);
      await server.handleToolUse("my_tool", { query: "test" });
      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({
          toolName: "my_tool",
          toolInput: expect.objectContaining({ query: "test" }),
          responseLength: expect.any(Number),
        }),
      );
    });
  });

  describe("fromPipeline()", () => {
    test("factory creates server with single pipeline", () => {
      const server = MCPServer.fromPipeline(mockPipeline, { name: "my_rag" });
      const defs = server.getToolDefinitions();
      expect(defs.length).toBe(1);
      expect(defs[0].name).toBe("my_rag");
    });

    test("defaults tool name to rag_query", () => {
      const server = MCPServer.fromPipeline(mockPipeline);
      const defs = server.getToolDefinitions();
      expect(defs[0].name).toBe("rag_query");
    });
  });
});
