/**
 * Serve command handler
 * Runs DevServer: a local HTTP API (GET /health, POST /query) over the
 * pipeline in .ragrc.json, reloading custom plugin modules on change.
 */

const path = require("path");
const { loadCliConfig } = require("../shared/config-context.js");

/**
 * @param {object} globalOptions - Global CLI options from program.opts()
 * @param {object} options - { port, host }
 * @returns {Promise<object|undefined>} The started server (for tests)
 */
async function handleServe(globalOptions, options = {}) {
  try {
    // Validate the config up front so a broken file fails at startup.
    const { config, configPath, configDir } = loadCliConfig(globalOptions);
    const pluginFiles = Object.values(config.plugins || {})
      .flatMap((group) => Object.values(group || {}))
      .filter((p) => typeof p === "string")
      .map((p) => path.resolve(configDir, p));

    const { DevServer } = require("../../dev/dev-server.js");
    const server = new DevServer({
      port: options.port,
      host: options.host,
      configPath,
      watchPaths: pluginFiles,
      verbose: false,
    });
    await server.start();

    console.log(`🚀 Serving ${path.basename(configPath)} at ${server.url}`);
    console.log(`   GET  ${server.url}/health`);
    console.log(`   POST ${server.url}/query  {"question": "...", "topK": 3}`);
    console.log("Press Ctrl+C to stop.");

    const shutdown = async () => {
      await server.stop();
      process.exit(0);
    };
    process.once("SIGINT", shutdown);
    process.once("SIGTERM", shutdown);
    return server;
  } catch (error) {
    console.error(`❌ Server failed to start: ${error.message}`);
    process.exitCode = 1;
    return undefined;
  }
}

module.exports = { handleServe };
