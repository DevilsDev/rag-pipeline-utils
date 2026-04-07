'use strict';

/**
 * Stream Router
 *
 * Wraps a RAG pipeline and routes streaming output to the appropriate
 * transport adapter (SSE or WebSocket) based on the incoming request.
 *
 * @module streaming/stream-router
 * @since 2.4.0
 */

const { EventEmitter } = require('events');
const { SSEAdapter } = require('./sse-adapter');
const { WebSocketAdapter } = require('./websocket-adapter');

/**
 * Default configuration for the stream router
 * @type {Object}
 */
const DEFAULT_CONFIG = {
  /** @type {string} Transport to use when auto-detection is inconclusive */
  defaultTransport: 'sse',
  /** @type {boolean} Whether to set CORS headers on responses */
  enableCORS: true,
  /** @type {string} Value for the Access-Control-Allow-Origin header */
  corsOrigin: '*',
};

/**
 * Routes pipeline streaming output to SSE or WebSocket transports.
 *
 * Provides both an Express/Node-HTTP-compatible request handler via
 * {@link StreamRouter#createHandler} and lower-level convenience methods
 * ({@link StreamRouter#streamSSE}, {@link StreamRouter#streamWS}) for
 * manual integration.
 *
 * @extends EventEmitter
 *
 * @example
 *   const router = new StreamRouter({ enableCORS: true });
 *   const handler = router.createHandler(pipeline);
 *   app.post('/api/query', handler);
 */
class StreamRouter extends EventEmitter {
  /**
   * @param {Object} [options] - Configuration overrides
   * @param {string} [options.defaultTransport='sse'] - Fallback transport type
   * @param {boolean} [options.enableCORS=true] - Enable CORS headers
   * @param {string} [options.corsOrigin='*'] - CORS origin value
   * @param {Object} [options.sseOptions] - Options forwarded to SSEAdapter
   * @param {Object} [options.wsOptions] - Options forwarded to WebSocketAdapter
   */
  constructor(options = {}) {
    super();
    this.config = { ...DEFAULT_CONFIG, ...options };
    this.sseAdapter = new SSEAdapter(options.sseOptions);
    this.wsAdapter = new WebSocketAdapter(options.wsOptions);
  }

  /**
   * Create an HTTP request handler that runs the pipeline in streaming mode
   * and routes output to the appropriate transport.
   *
   * The returned function is compatible with Node's `http.createServer`,
   * Express, and similar frameworks.
   *
   * Transport detection:
   * - `Accept: text/event-stream` header selects SSE
   * - `Upgrade: websocket` header selects WebSocket (note: actual upgrade
   *   negotiation is typically handled at a higher level)
   * - Otherwise falls back to {@link DEFAULT_CONFIG.defaultTransport}
   *
   * @param {Object} pipeline - A pipeline object with a `.run()` method
   * @returns {Function} Async request handler `(req, res) => Promise<void>`
   */
  createHandler(pipeline) {
    /**
     * @param {import('http').IncomingMessage} req
     * @param {import('http').ServerResponse} res
     */
    const handler = async (req, res) => {
      try {
        // --- 1. Parse query -----------------------------------------------
        const query =
          (req.body && req.body.query) || (req.query && req.query.q) || '';

        if (!query) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Missing query parameter' }));
          return;
        }

        // --- 2. CORS headers ----------------------------------------------
        if (this.config.enableCORS) {
          res.setHeader('Access-Control-Allow-Origin', this.config.corsOrigin);
          res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
          res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept');
        }

        // Handle CORS preflight
        if (req.method === 'OPTIONS') {
          res.writeHead(204);
          res.end();
          return;
        }

        // --- 3. Detect transport ------------------------------------------
        const accept = (req.headers && req.headers.accept) || '';
        const upgrade = (req.headers && req.headers.upgrade) || '';

        let transport = this.config.defaultTransport;
        if (accept.includes('text/event-stream')) {
          transport = 'sse';
        } else if (upgrade.toLowerCase() === 'websocket') {
          transport = 'ws';
        }

        // --- 4. Route to adapter ------------------------------------------
        if (transport === 'sse') {
          await this.streamSSE(pipeline, query, res);
        } else if (transport === 'ws') {
          // WebSocket upgrade is normally handled at the server level;
          // send a hint response when received through a regular handler.
          res.writeHead(426, { 'Content-Type': 'application/json' });
          res.end(
            JSON.stringify({
              error: 'WebSocket upgrade required',
              hint: 'Use the streamWS() method with an upgraded WebSocket connection',
            }),
          );
        } else {
          await this.streamSSE(pipeline, query, res);
        }
      } catch (err) {
        this.emit('error', err);

        if (!res.headersSent) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
        }
        if (!res.writableEnded) {
          res.end(
            JSON.stringify({ error: err.message || 'Internal server error' }),
          );
        }
      }
    };

    return handler;
  }

  /**
   * Run the pipeline in streaming mode and pipe tokens to an HTTP response
   * via Server-Sent Events.
   *
   * If the pipeline returns a non-iterable result, it is sent as a single
   * SSE data frame followed by the done sentinel.
   *
   * @param {Object} pipeline - Pipeline with a `.run()` method
   * @param {string} query - User query string
   * @param {import('http').ServerResponse} httpResponse - Writable HTTP response
   * @param {Object} [options={}] - Additional pipeline run options
   * @returns {Promise<void>}
   */
  async streamSSE(pipeline, query, httpResponse, options = {}) {
    const result = await pipeline.run({
      query,
      options: { ...options, stream: true },
    });

    if (result && Symbol.asyncIterator in Object(result)) {
      await this.sseAdapter.stream(result, httpResponse);
    } else {
      // Non-streaming result: send as a single SSE frame then DONE
      httpResponse.writeHead(200, { 'Content-Type': 'text/event-stream' });
      httpResponse.write(`data: ${JSON.stringify(result)}\n\n`);
      httpResponse.write(`data: [DONE]\n\n`);
      httpResponse.end();
    }
  }

  /**
   * Run the pipeline in streaming mode and pipe tokens over a WebSocket
   * connection.
   *
   * If the pipeline returns a non-iterable result, it is sent as a single
   * `result` message followed by a `done` message.
   *
   * @param {Object} pipeline - Pipeline with a `.run()` method
   * @param {string} query - User query string
   * @param {Object} wsConnection - WebSocket-like connection with `.send()`
   * @param {Object} [options={}] - Additional pipeline run options
   * @returns {Promise<void>}
   */
  async streamWS(pipeline, query, wsConnection, options = {}) {
    const result = await pipeline.run({
      query,
      options: { ...options, stream: true },
    });

    if (result && Symbol.asyncIterator in Object(result)) {
      await this.wsAdapter.stream(result, wsConnection);
    } else {
      wsConnection.send(JSON.stringify({ type: 'result', data: result }));
      wsConnection.send(JSON.stringify({ type: 'done' }));
    }
  }
}

module.exports = { StreamRouter, DEFAULT_CONFIG };
