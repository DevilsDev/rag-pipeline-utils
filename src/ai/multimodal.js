/**
 * Multi-Modal Processor
 * Handles processing of multiple content types (text, images, audio)
 * Extracted from ai/index.js per CLAUDE.md decomposition requirements
 */

"use strict";

// Import the existing multimodal processing implementation
const multiModalProcessor = require("./multimodal-processing");

/**
 * MultiModalProcessor class
 * Processes and integrates multiple content modalities
 */
class MultiModalProcessor {
  constructor() {
    this.supportedTypes = new Set(["text", "image", "audio", "video"]);
    this.processors = new Map();
    this.embeddings = new Map();
  }

  /**
   * Process multimodal content
   * @param {string} tenantId - Tenant identifier
   * @param {Array} content - Array of content objects with type and data
   * @param {object} options - Processing options
   * @returns {Promise<object>} Processing results
   */
  async processContent(tenantId, content, options = {}) {
    return await multiModalProcessor.processContent(tenantId, content, options);
  }

  /**
   * Generate embeddings for multimodal content
   * @param {string} tenantId - Tenant identifier
   * @param {object} content - Content to embed
   * @returns {Promise<Array>} Generated embeddings
   */
  async generateEmbeddings(tenantId, content) {
    return await multiModalProcessor.generateEmbeddings(tenantId, content);
  }

  /**
   * Align embeddings across modalities
   * @param {string} tenantId - Tenant identifier
   * @param {Array} embeddings - Multi-modal embeddings
   * @returns {Promise<Array>} Aligned embeddings
   */
  async alignEmbeddings(tenantId, embeddings) {
    return await multiModalProcessor.alignEmbeddings(tenantId, embeddings);
  }

  /**
   * Perform cross-modal search
   * @param {string} tenantId - Tenant identifier
   * @param {object} query - Query object with modality
   * @param {object} options - Search options
   * @returns {Promise<Array>} Search results
   */
  async crossModalSearch(tenantId, query, options = {}) {
    return await multiModalProcessor.crossModalSearch(tenantId, query, options);
  }
}

// Create and export singleton instance
const processor = new MultiModalProcessor();

module.exports = processor;
module.exports.MultiModalProcessor = MultiModalProcessor;
module.exports.default = module.exports;
