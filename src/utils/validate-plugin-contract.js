/**
 * Version: 1.0.0
 * Description: Type-safe plugin contract validator for runtime safety
 * Author: Ali Kahwaji
 * File: /src/utils/validate-plugin-contract.js
 */

const { pluginContracts  } = require('../core/plugin-contracts.js'); // eslint-disable-line global-require

/**
 * Validates that a plugin _instance implements all required methods.
 * @param {string} _type - Plugin _type (e.g. 'loader', 'embedder')
 * @param {object} _instance - Instantiated plugin module
 * @param {string} _filePath - Path to plugin (used in error reporting)
 * @throws {Error} if any required method is missing or not a function
 */
function validatePluginContract(_type, _instance, _filePath) {
  const expectedMethods = pluginContracts[_type];
  if (!expectedMethods) {
    throw new Error(`[validatePluginContract] Unknown plugin _type: ${_type}`);
  }

  const missing = expectedMethods.filter(method =>
    typeof _instance[method] !== 'function'
  );

  if (missing.length > 0) {
    throw new Error(
      `[validatePluginContract] Plugin '${_filePath}' is missing required methods for '${_type}': ${missing.join(', ')}`
    );
  }
}

/**
 * Optionally wraps plugin _instance with a Proxy for method usage auditing (see enforcePluginProxy)
 */


// Default export



module.exports = {
  validatePluginContract
};