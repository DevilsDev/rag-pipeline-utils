'use strict';

const { EventEmitter } = require('events');
const {
  abortableSleep,
  computeRetryDelay,
  createAbortError,
  getErrorStatus,
  isAbortError,
  isRetryableError,
  raceAbort,
  throwIfAborted,
} = require('./connector-utils');

/**
 * Abstract base class for all connectors.
 * Provides connection lifecycle, health checking, and retry logic.
 * @extends EventEmitter
 */
class BaseConnector extends EventEmitter {
  /**
   * @param {Object} options
   * @param {string} [options.name] - Connector display name
   */
  constructor(options = {}) {
    super();
    this.options = options;
    this.connected = false;
    this.name = options.name || this.constructor.name;
  }

  /**
   * Establish the connection.
   * Override in subclass for custom connection logic.
   * @returns {Promise<void>}
   */
  async connect() {
    this.connected = true;
    this.emit('connected', { name: this.name });
  }

  /**
   * Tear down the connection.
   * Override in subclass for custom disconnection logic.
   * @returns {Promise<void>}
   */
  async disconnect() {
    this.connected = false;
    this.emit('disconnected', { name: this.name });
  }

  /**
   * Check whether the connector is healthy and operational.
   * Override in subclass for custom health checks.
   * @returns {Promise<boolean>}
   */
  async isHealthy() {
    return this.connected;
  }

  /**
   * Retry wrapper for transient failures.
   *
   * Only retryable errors are retried: network errors and HTTP
   * 408/409/425/429/5xx (see {@link isRetryableError}). Other errors
   * (400, 401, 403, 404, aborts, errors with no status or network code) are
   * thrown immediately. Backoff is exponential with full jitter, starting at
   * `delay` and capped at `opts.maxDelay`; a Retry-After header on the error
   * is honoured (capped at `opts.maxDelay`). Emits a 'retry' event before
   * each retry.
   *
   * @param {Function} fn - Async function to execute; receives the attempt number
   * @param {number} [retries=3] - Maximum number of retry attempts
   * @param {number} [delay=1000] - Base backoff delay in ms
   * @param {object} [opts]
   * @param {AbortSignal} [opts.signal] - Aborts the call and any pending backoff
   * @param {number} [opts.maxDelay=30000] - Upper bound for a single backoff delay
   * @param {(err: *) => boolean} [opts.shouldRetry] - Override retry classification
   * @returns {Promise<*>} Result of the function
   * @throws {Error} The first non-retryable error, or the last error once retries are exhausted
   */
  async withRetry(fn, retries = 3, delay = 1000, opts = {}) {
    const signal = opts.signal;
    const shouldRetry = opts.shouldRetry || isRetryableError;
    const maxDelay = opts.maxDelay ?? this.options.retryMaxDelay ?? 30000;

    for (let attempt = 0; ; attempt++) {
      throwIfAborted(signal);
      try {
        return await raceAbort(() => fn(attempt), signal);
      } catch (err) {
        if (isAbortError(err) || (signal && signal.aborted)) {
          throw createAbortError(signal);
        }
        if (attempt >= retries || !shouldRetry(err)) {
          throw err;
        }
        const delayMs = computeRetryDelay(err, attempt, {
          baseDelay: delay,
          maxDelay,
          random: () => this._random(),
        });
        this.emit('retry', {
          name: this.name,
          attempt: attempt + 1,
          maxRetries: retries,
          error: err.message,
          status: getErrorStatus(err),
          delayMs,
        });
        await this._sleep(delayMs, signal);
      }
    }
  }

  /**
   * Wait between retries. Overridable in tests.
   * @param {number} ms
   * @param {AbortSignal} [signal]
   * @returns {Promise<void>}
   * @protected
   */
  _sleep(ms, signal) {
    return abortableSleep(ms, signal);
  }

  /**
   * Jitter source for retry backoff. Overridable in tests.
   * @returns {number} Value in [0, 1)
   * @protected
   */
  _random() {
    return Math.random();
  }

  /**
   * Return basic information about the connector.
   * @returns {{ name: string, connected: boolean, type: string }}
   */
  getInfo() {
    return {
      name: this.name,
      connected: this.connected,
      type: this.constructor.name,
    };
  }
}

module.exports = { BaseConnector };
