'use strict';

const { BaseConnector } = require('./base-connector');
const {
  missingApiKeyError,
  raceAbort,
  resolveApiKey,
  throwIfAborted,
} = require('./connector-utils');
const { buildRagPrompt } = require('./rag-prompt');
const { componentCacheKey } = require('../cache/component-keys');

const API_KEY_ENV = 'OPENAI_API_KEY';

/**
 * Default configuration for the OpenAI connector.
 * `apiKey` is a getter so the environment is read when a connector is
 * constructed, not when this module is first required.
 * @type {Object}
 */
const DEFAULT_CONFIG = {
  model: 'gpt-4o-mini',
  embeddingModel: 'text-embedding-3-small',
  temperature: 0.7,
  maxTokens: 4096,
  maxRetries: 3,
  retryDelay: 1000,
  get apiKey() {
    return process.env[API_KEY_ENV] || '';
  },
};

/**
 * Full LLM + embedder connector for the OpenAI API.
 * Supports chat completions (with streaming) and text embeddings.
 *
 * @extends BaseConnector
 */
class OpenAIConnector extends BaseConnector {
  /**
   * Cache identity for createRagPipeline({ cache }): the settings that
   * change this connector's output in the given role.
   * @param {'embedder'|'llm'} role
   * @returns {string|null}
   */
  getCacheKey(role) {
    const c = this.config;
    if (role === 'embedder') {
      return componentCacheKey('openai-embed', {
        baseURL: c.baseURL,
        model: c.embeddingModel,
      });
    }
    if (role === 'llm') {
      return componentCacheKey('openai', {
        baseURL: c.baseURL,
        model: c.model,
        temperature: c.temperature,
        maxTokens: c.maxTokens,
        systemPrompt: c.systemPrompt,
      });
    }
    return null;
  }

  /**
   * @param {Object} [options]
   * @param {string} [options.model='gpt-4o-mini'] - Chat model to use
   * @param {string} [options.embeddingModel='text-embedding-3-small'] - Embedding model
   * @param {number} [options.temperature=0.7] - Sampling temperature
   * @param {number} [options.maxTokens=4096] - Max tokens in completion
   * @param {string} [options.apiKey] - API key. Defaults to OPENAI_API_KEY at
   *   construction, except when `baseURL` is set (see below)
   * @param {string} [options.baseURL] - Base URL of an OpenAI-compatible API,
   *   e.g. Groq, Together, the Hugging Face router, vLLM, LM Studio or
   *   Ollama's `/v1` endpoint. With a custom base URL the key is never read
   *   from OPENAI_API_KEY (that would send your OpenAI key to another
   *   provider): pass `apiKey` explicitly, or omit it for servers that need
   *   none
   * @param {number} [options.maxRetries=3] - Retries for transient failures (the SDK's own retries are disabled)
   * @param {number} [options.retryDelay=1000] - Base backoff delay in ms
   * @param {string} [options.systemPrompt] - System prompt used when RAG context is supplied
   */
  constructor(options = {}) {
    super({ name: 'openai', ...options });
    const baseURL = options.baseURL ? String(options.baseURL) : undefined;
    this.config = {
      ...DEFAULT_CONFIG,
      ...options,
      baseURL,
      // A custom endpoint gets only an explicit key, never OPENAI_API_KEY.
      apiKey: baseURL
        ? options.apiKey || ''
        : resolveApiKey(options, API_KEY_ENV),
    };
    this._client = null; // lazy-loaded
  }

  /**
   * Lazily initialise and return the OpenAI client.
   * SDK retries are disabled (maxRetries: 0); withRetry() owns the policy.
   * @returns {Object} OpenAI client instance
   * @private
   */
  _getClient() {
    if (!this._client) {
      const mod = require('openai');
      const OpenAI = mod.OpenAI || mod.default || mod;
      this._client = new OpenAI({
        // Local OpenAI-compatible servers accept any key; the SDK needs one.
        apiKey: this.config.apiKey || (this.config.baseURL ? 'not-needed' : ''),
        ...(this.config.baseURL && { baseURL: this.config.baseURL }),
        maxRetries: 0,
      });
    }
    return this._client;
  }

  /**
   * @throws {Error} code MISSING_API_KEY when no key is configured
   * @private
   */
  _requireApiKey() {
    // Only the OpenAI API itself requires a key; a custom baseURL may not.
    if (!this.config.apiKey && !this.config.baseURL) {
      throw missingApiKeyError('OpenAI', API_KEY_ENV);
    }
  }

