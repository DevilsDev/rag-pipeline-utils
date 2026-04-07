'use strict';

const axios = require('axios');
const { BaseConnector } = require('./base-connector');

/**
 * Default configuration for the Anthropic connector.
 * @type {Object}
 */
const DEFAULT_CONFIG = {
  model: 'claude-3-5-sonnet-20241022',
  apiKey: process.env.ANTHROPIC_API_KEY || '',
  baseURL: 'https://api.anthropic.com',
  apiVersion: '2023-06-01',
  maxTokens: 4096,
  temperature: 0.7,
};

/**
 * LLM connector for the Anthropic Claude API.
 * Uses axios for HTTP calls and supports streaming via SSE.
 *
 * @extends BaseConnector
 */
class AnthropicConnector extends BaseConnector {
  /**
   * @param {Object} [options]
   * @param {string} [options.model='claude-3-5-sonnet-20241022'] - Claude model to use
   * @param {string} [options.apiKey] - Anthropic API key
   * @param {string} [options.baseURL='https://api.anthropic.com'] - API base URL
   * @param {string} [options.apiVersion='2023-06-01'] - API version header
   * @param {number} [options.maxTokens=4096] - Max tokens in response
   * @param {number} [options.temperature=0.7] - Sampling temperature
   */
  constructor(options = {}) {
    super({ name: 'anthropic', ...options });
    this.config = { ...DEFAULT_CONFIG, ...options };
    this.client = axios.create({
      baseURL: this.config.baseURL,
      headers: {
        'x-api-key': this.config.apiKey,
        'anthropic-version': this.config.apiVersion,
        'content-type': 'application/json',
      },
    });
  }

  /**
   * Connect to Anthropic. Verifies the API key is present.
   * @returns {Promise<void>}
   * @throws {Error} If no API key is configured
   */
  async connect() {
    if (!this.config.apiKey) {
      throw new Error(
        'Anthropic API key required. Set ANTHROPIC_API_KEY or pass apiKey option.',
      );
    }
    await super.connect();
  }

  /**
   * Generate a response from Claude using the provided query and optional RAG context.
   *
   * @param {string} query - The user query / prompt
   * @param {Array<Object|string>} [context=[]] - Retrieved documents for RAG
   * @param {Object} [options={}] - Override model, temperature, maxTokens per-call
   * @returns {Promise<string>} The generated text
   */
  async generate(query, context = [], options = {}) {
    return this.withRetry(async () => {
      const body = {
        model: options.model || this.config.model,
        max_tokens: options.maxTokens ?? this.config.maxTokens,
        temperature: options.temperature ?? this.config.temperature,
        messages: [
          { role: 'user', content: this._buildPrompt(query, context) },
        ],
      };

      // Add system message when context is provided
      if (context && context.length > 0) {
        const contextText = context
          .map((doc) => doc.content || doc.text || String(doc))
          .join('\n\n');
        body.system = `Use the following context to answer the question:\n\n${contextText}`;
        body.messages = [{ role: 'user', content: query }];
      }

      const response = await this.client.post('/v1/messages', body);
      return response.data.content[0].text;
    });
  }

  /**
   * Stream a response from Claude token-by-token via SSE.
   *
   * @param {string} query - The user query / prompt
   * @param {Array<Object|string>} [context=[]] - Retrieved documents for RAG
   * @param {Object} [options={}] - Override model, temperature, maxTokens per-call
   * @yields {{ token: string, done: boolean }}
   */
  async *generateStream(query, context = [], options = {}) {
    const body = {
      model: options.model || this.config.model,
      max_tokens: options.maxTokens ?? this.config.maxTokens,
      temperature: options.temperature ?? this.config.temperature,
      messages: [{ role: 'user', content: this._buildPrompt(query, context) }],
      stream: true,
    };

    if (context && context.length > 0) {
      const contextText = context
        .map((doc) => doc.content || doc.text || String(doc))
        .join('\n\n');
      body.system = `Use the following context to answer the question:\n\n${contextText}`;
      body.messages = [{ role: 'user', content: query }];
    }

    const response = await this.client.post('/v1/messages', body, {
      responseType: 'stream',
    });

    let buffer = '';

    for await (const chunk of response.data) {
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
   * Build a prompt string that includes RAG context when available.
   *
   * @param {string} query - User query
   * @param {Array<Object|string>} context - RAG context documents
   * @returns {string} Combined prompt
   * @private
   */
  _buildPrompt(query, context) {
    if (!context || context.length === 0) return query;
    const contextText = context
      .map((doc) => doc.content || doc.text || String(doc))
      .join('\n\n');
    return `Context:\n${contextText}\n\nQuestion: ${query}`;
  }
}

module.exports = { AnthropicConnector, DEFAULT_CONFIG };
