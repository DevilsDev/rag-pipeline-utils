# Hot Reload Development Guide

## Overview

The Hot Reload feature provides automatic reloading of plugins and configuration files during development, eliminating the need to restart your application when making changes. This significantly improves the development experience and iteration speed.

## Features

- **Automatic Plugin Reloading**: Watches plugin files and reloads them when changes are detected
- **Configuration Hot-Reloading**: Automatically reloads configuration files (.ragrc.json)
- **State Preservation**: Preserves and restores plugin state during compatible reloads
- **Lifecycle Hooks**: Provides hooks for custom logic before/after reloads
- **Error Handling**: Graceful error handling with detailed notifications
- **Statistics Tracking**: Tracks reload metrics and performance
- **Development Server**: Integrated development server with hot reload support

## Quick Start

### Basic Usage

```javascript
const { createHotReloadManager } = require("@devilsdev/rag-pipeline-utils");

// Create hot reload manager
const hotReload = createHotReloadManager({
  enabled: true,
  watchPaths: ["./src/plugins", "./src/mocks"],
  configPath: ".ragrc.json",
  verbose: true,
});

// Listen to reload events
hotReload.on("plugin:reloaded", ({ path, duration }) => {
  console.log(`Plugin reloaded: ${path} in ${duration}ms`);
});

// Start watching
await hotReload.start();
```

### Using Development Server

```javascript
const { createDevServer } = require("@devilsdev/rag-pipeline-utils");

// Create development server with hot reload
const devServer = createDevServer({
  port: 3000,
  watchPaths: ["./src/plugins", "./src/mocks"],
  configPath: ".ragrc.json",
  verbose: true,
  autoReload: true,
});

// Start server
await devServer.start();

// Graceful shutdown
process.on("SIGINT", async () => {
  await devServer.stop();
  process.exit(0);
});
```

## API Reference

### HotReloadManager

#### Constructor Options

```javascript
{
  enabled: boolean,              // Enable/disable hot reload (default: true)
  watchPaths: string[],          // Paths to watch (default: ['./src/plugins', './src/mocks'])
  configPath: string,            // Config file path (default: '.ragrc.json')
  debounceDelay: number,         // Debounce delay in ms (default: 300)
  preserveState: boolean,        // Preserve plugin state (default: true)
  verbose: boolean,              // Verbose logging (default: false)
  ignorePatterns: string[],      // Patterns to ignore (default: ['**/node_modules/**', '**/*.test.js'])
  pluginRegistry: object,        // Plugin registry instance
  configValidator: function      // Custom config validator
}
```

#### Methods

##### start()

Start watching for file changes.

```javascript
await hotReload.start();
```

##### stop()

Stop watching for file changes.

```javascript
await hotReload.stop();
```

##### triggerReload(filePath, type)

Manually trigger a reload.

```javascript
// Reload a plugin
await hotReload.triggerReload("./src/plugins/my-plugin.js", "plugin");

// Reload configuration
await hotReload.triggerReload(".ragrc.json", "config");
```

##### registerHook(hookName, callback)

Register a lifecycle hook.

```javascript
hotReload.registerHook("beforeReload", async (data) => {
  console.log("About to reload:", data.path);
});

hotReload.registerHook("afterReload", async (data) => {
  console.log("Reload completed:", data.path);
});

hotReload.registerHook("onError", async ({ message, error }) => {
  console.error("Reload error:", message);
});

hotReload.registerHook("onStatePreserve", async ({ path, state }) => {
  console.log("Preserving state for:", path);
});

hotReload.registerHook("onStateRestore", async ({ plugin, state }) => {
  console.log("Restoring state");
});
```

##### getStats()

Get reload statistics.

```javascript
const stats = hotReload.getStats();
console.log(stats);
// {
//   totalReloads: 42,
//   successfulReloads: 40,
//   failedReloads: 2,
//   configReloads: 10,
//   pluginReloads: 32,
//   averageReloadTime: 125,
//   reloadHistory: [...],
//   isEnabled: true,
//   isReloading: false,
//   queuedReloads: 0
// }
```

##### getHistory()

Get reload history.

```javascript
const history = hotReload.getHistory();
// Array of reload records (max 100)
```

##### clearHistory()

Clear reload history.

```javascript
hotReload.clearHistory();
```

#### Events

##### plugin:reloaded

Emitted when a plugin is successfully reloaded.

```javascript
hotReload.on("plugin:reloaded", ({ path, plugin, duration }) => {
  console.log(`Plugin reloaded: ${path} in ${duration}ms`);
});
```

##### plugin:reload-failed

Emitted when plugin reload fails.

```javascript
hotReload.on("plugin:reload-failed", ({ path, error }) => {
  console.error(`Plugin reload failed: ${path}`, error);
});
```

##### config:reloaded

Emitted when configuration is successfully reloaded.

