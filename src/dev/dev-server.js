'use strict';

/**
 * Development Server with Hot Reload Support
 *
 * Provides a development server with integrated hot reloading
 * for rapid plugin and configuration development.
 *
 * Features:
 * - Local HTTP API over the configured pipeline:
 *     GET  /health  -> { status, uptime }
 *     POST /query   -> { question, topK? } => { answer, results, citations }
 *   Binds to 127.0.0.1 by default, JSON only, no CORS headers, request
 *   bodies limited to 64 KB, no static file serving.
 * - Automatic hot reloading of plugins and configuration
 * - Statistics dashboard
 *
 * @module dev/dev-server
 * @since 2.4.0
 */

const http = require('http');
const { EventEmitter } = require('events');
const { createHotReloadManager } = require('./hot-reload');
const { logger } = require('../utils/logger');

const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '::1', '[::1]']);

/**
 * Development Server
 *
 * Integrates hot reloading with a development workflow
 */
class DevServer extends EventEmitter {
  constructor(options = {}) {
    super();

    this.options = {
      port: options.port ?? 3000, // 0 picks a free port
      host: options.host || '127.0.0.1',
      watchPaths: options.watchPaths || [],
      maxBodyBytes: options.maxBodyBytes || 64 * 1024,
      // Optional custom handler: async ({ question, topK }) => result
      query: options.query || null,
      configPath: options.configPath || '.ragrc.json',
      verbose: options.verbose !== false,
      autoReload: options.autoReload !== false,
      notifyOnReload: options.notifyOnReload !== false,
      pluginRegistry: options.pluginRegistry || null,
      pipeline: options.pipeline || null,
      ...options,
    };

    // Create hot reload manager
    this.hotReload = createHotReloadManager({
      enabled: this.options.autoReload,
      watchPaths: this.options.watchPaths,
      configPath: this.options.configPath,
      verbose: this.options.verbose,
      pluginRegistry: this.options.pluginRegistry,
      preserveState: true,
    });

    this.isRunning = false;
    this.startTime = null;

    // Setup hot reload event handlers
    this._setupHotReloadHandlers();
  }

  /**
   * Setup hot reload event handlers
   *
   * @private
   */
  _setupHotReloadHandlers() {
    // Plugin reloaded
    this.hotReload.on('plugin:reloaded', ({ path, duration }) => {
      this._log(`✓ Plugin reloaded: ${path} (${duration}ms)`, 'success');
      this.emit('plugin:reloaded', { path, duration });

      if (this.options.notifyOnReload) {
        this._notify(`Plugin reloaded: ${path}`, 'success');
      }
    });

    // Plugin reload failed
    this.hotReload.on('plugin:reload-failed', ({ path, error }) => {
      this._log(`✗ Plugin reload failed: ${path} - ${error}`, 'error');
      this.emit('plugin:reload-failed', { path, error });

      if (this.options.notifyOnReload) {
        this._notify(`Plugin reload failed: ${path}`, 'error');
      }
    });

    // Config reloaded
    this.hotReload.on('config:reloaded', ({ path, duration }) => {
      this._log(`✓ Configuration reloaded: ${path} (${duration}ms)`, 'success');
      this.emit('config:reloaded', { path, duration });

      if (this.options.notifyOnReload) {
        this._notify(`Configuration reloaded`, 'success');
      }

      // Reinitialize pipeline if provided
      if (this.options.pipeline && this.options.pipeline.reinitialize) {
        this.options.pipeline.reinitialize();
      }
    });

    // Config reload failed
    this.hotReload.on('config:reload-failed', ({ path, error }) => {
      this._log(`✗ Configuration reload failed: ${path} - ${error}`, 'error');
      this.emit('config:reload-failed', { path, error });

      if (this.options.notifyOnReload) {
        this._notify(`Configuration reload failed`, 'error');
      }
    });

    // Plugin added
    this.hotReload.on('plugin:added', ({ path }) => {
      this._log(`+ New plugin detected: ${path}`, 'info');
      this.emit('plugin:added', { path });
    });

    // Plugin removed
    this.hotReload.on('plugin:removed', ({ path }) => {
      this._log(`- Plugin removed: ${path}`, 'info');
      this.emit('plugin:removed', { path });
    });

    // Error
    this.hotReload.on('error', ({ message, error }) => {
      this._log(`ERROR: ${message} - ${error}`, 'error');
      this.emit('error', { message, error });
    });
  }

