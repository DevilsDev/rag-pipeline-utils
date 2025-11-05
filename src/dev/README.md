# Development Tools

This directory contains development tools for the RAG Pipeline Utils library.

## Available Tools

### Hot Reload Manager (`hot-reload.js`)

Provides automatic reloading of plugins and configuration files during development.

**Features:**

- File watching with chokidar
- Plugin hot-reloading with module cache clearing
- Configuration hot-reloading with validation
- State preservation and restoration
- Lifecycle hooks (beforeReload, afterReload, onError, etc.)
- Statistics tracking and history
- Error handling with notifications

**Usage:**

```javascript
const { createHotReloadManager } = require("./hot-reload");

const hotReload = createHotReloadManager({
  watchPaths: ["./src/plugins"],
  configPath: ".ragrc.json",
  verbose: true,
});

await hotReload.start();
```

### Development Server (`dev-server.js`)

Integrated development server with hot reload support.

**Features:**

- Hot reload integration
- Real-time notifications
- Statistics dashboard
- Event-driven architecture
- Graceful shutdown
- Pipeline integration

**Usage:**

```javascript
const { createDevServer } = require("./dev-server");

const devServer = createDevServer({
  port: 3000,
  watchPaths: ["./src/plugins"],
  autoReload: true,
});

await devServer.start();
```

## Examples

See `examples/hot-reload-usage.js` for comprehensive examples including:

1. Basic hot reload setup
2. Integration with plugin registry
3. Development server usage
4. Pipeline integration
5. Custom state preservation
6. Manual reload triggering
7. Configuration validation
8. Complete development workflows

## Documentation

Full documentation is available at `docs/hot-reload.md`.

## Testing

Tests are located in `__tests__/dev/hot-reload.test.js`.

Run tests:

```bash
npm test -- __tests__/dev/hot-reload.test.js
```

## API Reference

### Hot Reload Manager

- `start()` - Start watching for changes
- `stop()` - Stop watching
- `triggerReload(filePath, type)` - Manually trigger reload
- `registerHook(hookName, callback)` - Register lifecycle hook
- `getStats()` - Get reload statistics
- `getHistory()` - Get reload history

### Development Server

- `start()` - Start dev server
- `stop()` - Stop dev server
- `getStatus()` - Get server status
- `getStatistics()` - Get formatted statistics
- `triggerReload(filePath, type)` - Manually trigger reload
- `registerHook(hookName, callback)` - Register lifecycle hook

## Events

Both tools emit various events:

- `started` / `stopped`
- `plugin:reloaded` / `plugin:reload-failed`
- `config:reloaded` / `config:reload-failed`
- `plugin:added` / `plugin:removed`
- `error`
- `notification` (DevServer only)

## Dependencies

- `chokidar` - File system watching

## License

GPL-3.0