```javascript
hotReload.on("config:reloaded", ({ path, config, duration }) => {
  console.log(`Config reloaded: ${path} in ${duration}ms`);
});
```

##### config:reload-failed

Emitted when configuration reload fails.

```javascript
hotReload.on("config:reload-failed", ({ path, error }) => {
  console.error(`Config reload failed: ${path}`, error);
});
```

##### plugin:added

Emitted when a new plugin is detected.

```javascript
hotReload.on("plugin:added", ({ path }) => {
  console.log(`New plugin: ${path}`);
});
```

##### plugin:removed

Emitted when a plugin is removed.

```javascript
hotReload.on("plugin:removed", ({ path }) => {
  console.log(`Plugin removed: ${path}`);
});
```

##### error

Emitted when an error occurs.

```javascript
hotReload.on("error", ({ message, error, stack }) => {
  console.error("Error:", message);
});
```

##### started

Emitted when hot reload starts.

```javascript
hotReload.on("started", () => {
  console.log("Hot reload started");
});
```

##### stopped

Emitted when hot reload stops.

```javascript
hotReload.on("stopped", () => {
  console.log("Hot reload stopped");
});
```

### DevServer

#### Constructor Options

```javascript
{
  port: number,                  // Server port (default: 3000)
  host: string,                  // Server host (default: 'localhost')
  watchPaths: string[],          // Paths to watch
  configPath: string,            // Config file path
  verbose: boolean,              // Verbose logging (default: true)
  autoReload: boolean,           // Enable auto-reload (default: true)
  notifyOnReload: boolean,       // Show notifications (default: true)
  pluginRegistry: object,        // Plugin registry instance
  pipeline: object               // Pipeline instance
}
```

#### Methods

##### start()

Start the development server.

```javascript
await devServer.start();
```

##### stop()

Stop the development server.

```javascript
await devServer.stop();
```

##### getStatus()

Get server status.

```javascript
const status = devServer.getStatus();
// {
//   isRunning: true,
//   uptime: 123456,
//   host: 'localhost',
//   port: 3000,
//   watchPaths: [...],
//   configPath: '.ragrc.json',
//   hotReload: { enabled: true, stats: {...} }
// }
```

##### getStatistics()

Get formatted statistics dashboard.

```javascript
console.log(devServer.getStatistics());
// Displays a formatted ASCII table with statistics
```

##### triggerReload(filePath, type)

Manually trigger a reload.

```javascript
await devServer.triggerReload("./src/plugins/my-plugin.js", "plugin");
```

##### registerHook(hookName, callback)

Register a lifecycle hook (delegates to HotReloadManager).

```javascript
devServer.registerHook("beforeReload", async (data) => {
  // Custom logic
});
```

#### Events

DevServer inherits all HotReloadManager events plus:

##### notification

Emitted when a notification is sent.

```javascript
devServer.on("notification", ({ message, type, timestamp }) => {
  console.log(`[${type}] ${message}`);
});
```

## Advanced Usage

### State Preservation

Plugins can implement state preservation methods:

```javascript
// my-plugin.js
class MyPlugin {
  constructor() {
    this.state = {
      counter: 0,
      cache: new Map(),
    };
  }

  // Optional: Custom state getter
  async getState() {
    return {
      counter: this.state.counter,
      cache: Array.from(this.state.cache.entries()),
    };
  }

  // Optional: Custom state setter
  async setState(state) {
    this.state.counter = state.counter;
    this.state.cache = new Map(state.cache);
  }

  async execute(input) {
    this.state.counter++;
    // Plugin logic...
  }
}

module.exports = MyPlugin;
```

### Custom Configuration Validation

```javascript
const hotReload = createHotReloadManager({
  configPath: ".ragrc.json",
  configValidator: (config) => {
    const errors = [];

    // Custom validation rules
    if (!config.metadata || !config.metadata.name) {
      errors.push({ message: "metadata.name is required" });
    }

    if (!config.pipeline || !config.pipeline.stages) {
      errors.push({ message: "pipeline.stages is required" });
    }

    // Validate plugin configurations
    if (config.plugins) {
      for (const [name, pluginConfig] of Object.entries(config.plugins)) {
        if (!pluginConfig.type) {
          errors.push({ message: `Plugin '${name}' missing type` });
        }
      }
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  },
});
```

### Integration with Plugin Registry

```javascript
const pluginRegistry = require("@devilsdev/rag-pipeline-utils").pluginRegistry;

const hotReload = createHotReloadManager({
  watchPaths: ["./src/plugins"],
  pluginRegistry: pluginRegistry,
  verbose: true,
});

// Plugin registry will be automatically updated on reloads
hotReload.on("plugin:reloaded", ({ path, plugin }) => {
  console.log("Plugin registry updated with new version");
});

await hotReload.start();
```

### Complete Development Workflow