  /**
   * Start the development server
   *
   * @returns {Promise<void>}
   */
  async start() {
    if (this.isRunning) {
      this._log('Development server is already running', 'warn');
      return;
    }

    this._log('Starting development server...', 'info');
    this.startTime = Date.now();

    // Start hot reload
    await this.hotReload.start();

    this.server = http.createServer((req, res) => {
      this._handleRequest(req, res).catch((error) => {
        this._send(res, 500, { error: error.message });
      });
    });
    await new Promise((resolve, reject) => {
      this.server.once('error', reject);
      this.server.listen(this.options.port, this.options.host, () => {
        this.server.off('error', reject);
        resolve();
      });
    });
    this.port = this.server.address().port;

    this.isRunning = true;

    this._log(`Development server listening on ${this.url}`, 'success');
    this._log(`Watching: ${this.options.watchPaths.join(', ')}`, 'info');
    this._log(
      'Hot reload enabled - changes will be applied automatically',
      'info',
    );
    this._log('Press Ctrl+C to stop', 'info');

    this.emit('started');
  }

  /**
   * Stop the development server
   *
   * @returns {Promise<void>}
   */
  async stop() {
    if (!this.isRunning) {
      return;
    }

    this._log('Stopping development server...', 'info');

    // Stop hot reload
    await this.hotReload.stop();

    if (this.server) {
      await new Promise((resolve) => this.server.close(() => resolve()));
      this.server = null;
    }

    this.isRunning = false;

    const uptime = this.startTime ? Date.now() - this.startTime : 0;
    this._log(
      `Development server stopped (uptime: ${this._formatDuration(uptime)})`,
      'info',
    );

    this.emit('stopped');
  }

  /**
   * Get server status
   *
   * @returns {object} Server status
   */
  getStatus() {
    const stats = this.hotReload.getStats();
    const uptime = this.startTime ? Date.now() - this.startTime : 0;

    return {
      isRunning: this.isRunning,
      uptime,
      host: this.options.host,
      port: this.port ?? this.options.port,
      url: this.isRunning ? this.url : null,
      watchPaths: this.options.watchPaths,
      configPath: this.options.configPath,
      hotReload: {
        enabled: this.options.autoReload,
        stats,
      },
    };
  }

  /**
   * Get statistics dashboard
   *
   * @returns {string} Formatted statistics
   */
  getStatistics() {
    const stats = this.hotReload.getStats();
    const uptime = this.startTime ? Date.now() - this.startTime : 0;

    return `
╔════════════════════════════════════════════════════════════════╗
║                   Development Server Statistics                ║
╠════════════════════════════════════════════════════════════════╣
║ Status:              ${this.isRunning ? 'Running' : 'Stopped'}                              ║
║ Uptime:              ${this._formatDuration(uptime).padEnd(39)}║
║                                                                ║
║ Hot Reload:                                                    ║
║   Total Reloads:     ${String(stats.totalReloads).padEnd(39)}║
║   Successful:        ${String(stats.successfulReloads).padEnd(39)}║
║   Failed:            ${String(stats.failedReloads).padEnd(39)}║
║   Plugin Reloads:    ${String(stats.pluginReloads).padEnd(39)}║
║   Config Reloads:    ${String(stats.configReloads).padEnd(39)}║
║   Avg Reload Time:   ${String(Math.round(stats.averageReloadTime) + 'ms').padEnd(39)}║
║                                                                ║
║ Watching:                                                      ║
${this.options.watchPaths.map((p) => `║   - ${p.padEnd(56)}║`).join('\n')}
╚════════════════════════════════════════════════════════════════╝
    `.trim();
  }

  /**
   * Manually trigger a reload
   *
   * @param {string} filePath - File path to reload
   * @param {string} type - Type ('plugin' or 'config')
   * @returns {Promise<void>}
   */
  /** @returns {string} Base URL of the running server */
  get url() {
    return `http://${this.options.host}:${this.port ?? this.options.port}`;
  }

  /**
   * Route a request. Only GET /health and POST /query exist.
   * @private
   */
  async _handleRequest(req, res) {
    // DNS rebinding: a web page can point its own domain at 127.0.0.1 and
    // then call this server same-origin. When bound to loopback, only accept
    // requests addressed to a loopback name.
    if (
      LOOPBACK_HOSTS.has(this.options.host) &&
      !this._isLoopbackHostHeader(req)
    ) {
      return this._send(res, 403, { error: 'Forbidden host' });
    }

    const { pathname } = new URL(req.url, 'http://localhost');

    if (pathname === '/health') {
      if (req.method !== 'GET')
        return this._send(res, 405, { error: 'Use GET' });
      const uptime = this.startTime ? Date.now() - this.startTime : 0;
      return this._send(res, 200, { status: 'ok', uptime });
    }

    if (pathname === '/query') {
      if (req.method !== 'POST')
        return this._send(res, 405, { error: 'Use POST' });
      let body;
      try {
        body = await this._readJson(req);
      } catch (error) {
        return this._send(res, error.statusCode || 400, {
          error: error.message,
        });
      }
      const { question, topK } = body || {};
      if (typeof question !== 'string' || !question.trim()) {
        return this._send(res, 400, {
          error: '"question" must be a non-empty string',
        });
      }
      if (
        topK !== undefined &&
        !(Number.isInteger(topK) && topK > 0 && topK <= 50)
      ) {
        return this._send(res, 400, {
          error: '"topK" must be an integer from 1 to 50',
        });
      }
      const result = await this._runQuery({ question, topK: topK || 3 });
      return this._send(res, 200, result);
    }

    return this._send(res, 404, { error: 'Not found' });
  }

