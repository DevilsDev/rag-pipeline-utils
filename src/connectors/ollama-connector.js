'use strict';

const axios = require('axios');
const { BaseConnector } = require('./base-connector');

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
};

/**
 * Connector for Ollama local LLM server.
 * Supports text generation (sync and streaming) and embeddings.
 * @extends BaseConnector
 */
class OllamaConnector extends BaseConnector {
  /**
   * @param {Object} options
   * @param {string} [options.baseURL='http://localhost:11434'] - Ollama server URL
   * @param {string} [options.model='llama3'] - Default generation model
   * @param {string} [options.embeddingModel='nomic-embed-text'] - Default embedding model
   * @param {number} [options.timeout=60000] - Request timeout in ms
   * @param {number} [options.temperature=0.7] - Generation temperature
   */
  constructor(options = {}) {
    super({ name: 'ollama', ...options });
    this.config = { ...DEFAULT_CONFIG, ...options };
    this.client = axios.create({
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
   * Generate a response for the given query with optional context documents.
   * @param {string} query - The user query
   * @param {Array<Object|string>} [context=[]] - Context documents for RAG
   * @param {Object} [options={}] - Override options
   * @param {string} [options.model] - Override the generation model
   * @param {number} [options.temperature] - Override temperature
   * @returns {Promise<string>} Generated response text
   */
  async generate(query, context = [], options = {}) {
    const model = options.model || this.config.model;
    const temperature = options.temperature ?? this.config.temperature;
    const prompt = this._buildPrompt(query, context);

    const result = await this.withRetry(async () => {
      const response = await this.client.post('/api/generate', {
        model,
        prompt,
        stream: false,
        options: { temperature },
      });
      return response.data.response;
    });

    return result;
  }

  /**
   * Stream a response token-by-token for the given query.
   * @param {string} query - The user query
   * @param {Array<Object|string>} [context=[]] - Context documents for RAG
   * @param {Object} [options={}] - Override options
   * @param {string} [options.model] - Override the generation model
   * @param {number} [options.temperature] - Override temperature
   * @yields {{ token: string, done: boolean }}
   */
  async *generateStream(query, context = [], options = {}) {
    const model = options.model || this.config.model;
    const temperature = options.temperature ?? this.config.temperature;
    const prompt = this._buildPrompt(query, context);

    let response;
    try {
      response = await this.client.post(
        '/api/generate',
        {
          model,
          prompt,
          stream: true,
          options: { temperature },
        },
        { responseType: 'stream' },
      );
    } catch (err) {
      throw new Error(`Ollama streaming request failed: ${err.message}`);
    }

    let buffer = '';
    for await (const chunk of response.data) {
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
   * @returns {Promise<number[]>} Embedding vector
   */
  async embed(text) {
    const result = await this.withRetry(async () => {
      const response = await this.client.post('/api/embeddings', {
        model: this.config.embeddingModel,
        prompt: text,
      });
      return response.data.embedding;
    });

    return result;
  }

  /**
   * Generate an embedding vector for a query string.
   * Alias for {@link embed}.
   * @param {string} query - Query text to embed
   * @returns {Promise<number[]>} Embedding vector
   */
  async embedQuery(query) {
    return this.embed(query);
  }

  /**
   * Build a prompt string incorporating context documents.
   * @param {string} query - The user query
   * @param {Array<Object|string>} context - Context documents
   * @returns {string} Formatted prompt
   * @private
   */
  _buildPrompt(query, context) {
    if (!context || context.length === 0) return query;

    const contextText = context
      .map((doc) => {
        const text = doc.content || doc.text || String(doc);
        return text;
      })
      .join('\n\n');

    return `Context:\n${contextText}\n\nQuestion: ${query}\n\nAnswer:`;
  }
}

module.exports = { OllamaConnector, DEFAULT_CONFIG };
