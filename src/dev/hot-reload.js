"use strict";

/**
 * Hot Reload Manager for Development
 *
 * Provides hot reloading functionality for plugins and configuration
 * during development without requiring application restart.
 *
 * Features:
 * - File watching for plugins and configuration
 * - Dynamic plugin reloading
 * - State preservation during compatible reloads
 * - Reload events and hooks
 * - Error handling with notifications
 *
 * @module dev/hot-reload
 * @since 2.4.0
 */

const { EventEmitter } = require("events");
const chokidar = require("chokidar");
const path = require("path");
const fs = require("fs");
const {
  createError,
  wrapError,
  ERROR_CODES,
} = require("../utils/error-formatter");

/**
 * Hot Reload Manager
 *
 * Manages file watching and hot reloading of plugins and configuration.
 */
class HotReloadManager extends EventEmitter {
  constructor(options = {}) {
    super();

    this.options = {
      enabled: options.enabled !== false,
      watchPaths: options.watchPaths || ["./src/plugins", "./src/mocks"],
      configPath: options.configPath || ".ragrc.json",
      debounceDelay: options.debounceDelay || 300,
      preserveState: options.preserveState !== false,
      verbose: options.verbose || false,
      ignorePatterns: options.ignorePatterns || [
        "**/node_modules/**",
        "**/*.test.js",
        "**/*.spec.js",
        "**/.git/**",
      ],
      ...options,
    };

    // Internal state
    this.watchers = [];
    this.pluginRegistry = options.pluginRegistry || null;
    this.reloadQueue = new Map();
    this.debounceTimers = new Map();
    this.pluginState = new Map();
    this.reloadHistory = [];
    this.isReloading = false;

    // Statistics
    this.stats = {
      totalReloads: 0,
      successfulReloads: 0,
      failedReloads: 0,
      configReloads: 0,
      pluginReloads: 0,
      averageReloadTime: 0,
    };

    // Lifecycle hooks
    this.hooks = {
      beforeReload: [],
      afterReload: [],
      onError: [],
      onStatePreserve: [],
      onStateRestore: [],
    };

    if (this.options.enabled) {
      this._log("Hot reload manager initialized");
    }
  }

  /**
   * Start watching for file changes
   *
   * @returns {Promise<void>}
   */
  async start() {
    if (!this.options.enabled) {
      this._log("Hot reload is disabled");
      return;
    }

    this._log("Starting hot reload manager...");

    // Watch plugin files
    await this._watchPlugins();

    // Watch configuration file
    await this._watchConfig();

    this.emit("started");
    this._log("Hot reload manager started successfully");
  }

  /**
   * Stop watching for file changes
   *
   * @returns {Promise<void>}
   */
  async stop() {
    this._log("Stopping hot reload manager...");

    // Close all watchers
    for (const watcher of this.watchers) {
      await watcher.close();
    }

    this.watchers = [];
    this.emit("stopped");
    this._log("Hot reload manager stopped");
  }

  /**
   * Watch plugin files
   *
   * @private
   * @returns {Promise<void>}
   */
  async _watchPlugins() {
    const watcher = chokidar.watch(this.options.watchPaths, {
      ignored: this.options.ignorePatterns,
      persistent: true,
      ignoreInitial: true,
      awaitWriteFinish: {
        stabilityThreshold: 100,
        pollInterval: 50,
      },
    });

    watcher.on("change", (filePath) => {
      this._handlePluginChange(filePath);
    });

    watcher.on("add", (filePath) => {
      this._log(`New plugin detected: ${filePath}`);
      this.emit("plugin:added", { path: filePath });
    });

    watcher.on("unlink", (filePath) => {
      this._log(`Plugin removed: ${filePath}`);
      this.emit("plugin:removed", { path: filePath });
      this._handlePluginRemoval(filePath);
    });

    watcher.on("error", (error) => {
      this._handleError("Plugin watcher error", error);
    });

    this.watchers.push(watcher);
    this._log(`Watching plugins in: ${this.options.watchPaths.join(", ")}`);
  }

  /**
   * Watch configuration file
   *
   * @private
   * @returns {Promise<void>}
   */
  async _watchConfig() {
    if (!this.options.configPath) {
      return;
    }

    const watcher = chokidar.watch(this.options.configPath, {
      persistent: true,
      ignoreInitial: true,
      awaitWriteFinish: {
        stabilityThreshold: 200,
        pollInterval: 100,
      },
    });

    watcher.on("change", () => {
      this._handleConfigChange();
    });

    watcher.on("error", (error) => {
      this._handleError("Config watcher error", error);
    });

    this.watchers.push(watcher);
    this._log(`Watching configuration: ${this.options.configPath}`);
  }

