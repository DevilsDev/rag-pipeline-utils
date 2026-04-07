"use strict";

const { EventEmitter } = require("events");

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
    this.emit("connected", { name: this.name });
  }

  /**
   * Tear down the connection.
   * Override in subclass for custom disconnection logic.
   * @returns {Promise<void>}
   */
  async disconnect() {
    this.connected = false;
    this.emit("disconnected", { name: this.name });
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
   * Retry wrapper that attempts a function up to N times with a delay between retries.
   * Emits a 'retry' event on each retry attempt.
   * @param {Function} fn - Async function to execute
   * @param {number} [retries=3] - Maximum number of retry attempts
   * @param {number} [delay=1000] - Delay in ms between retries
   * @returns {Promise<*>} Result of the function
   * @throws {Error} Last error if all retries are exhausted
   */
  async withRetry(fn, retries = 3, delay = 1000) {
    let lastError;
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        return await fn();
      } catch (err) {
        lastError = err;
        if (attempt < retries) {
          this.emit("retry", {
            name: this.name,
            attempt: attempt + 1,
            maxRetries: retries,
            error: err.message,
          });
          await new Promise((resolve) => setTimeout(resolve, delay));
        }
      }
    }
    throw lastError;
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
