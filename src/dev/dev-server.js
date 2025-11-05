"use strict";

/**
 * Development Server with Hot Reload Support
 *
 * Provides a development server with integrated hot reloading
 * for rapid plugin and configuration development.
 *
 * Features:
 * - Automatic hot reloading of plugins and configuration
 * - Live feedback on reload status
 * - Error notifications
 * - Statistics dashboard
 * - WebSocket support for real-time updates (optional)
 *
 * @module dev/dev-server
 * @since 2.4.0
 */

const { EventEmitter } = require("events");
const { createHotReloadManager } = require("./hot-reload");
const logger = require("../utils/logger");

/**
 * Development Server
 *
 * Integrates hot reloading with a development workflow
 */
class DevServer extends EventEmitter {
  constructor(options = {}) {
    super();

    this.options = {
      port: options.port || 3000,
      host: options.host || "localhost",
      watchPaths: options.watchPaths || ["./src/plugins", "./src/mocks"],
      configPath: options.configPath || ".ragrc.json",
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
    this.hotReload.on("plugin:reloaded", ({ path, duration }) => {
      this._log(`✓ Plugin reloaded: ${path} (${duration}ms)`, "success");
      this.emit("plugin:reloaded", { path, duration });

      if (this.options.notifyOnReload) {
        this._notify(`Plugin reloaded: ${path}`, "success");
      }
    });

    // Plugin reload failed
    this.hotReload.on("plugin:reload-failed", ({ path, error }) => {
      this._log(`✗ Plugin reload failed: ${path} - ${error}`, "error");
      this.emit("plugin:reload-failed", { path, error });

      if (this.options.notifyOnReload) {
        this._notify(`Plugin reload failed: ${path}`, "error");
      }
    });

    // Config reloaded
    this.hotReload.on("config:reloaded", ({ path, duration }) => {
      this._log(`✓ Configuration reloaded: ${path} (${duration}ms)`, "success");
      this.emit("config:reloaded", { path, duration });

      if (this.options.notifyOnReload) {
        this._notify(`Configuration reloaded`, "success");
      }

      // Reinitialize pipeline if provided
      if (this.options.pipeline && this.options.pipeline.reinitialize) {
        this.options.pipeline.reinitialize();
      }
    });

    // Config reload failed
    this.hotReload.on("config:reload-failed", ({ path, error }) => {
      this._log(`✗ Configuration reload failed: ${path} - ${error}`, "error");
      this.emit("config:reload-failed", { path, error });

      if (this.options.notifyOnReload) {
        this._notify(`Configuration reload failed`, "error");
      }
    });

    // Plugin added
    this.hotReload.on("plugin:added", ({ path }) => {
      this._log(`+ New plugin detected: ${path}`, "info");
      this.emit("plugin:added", { path });
    });

    // Plugin removed
    this.hotReload.on("plugin:removed", ({ path }) => {
      this._log(`- Plugin removed: ${path}`, "info");
      this.emit("plugin:removed", { path });
    });

    // Error
    this.hotReload.on("error", ({ message, error }) => {
      this._log(`ERROR: ${message} - ${error}`, "error");
      this.emit("error", { message, error });
    });
  }

  /**
   * Start the development server
   *
   * @returns {Promise<void>}
   */
  async start() {
    if (this.isRunning) {
      this._log("Development server is already running", "warn");
      return;
    }

    this._log("Starting development server...", "info");
    this.startTime = Date.now();

    // Start hot reload
    await this.hotReload.start();

    this.isRunning = true;

    this._log(
      `Development server started on ${this.options.host}:${this.options.port}`,
      "success",
    );
    this._log(`Watching: ${this.options.watchPaths.join(", ")}`, "info");
    this._log(
      "Hot reload enabled - changes will be applied automatically",
      "info",
    );
    this._log("Press Ctrl+C to stop", "info");

    this.emit("started");
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

    this._log("Stopping development server...", "info");

    // Stop hot reload
    await this.hotReload.stop();

    this.isRunning = false;

    const uptime = this.startTime ? Date.now() - this.startTime : 0;
    this._log(
      `Development server stopped (uptime: ${this._formatDuration(uptime)})`,
      "info",
    );

    this.emit("stopped");
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
      port: this.options.port,
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
║ Status:              ${this.isRunning ? "Running" : "Stopped"}                              ║
║ Uptime:              ${this._formatDuration(uptime).padEnd(39)}║
║                                                                ║
║ Hot Reload:                                                    ║
║   Total Reloads:     ${String(stats.totalReloads).padEnd(39)}║
║   Successful:        ${String(stats.successfulReloads).padEnd(39)}║
║   Failed:            ${String(stats.failedReloads).padEnd(39)}║
║   Plugin Reloads:    ${String(stats.pluginReloads).padEnd(39)}║
║   Config Reloads:    ${String(stats.configReloads).padEnd(39)}║
║   Avg Reload Time:   ${String(Math.round(stats.averageReloadTime) + "ms").padEnd(39)}║
║                                                                ║
║ Watching:                                                      ║
${this.options.watchPaths.map((p) => `║   - ${p.padEnd(56)}║`).join("\n")}
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
  async triggerReload(filePath, type = "plugin") {
    this._log(`Manually triggering reload: ${filePath}`, "info");
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
  _log(message, level = "info") {
    if (!this.options.verbose && level === "info") {
      return;
    }

    const prefix = "[DevServer]";

    switch (level) {
      case "success":
        console.log(`${prefix} ✓ ${message}`);
        break;
      case "error":
        console.error(`${prefix} ✗ ${message}`);
        break;
      case "warn":
        console.warn(`${prefix} ⚠ ${message}`);
        break;
      case "info":
      default:
        console.log(`${prefix} ${message}`);
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
  _notify(message, type = "info") {
    // In a real implementation, this could send desktop notifications
    // or WebSocket messages to connected clients
    this.emit("notification", { message, type, timestamp: new Date() });
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