```javascript
const {
  createDevServer,
  createRagPipeline,
} = require("@devilsdev/rag-pipeline-utils");

async function startDevelopment() {
  // Create pipeline
  const pipeline = await createRagPipeline({
    configPath: ".ragrc.json",
  });

  // Create dev server with pipeline
  const devServer = createDevServer({
    watchPaths: ["./src/plugins", "./src/mocks"],
    configPath: ".ragrc.json",
    verbose: true,
    pluginRegistry: pluginRegistry,
    pipeline: pipeline,
  });

  // Add custom hooks
  devServer.registerHook("beforeReload", async (data) => {
    console.log("Running pre-reload checks...");
    // Run linting, tests, etc.
  });

  devServer.registerHook("afterReload", async (data) => {
    console.log("Running post-reload tasks...");
    // Run smoke tests, send notifications, etc.
  });

  // Start development server
  await devServer.start();

  // Display statistics every 5 minutes
  setInterval(() => {
    console.log(devServer.getStatistics());
  }, 300000);

  // Graceful shutdown
  process.on("SIGINT", async () => {
    console.log("\nShutting down...");
    console.log(devServer.getStatistics());
    await devServer.stop();
    process.exit(0);
  });
}

startDevelopment().catch(console.error);
```

## Best Practices

### 1. Use Debouncing

The default debounce delay is 300ms, which prevents rapid successive reloads when saving files multiple times quickly.

```javascript
const hotReload = createHotReloadManager({
  debounceDelay: 500, // Increase for slower file systems
});
```

### 2. Ignore Test Files

By default, test files are ignored. Add more patterns if needed:

```javascript
const hotReload = createHotReloadManager({
  ignorePatterns: [
    "**/node_modules/**",
    "**/*.test.js",
    "**/*.spec.js",
    "**/__tests__/**",
    "**/coverage/**",
    "**/.git/**",
  ],
});
```

### 3. Use State Preservation

Implement `getState()` and `setState()` in plugins to preserve state across reloads:

```javascript
class MyPlugin {
  async getState() {
    return {
      /* state to preserve */
    };
  }

  async setState(state) {
    // Restore state
  }
}
```

### 4. Handle Errors Gracefully

Always listen to error events:

```javascript
hotReload.on("error", ({ message, error }) => {
  console.error("Hot reload error:", message);
  // Send notification, log to service, etc.
});

hotReload.on("plugin:reload-failed", ({ path, error }) => {
  console.error(`Failed to reload ${path}:`, error);
  // Keep old version, notify developer, etc.
});
```

### 5. Use Lifecycle Hooks for Testing

Run tests before accepting reloads:

```javascript
devServer.registerHook("beforeReload", async (data) => {
  // Run quick tests
  const testsPassed = await runQuickTests(data.path);
  if (!testsPassed) {
    throw new Error("Tests failed - reload aborted");
  }
});
```

### 6. Monitor Reload Performance

Track reload statistics to identify slow reloads:

```javascript
hotReload.on("plugin:reloaded", ({ path, duration }) => {
  if (duration > 1000) {
    console.warn(`Slow reload detected: ${path} took ${duration}ms`);
  }
});
```

## Troubleshooting

### Module Not Found Error

If you see "Cannot find module 'chokidar'", install dependencies:

```bash
npm install
```

### Reloads Not Triggering

1. Check that files are in watched paths
2. Verify file patterns aren't ignored
3. Enable verbose logging to see what's happening:

```javascript
const hotReload = createHotReloadManager({
  verbose: true,
});
```

### State Not Preserved

1. Implement `getState()` and `setState()` in your plugin
2. Ensure `preserveState: true` is set
3. Check that state is serializable (no functions, circular references)

### Configuration Validation Failing

Check the validation errors:

```javascript
hotReload.on("config:reload-failed", ({ error }) => {
  console.error("Config validation error:", error);
});
```

## Performance Considerations

- **Debouncing**: Reduces unnecessary reloads during rapid file changes
- **Module Cache Clearing**: Only clears the specific module being reloaded
- **State Preservation**: Minimal overhead with shallow copying
- **Average Reload Time**: Typically 50-200ms depending on plugin complexity

## Security Considerations

- Only use hot reload in development environments
- Set `enabled: false` in production
- Validate configuration changes to prevent malicious modifications
- Use file system permissions to restrict write access

## Examples

See `src/dev/examples/hot-reload-usage.js` for complete working examples including:

1. Basic hot reload setup
2. Integration with plugin registry
3. Development server usage
4. Pipeline integration
5. Custom state preservation
6. Manual reload triggering
7. Configuration validation
8. Complete development workflows

## Related Documentation

- [Plugin Development Guide](./plugin-development.md)
- [Configuration Reference](./configuration.md)
- [Development Tools](./development-tools.md)

## Support

For issues, questions, or contributions:

- GitHub Issues: https://github.com/DevilsDev/rag-pipeline-utils/issues
- Documentation: https://github.com/DevilsDev/rag-pipeline-utils#readme
