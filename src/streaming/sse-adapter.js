'use strict';

/**
 * SSE (Server-Sent Events) Adapter
 *
 * Converts AsyncGenerator tokens to Server-Sent Events format
 * for real-time streaming of RAG pipeline responses over HTTP.
 *
 * @module streaming/sse-adapter
 * @since 2.4.0
 */

const { EventEmitter } = require('events');

/**
 * Default configuration for SSE streaming
 * @type {Object}
 */
const DEFAULT_CONFIG = {
  /** @type {string} SSE event name for token events */
  eventName: 'token',
  /** @type {string} Sentinel value indicating stream completion */
  doneEvent: '[DONE]',
  /** @type {number} Interval in ms between heartbeat comments */
  heartbeatIntervalMs: 15000,
};

/**
 * Adapts an AsyncGenerator to the Server-Sent Events protocol.
 *
 * Writes well-formed SSE frames to an HTTP response, manages heartbeat
 * keep-alive comments, and handles client disconnects gracefully.
 *
 * @extends EventEmitter
 *
 * @example
 *   const adapter = new SSEAdapter({ heartbeatIntervalMs: 10000 });
 *   adapter.on('token', (t) => console.log('sent', t));
 *   await adapter.stream(asyncTokenGenerator, res);
 */
class SSEAdapter extends EventEmitter {
  /**
   * @param {Object} [options] - Configuration overrides
   * @param {string} [options.eventName='token'] - SSE event name for token frames
   * @param {string} [options.doneEvent='[DONE]'] - Sentinel value for the final data frame
   * @param {number} [options.heartbeatIntervalMs=15000] - Heartbeat interval in milliseconds
   */
  constructor(options = {}) {
    super();
    this.config = { ...DEFAULT_CONFIG, ...options };
  }

  /**
   * Stream tokens from an AsyncGenerator to an HTTP response as SSE.
   *
   * Sets the required SSE headers, starts a heartbeat timer, and iterates
   * over the generator. Each yielded value should be an object with at least
   * a `token` property and an optional `done` boolean.
   *
   * @param {AsyncGenerator<{token: string, done?: boolean}>} asyncGenerator - Token source
   * @param {import('http').ServerResponse} httpResponse - Writable HTTP response
   * @returns {Promise<void>} Resolves when the stream ends or the client disconnects
   */
  async stream(asyncGenerator, httpResponse) {
    let heartbeatTimer = null;
    let clientDisconnected = false;

    // --- helpers --------------------------------------------------------
    const cleanup = () => {
      if (heartbeatTimer) {
        clearInterval(heartbeatTimer);
        heartbeatTimer = null;
      }
    };

    // --- 1. SSE headers -------------------------------------------------
    httpResponse.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    });

    // --- 2. Heartbeat keep-alive ----------------------------------------
    heartbeatTimer = setInterval(() => {
      if (!clientDisconnected) {
        httpResponse.write(': heartbeat\n\n');
      }
    }, this.config.heartbeatIntervalMs);

    // --- 3. Client disconnect handler -----------------------------------
    const onClose = () => {
      clientDisconnected = true;
      cleanup();
      this.emit('disconnect');
    };
    httpResponse.on('close', onClose);

    // --- 4. Iterate over the generator ----------------------------------
    try {
      this.emit('started');

      for await (const value of asyncGenerator) {
        if (clientDisconnected) {
          break;
        }

        if (value && value.done) {
          // Final frame
          httpResponse.write(`data: ${this.config.doneEvent}\n\n`);
          this.emit('done');
          break;
        }

        const token = value && value.token !== undefined ? value.token : value;
        const frame = this.formatEvent(this.config.eventName, { token });
        httpResponse.write(frame);
        this.emit('token', token);
      }

      // If the generator is exhausted without an explicit done flag, send DONE
      if (!clientDisconnected && !httpResponse.writableEnded) {
        httpResponse.write(`data: ${this.config.doneEvent}\n\n`);
        this.emit('done');
      }
    } catch (err) {
      this.emit('error', err);

      if (!clientDisconnected && !httpResponse.writableEnded) {
        const errorFrame = this.formatEvent('error', {
          message: err.message || 'Internal streaming error',
        });
        httpResponse.write(errorFrame);
      }
    } finally {
      cleanup();
      httpResponse.removeListener('close', onClose);

      if (!httpResponse.writableEnded) {
        httpResponse.end();
      }
    }
  }

  /**
   * Format a single SSE event string.
   *
   * Multi-line data is split so each line is prefixed with `data: ` as
   * required by the SSE specification.
   *
   * @param {string} eventName - The SSE event type
   * @param {*} data - Payload (will be JSON-stringified)
   * @returns {string} Fully formatted SSE frame including trailing blank line
   */
  formatEvent(eventName, data) {
    const json = JSON.stringify(data);
    const lines = json.split('\n');

    let frame = `event: ${eventName}\n`;
    for (const line of lines) {
      frame += `data: ${line}\n`;
    }
    frame += '\n';

    return frame;
  }
}

module.exports = { SSEAdapter, DEFAULT_CONFIG };