  /**
   * Connect to OpenAI. Verifies the API key is present.
   * @returns {Promise<void>}
   * @throws {Error} If no API key is configured
   */
  async connect() {
    this._requireApiKey();
    await super.connect();
  }

  /**
   * Run a request with the connector's retry policy and cancellation.
   * @private
   */
  _request(signal, fn) {
    return this.withRetry(fn, this.config.maxRetries, this.config.retryDelay, {
      signal,
    });
  }

  /**
   * Generate a chat completion using the provided query and optional RAG context.
   *
   * @param {string} query - The user query / prompt
   * @param {Array<Object|string>} [context=[]] - Retrieved documents for RAG
   * @param {Object} [options={}] - Override model, temperature, maxTokens per-call
   * @param {AbortSignal} [options.signal] - Cancels the request
   * @returns {Promise<string>} The generated text
   */
  async generate(query, context = [], options = {}) {
    const { signal } = options;
    throwIfAborted(signal);
    this._requireApiKey();
    return this._request(signal, async () => {
      const client = this._getClient();
      const messages = this._buildMessages(query, context);

      const response = await client.chat.completions.create(
        {
          model: options.model || this.config.model,
          messages,
          temperature: options.temperature ?? this.config.temperature,
          max_tokens: options.maxTokens ?? this.config.maxTokens,
        },
        signal ? { signal } : undefined,
      );

      return response.choices[0].message.content;
    });
  }

  /**
   * Stream a chat completion token-by-token.
   *
   * @param {string} query - The user query / prompt
   * @param {Array<Object|string>} [context=[]] - Retrieved documents for RAG
   * @param {Object} [options={}] - Override model, temperature, maxTokens per-call
   * @param {AbortSignal} [options.signal] - Cancels the stream
   * @yields {{ token: string, done: boolean }}
   */
  async *generateStream(query, context = [], options = {}) {
    const { signal } = options;
    throwIfAborted(signal);
    this._requireApiKey();
    const client = this._getClient();
    const messages = this._buildMessages(query, context);

    const stream = await raceAbort(
      client.chat.completions.create(
        {
          model: options.model || this.config.model,
          messages,
          temperature: options.temperature ?? this.config.temperature,
          max_tokens: options.maxTokens ?? this.config.maxTokens,
          stream: true,
        },
        signal ? { signal } : undefined,
      ),
      signal,
    );

    for await (const chunk of stream) {
      throwIfAborted(signal);
      const token = chunk.choices[0]?.delta?.content || '';
      yield { token, done: false };
    }

    yield { token: '', done: true };
  }

  /**
   * Generate an embedding vector for the given text.
   *
   * @param {string} text - Input text to embed
   * @param {Object} [options={}]
   * @param {AbortSignal} [options.signal] - Cancels the request
   * @returns {Promise<number[]>} Embedding vector
   */
  async embed(text, options = {}) {
    const { signal } = options;
    throwIfAborted(signal);
    this._requireApiKey();
    return this._request(signal, async () => {
      const client = this._getClient();

      const response = await client.embeddings.create(
        {
          model: this.config.embeddingModel,
          input: text,
        },
        signal ? { signal } : undefined,
      );

      return response.data[0].embedding;
    });
  }

  /**
   * Generate an embedding vector for a search query.
   * Alias for {@link OpenAIConnector#embed}.
   *
   * @param {string} query - Query text to embed
   * @param {Object} [options={}] - Same as embed()
   * @returns {Promise<number[]>} Embedding vector
   */
  async embedQuery(query, options = {}) {
    return this.embed(query, options);
  }

  /**
   * Build the messages array for a chat completion request. Retrieved
   * context goes into the user message as delimited, untrusted reference
   * data; the system message only carries instructions.
   *
   * @param {string} query - User query
   * @param {Array<Object|string>} context - RAG context documents
   * @returns {Array<{ role: string, content: string }>}
   * @private
   */
  _buildMessages(query, context) {
    const prompt = buildRagPrompt(query, context, {
      systemPrompt: this.config.systemPrompt,
    });
    const messages = [];
    if (prompt.system) {
      messages.push({ role: 'system', content: prompt.system });
    }
    messages.push({ role: 'user', content: prompt.user });
    return messages;
  }
}

module.exports = { OpenAIConnector, DEFAULT_CONFIG };
