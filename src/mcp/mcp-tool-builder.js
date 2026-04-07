'use strict';

/**
 * @module mcp/mcp-tool-builder
 * @description Builds MCP tool definitions from pipeline configuration.
 */

/** @type {Object} Default configuration for the MCP tool builder */
const DEFAULT_CONFIG = {
  toolName: 'rag_pipeline_query',
  toolDescription: 'Query a RAG pipeline with natural language',
};

/**
 * Builds MCP-compatible tool definitions from RAG pipeline configuration.
 *
 * @example
 * const builder = new MCPToolBuilder({ toolName: 'my_rag_tool' });
 * const definition = builder.buildToolDefinition({ capabilities: { stream: true } });
 */
class MCPToolBuilder {
  /**
   * @param {Object} [options={}] - Builder configuration
   * @param {string} [options.toolName] - Name for the generated MCP tool
   * @param {string} [options.toolDescription] - Description for the generated MCP tool
   */
  constructor(options = {}) {
    this.config = { ...DEFAULT_CONFIG, ...options };
  }

  /**
   * Generate an MCP-compatible tool definition from pipeline configuration.
   *
   * @param {Object} [pipelineConfig={}] - Pipeline-specific configuration
   * @param {Object} [pipelineConfig.capabilities] - Pipeline capabilities to reflect in schema
   * @param {boolean} [pipelineConfig.capabilities.stream] - Whether streaming is supported
   * @param {boolean} [pipelineConfig.capabilities.citations] - Whether citations are supported
   * @param {boolean} [pipelineConfig.capabilities.evaluate] - Whether evaluation is supported
   * @param {number} [pipelineConfig.capabilities.maxTopK] - Maximum allowed topK value
   * @returns {Object} MCP tool definition with name, description, and input_schema
   */
  buildToolDefinition(pipelineConfig = {}) {
    const capabilities = pipelineConfig.capabilities || {};

    const properties = {
      query: {
        type: 'string',
        description: 'The search query or question',
      },
      topK: {
        type: 'number',
        description: 'Number of results to retrieve',
        default: 5,
      },
    };

    if (typeof capabilities.maxTopK === 'number') {
      properties.topK.maximum = capabilities.maxTopK;
    }

    if (capabilities.stream !== false) {
      properties.stream = {
        type: 'boolean',
        description: 'Enable streaming response',
        default: false,
      };
    }

    if (capabilities.citations !== false) {
      properties.citations = {
        type: 'boolean',
        description: 'Include source citations',
        default: false,
      };
    }

    if (capabilities.evaluate !== false) {
      properties.evaluate = {
        type: 'boolean',
        description: 'Include quality evaluation metrics',
        default: false,
      };
    }

    return {
      name: this.config.toolName,
      description: this.config.toolDescription,
      input_schema: {
        type: 'object',
        properties,
        required: ['query'],
      },
    };
  }

  /**
   * Build tool definitions for multiple named pipelines.
   *
   * @param {Array<Object>} pipelines - Array of pipeline descriptors
   * @param {string} pipelines[].name - Tool name for this pipeline
   * @param {string} [pipelines[].description] - Tool description
   * @param {Object} [pipelines[].pipeline] - Pipeline instance (unused during definition building)
   * @param {Object} [pipelines[].config] - Pipeline configuration passed to buildToolDefinition
   * @returns {Array<Object>} Array of MCP tool definitions
   */
  buildMultipleTools(pipelines) {
    if (!Array.isArray(pipelines)) {
      throw new TypeError('pipelines must be an array');
    }

    return pipelines.map((entry) => {
      const builder = new MCPToolBuilder({
        toolName: entry.name,
        toolDescription: entry.description || this.config.toolDescription,
      });
      return builder.buildToolDefinition(entry.config || {});
    });
  }
}

module.exports = { MCPToolBuilder, DEFAULT_CONFIG };
