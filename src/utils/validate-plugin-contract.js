/**
 * Version: 1.0.0
 * Description: Type-safe plugin contract validator for runtime safety
 * Author: Ali Kahwaji
 * File: /src/utils/validate-plugin-contract.js
 */

const { pluginContracts } = require("../core/plugin-contracts.js"); // eslint-disable-line global-require

/**
 * Validates that a plugin instance implements all required methods.
 * @param {string} type - Plugin type (e.g. 'loader', 'embedder')
 * @param {object} instance - Instantiated plugin module
 * @param {string} filePath - Path to plugin (used in error reporting)
 * @throws {Error} if any required method is missing or not a function
 */
function validatePluginContract(type, instance, filePath) {
  const contract = pluginContracts[type];
  if (!contract) {
    throw new Error(`[validatePluginContract] Unknown plugin type: ${type}`);
  }

  const expectedMethods = contract.requiredMethods || pluginContracts[type];

  const missing = expectedMethods.filter(
    (method) => typeof instance[method] !== "function",
  );

  if (missing.length > 0) {
    throw new Error(
      `[validatePluginContract] Plugin '${filePath}' is missing required methods for '${type}': ${missing.join(", ")}`,
    );
  }
}

/**
 * Optionally wraps plugin instance with a Proxy for method usage auditing (see enforcePluginProxy)
 */

module.exports = {
  validatePluginContract,
};
