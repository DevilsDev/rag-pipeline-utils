'use strict';

/**
 * Hot Reload Usage Examples
 *
 * This file demonstrates various ways to use the hot reload functionality
 * in development environments.
 */

const { createHotReloadManager } = require('../hot-reload');
const { createDevServer } = require('../dev-server');
const { createRagPipeline } = require('../../core/create-pipeline');
const pluginRegistry = require('../../core/plugin-registry');

// ============================================================================
// Example 1: Basic Hot Reload Setup
// ============================================================================

function basicHotReloadExample() {
  console.log('\n=== Example 1: Basic Hot Reload ===\n');

  // Create hot reload manager
  const hotReload = createHotReloadManager({
    enabled: true,
    watchPaths: ['./src/plugins', './src/mocks'],
    configPath: '.ragrc.json',
    verbose: true,
  });

  // Listen to events
  hotReload.on('plugin:reloaded', ({ path, duration }) => {
    console.log(`Plugin reloaded: ${path} in ${duration}ms`);
  });

  hotReload.on('config:reloaded', ({ config }) => {
    console.log('Configuration reloaded:', config.metadata?.name);
  });

  // Start watching
  hotReload.start().then(() => {
    console.log('Hot reload started');
  });

  // To stop:
  // hotReload.stop();
}

// ============================================================================
// Example 2: Hot Reload with Plugin Registry Integration
// ============================================================================

async function hotReloadWithRegistryExample() {
  console.log('\n=== Example 2: Hot Reload with Plugin Registry ===\n');

  // Create hot reload manager with plugin registry
  const hotReload = createHotReloadManager({
    enabled: true,
    watchPaths: ['./src/plugins'],
    pluginRegistry: pluginRegistry,
    verbose: true,
    preserveState: true, // Preserve plugin state during reloads
  });

  // Register hooks for advanced control
  hotReload.registerHook('beforeReload', async (data) => {
    console.log(`About to reload ${data.type}: ${data.path}`);
    // Perform any cleanup or preparation
  });

  hotReload.registerHook('afterReload', async (data) => {
    console.log(`Reload completed for ${data.type}: ${data.path}`);
    // Re-register with plugin registry, update references, etc.
  });

  hotReload.registerHook('onError', async ({ message, error }) => {
    console.error(`Reload error: ${message}`, error);
    // Send notification, log to service, etc.
  });

  await hotReload.start();

  // Get statistics
  setInterval(() => {
    const stats = hotReload.getStats();
    console.log('Reload Stats:', {
      total: stats.totalReloads,
      successful: stats.successfulReloads,
      failed: stats.failedReloads,
      avgTime: Math.round(stats.averageReloadTime) + 'ms',
    });
  }, 60000); // Every minute
}

// ============================================================================
// Example 3: Development Server with Hot Reload
// ============================================================================

async function devServerExample() {
  console.log('\n=== Example 3: Development Server ===\n');

  // Create development server with integrated hot reload
  const devServer = createDevServer({
    port: 3000,
    host: 'localhost',
    watchPaths: ['./src/plugins', './src/mocks'],
    configPath: '.ragrc.json',
    verbose: true,
    autoReload: true,
    notifyOnReload: true,
  });

  // Listen to server events
  devServer.on('started', () => {
    console.log('Development server started');
    console.log(devServer.getStatistics());
  });

  devServer.on('plugin:reloaded', ({ path, duration }) => {
    console.log(`✓ Plugin reloaded: ${path} (${duration}ms)`);
  });

  devServer.on('config:reloaded', ({ path, duration }) => {
    console.log(`✓ Config reloaded: ${path} (${duration}ms)`);
  });

  devServer.on('notification', ({ message, type }) => {
    console.log(`[${type.toUpperCase()}] ${message}`);
  });

  // Start the server
  await devServer.start();

  // Display statistics periodically
  setInterval(() => {
    console.log(devServer.getStatistics());
  }, 300000); // Every 5 minutes

  // Handle graceful shutdown
  process.on('SIGINT', async () => {
    console.log('\nShutting down...');
    await devServer.stop();
    process.exit(0);
  });
}

// ============================================================================
// Example 4: Hot Reload with RAG Pipeline
// ============================================================================

async function hotReloadWithPipelineExample() {
  console.log('\n=== Example 4: Hot Reload with Pipeline ===\n');

  // Create pipeline
  const pipeline = await createRagPipeline({
    configPath: '.ragrc.json',
  });

  // Create dev server with pipeline integration
  const devServer = createDevServer({
    watchPaths: ['./src/plugins', './src/mocks'],
    configPath: '.ragrc.json',
    verbose: true,
    pluginRegistry: pluginRegistry,
    pipeline: pipeline,
  });

  // When config changes, pipeline will be reinitialized automatically
  devServer.on('config:reloaded', async () => {
    console.log('Pipeline configuration updated');
    // Pipeline is automatically reinitialized by dev server
  });

  // When plugins change, they're hot-reloaded
  devServer.on('plugin:reloaded', async ({ path }) => {
    console.log(`Plugin ${path} updated and reloaded`);
    // Plugin is automatically updated in registry
  });

  await devServer.start();
}