  /**
   * Handle plugin file change
   *
   * @private
   * @param {string} filePath - Changed file path
   */
  _handlePluginChange(filePath) {
    this._log(`Plugin changed: ${filePath}`);

    // Debounce rapid changes
    if (this.debounceTimers.has(filePath)) {
      clearTimeout(this.debounceTimers.get(filePath));
    }

    const timer = setTimeout(() => {
      this._reloadPlugin(filePath);
      this.debounceTimers.delete(filePath);
    }, this.options.debounceDelay);

    this.debounceTimers.set(filePath, timer);
  }

  /**
   * Handle configuration change
   *
   * @private
   */
  _handleConfigChange() {
    this._log("Configuration changed");

    // Debounce config changes
    if (this.debounceTimers.has("config")) {
      clearTimeout(this.debounceTimers.get("config"));
    }

    const timer = setTimeout(() => {
      this._reloadConfig();
      this.debounceTimers.delete("config");
    }, this.options.debounceDelay);

    this.debounceTimers.set("config", timer);
  }

  /**
   * Reload a plugin
   *
   * @private
   * @param {string} filePath - Plugin file path
   * @returns {Promise<void>}
   */
  async _reloadPlugin(filePath) {
    if (this.isReloading) {
      this.reloadQueue.set(filePath, "plugin");
      return;
    }

    this.isReloading = true;
    const startTime = Date.now();

    try {
      this._log(`Reloading plugin: ${filePath}`);

      // Execute before reload hooks
      await this._executeHooks("beforeReload", {
        type: "plugin",
        path: filePath,
      });

      // Preserve state if enabled
      let preservedState = null;
      if (this.options.preserveState) {
        preservedState = await this._preservePluginState(filePath);
      }

      // Clear module cache
      const resolvedPath = require.resolve(path.resolve(filePath));
      delete require.cache[resolvedPath];

      // Reload the plugin
      const plugin = require(resolvedPath);

      // Restore state if preserved
      if (preservedState && this.options.preserveState) {
        await this._restorePluginState(plugin, preservedState);
      }

      // Update plugin registry if available
      if (this.pluginRegistry) {
        await this._updatePluginRegistry(filePath, plugin);
      }

      const reloadTime = Date.now() - startTime;

      // Update statistics
      this.stats.totalReloads++;
      this.stats.successfulReloads++;
      this.stats.pluginReloads++;
      this._updateAverageReloadTime(reloadTime);

      // Record reload
      this._recordReload({
        type: "plugin",
        path: filePath,
        success: true,
        duration: reloadTime,
        timestamp: new Date().toISOString(),
      });

      // Execute after reload hooks
      await this._executeHooks("afterReload", {
        type: "plugin",
        path: filePath,
        plugin,
        duration: reloadTime,
      });

      this.emit("plugin:reloaded", {
        path: filePath,
        plugin,
        duration: reloadTime,
      });

      this._log(`Plugin reloaded successfully: ${filePath} (${reloadTime}ms)`);
    } catch (error) {
      this.stats.totalReloads++;
      this.stats.failedReloads++;

      this._recordReload({
        type: "plugin",
        path: filePath,
        success: false,
        error: error.message,
        timestamp: new Date().toISOString(),
      });

      const enhancedError = wrapError(error, ERROR_CODES.HOT_RELOAD_FAILED, {
        path: filePath,
        reason: error.message,
        watchPaths: this.options.watchPaths.join(", "),
      });

      this._handleError(`Failed to reload plugin: ${filePath}`, enhancedError);

      this.emit("plugin:reload-failed", {
        path: filePath,
        error: enhancedError.message,
        suggestions: enhancedError.suggestions,
      });
    } finally {
      this.isReloading = false;

      // Process queued reloads
      await this._processReloadQueue();
    }
  }

