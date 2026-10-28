'use strict';

const axios = require('axios');
const { BaseConnector } = require('./base-connector');
const {
  missingApiKeyError,
  resolveApiKey,
  throwIfAborted,
} = require('./connector-utils');

const API_KEY_ENV = 'COHERE_API_KEY';

/**
 * Default configuration for the Cohere connector.
 * `apiKey` is a getter so the environment is read when a connector is
 * constructed, not when this module is first required.
 * @type {Object}
 */
const DEFAULT_CONFIG = {
  get apiKey() {
    return process.env[API_KEY_ENV] || '';
  },
  baseURL: 'https://api.cohere.ai/v1',
  embeddingModel: 'embed-english-v3.0',
  rerankModel: 'rerank-english-v3.0',
  inputType: 'search_document',
  queryInputType: 'search_query',
  maxRetries: 3,
  retryDelay: 1000,
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
    super({ name: 'cohere', ...options });
    this.config = {
      ...DEFAULT_CONFIG,
      ...options,
      apiKey: resolveApiKey(options, API_KEY_ENV),
    };
    this.client = axios.create({
      baseURL: this.config.baseURL,
      headers: {
        Authorization: `Bearer ${this.config.apiKey}`,
        'Content-Type': 'application/json',
      },
    });
  }

  /**
   * @throws {Error} code MISSING_API_KEY when no key is configured
   * @private
   */
  _requireApiKey() {
    if (!this.config.apiKey) {
      throw missingApiKeyError('Cohere', API_KEY_ENV);
    }
  }

  /**
   * Connect to Cohere. Verifies the API key is present.
   * @returns {Promise<void>}
   * @throws {Error} If no API key is configured
   */
  async connect() {
    this._requireApiKey();
    await super.connect();
  }

  /**
   * POST with the connector's retry policy and cancellation.
   * @param {string} path
   * @param {object} body
   * @param {AbortSignal} [signal]
   * @returns {Promise<object>} Response data
   * @private
   */
  async _post(path, body, signal) {
    throwIfAborted(signal);
    this._requireApiKey();
    return this.withRetry(
      async () => {
        const response = await this.client.post(
          path,
          body,
          signal ? { signal } : undefined,
        );
        return response.data;
      },
      this.config.maxRetries,
      this.config.retryDelay,
      { signal },
    );
  }

  /**
   * Generate an embedding vector for document text.
   * Uses the document input type by default.
   *
   * @param {string} text - Input text to embed
   * @param {Object} [options={}]
   * @param {AbortSignal} [options.signal] - Cancels the request
   * @returns {Promise<number[]>} Embedding vector
   */
  async embed(text, options = {}) {
    const data = await this._post(
      '/embed',
      {
        texts: [text],
        model: this.config.embeddingModel,
        input_type: this.config.inputType,
      },
      options.signal,
    );
    return data.embeddings[0];
  }

  /**
   * Generate an embedding vector for a search query.
   * Uses the query input type for better retrieval accuracy.
   *
   * @param {string} query - Query text to embed
   * @param {Object} [options={}]
   * @param {AbortSignal} [options.signal] - Cancels the request
   * @returns {Promise<number[]>} Embedding vector
   */
  async embedQuery(query, options = {}) {
    const data = await this._post(
      '/embed',
      {
        texts: [query],
        model: this.config.embeddingModel,
        input_type: this.config.queryInputType,
      },
      options.signal,
    );
    return data.embeddings[0];
  }

  /**
   * Rerank documents by relevance to a query using Cohere's reranker.
   *
   * @param {string} query - The search query
   * @param {Array<Object|string>} documents - Documents to rerank
   * @param {Object} [options={}]
   * @param {number} [options.topK] - Number of top results to return (defaults to all)
   * @param {AbortSignal} [options.signal] - Cancels the request
   * @returns {Promise<Array<Object>>} Reranked documents with relevance scores
   */
  async rerank(query, documents, options = {}) {
    const docs = documents.map((doc) => doc.content || doc.text || String(doc));

    const data = await this._post(
      '/rerank',
      {
        model: this.config.rerankModel,
        query,
        documents: docs,
        top_n: options.topK || documents.length,
      },
      options.signal,
    );

    return data.results.map((result) => ({
      ...documents[result.index],
      score: result.relevance_score,
    }));
  }

  /**
   * Check connector health by performing a lightweight embed call.
   * @returns {Promise<boolean>}
   */
  async isHealthy() {
    try {
      await this.embed('health check');
      return true;
    } catch {
      return false;
    }
  }
}

module.exports = { CohereConnector, DEFAULT_CONFIG };
