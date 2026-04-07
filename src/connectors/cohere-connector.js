"use strict";

const axios = require("axios");
const { BaseConnector } = require("./base-connector");

/**
 * Default configuration for the Cohere connector.
 * @type {Object}
 */
const DEFAULT_CONFIG = {
  apiKey: process.env.COHERE_API_KEY || "",
  baseURL: "https://api.cohere.ai/v1",
  embeddingModel: "embed-english-v3.0",
  rerankModel: "rerank-english-v3.0",
  inputType: "search_document",
  queryInputType: "search_query",
};

/**
 * Embedder + reranker connector for the Cohere API.
 * Provides text embeddings (with separate document/query input types) and
 * document reranking capabilities.
 *
 * @extends BaseConnector
 */
class CohereConnector extends BaseConnector {
  /**
   * @param {Object} [options]
   * @param {string} [options.apiKey] - Cohere API key
   * @param {string} [options.baseURL='https://api.cohere.ai/v1'] - API base URL
   * @param {string} [options.embeddingModel='embed-english-v3.0'] - Embedding model
   * @param {string} [options.rerankModel='rerank-english-v3.0'] - Reranking model
   * @param {string} [options.inputType='search_document'] - Input type for document embeddings
   * @param {string} [options.queryInputType='search_query'] - Input type for query embeddings
   */
  constructor(options = {}) {
    super({ name: "cohere", ...options });
    this.config = { ...DEFAULT_CONFIG, ...options };
    this.client = axios.create({
      baseURL: this.config.baseURL,
      headers: {
        Authorization: `Bearer ${this.config.apiKey}`,
        "Content-Type": "application/json",
      },
    });
  }

  /**
   * Connect to Cohere. Verifies the API key is present.
   * @returns {Promise<void>}
   * @throws {Error} If no API key is configured
   */
  async connect() {
    if (!this.config.apiKey) {
      throw new Error(
        "Cohere API key required. Set COHERE_API_KEY or pass apiKey option.",
      );
    }
    await super.connect();
  }

  /**
   * Generate an embedding vector for document text.
   * Uses the document input type by default.
   *
   * @param {string} text - Input text to embed
   * @returns {Promise<number[]>} Embedding vector
   */
  async embed(text) {
    return this.withRetry(async () => {
      const response = await this.client.post("/embed", {
        texts: [text],
        model: this.config.embeddingModel,
        input_type: this.config.inputType,
      });

      return response.data.embeddings[0];
    });
  }

  /**
   * Generate an embedding vector for a search query.
   * Uses the query input type for better retrieval accuracy.
   *
   * @param {string} query - Query text to embed
   * @returns {Promise<number[]>} Embedding vector
   */
  async embedQuery(query) {
    return this.withRetry(async () => {
      const response = await this.client.post("/embed", {
        texts: [query],
        model: this.config.embeddingModel,
        input_type: this.config.queryInputType,
      });

      return response.data.embeddings[0];
    });
  }

  /**
   * Rerank documents by relevance to a query using Cohere's reranker.
   *
   * @param {string} query - The search query
   * @param {Array<Object|string>} documents - Documents to rerank
   * @param {Object} [options={}]
   * @param {number} [options.topK] - Number of top results to return (defaults to all)
   * @returns {Promise<Array<Object>>} Reranked documents with relevance scores
   */
  async rerank(query, documents, options = {}) {
    return this.withRetry(async () => {
      const docs = documents.map(
        (doc) => doc.content || doc.text || String(doc),
      );

      const response = await this.client.post("/rerank", {
        model: this.config.rerankModel,
        query,
        documents: docs,
        top_n: options.topK || documents.length,
      });

      return response.data.results.map((result) => ({
        ...documents[result.index],
        score: result.relevance_score,
      }));
    });
  }

  /**
   * Check connector health by performing a lightweight embed call.
   * @returns {Promise<boolean>}
   */
  async isHealthy() {
    try {
      await this.embed("health check");
      return true;
    } catch {
      return false;
    }
  }
}

module.exports = { CohereConnector, DEFAULT_CONFIG };