  /**
   * Reload configuration
   *
   * @private
   * @returns {Promise<void>}
   */
  async _reloadConfig() {
    if (this.isReloading) {
      this.reloadQueue.set("config", "config");
      return;
    }

    this.isReloading = true;
    const startTime = Date.now();

    try {
      this._log(`Reloading configuration: ${this.options.configPath}`);

      // Execute before reload hooks
      await this._executeHooks("beforeReload", {
        type: "config",
        path: this.options.configPath,
      });

      // Read and parse configuration
      const configContent = fs.readFileSync(this.options.configPath, "utf-8");
      const config = JSON.parse(configContent);

      // Validate configuration (if validator provided)
      if (this.options.configValidator) {
        const validation = this.options.configValidator(config);
        if (!validation.valid) {
          throw new Error(
            `Invalid configuration: ${validation.errors?.map((e) => e.message).join(", ")}`,
          );
        }
      }

      const reloadTime = Date.now() - startTime;

      // Update statistics
      this.stats.totalReloads++;
      this.stats.successfulReloads++;
      this.stats.configReloads++;
      this._updateAverageReloadTime(reloadTime);

      // Record reload
      this._recordReload({
        type: "config",
        path: this.options.configPath,
        success: true,
        duration: reloadTime,
        timestamp: new Date().toISOString(),
      });

      // Execute after reload hooks
      await this._executeHooks("afterReload", {
        type: "config",
        path: this.options.configPath,
        config,
        duration: reloadTime,
      });

      this.emit("config:reloaded", {
        path: this.options.configPath,
        config,
        duration: reloadTime,
      });

      this._log(
        `Configuration reloaded successfully: ${this.options.configPath} (${reloadTime}ms)`,
      );
    } catch (error) {
      this.stats.totalReloads++;
      this.stats.failedReloads++;

      this._recordReload({
        type: "config",
        path: this.options.configPath,
        success: false,
        error: error.message,
        timestamp: new Date().toISOString(),
      });

      const enhancedError = wrapError(error, ERROR_CODES.HOT_RELOAD_FAILED, {
        path: this.options.configPath,
        reason: error.message,
        watchPaths: this.options.watchPaths.join(", "),
      });

      this._handleError(
        `Failed to reload configuration: ${this.options.configPath}`,
        enhancedError,
      );

      this.emit("config:reload-failed", {
        path: this.options.configPath,
        error: enhancedError.message,
        suggestions: enhancedError.suggestions,
      });
    } finally {
      this.isReloading = false;

      // Process queued reloads
      await this._processReloadQueue();
    }
  }

  /**
   * Handle plugin removal
   *
   * @private
   * @param {string} filePath - Removed plugin path
   */
  _handlePluginRemoval(filePath) {
    // Clear from cache
    try {
      const resolvedPath = require.resolve(path.resolve(filePath));
      delete require.cache[resolvedPath];
    } catch (error) {
      // Plugin might not be in cache
    }

    // Clear preserved state
    this.pluginState.delete(filePath);

    // Notify plugin registry
    if (this.pluginRegistry) {
      // Plugin registry should handle removal
      this.emit("plugin:removed:registry", { path: filePath });
    }
  }

  /**
   * Preserve plugin state before reload
   *
   * @private
   * @param {string} filePath - Plugin file path
   * @returns {Promise<any>} Preserved state
   */
  async _preservePluginState(filePath) {
    try {
      const resolvedPath = require.resolve(path.resolve(filePath));
      const plugin = require.cache[resolvedPath]?.exports;

      if (!plugin) {
        return null;
      }

      let state = null;

      // Try to get state from plugin
      if (typeof plugin.getState === "function") {
        state = await plugin.getState();
      } else if (plugin.state) {
        state = { ...plugin.state };
      }

      if (state) {
        this.pluginState.set(filePath, state);

        await this._executeHooks("onStatePreserve", {
          path: filePath,
          state,
        });

        this._log(`State preserved for: ${filePath}`);
      }

      return state;
    } catch (error) {
      const enhancedError = wrapError(
        error,
        ERROR_CODES.HOT_RELOAD_STATE_ERROR,
        {
          reason: error.message,
        },
      );
      this._log(
        `Failed to preserve state for ${filePath}: ${enhancedError.message}`,
      );
      return null;
    }
  }

  /**
   * Restore plugin state after reload
   *
   * @private
   * @param {object} plugin - Reloaded plugin
   * @param {any} state - Preserved state
   * @returns {Promise<void>}
   */
  async _restorePluginState(plugin, state) {
    if (!state) {
      return;
    }

    try {
      // Try to restore state to plugin
      if (typeof plugin.setState === "function") {
        await plugin.setState(state);
      } else if (plugin.state !== undefined) {
        plugin.state = { ...state };
      }

      await this._executeHooks("onStateRestore", {
        plugin,
        state,
      });

      this._log("State restored successfully");
    } catch (error) {
      const enhancedError = wrapError(
        error,
        ERROR_CODES.HOT_RELOAD_STATE_ERROR,
        {
          reason: error.message,
        },
      );
      this._log(`Failed to restore state: ${enhancedError.message}`);
    }
  }

  /**
   * Update plugin registry with reloaded plugin
   *
   * @private
   * @param {string} filePath - Plugin file path
   * @param {object} plugin - Reloaded plugin
   * @returns {Promise<void>}
   */
  async _updatePluginRegistry(filePath, plugin) {
    // Extract plugin name and type from file path or plugin metadata
    const pluginName = path.basename(filePath, path.extname(filePath));

    // Notify registry of updated plugin
    if (typeof this.pluginRegistry.updatePlugin === "function") {
      await this.pluginRegistry.updatePlugin(pluginName, plugin);
    }

    this._log(`Plugin registry updated: ${pluginName}`);
  }

