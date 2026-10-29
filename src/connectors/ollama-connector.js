'use strict';

// axios loads on first use, so importing the package does not pay for it
// (about 125 ms) unless this connector is constructed.
const loadAxios = () => require('axios'); // eslint-disable-line global-require
const { BaseConnector } = require('./base-connector');
const {
  raceAbort,
  signalOptions,
  throwIfAborted,
} = require('./connector-utils');
const { buildRagPrompt } = require('./rag-prompt');
const { componentCacheKey } = require('../cache/component-keys');

/**
 * Default configuration for the Ollama connector.
 * @type {Object}
 */
const DEFAULT_CONFIG = {
  baseURL: 'http://localhost:11434',
  model: 'llama3',
  embeddingModel: 'nomic-embed-text',
  timeout: 60000,
  temperature: 0.7,
  maxRetries: 3,
  retryDelay: 1000,
};

/**
 * Connector for Ollama local LLM server.
 * Supports text generation (sync and streaming) and embeddings.
 * Ollama needs no API key.
 * @extends BaseConnector
 */
class OllamaConnector extends BaseConnector {
  /**
   * Cache identity for createRagPipeline({ cache }).
   * @param {'embedder'|'llm'} role
   * @returns {string|null}
   */
  getCacheKey(role) {
    const c = this.config;
    if (role === 'embedder') {
      return componentCacheKey('ollama-embed', {
        baseURL: c.baseURL,
        model: c.embeddingModel,
      });
    }
    if (role === 'llm') {
      return componentCacheKey('ollama', {
        baseURL: c.baseURL,
        model: c.model,
        temperature: c.temperature,
        systemPrompt: c.systemPrompt,
      });
    }
    return null;
  }

  /**
   * @param {Object} options
   * @param {string} [options.baseURL='http://localhost:11434'] - Ollama server URL
   * @param {string} [options.model='llama3'] - Default generation model
   * @param {string} [options.embeddingModel='nomic-embed-text'] - Default embedding model
   * @param {number} [options.timeout=60000] - Request timeout in ms
   * @param {number} [options.temperature=0.7] - Generation temperature
   * @param {number} [options.maxRetries=3] - Retries for transient failures
   * @param {number} [options.retryDelay=1000] - Base backoff delay in ms
   * @param {string} [options.systemPrompt] - System prompt used when RAG context is supplied
   */
  constructor(options = {}) {
    super({ name: 'ollama', ...options });
    this.config = { ...DEFAULT_CONFIG, ...options };
    this.client = loadAxios().create({
      baseURL: this.config.baseURL,
      timeout: this.config.timeout,
    });
  }

  /**
   * Connect to the Ollama server by verifying it is reachable.
   * @returns {Promise<void>}
   * @throws {Error} If the Ollama server is not reachable
   */
  async connect() {
    try {
      await this.client.get('/api/tags');
      await super.connect();
    } catch (err) {
      throw new Error(
        `Cannot connect to Ollama at ${this.config.baseURL}. Is Ollama running? (ollama serve)`,
      );
    }
  }

  /**
   * Check whether the Ollama server is reachable.
   * @returns {Promise<boolean>}
   */
  async isHealthy() {
    try {
      await this.client.get('/api/tags');
      return true;
    } catch {
      return false;
    }
  }

  /**
   * POST with the connector's retry policy and cancellation.
   * @private
   */
  _post(path, body, signal) {
    throwIfAborted(signal);
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
   * Build the /api/generate body. Retrieved context goes into the prompt as
   * delimited, untrusted reference data; instructions go in `system`.
   * @private
   */
  _buildBody(query, context, options, stream) {
    const prompt = buildRagPrompt(query, context, {
      systemPrompt: this.config.systemPrompt,
    });
    const body = {
      model: options.model || this.config.model,
      prompt: prompt.user,
      stream,
      options: { temperature: options.temperature ?? this.config.temperature },
    };
    if (prompt.system) body.system = prompt.system;
    return body;
  }

  /**
   * Generate a response for the given query with optional context documents.
   * @param {string} query - The user query
   * @param {Array<Object|string>} [context=[]] - Context documents for RAG
   * @param {Object} [options={}] - Override options
   * @param {string} [options.model] - Override the generation model
   * @param {number} [options.temperature] - Override temperature
   * @param {AbortSignal} [options.signal] - Cancels the request
   * @returns {Promise<string>} Generated response text
   */
  async generate(query, context = [], options = {}) {
    const body = this._buildBody(query, context, options, false);
    const data = await this._post('/api/generate', body, options.signal);
    return data.response;
  }

  /**
   * Stream a response token-by-token for the given query.
   * @param {string} query - The user query
   * @param {Array<Object|string>} [context=[]] - Context documents for RAG
   * @param {Object} [options={}] - Override options
   * @param {string} [options.model] - Override the generation model
   * @param {number} [options.temperature] - Override temperature
   * @param {AbortSignal} [options.signal] - Cancels the stream
   * @yields {{ token: string, done: boolean }}
   */
  async *generateStream(query, context = [], options = {}) {
    const { signal } = options;
    throwIfAborted(signal);
    const body = this._buildBody(query, context, options, true);

    let response;
    try {
      response = await raceAbort(
        this.client.post('/api/generate', body, {
          responseType: 'stream',
          ...signalOptions(signal),
        }),
        signal,
      );
    } catch (err) {
      if (err && err.name === 'AbortError') throw err;
      throw new Error(`Ollama streaming request failed: ${err.message}`);
    }

    let buffer = '';
    for await (const chunk of response.data) {
      throwIfAborted(signal);
      buffer += chunk.toString();
      const lines = buffer.split('\n');
      // Keep the last potentially incomplete line in the buffer
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        try {
          const parsed = JSON.parse(trimmed);
          yield { token: parsed.response || '', done: !!parsed.done };
        } catch {
          // Skip malformed lines
        }
      }
    }

    // Process any remaining data in the buffer
    if (buffer.trim()) {
      try {
        const parsed = JSON.parse(buffer.trim());
        yield { token: parsed.response || '', done: !!parsed.done };
      } catch {
        // Skip malformed trailing data
      }
    }
  }

  /**
   * Generate an embedding vector for the given text.
   * @param {string} text - Text to embed
   * @param {Object} [options={}]
   * @param {AbortSignal} [options.signal] - Cancels the request
   * @returns {Promise<number[]>} Embedding vector
   */
  async embed(text, options = {}) {
    const data = await this._post(
      '/api/embeddings',
      { model: this.config.embeddingModel, prompt: text },
      options.signal,
    );
    return data.embedding;
  }

  /**
   * Generate an embedding vector for a query string.
   * Alias for {@link embed}.
   * @param {string} query - Query text to embed
   * @param {Object} [options={}] - Same as embed()
   * @returns {Promise<number[]>} Embedding vector
   */
  async embedQuery(query, options = {}) {
    return this.embed(query, options);
  }

  /**
   * Build a prompt string incorporating context documents.
   * Kept for backward compatibility; context is delimited and labelled as
   * untrusted reference data.
   * @param {string} query - The user query
   * @param {Array<Object|string>} context - Context documents
   * @returns {string} Formatted prompt
   * @private
   */
  _buildPrompt(query, context) {
    return buildRagPrompt(query, context).user;
  }
}

module.exports = { OllamaConnector, DEFAULT_CONFIG };
