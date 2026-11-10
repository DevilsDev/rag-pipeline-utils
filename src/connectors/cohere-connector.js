'use strict';

// axios loads on first use, so importing the package does not pay for it
// (about 125 ms) unless this connector is constructed.
const loadAxios = () => require('axios'); // eslint-disable-line global-require
const { componentCacheKey } = require('../cache/component-keys');
const { BaseConnector } = require('./base-connector');
const {
  cleanAxiosErrors,
  missingApiKeyError,
  resolveApiKey,
  throwIfAborted,
  withKeyId,
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
   * Cache identity for createRagPipeline({ cache }).
   * @param {'embedder'} role
   * @returns {string|null}
   */
  getCacheKey(role) {
    if (role !== 'embedder') return null;
    const c = this.config;
    return componentCacheKey(
      'cohere-embed',
      withKeyId({
      baseURL: c.baseURL,
      model: c.embeddingModel,
      queryInputType: c.queryInputType,
    }, c.apiKey),
    );
  }

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
    this.client = loadAxios().create({
      baseURL: this.config.baseURL,
      headers: {
        Authorization: `Bearer ${this.config.apiKey}`,
        'Content-Type': 'application/json',
      },
    });
    // Errors must not carry the request config (and the API key) to callers
    cleanAxiosErrors(this.client, 'Cohere');
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
    return firstEmbedding(data);
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
    return firstEmbedding(data);
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

    if (!data || !Array.isArray(data.results)) {
      throw new Error('Cohere rerank returned no results');
    }
    return data.results.map((result) => {
      const doc = documents[result.index];
      // Strings become { content }; spreading a string would give a map of characters
      const base = typeof doc === 'string' ? { content: doc } : { ...doc };
      return { ...base, relevanceScore: result.relevance_score };
    });
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

/**
 * @param {object} data - Cohere /embed response body
 * @returns {number[]}
 */
function firstEmbedding(data) {
  const vector = data && Array.isArray(data.embeddings) && data.embeddings[0];
  if (!vector) {
    throw new Error('Cohere embed returned no embeddings');
  }
  return vector;
}

module.exports = { CohereConnector, DEFAULT_CONFIG };