// ============================================================================
// Example 5: Custom State Preservation
// ============================================================================

async function customStatePreservationExample() {
  console.log('\n=== Example 5: Custom State Preservation ===\n');

  const hotReload = createHotReloadManager({
    enabled: true,
    watchPaths: ['./src/plugins'],
    preserveState: true,
    verbose: true,
  });

  // Hook into state preservation
  hotReload.registerHook('onStatePreserve', async ({ path, state }) => {
    console.log(`Preserving state for ${path}:`, state);
    // You can save state to external storage here
  });

  hotReload.registerHook('onStateRestore', async ({ plugin, state }) => {
    console.log('Restoring state:', state);
    // You can restore state from external storage here
  });

  await hotReload.start();
}

// ============================================================================
// Example 6: Manual Reload Triggering
// ============================================================================

async function manualReloadExample() {
  console.log('\n=== Example 6: Manual Reload ===\n');

  const devServer = createDevServer({
    watchPaths: ['./src/plugins'],
    autoReload: false, // Disable automatic reloading
    verbose: true,
  });

  await devServer.start();

  // Manually trigger reloads
  await devServer.triggerReload('./src/plugins/my-plugin.js', 'plugin');
  await devServer.triggerReload('.ragrc.json', 'config');

  console.log('Manual reloads completed');
}

// ============================================================================
// Example 7: Configuration Validation
// ============================================================================

async function configValidationExample() {
  console.log('\n=== Example 7: Config Validation ===\n');

  const hotReload = createHotReloadManager({
    enabled: true,
    configPath: '.ragrc.json',
    verbose: true,
    // Custom config validator
    configValidator: (config) => {
      const errors = [];

      // Validate required fields
      if (!config.metadata || !config.metadata.name) {
        errors.push({ message: 'metadata.name is required' });
      }

      if (!config.pipeline || !config.pipeline.stages) {
        errors.push({ message: 'pipeline.stages is required' });
      }

      return {
        valid: errors.length === 0,
        errors,
      };
    },
  });

  hotReload.on('config:reload-failed', ({ error }) => {
    console.error('Configuration validation failed:', error);
  });

  await hotReload.start();
}

// ============================================================================
// Example 8: Development Workflow Integration
// ============================================================================

async function developmentWorkflowExample() {
  console.log('\n=== Example 8: Complete Development Workflow ===\n');

  // Create a complete development environment
  const devServer = createDevServer({
    port: 3000,
    host: 'localhost',
    watchPaths: ['./src/plugins', './src/mocks', './src/config'],
    configPath: '.ragrc.json',
    verbose: true,
    autoReload: true,
    notifyOnReload: true,
    pluginRegistry: pluginRegistry,
  });

  // Add custom hooks
  devServer.registerHook('beforeReload', async (data) => {
    console.log(`[BEFORE] Reloading ${data.type}: ${data.path}`);
    // Run pre-reload tasks (tests, linting, etc.)
  });

  devServer.registerHook('afterReload', async (data) => {
    console.log(`[AFTER] Reloaded ${data.type}: ${data.path}`);
    // Run post-reload tasks (smoke tests, notifications, etc.)
  });

  // Start server
  await devServer.start();

  // Log status every 5 minutes
  setInterval(() => {
    const status = devServer.getStatus();
    console.log('\n=== Server Status ===');
    console.log(`Uptime: ${Math.floor(status.uptime / 1000)}s`);
    console.log(`Total Reloads: ${status.hotReload.stats.totalReloads}`);
    console.log(
      `Success Rate: ${
        status.hotReload.stats.totalReloads > 0
          ? Math.round(
              (status.hotReload.stats.successfulReloads /
                status.hotReload.stats.totalReloads) *
                100,
            ) + '%'
          : 'N/A'
      }`,
    );
  }, 300000);

  // Handle shutdown
  process.on('SIGINT', async () => {
    console.log('\n\nShutting down development server...');
    console.log(devServer.getStatistics());
    await devServer.stop();
    process.exit(0);
  });
}

// ============================================================================
// Run Examples
// ============================================================================

// Uncomment the example you want to run:

// basicHotReloadExample();
// hotReloadWithRegistryExample();
// devServerExample();
// hotReloadWithPipelineExample();
// customStatePreservationExample();
// manualReloadExample();
// configValidationExample();
// developmentWorkflowExample();

module.exports = {
  basicHotReloadExample,
  hotReloadWithRegistryExample,
  devServerExample,
  hotReloadWithPipelineExample,
  customStatePreservationExample,
  manualReloadExample,
  configValidationExample,
  developmentWorkflowExample,
};
