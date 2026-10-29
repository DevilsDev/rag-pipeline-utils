'use strict';

// axios loads on first use, so importing the package does not pay for it
// (about 125 ms) unless this connector is constructed.
const loadAxios = () => require('axios'); // eslint-disable-line global-require
const { BaseConnector } = require('./base-connector');
const {
  missingApiKeyError,
  raceAbort,
  resolveApiKey,
  signalOptions,
  throwIfAborted,
} = require('./connector-utils');
const { buildRagPrompt } = require('./rag-prompt');
const { componentCacheKey } = require('../cache/component-keys');

const API_KEY_ENV = 'ANTHROPIC_API_KEY';

/**
 * Default configuration for the Anthropic connector.
 * `apiKey` is a getter so the environment is read when a connector is
 * constructed, not when this module is first required.
 * @type {Object}
 */
const DEFAULT_CONFIG = {
  model: 'claude-3-5-sonnet-20241022',
  baseURL: 'https://api.anthropic.com',
  apiVersion: '2023-06-01',
  maxTokens: 4096,
  temperature: 0.7,
  maxRetries: 3,
  retryDelay: 1000,
  get apiKey() {
    return process.env[API_KEY_ENV] || '';
  },
};

/**
 * LLM connector for the Anthropic Claude API.
 * Uses axios for HTTP calls and supports streaming via SSE.
 *
 * @extends BaseConnector
 */
class AnthropicConnector extends BaseConnector {
  /**
   * Cache identity for createRagPipeline({ cache }).
   * @param {'llm'} role
   * @returns {string|null}
   */
  getCacheKey(role) {
    if (role !== 'llm') return null;
    const c = this.config;
    return componentCacheKey('anthropic', {
      baseURL: c.baseURL,
      model: c.model,
      temperature: c.temperature,
      maxTokens: c.maxTokens,
      systemPrompt: c.systemPrompt,
    });
  }

  /**
   * @param {Object} [options]
   * @param {string} [options.model='claude-3-5-sonnet-20241022'] - Claude model to use
   * @param {string} [options.apiKey] - Anthropic API key (defaults to ANTHROPIC_API_KEY at construction)
   * @param {string} [options.baseURL='https://api.anthropic.com'] - API base URL
   * @param {string} [options.apiVersion='2023-06-01'] - API version header
   * @param {number} [options.maxTokens=4096] - Max tokens in response
   * @param {number} [options.temperature=0.7] - Sampling temperature
   * @param {number} [options.maxRetries=3] - Retries for transient failures
   * @param {number} [options.retryDelay=1000] - Base backoff delay in ms
   * @param {string} [options.systemPrompt] - System prompt used when RAG context is supplied
   */
  constructor(options = {}) {
    super({ name: 'anthropic', ...options });
    this.config = {
      ...DEFAULT_CONFIG,
      ...options,
      apiKey: resolveApiKey(options, API_KEY_ENV),
    };
    this.client = loadAxios().create({
      baseURL: this.config.baseURL,
      headers: {
        'x-api-key': this.config.apiKey,
        'anthropic-version': this.config.apiVersion,
        'content-type': 'application/json',
      },
    });
  }

  /**
   * @throws {Error} code MISSING_API_KEY when no key is configured
   * @private
   */
  _requireApiKey() {
    if (!this.config.apiKey) {
      throw missingApiKeyError('Anthropic', API_KEY_ENV);
    }
  }

  /**
   * Connect to Anthropic. Verifies the API key is present.
   * @returns {Promise<void>}
   * @throws {Error} If no API key is configured
   */
  async connect() {
    this._requireApiKey();
    await super.connect();
  }

  /**
   * Build the Messages API request body. Retrieved context goes into the
   * user message as delimited, untrusted reference data; the system prompt
   * only carries instructions.
   * @private
   */
  _buildBody(query, context, options) {
    const prompt = buildRagPrompt(query, context, {
      systemPrompt: this.config.systemPrompt,
    });
    const body = {
      model: options.model || this.config.model,
      max_tokens: options.maxTokens ?? this.config.maxTokens,
      temperature: options.temperature ?? this.config.temperature,
      messages: [{ role: 'user', content: prompt.user }],
    };
    if (prompt.system) body.system = prompt.system;
    return body;
  }

  /**
   * Generate a response from Claude using the provided query and optional RAG context.
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
    const body = this._buildBody(query, context, options);
    return this.withRetry(
      async () => {
        const response = await this.client.post(
          '/v1/messages',
          body,
          signal ? { signal } : undefined,
        );
        return response.data.content[0].text;
      },
      this.config.maxRetries,
      this.config.retryDelay,
      { signal },
    );
  }

  /**
   * Stream a response from Claude token-by-token via SSE.
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
    const body = { ...this._buildBody(query, context, options), stream: true };

    const response = await raceAbort(
      this.client.post('/v1/messages', body, {
        responseType: 'stream',
        ...signalOptions(signal),
      }),
      signal,
    );

    let buffer = '';

    for await (const chunk of response.data) {
      throwIfAborted(signal);
      buffer += chunk.toString();
      const lines = buffer.split('\n');
      // Keep the last incomplete line in the buffer
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;

        const jsonStr = line.slice(6).trim();
        if (!jsonStr || jsonStr === '[DONE]') continue;

        try {
          const event = JSON.parse(jsonStr);

          if (
            event.type === 'content_block_delta' &&
            event.delta &&
            event.delta.text
          ) {
            yield { token: event.delta.text, done: false };
          }

          if (event.type === 'message_stop') {
            yield { token: '', done: true };
            return;
          }
        } catch {
          // Skip malformed JSON lines
        }
      }
    }

    yield { token: '', done: true };
  }

  /**
   * Build a single prompt string that includes RAG context when available.
   * Kept for backward compatibility; the context is delimited and labelled
   * as untrusted reference data.
   *
   * @param {string} query - User query
   * @param {Array<Object|string>} context - RAG context documents
   * @returns {string} Combined prompt
   * @private
   */
  _buildPrompt(query, context) {
    return buildRagPrompt(query, context).user;
  }
}

module.exports = { AnthropicConnector, DEFAULT_CONFIG };
