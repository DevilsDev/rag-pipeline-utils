"use strict";

/**
 * WebSocket Adapter
 *
 * Sends AsyncGenerator tokens over a WebSocket connection
 * for real-time bidirectional streaming of RAG pipeline responses.
 *
 * @module streaming/websocket-adapter
 * @since 2.4.0
 */

const { EventEmitter } = require("events");

/**
 * Default configuration for WebSocket streaming
 * @type {Object}
 */
const DEFAULT_CONFIG = {
  /** @type {string} Message type identifier for token payloads */
  messageType: "token",
  /** @type {string} Message type identifier for stream completion */
  doneType: "done",
  /** @type {string} Message type identifier for error payloads */
  errorType: "error",
};

/**
 * WebSocket ready-state constants (mirrors the W3C WebSocket API).
 * @enum {number}
 * @private
 */
const WS_READY_STATE = {
  OPEN: 1,
};

/**
 * Adapts an AsyncGenerator to a WebSocket connection.
 *
 * Sends JSON-framed messages for each token, a completion message when
 * the generator is exhausted, and an error message on failure. Handles
 * premature connection closure gracefully.
 *
 * @extends EventEmitter
 *
 * @example
 *   const adapter = new WebSocketAdapter();
 *   adapter.on('done', () => console.log('stream complete'));
 *   await adapter.stream(asyncTokenGenerator, ws);
 */
class WebSocketAdapter extends EventEmitter {
  /**
   * @param {Object} [options] - Configuration overrides
   * @param {string} [options.messageType='token'] - Type field for token messages
   * @param {string} [options.doneType='done'] - Type field for completion message
   * @param {string} [options.errorType='error'] - Type field for error messages
   */
  constructor(options = {}) {
    super();
    this.config = { ...DEFAULT_CONFIG, ...options };
  }

  /**
   * Stream tokens from an AsyncGenerator over a WebSocket connection.
   *
   * Each yielded value should be an object with at least a `token` property
   * and an optional `done` boolean. Messages are sent as JSON strings via
   * `wsConnection.send()`.
   *
   * @param {AsyncGenerator<{token: string, done?: boolean}>} asyncGenerator - Token source
   * @param {Object} wsConnection - WebSocket-like object with a `send(data)` method
   * @param {Function} wsConnection.send - Sends a string message over the socket
   * @param {number} [wsConnection.readyState] - Optional W3C readyState property
   * @returns {Promise<void>} Resolves when the stream ends or the connection closes
   * @throws {TypeError} If wsConnection lacks a send method
   */
  async stream(asyncGenerator, wsConnection) {
    // --- 1. Validate connection -----------------------------------------
    if (!wsConnection || typeof wsConnection.send !== "function") {
      throw new TypeError("wsConnection must have a send() method");
    }

    let connectionClosed = false;

    // --- 2. Connection lifecycle handlers --------------------------------
    const onClose = () => {
      connectionClosed = true;
    };
    const onError = (err) => {
      connectionClosed = true;
      this.emit("error", err);
    };

    if (typeof wsConnection.on === "function") {
      wsConnection.on("close", onClose);
      wsConnection.on("error", onError);
    }

    // --- 3. Iterate and send --------------------------------------------
    try {
      this.emit("started");

      for await (const value of asyncGenerator) {
        if (connectionClosed || !this._isOpen(wsConnection)) {
          break;
        }

        if (value && value.done) {
          this._send(wsConnection, { type: this.config.doneType });
          this.emit("done");
          break;
        }

        const token = value && value.token !== undefined ? value.token : value;
        this._send(wsConnection, {
          type: this.config.messageType,
          data: { token },
        });
        this.emit("token", token);
      }

      // Generator exhausted without explicit done flag
      if (!connectionClosed && this._isOpen(wsConnection)) {
        this._send(wsConnection, { type: this.config.doneType });
        this.emit("done");
      }
    } catch (err) {
      this.emit("error", err);

      if (!connectionClosed && this._isOpen(wsConnection)) {
        this._send(wsConnection, {
          type: this.config.errorType,
          data: { message: err.message || "Internal streaming error" },
        });
      }
    } finally {
      if (typeof wsConnection.removeListener === "function") {
        wsConnection.removeListener("close", onClose);
        wsConnection.removeListener("error", onError);
      }
    }
  }

  /**
   * Check whether the WebSocket connection is still open.
   *
   * @param {Object} wsConnection
   * @returns {boolean}
   * @private
   */
  _isOpen(wsConnection) {
    if (typeof wsConnection.readyState === "number") {
      return wsConnection.readyState === WS_READY_STATE.OPEN;
    }
    // If readyState is not available, assume open
    return true;
  }

  /**
   * Send a JSON-serialised message over the WebSocket.
   *
   * @param {Object} wsConnection
   * @param {Object} payload
   * @private
   */
  _send(wsConnection, payload) {
    wsConnection.send(JSON.stringify(payload));
  }
}

module.exports = { WebSocketAdapter, DEFAULT_CONFIG };
