"use strict";

/**
 * @module mcp/mcp-server
 * @description Wraps a RAG pipeline as an MCP-compatible tool handler.
 */

const { EventEmitter } = require("events");
const { MCPToolBuilder } = require("./mcp-tool-builder");

/** @type {Object} Default configuration for the MCP server */
const DEFAULT_CONFIG = {
  includeMetadata: true,
  maxResponseLength: 50000,
};

/**
 * MCP server that registers RAG pipelines as callable MCP tools.
 *
 * @extends EventEmitter
 * @fires MCPServer#tool_use
 *
 * @example
 * const server = MCPServer.fromPipeline(myPipeline, { name: 'my_tool' });
 * const tools = server.getToolDefinitions();
 * const result = await server.handleToolUse('my_tool', { query: 'What is X?' });
 */
class MCPServer extends EventEmitter {
  /**
   * @param {Object} [options={}] - Server configuration
   * @param {boolean} [options.includeMetadata] - Include metadata in responses
   * @param {number} [options.maxResponseLength] - Maximum response text length
   * @param {Object} [options.toolOptions] - Options forwarded to MCPToolBuilder
   */
  constructor(options = {}) {
    super();
    this.config = { ...DEFAULT_CONFIG, ...options };
    this.toolBuilder = new MCPToolBuilder(options.toolOptions);
    /** @type {Map<string, {pipeline: Object, config: Object, toolDefinition: Object}>} */
    this.pipelines = new Map();
  }

  /**
   * Register a pipeline that can be called as an MCP tool.
   *
   * @param {string} name - Tool name used to invoke this pipeline
   * @param {Object} pipeline - Pipeline instance with a `run` method
   * @param {Object} [config={}] - Pipeline-specific configuration
   * @returns {void}
   */
  registerPipeline(name, pipeline, config = {}) {
    if (!name || typeof name !== "string") {
      throw new TypeError("Pipeline name must be a non-empty string");
    }
    if (!pipeline || typeof pipeline.run !== "function") {
      throw new TypeError("Pipeline must have a run() method");
    }

    const builder = new MCPToolBuilder({
      toolName: name,
      toolDescription:
        config.description || this.toolBuilder.config.toolDescription,
    });

    const toolDefinition = builder.buildToolDefinition(config);

    this.pipelines.set(name, { pipeline, config, toolDefinition });
  }

  /**
   * Return array of all registered tool definitions.
   * Each is a valid MCP tool schema.
   *
   * @returns {Array<Object>} Array of MCP tool definition objects
   */
  getToolDefinitions() {
    return Array.from(this.pipelines.values()).map(
      (entry) => entry.toolDefinition,
    );
  }

  /**
   * Handle an MCP tool_use request by running the matching pipeline.
   *
   * @param {string} toolName - Name of the tool to invoke
   * @param {Object} toolInput - Tool input parameters
   * @param {string} toolInput.query - The search query (required)
   * @param {number} [toolInput.topK] - Number of results to retrieve
   * @param {boolean} [toolInput.stream] - Enable streaming response
   * @param {boolean} [toolInput.citations] - Include source citations
   * @param {boolean} [toolInput.evaluate] - Include quality evaluation metrics
   * @returns {Promise<Object>} MCP-formatted response with type and text fields
   * @throws {Error} If tool name is not registered or query is missing
   */
  async handleToolUse(toolName, toolInput) {
    const entry = this.pipelines.get(toolName);
    if (!entry) {
      throw new Error(`Unknown tool: ${toolName}`);
    }

    if (
      !toolInput ||
      typeof toolInput.query !== "string" ||
      !toolInput.query.trim()
    ) {
      throw new Error(
        "toolInput.query is required and must be a non-empty string",
      );
    }

    const { pipeline } = entry;
    const options = {};

    if (typeof toolInput.topK === "number") {
      options.topK = toolInput.topK;
    }
    if (typeof toolInput.stream === "boolean") {
      options.stream = toolInput.stream;
    }
    if (typeof toolInput.citations === "boolean") {
      options.citations = toolInput.citations;
    }
    if (typeof toolInput.evaluate === "boolean") {
      options.evaluate = toolInput.evaluate;
    }

    const result = await pipeline.run({
      query: toolInput.query,
      options,
    });

    const hasExtras = result.citations || result.evaluation;
    let responseText;

    if (hasExtras && this.config.includeMetadata) {
      const payload = { answer: result.answer || result.results };
      if (result.citations) {
        payload.citations = result.citations;
      }
      if (result.evaluation) {
        payload.evaluation = result.evaluation;
      }
      responseText = JSON.stringify(payload);
    } else {
      responseText =
        typeof result.answer === "string"
          ? result.answer
          : JSON.stringify(result);
    }

    if (
      this.config.maxResponseLength &&
      responseText.length > this.config.maxResponseLength
    ) {
      responseText = responseText.slice(0, this.config.maxResponseLength);
    }

    const response = {
      type: "text",
      text: responseText,
    };

    /**
     * @event MCPServer#tool_use
     * @type {Object}
     * @property {string} toolName - Name of the tool that was invoked
     * @property {Object} toolInput - Original input parameters
     * @property {number} responseLength - Length of the response text
     */
    this.emit("tool_use", {
      toolName,
      toolInput,
      responseLength: responseText.length,
    });

    return response;
  }

  /**
   * Convenience factory: create an MCPServer with a single pipeline registered.
   *
   * @param {Object} pipeline - Pipeline instance with a `run` method
   * @param {Object} [options={}] - Server and registration options
   * @param {string} [options.name='rag_query'] - Tool name for the pipeline
   * @param {Object} [options.config] - Pipeline-specific configuration
   * @returns {MCPServer} Configured server instance
   */
  static fromPipeline(pipeline, options = {}) {
    const server = new MCPServer(options);
    server.registerPipeline(
      options.name || "rag_query",
      pipeline,
      options.config || {},
    );
    return server;
  }
}

module.exports = { MCPServer, DEFAULT_CONFIG };