  /** @private */
  _isLoopbackHostHeader(req) {
    const header = req.headers.host || '';
    const hostname = header.startsWith('[')
      ? header.slice(0, header.indexOf(']') + 1)
      : header.split(':')[0];
    return LOOPBACK_HOSTS.has(hostname.toLowerCase());
  }

  /**
   * Answer with the custom `query` option, or the pipeline described by the
   * config file (reloaded per request, so config edits apply immediately).
   * @private
   */
  async _runQuery({ question, topK }) {
    if (this.options.query) return this.options.query({ question, topK });
    const { loadCliConfig } = require('../cli/shared/config-context');
    const { query } = require('../cli/services/rag-service');
    const { config, configDir } = loadCliConfig({
      config: this.options.configPath,
    });
    // The HTTP response keeps its shape: answer, results, citations.
    const { timings, durationMs, ...result } = await query({
      config,
      configDir,
      question,
      topK,
    });
    return result;
  }

  /** @private */
  _readJson(req) {
    return new Promise((resolve, reject) => {
      const type = req.headers['content-type'] || '';
      if (!type.includes('application/json')) {
        const error = new Error('Content-Type must be application/json');
        error.statusCode = 415;
        return reject(error);
      }
      let size = 0;
      const chunks = [];
      req.on('data', (chunk) => {
        size += chunk.length;
        if (size > this.options.maxBodyBytes) {
          const error = new Error('Request body too large');
          error.statusCode = 413;
          reject(error);
          // Stop buffering but keep draining, so the 413 response is delivered
          req.removeAllListeners('data');
          req.resume();
          return;
        }
        chunks.push(chunk);
      });
      req.on('end', () => {
        try {
          resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'));
        } catch {
          reject(new Error('Invalid JSON body'));
        }
      });
      req.on('error', reject);
    });
  }

  /** @private */
  _send(res, status, payload) {
    if (res.headersSent) return;
    res.writeHead(status, {
      'Content-Type': 'application/json; charset=utf-8',
      'X-Content-Type-Options': 'nosniff',
    });
    res.end(JSON.stringify(payload));
  }

  async triggerReload(filePath, type = 'plugin') {
    this._log(`Manually triggering reload: ${filePath}`, 'info');
    await this.hotReload.triggerReload(filePath, type);
  }

  /**
   * Register a lifecycle hook
   *
   * @param {string} hookName - Hook name
   * @param {Function} callback - Hook callback
   */
  registerHook(hookName, callback) {
    this.hotReload.registerHook(hookName, callback);
  }

  /**
   * Unregister a lifecycle hook
   *
   * @param {string} hookName - Hook name
   * @param {Function} callback - Hook callback
   */
  unregisterHook(hookName, callback) {
    this.hotReload.unregisterHook(hookName, callback);
  }

  /**
   * Log message
   *
   * @private
   * @param {string} message - Log message
   * @param {string} level - Log level
   */
  _log(message, level = 'info') {
    if (!this.options.verbose && level === 'info') {
      return;
    }

    const prefix = '[DevServer]';

    switch (level) {
      case 'success':
        logger.info(`${prefix} ${message}`);
        break;
      case 'error':
        logger.error(`${prefix} ${message}`);
        break;
      case 'warn':
        logger.warn(`${prefix} ${message}`);
        break;
      case 'info':
      default:
        logger.info(`${prefix} ${message}`);
        break;
    }
  }

  /**
   * Send notification
   *
   * @private
   * @param {string} message - Notification message
   * @param {string} type - Notification type
   */
  _notify(message, type = 'info') {
    // In a real implementation, this could send desktop notifications
    // or WebSocket messages to connected clients
    this.emit('notification', { message, type, timestamp: new Date() });
  }

  /**
   * Format duration
   *
   * @private
   * @param {number} ms - Duration in milliseconds
   * @returns {string} Formatted duration
   */
  _formatDuration(ms) {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);

    if (hours > 0) {
      return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
    } else if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`;
    } else {
      return `${seconds}s`;
    }
  }
}

/**
 * Create development server
 *
 * @param {object} options - Server options
 * @returns {DevServer} Development server instance
 */
function createDevServer(options = {}) {
  return new DevServer(options);
}

module.exports = {
  DevServer,
  createDevServer,
};
