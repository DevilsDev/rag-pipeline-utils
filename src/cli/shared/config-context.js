/**
 * Resolve and load the config file named by the global --config option.
 */

const path = require("path");
const {
  loadRagConfig,
  resolveConfigPath,
} = require("../../config/load-config.js");

/**
 * @param {object} globalOptions - program.opts(); uses globalOptions.config
 * @returns {{config: object, configPath: string, configDir: string}}
 */
function loadCliConfig(globalOptions = {}) {
  const configPath = resolveConfigPath(globalOptions.config || ".ragrc.json");
  const config = loadRagConfig(configPath);
  return { config, configPath, configDir: path.dirname(configPath) };
}

module.exports = { loadCliConfig };
