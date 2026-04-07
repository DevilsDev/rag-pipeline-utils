'use strict';

const { BaseConnector } = require('./base-connector');

/**
 * Default configuration for the OpenAI connector.
 * @type {Object}
 */
const DEFAULT_CONFIG = {
  model: 'gpt-4o-mini',
  embeddingModel: 'text-embedding-3-small',
  temperature: 0.7,
  maxTokens: 4096,
  apiKey: process.env.OPENAI_API_KEY || '',
};

/**
 * Full LLM + embedder connector for the OpenAI API.
 * Supports chat completions (with streaming) and text embeddings.
 *
 * @extends BaseConnector
 */
class OpenAIConnector extends BaseConnector {
  /**
   * @param {Object} [options]
   * @param {string} [options.model='gpt-4o-mini'] - Chat model to use
   * @param {string} [options.embeddingModel='text-embedding-3-small'] - Embedding model
   * @param {number} [options.temperature=0.7] - Sampling temperature
   * @param {number} [options.maxTokens=4096] - Max tokens in completion
   * @param {string} [options.apiKey] - OpenAI API key
   */
  constructor(options = {}) {
    super({ name: 'openai', ...options });
    this.config = { ...DEFAULT_CONFIG, ...options };
    this._client = null; // lazy-loaded
  }

  /**
   * Lazily initialise and return the OpenAI client.
   * @returns {Object} OpenAI client instance
   * @private
   */
  _getClient() {
    if (!this._client) {
      const OpenAI = require('openai');
      this._client = new OpenAI({ apiKey: this.config.apiKey });
    }
    return this._client;
  }

  /**
   * Connect to OpenAI. Verifies the API key is present.
   * @returns {Promise<void>}
   * @throws {Error} If no API key is configured
   */
  async connect() {
    if (!this.config.apiKey) {
      throw new Error(
        'OpenAI API key required. Set OPENAI_API_KEY or pass apiKey option.',
      );
    }
    await super.connect();
  }

  /**
   * Generate a chat completion using the provided query and optional RAG context.
   *
   * @param {string} query - The user query / prompt
   * @param {Array<Object|string>} [context=[]] - Retrieved documents for RAG
   * @param {Object} [options={}] - Override model, temperature, maxTokens per-call
   * @returns {Promise<string>} The generated text
   */
  async generate(query, context = [], options = {}) {
    return this.withRetry(async () => {
      const client = this._getClient();
      const messages = this._buildMessages(query, context);

      const response = await client.chat.completions.create({
        model: options.model || this.config.model,
        messages,
        temperature: options.temperature ?? this.config.temperature,
        max_tokens: options.maxTokens ?? this.config.maxTokens,
      });

      return response.choices[0].message.content;
    });
  }

  /**
   * Stream a chat completion token-by-token.
   *
   * @param {string} query - The user query / prompt
   * @param {Array<Object|string>} [context=[]] - Retrieved documents for RAG
   * @param {Object} [options={}] - Override model, temperature, maxTokens per-call
   * @yields {{ token: string, done: boolean }}
   */
  async *generateStream(query, context = [], options = {}) {
    const client = this._getClient();
    const messages = this._buildMessages(query, context);

    const stream = await client.chat.completions.create({
      model: options.model || this.config.model,
      messages,
      temperature: options.temperature ?? this.config.temperature,
      max_tokens: options.maxTokens ?? this.config.maxTokens,
      stream: true,
    });

    for await (const chunk of stream) {
      const token = chunk.choices[0]?.delta?.content || '';
      yield { token, done: false };
    }

    yield { token: '', done: true };
  }

  /**
   * Generate an embedding vector for the given text.
   *
   * @param {string} text - Input text to embed
   * @returns {Promise<number[]>} Embedding vector
   */
  async embed(text) {
    return this.withRetry(async () => {
      const client = this._getClient();

      const response = await client.embeddings.create({
        model: this.config.embeddingModel,
        input: text,
      });

      return response.data[0].embedding;
    });
  }

  /**
   * Generate an embedding vector for a search query.
   * Alias for {@link OpenAIConnector#embed}.
   *
   * @param {string} query - Query text to embed
   * @returns {Promise<number[]>} Embedding vector
   */
  async embedQuery(query) {
    return this.embed(query);
  }

  /**
   * Build the messages array for a chat completion request.
   *
   * @param {string} query - User query
   * @param {Array<Object|string>} context - RAG context documents
   * @returns {Array<{ role: string, content: string }>}
   * @private
   */
  _buildMessages(query, context) {
    const messages = [];

    if (context && context.length > 0) {
      const contextText = context
        .map((doc) => doc.content || doc.text || String(doc))
        .join('\n\n');
      messages.push({
        role: 'system',
        content: `Use the following context to answer the question:\n\n${contextText}`,
      });
    }

    messages.push({ role: 'user', content: query });
    return messages;
  }
}

module.exports = { OpenAIConnector, DEFAULT_CONFIG };