  /**
   * Process queued reloads
   *
   * @private
   * @returns {Promise<void>}
   */
  async _processReloadQueue() {
    if (this.reloadQueue.size === 0) {
      return;
    }

    const [[key, type]] = this.reloadQueue.entries();
    this.reloadQueue.delete(key);

    if (type === "plugin") {
      await this._reloadPlugin(key);
    } else if (type === "config") {
      await this._reloadConfig();
    }
  }

  /**
   * Execute lifecycle hooks
   *
   * @private
   * @param {string} hookName - Hook name
   * @param {object} data - Hook data
   * @returns {Promise<void>}
   */
  async _executeHooks(hookName, data) {
    const hooks = this.hooks[hookName] || [];

    for (const hook of hooks) {
      try {
        await hook(data);
      } catch (error) {
        this._log(`Hook ${hookName} failed: ${error.message}`);
      }
    }
  }

  /**
   * Record reload in history
   *
   * @private
   * @param {object} record - Reload record
   */
  _recordReload(record) {
    this.reloadHistory.push(record);

    // Keep only last 100 records
    if (this.reloadHistory.length > 100) {
      this.reloadHistory.shift();
    }
  }

  /**
   * Update average reload time
   *
   * @private
   * @param {number} duration - Reload duration
   */
  _updateAverageReloadTime(duration) {
    const total =
      this.stats.averageReloadTime * (this.stats.successfulReloads - 1);
    this.stats.averageReloadTime =
      (total + duration) / this.stats.successfulReloads;
  }

  /**
   * Handle errors
   *
   * @private
   * @param {string} message - Error message
   * @param {Error} error - Error object
   */
  _handleError(message, error) {
    this._log(`ERROR: ${message}: ${error.message}`, true);

    this._executeHooks("onError", {
      message,
      error,
      stack: error.stack,
    });

    this.emit("error", {
      message,
      error: error.message,
      stack: error.stack,
    });
  }

  /**
   * Log message
   *
   * @private
   * @param {string} message - Log message
   * @param {boolean} isError - Whether this is an error
   */
  _log(message, isError = false) {
    if (this.options.verbose || isError) {
      const prefix = "[HotReload]";
      if (isError) {
        console.error(`${prefix} ${message}`);
      } else {
        console.log(`${prefix} ${message}`);
      }
    }
  }

  /**
   * Register a lifecycle hook
   *
   * @param {string} hookName - Hook name (beforeReload, afterReload, onError, etc.)
   * @param {Function} callback - Hook callback
   */
  registerHook(hookName, callback) {
    if (!this.hooks[hookName]) {
      throw new Error(`Unknown hook: ${hookName}`);
    }

    this.hooks[hookName].push(callback);
    this._log(`Hook registered: ${hookName}`);
  }

  /**
   * Unregister a lifecycle hook
   *
   * @param {string} hookName - Hook name
   * @param {Function} callback - Hook callback
   */
  unregisterHook(hookName, callback) {
    if (!this.hooks[hookName]) {
      return;
    }

    const index = this.hooks[hookName].indexOf(callback);
    if (index !== -1) {
      this.hooks[hookName].splice(index, 1);
      this._log(`Hook unregistered: ${hookName}`);
    }
  }

  /**
   * Get reload statistics
   *
   * @returns {object} Reload statistics
   */
  getStats() {
    return {
      ...this.stats,
      reloadHistory: [...this.reloadHistory],
      isEnabled: this.options.enabled,
      isReloading: this.isReloading,
      queuedReloads: this.reloadQueue.size,
    };
  }

  /**
   * Get reload history
   *
   * @returns {Array<object>} Reload history
   */
  getHistory() {
    return [...this.reloadHistory];
  }

  /**
   * Clear reload history
   */
  clearHistory() {
    this.reloadHistory = [];
    this._log("Reload history cleared");
  }

  /**
   * Manually trigger a reload
   *
   * @param {string} filePath - File path to reload
   * @param {string} type - Type ('plugin' or 'config')
   * @returns {Promise<void>}
   */
  async triggerReload(filePath, type = "plugin") {
    if (type === "plugin") {
      await this._reloadPlugin(filePath);
    } else if (type === "config") {
      await this._reloadConfig();
    } else {
      throw new Error(`Unknown reload type: ${type}`);
    }
  }
}

/**
 * Create hot reload manager
 *
 * @param {object} options - Manager options
 * @returns {HotReloadManager} Hot reload manager instance
 */
function createHotReloadManager(options = {}) {
  return new HotReloadManager(options);
}

module.exports = {
  HotReloadManager,
  createHotReloadManager,
};
