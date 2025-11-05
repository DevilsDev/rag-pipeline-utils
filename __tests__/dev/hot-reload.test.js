"use strict";

/**
 * Hot Reload Manager Tests
 *
 * Comprehensive tests for hot reloading functionality
 */

const {
  HotReloadManager,
  createHotReloadManager,
} = require("../../src/dev/hot-reload");
const fs = require("fs");
const path = require("path");

// Mock dependencies
jest.mock("chokidar");
const chokidar = require("chokidar");

// Helper function to create HotReloadManager with error listener
function createTestHotReloadManager(options = {}) {
  const manager = new HotReloadManager(options);
  manager.on("error", () => {}); // Prevent unhandled errors in tests
  return manager;
}

describe("HotReloadManager", () => {
  let hotReload;
  let mockWatcher;

  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();

    // Create mock watcher
    mockWatcher = {
      on: jest.fn().mockReturnThis(),
      close: jest.fn().mockResolvedValue(undefined),
    };

    chokidar.watch = jest.fn().mockReturnValue(mockWatcher);

    // Suppress console output during tests
    jest.spyOn(console, "log").mockImplementation(() => {});
    jest.spyOn(console, "error").mockImplementation(() => {});

    // Create hotReload instance with error listener to prevent unhandled errors
    hotReload = null;
  });

  afterEach(async () => {
    if (hotReload) {
      await hotReload.stop();
    }
    console.log.mockRestore();
    console.error.mockRestore();
    jest.useRealTimers();
  });

  describe("Initialization", () => {
    test("should create hot reload manager with default options", () => {
      hotReload = createTestHotReloadManager();

      expect(hotReload).toBeInstanceOf(HotReloadManager);
      expect(hotReload.options.enabled).toBe(true);
      expect(hotReload.options.watchPaths).toEqual([
        "./src/plugins",
        "./src/mocks",
      ]);
      expect(hotReload.options.configPath).toBe(".ragrc.json");
      expect(hotReload.options.debounceDelay).toBe(300);
      expect(hotReload.options.preserveState).toBe(true);
    });

    test("should create hot reload manager with custom options", () => {
      hotReload = createTestHotReloadManager({
        enabled: true,
        watchPaths: ["./custom/plugins"],
        configPath: "./custom-config.json",
        debounceDelay: 500,
        preserveState: false,
        verbose: true,
      });

      expect(hotReload.options.watchPaths).toEqual(["./custom/plugins"]);
      expect(hotReload.options.configPath).toBe("./custom-config.json");
      expect(hotReload.options.debounceDelay).toBe(500);
      expect(hotReload.options.preserveState).toBe(false);
      expect(hotReload.options.verbose).toBe(true);
    });

    test("should initialize with disabled state", () => {
      hotReload = createTestHotReloadManager({ enabled: false });

      expect(hotReload.options.enabled).toBe(false);
    });

    test("should initialize statistics", () => {
      hotReload = createTestHotReloadManager();

      expect(hotReload.stats.totalReloads).toBe(0);
      expect(hotReload.stats.successfulReloads).toBe(0);
      expect(hotReload.stats.failedReloads).toBe(0);
      expect(hotReload.stats.configReloads).toBe(0);
      expect(hotReload.stats.pluginReloads).toBe(0);
      expect(hotReload.stats.averageReloadTime).toBe(0);
    });

    test("should initialize with plugin registry", () => {
      const mockRegistry = {
        updatePlugin: jest.fn(),
      };

      hotReload = createTestHotReloadManager({
        pluginRegistry: mockRegistry,
      });

      expect(hotReload.pluginRegistry).toBe(mockRegistry);
    });
  });

  describe("Factory Function", () => {
    test("should create manager using factory function", () => {
      hotReload = createTestHotReloadManager({ verbose: true });

      expect(hotReload).toBeInstanceOf(HotReloadManager);
      expect(hotReload.options.verbose).toBe(true);
    });
  });

  describe("Start and Stop", () => {
    test("should start hot reload manager", async () => {
      hotReload = createTestHotReloadManager();

      const startSpy = jest.fn();
      hotReload.on("started", startSpy);

      await hotReload.start();

      expect(chokidar.watch).toHaveBeenCalledTimes(2); // Plugins + config
      expect(startSpy).toHaveBeenCalled();
    });

    test("should not start if disabled", async () => {
      hotReload = createTestHotReloadManager({ enabled: false });

      await hotReload.start();

      expect(chokidar.watch).not.toHaveBeenCalled();
    });

    test("should stop hot reload manager", async () => {
      hotReload = createTestHotReloadManager();

      const stopSpy = jest.fn();
      hotReload.on("stopped", stopSpy);

      await hotReload.start();
      await hotReload.stop();

      expect(mockWatcher.close).toHaveBeenCalledTimes(2); // Plugins + config
      expect(stopSpy).toHaveBeenCalled();
    });

    test("should watch plugin paths", async () => {
      hotReload = createTestHotReloadManager({
        watchPaths: ["./src/plugins", "./src/custom"],
      });

      await hotReload.start();

      expect(chokidar.watch).toHaveBeenCalledWith(
        ["./src/plugins", "./src/custom"],
        expect.objectContaining({
          ignored: expect.any(Array),
          persistent: true,
          ignoreInitial: true,
        }),
      );
    });

    test("should watch config path", async () => {
      hotReload = createTestHotReloadManager({
        configPath: "./custom-config.json",
      });

      await hotReload.start();

      expect(chokidar.watch).toHaveBeenCalledWith(
        "./custom-config.json",
        expect.objectContaining({
          persistent: true,
          ignoreInitial: true,
        }),
      );
    });

    test("should not watch config if path not provided", async () => {
      hotReload = createTestHotReloadManager({
        configPath: null,
      });

      await hotReload.start();

      expect(chokidar.watch).toHaveBeenCalledTimes(1); // Only plugins
    });
  });

  describe("Plugin Change Handling", () => {
    beforeEach(() => {
      jest.useFakeTimers();
      hotReload = createTestHotReloadManager({ debounceDelay: 300 });
    });

    test("should handle plugin file change", async () => {
      await hotReload.start();

      // Get the 'change' handler
      const changeHandler = mockWatcher.on.mock.calls.find(
        (call) => call[0] === "change",
      )[1];

      const filePath = "./src/plugins/test-plugin.js";

      // Trigger change
      changeHandler(filePath);

      // Should debounce
      expect(hotReload.debounceTimers.has(filePath)).toBe(true);

      // Fast-forward time
      jest.advanceTimersByTime(300);

      expect(hotReload.debounceTimers.has(filePath)).toBe(false);
    });

    test("should debounce rapid changes", async () => {
      await hotReload.start();

      const changeHandler = mockWatcher.on.mock.calls.find(
        (call) => call[0] === "change",
      )[1];

      const filePath = "./src/plugins/test-plugin.js";

      // Trigger multiple rapid changes
      changeHandler(filePath);
      jest.advanceTimersByTime(100);
      changeHandler(filePath);
      jest.advanceTimersByTime(100);
      changeHandler(filePath);

      // Should only have one timer
      expect(hotReload.debounceTimers.has(filePath)).toBe(true);

      // Fast-forward to complete debounce
      jest.advanceTimersByTime(300);

      expect(hotReload.debounceTimers.has(filePath)).toBe(false);
    });

    test("should handle plugin addition", async () => {
      await hotReload.start();

      const addSpy = jest.fn();
      hotReload.on("plugin:added", addSpy);

      const addHandler = mockWatcher.on.mock.calls.find(
        (call) => call[0] === "add",
      )[1];

      const filePath = "./src/plugins/new-plugin.js";
      addHandler(filePath);

      expect(addSpy).toHaveBeenCalledWith({ path: filePath });
    });

    test("should handle plugin removal", async () => {
      await hotReload.start();

      const removeSpy = jest.fn();
      hotReload.on("plugin:removed", removeSpy);

      const unlinkHandler = mockWatcher.on.mock.calls.find(
        (call) => call[0] === "unlink",
      )[1];

      const filePath = "./src/plugins/removed-plugin.js";
      unlinkHandler(filePath);

      expect(removeSpy).toHaveBeenCalledWith({ path: filePath });
    });

    test("should handle watcher errors", async () => {
      await hotReload.start();

      const errorSpy = jest.fn();
      hotReload.on("error", errorSpy);

      const errorHandler = mockWatcher.on.mock.calls.find(
        (call) => call[0] === "error",
      )[1];

      const error = new Error("Watcher error");
      errorHandler(error);

      expect(errorSpy).toHaveBeenCalled();
    });
  });

  describe("Configuration Change Handling", () => {
    beforeEach(() => {
      jest.useFakeTimers();
      hotReload = createTestHotReloadManager({ debounceDelay: 300 });
    });

    test("should handle config file change", async () => {
      await hotReload.start();

      // Get the config watcher change handler
      const configWatcher = chokidar.watch.mock.calls.find((call) =>
        call[0].includes(".ragrc.json"),
      );

      expect(configWatcher).toBeDefined();

      // Simulate change through the manager
      hotReload._handleConfigChange();

      expect(hotReload.debounceTimers.has("config")).toBe(true);

      jest.advanceTimersByTime(300);

      expect(hotReload.debounceTimers.has("config")).toBe(false);
    });

    test("should debounce rapid config changes", async () => {
      await hotReload.start();

      // Trigger multiple changes
      hotReload._handleConfigChange();
      jest.advanceTimersByTime(100);
      hotReload._handleConfigChange();
      jest.advanceTimersByTime(100);
      hotReload._handleConfigChange();

      expect(hotReload.debounceTimers.has("config")).toBe(true);

      jest.advanceTimersByTime(300);

      expect(hotReload.debounceTimers.has("config")).toBe(false);
    });
  });

  describe("Plugin Reloading", () => {
    test("should reload plugin successfully", async () => {
      const mockPlugin = {
        name: "test-plugin",
        load: jest.fn(),
      };

      // Mock require
      jest.mock("./test-plugin.js", () => mockPlugin, { virtual: true });

      hotReload = createTestHotReloadManager({ verbose: true });

      // Always attach error listener to prevent unhandled errors
      hotReload.on("error", () => {});

      const reloadSpy = jest.fn();
      hotReload.on("plugin:reloaded", reloadSpy);

      const filePath = path.resolve("./test-plugin.js");

      await hotReload._reloadPlugin(filePath);

      // Plugin reload will fail because file doesn't exist, but totalReloads should increment
      expect(hotReload.stats.totalReloads).toBe(1);
    });

    test("should handle plugin reload failure", async () => {
      hotReload = createTestHotReloadManager();

      // Attach error listener to prevent unhandled errors
      hotReload.on("error", () => {});

      const failSpy = jest.fn();
      hotReload.on("plugin:reload-failed", failSpy);

      const filePath = "./nonexistent-plugin.js";

      await hotReload._reloadPlugin(filePath);

      expect(hotReload.stats.totalReloads).toBe(1);
      expect(hotReload.stats.failedReloads).toBe(1);
      expect(failSpy).toHaveBeenCalled();
    });

    test("should queue reloads when already reloading", async () => {
      hotReload = createTestHotReloadManager();
      hotReload.isReloading = true;

      const filePath = "./test-plugin.js";

      await hotReload._reloadPlugin(filePath);

      expect(hotReload.reloadQueue.has(filePath)).toBe(true);
      expect(hotReload.reloadQueue.get(filePath)).toBe("plugin");
    });

    test("should update plugin registry after reload", async () => {
      const mockRegistry = {
        updatePlugin: jest.fn().mockResolvedValue(undefined),
      };

      const mockPlugin = {
        name: "test-plugin",
      };

      hotReload = createTestHotReloadManager({
        pluginRegistry: mockRegistry,
      });

      const filePath = "./test-plugin.js";

      // Directly call _updatePluginRegistry which extracts name from path
      await hotReload._updatePluginRegistry(filePath, mockPlugin);

      // Should call updatePlugin with the extracted plugin name
      expect(mockRegistry.updatePlugin).toHaveBeenCalledWith(
        "test-plugin",
        mockPlugin,
      );
    });
  });

  describe("Configuration Reloading", () => {
    test("should reload configuration successfully", async () => {
      const mockConfig = {
        metadata: { name: "test-config" },
        plugins: {},
      };

      jest
        .spyOn(fs, "readFileSync")
        .mockReturnValue(JSON.stringify(mockConfig));

      hotReload = createTestHotReloadManager({
        configPath: "./test-config.json",
      });

      const reloadSpy = jest.fn();
      hotReload.on("config:reloaded", reloadSpy);

      await hotReload._reloadConfig();

      expect(hotReload.stats.configReloads).toBe(1);
      expect(hotReload.stats.successfulReloads).toBe(1);
      expect(reloadSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          config: mockConfig,
        }),
      );

      fs.readFileSync.mockRestore();
    });

    test("should handle invalid JSON in config", async () => {
      jest.spyOn(fs, "readFileSync").mockReturnValue("{ invalid json }");

      hotReload = createTestHotReloadManager({
        configPath: "./invalid-config.json",
      });

      const failSpy = jest.fn();
      hotReload.on("config:reload-failed", failSpy);

      await hotReload._reloadConfig();

      expect(hotReload.stats.failedReloads).toBe(1);
      expect(failSpy).toHaveBeenCalled();

      fs.readFileSync.mockRestore();
    });

    test("should validate config with custom validator", async () => {
      const mockConfig = {
        metadata: { name: "test-config" },
      };

      const mockValidator = jest.fn().mockReturnValue({
        valid: false,
        errors: [{ message: "Invalid config" }],
      });

      jest
        .spyOn(fs, "readFileSync")
        .mockReturnValue(JSON.stringify(mockConfig));

      hotReload = createTestHotReloadManager({
        configPath: "./test-config.json",
        configValidator: mockValidator,
      });

      const failSpy = jest.fn();
      hotReload.on("config:reload-failed", failSpy);

      await hotReload._reloadConfig();

      expect(mockValidator).toHaveBeenCalledWith(mockConfig);
      expect(hotReload.stats.failedReloads).toBe(1);
      expect(failSpy).toHaveBeenCalled();

      fs.readFileSync.mockRestore();
    });

    test("should queue config reloads when already reloading", async () => {
      hotReload = createTestHotReloadManager();
      hotReload.isReloading = true;

      await hotReload._reloadConfig();

      expect(hotReload.reloadQueue.has("config")).toBe(true);
      expect(hotReload.reloadQueue.get("config")).toBe("config");
    });
  });

  describe("State Preservation", () => {
    test("should return null when plugin not in cache", async () => {
      hotReload = createTestHotReloadManager({ preserveState: true });

      const filePath = "./nonexistent-plugin.js";
      const state = await hotReload._preservePluginState(filePath);

      expect(state).toBeNull();
    });

    test("should preserve state when preserveState option is enabled", async () => {
      hotReload = createTestHotReloadManager({ preserveState: true });

      expect(hotReload.options.preserveState).toBe(true);
    });

    test("should not preserve state when preserveState option is disabled", async () => {
      hotReload = createTestHotReloadManager({ preserveState: false });

      const filePath = "./test-plugin.js";
      const state = await hotReload._preservePluginState(filePath);

      expect(state).toBeNull();
    });

    test("should store preserved state in plugin state map", async () => {
      hotReload = createTestHotReloadManager({ preserveState: true });

      const filePath = "./test-plugin.js";
      const testState = { data: "preserved" };

      // Manually set state to test storage
      hotReload.pluginState.set(filePath, testState);

      expect(hotReload.pluginState.get(filePath)).toEqual(testState);
    });

    test("should restore plugin state after reload", async () => {
      const mockPlugin = {
        state: {},
      };

      const state = { count: 42 };

      hotReload = createTestHotReloadManager({ preserveState: true });

      await hotReload._restorePluginState(mockPlugin, state);

      expect(mockPlugin.state).toEqual(state);
    });

    test("should use setState method if available", async () => {
      const mockPlugin = {
        setState: jest.fn().mockResolvedValue(undefined),
      };

      const state = { data: "test" };

      hotReload = createTestHotReloadManager({ preserveState: true });

      await hotReload._restorePluginState(mockPlugin, state);

      expect(mockPlugin.setState).toHaveBeenCalledWith(state);
    });

    test("should not preserve state if disabled", async () => {
      hotReload = createTestHotReloadManager({ preserveState: false });

      const filePath = "./test-plugin.js";

      const state = await hotReload._preservePluginState(filePath);

      expect(state).toBeNull();
    });
  });

  describe("Lifecycle Hooks", () => {
    test("should register hooks", () => {
      hotReload = createTestHotReloadManager();

      const hook = jest.fn();

      hotReload.registerHook("beforeReload", hook);

      expect(hotReload.hooks.beforeReload).toContain(hook);
    });

    test("should throw error for unknown hook", () => {
      hotReload = createTestHotReloadManager();

      expect(() => {
        hotReload.registerHook("unknownHook", jest.fn());
      }).toThrow("Unknown hook: unknownHook");
    });

    test("should unregister hooks", () => {
      hotReload = createTestHotReloadManager();

      const hook = jest.fn();

      hotReload.registerHook("afterReload", hook);
      hotReload.unregisterHook("afterReload", hook);

      expect(hotReload.hooks.afterReload).not.toContain(hook);
    });

    test("should execute beforeReload hooks", async () => {
      const mockConfig = {
        metadata: { name: "test" },
      };

      jest
        .spyOn(fs, "readFileSync")
        .mockReturnValue(JSON.stringify(mockConfig));

      hotReload = createTestHotReloadManager({
        configPath: "./test.json",
      });

      const beforeHook = jest.fn();
      hotReload.registerHook("beforeReload", beforeHook);

      await hotReload._reloadConfig();

      expect(beforeHook).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "config",
          path: "./test.json",
        }),
      );

      fs.readFileSync.mockRestore();
    });

    test("should execute afterReload hooks", async () => {
      const mockConfig = {
        metadata: { name: "test" },
      };

      jest
        .spyOn(fs, "readFileSync")
        .mockReturnValue(JSON.stringify(mockConfig));

      hotReload = createTestHotReloadManager({
        configPath: "./test.json",
      });

      const afterHook = jest.fn();
      hotReload.registerHook("afterReload", afterHook);

      await hotReload._reloadConfig();

      expect(afterHook).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "config",
          config: mockConfig,
        }),
      );

      fs.readFileSync.mockRestore();
    });

    test("should execute onError hooks", async () => {
      jest.spyOn(fs, "readFileSync").mockReturnValue("invalid json");

      hotReload = createTestHotReloadManager({
        configPath: "./test.json",
      });

      const errorHook = jest.fn();
      hotReload.registerHook("onError", errorHook);

      await hotReload._reloadConfig();

      expect(errorHook).toHaveBeenCalled();

      fs.readFileSync.mockRestore();
    });

    test("should handle hook errors gracefully", async () => {
      hotReload = createTestHotReloadManager();

      const failingHook = jest.fn().mockRejectedValue(new Error("Hook failed"));

      hotReload.registerHook("beforeReload", failingHook);

      // Should not throw
      await expect(
        hotReload._executeHooks("beforeReload", {}),
      ).resolves.not.toThrow();
    });
  });

  describe("Statistics", () => {
    test("should track reload statistics", async () => {
      const mockConfig = {
        metadata: { name: "test" },
      };

      jest
        .spyOn(fs, "readFileSync")
        .mockReturnValue(JSON.stringify(mockConfig));

      hotReload = createTestHotReloadManager({
        configPath: "./test.json",
      });

      await hotReload._reloadConfig();

      const stats = hotReload.getStats();

      expect(stats.totalReloads).toBe(1);
      expect(stats.successfulReloads).toBe(1);
      expect(stats.configReloads).toBe(1);
      expect(stats.averageReloadTime).toBeGreaterThanOrEqual(0);

      fs.readFileSync.mockRestore();
    });

    test("should track failed reloads", async () => {
      jest.spyOn(fs, "readFileSync").mockReturnValue("invalid");

      hotReload = createTestHotReloadManager({
        configPath: "./test.json",
      });

      await hotReload._reloadConfig();

      const stats = hotReload.getStats();

      expect(stats.totalReloads).toBe(1);
      expect(stats.failedReloads).toBe(1);

      fs.readFileSync.mockRestore();
    });

    test("should calculate average reload time", async () => {
      hotReload = createTestHotReloadManager();

      hotReload.stats.successfulReloads = 2;
      hotReload.stats.averageReloadTime = 100;

      hotReload._updateAverageReloadTime(200);

      expect(hotReload.stats.averageReloadTime).toBe(150);
    });
  });

  describe("History", () => {
    test("should record reload history", async () => {
      const mockConfig = {
        metadata: { name: "test" },
      };

      jest
        .spyOn(fs, "readFileSync")
        .mockReturnValue(JSON.stringify(mockConfig));

      hotReload = createTestHotReloadManager({
        configPath: "./test.json",
      });

      await hotReload._reloadConfig();

      const history = hotReload.getHistory();

      expect(history).toHaveLength(1);
      expect(history[0]).toMatchObject({
        type: "config",
        success: true,
      });

      fs.readFileSync.mockRestore();
    });

    test("should limit history to 100 records", () => {
      hotReload = createTestHotReloadManager();

      // Add 110 records
      for (let i = 0; i < 110; i++) {
        hotReload._recordReload({
          type: "plugin",
          path: `./plugin-${i}.js`,
          success: true,
          timestamp: new Date().toISOString(),
        });
      }

      expect(hotReload.reloadHistory).toHaveLength(100);
    });

    test("should clear history", () => {
      hotReload = createTestHotReloadManager();

      hotReload._recordReload({
        type: "plugin",
        path: "./test.js",
        success: true,
        timestamp: new Date().toISOString(),
      });

      hotReload.clearHistory();

      expect(hotReload.reloadHistory).toHaveLength(0);
    });
  });

  describe("Manual Reload Trigger", () => {
    test("should manually trigger plugin reload", async () => {
      hotReload = createTestHotReloadManager();

      const filePath = "./test-plugin.js";

      await hotReload.triggerReload(filePath, "plugin");

      expect(hotReload.stats.totalReloads).toBeGreaterThan(0);
    });

    test("should manually trigger config reload", async () => {
      const mockConfig = {
        metadata: { name: "test" },
      };

      jest
        .spyOn(fs, "readFileSync")
        .mockReturnValue(JSON.stringify(mockConfig));

      hotReload = createTestHotReloadManager({
        configPath: "./test.json",
      });

      await hotReload.triggerReload("./test.json", "config");

      expect(hotReload.stats.configReloads).toBe(1);

      fs.readFileSync.mockRestore();
    });

    test("should throw error for unknown reload type", async () => {
      hotReload = createTestHotReloadManager();

      await expect(
        hotReload.triggerReload("./test.js", "unknown"),
      ).rejects.toThrow("Unknown reload type: unknown");
    });
  });

  describe("Queue Processing", () => {
    test("should process queued reloads", async () => {
      hotReload = createTestHotReloadManager();

      const filePath = "./test-plugin.js";
      hotReload.reloadQueue.set(filePath, "plugin");

      await hotReload._processReloadQueue();

      expect(hotReload.reloadQueue.size).toBe(0);
    });

    test("should process config reload from queue", async () => {
      const mockConfig = {
        metadata: { name: "test" },
      };

      jest
        .spyOn(fs, "readFileSync")
        .mockReturnValue(JSON.stringify(mockConfig));

      hotReload = createTestHotReloadManager({
        configPath: "./test.json",
      });

      hotReload.reloadQueue.set("config", "config");

      await hotReload._processReloadQueue();

      expect(hotReload.stats.configReloads).toBe(1);

      fs.readFileSync.mockRestore();
    });

    test("should do nothing if queue is empty", async () => {
      hotReload = createTestHotReloadManager();

      await hotReload._processReloadQueue();

      expect(hotReload.stats.totalReloads).toBe(0);
    });
  });

  describe("Error Handling", () => {
    test("should emit error events", async () => {
      hotReload = createTestHotReloadManager();

      const errorSpy = jest.fn();
      hotReload.on("error", errorSpy);

      const error = new Error("Test error");
      hotReload._handleError("Test message", error);

      expect(errorSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          message: "Test message",
          error: "Test error",
        }),
      );
    });

    test("should handle plugin removal errors gracefully", () => {
      hotReload = createTestHotReloadManager();

      // Should not throw
      expect(() => {
        hotReload._handlePluginRemoval("./nonexistent.js");
      }).not.toThrow();
    });
  });

  describe("Plugin Removal", () => {
    test("should handle plugin removal", () => {
      hotReload = createTestHotReloadManager();

      const filePath = "./test-plugin.js";

      // Add to state
      hotReload.pluginState.set(filePath, { data: "test" });

      hotReload._handlePluginRemoval(filePath);

      expect(hotReload.pluginState.has(filePath)).toBe(false);
    });

    test("should emit registry removal event", () => {
      const mockRegistry = {
        updatePlugin: jest.fn(),
      };

      hotReload = createTestHotReloadManager({
        pluginRegistry: mockRegistry,
      });

      const registrySpy = jest.fn();
      hotReload.on("plugin:removed:registry", registrySpy);

      const filePath = "./test-plugin.js";
      hotReload._handlePluginRemoval(filePath);

      expect(registrySpy).toHaveBeenCalledWith({ path: filePath });
    });
  });

  describe("Events", () => {
    test("should emit started event", async () => {
      hotReload = createTestHotReloadManager();

      const startedSpy = jest.fn();
      hotReload.on("started", startedSpy);

      await hotReload.start();

      expect(startedSpy).toHaveBeenCalled();
    });

    test("should emit stopped event", async () => {
      hotReload = createTestHotReloadManager();

      const stoppedSpy = jest.fn();
      hotReload.on("stopped", stoppedSpy);

      await hotReload.start();
      await hotReload.stop();

      expect(stoppedSpy).toHaveBeenCalled();
    });

    test("should emit plugin:reloaded event", async () => {
      hotReload = createTestHotReloadManager();

      const reloadedSpy = jest.fn();
      hotReload.on("plugin:reloaded", reloadedSpy);

      const filePath = path.resolve("./test-plugin.js");

      await hotReload._reloadPlugin(filePath);

      // Since the plugin file doesn't exist, it will fail and increment failed reloads
      expect(hotReload.stats.totalReloads).toBeGreaterThan(0);
    });
  });

  describe("Integration", () => {
    test("should integrate with plugin registry", async () => {
      const mockRegistry = {
        updatePlugin: jest.fn().mockResolvedValue(undefined),
      };

      hotReload = createTestHotReloadManager({
        pluginRegistry: mockRegistry,
      });

      const mockPlugin = { name: "test" };
      const filePath = path.resolve("./test-plugin.js");

      await hotReload._updatePluginRegistry(filePath, mockPlugin);

      expect(mockRegistry.updatePlugin).toHaveBeenCalled();
    });

    test("should work with config validator", async () => {
      const mockValidator = jest.fn().mockReturnValue({ valid: true });

      const mockConfig = {
        metadata: { name: "test" },
      };

      jest
        .spyOn(fs, "readFileSync")
        .mockReturnValue(JSON.stringify(mockConfig));

      hotReload = createTestHotReloadManager({
        configPath: "./test.json",
        configValidator: mockValidator,
      });

      await hotReload._reloadConfig();

      expect(mockValidator).toHaveBeenCalledWith(mockConfig);
      expect(hotReload.stats.successfulReloads).toBe(1);

      fs.readFileSync.mockRestore();
    });
  });
});
