/**
 * Version: 2.0.0
 * Path: /src/core/plugin-registry.js
 * Description: Registry for managing pluggable components with runtime contract validation
 * Author: Ali Kahwaji
 */

const { pluginContracts  } = require('./plugin-contracts.js'); // eslint-disable-line global-require

class PluginRegistry {
  #registry = {
    loader: new Map(),
    embedder: new Map(),
    retriever: new Map(),
    llm: new Map(),
    reranker: new Map(),
  };

  register(_type, name, plugin) {
    const group = this.#registry[_type];
    if (!group) {
      throw new Error(`Unknown plugin _type: '${_type}'`);
    }
    
    // Validate plugin implements required contract
    this.#validatePluginContract(_type, name, plugin);
    
    group.set(name, plugin);
  }

  /**
   * Validates that a plugin implements the required contract methods
   * @param {string} _type - Plugin _type (loader, embedder, retriever, llm, reranker)
   * @param {string} name - Plugin name for error reporting
   * @param {object} plugin - Plugin _instance to validate
   * @throws {Error} If plugin doesn't implement required methods
   */
  #validatePluginContract(_type, name, plugin) {
    const contract = pluginContracts[_type];
    if (!contract) {
      throw new Error(`No contract defined for plugin _type: '${_type}'`);
    }

    const missingMethods = [];
    
    // Validate required methods
    for (const methodName of contract.requiredMethods) {
      if (typeof plugin[methodName] !== 'function') {
        missingMethods.push(methodName);
      }
    }

    if (missingMethods.length > 0) {
      throw new Error(
        `Plugin [${_type}:${name}] missing required methods: ${missingMethods.join(', ')}. ` +
        `Expected methods: ${contract.requiredMethods.join(', ')}`
      );
    }

    // Log info about optional methods for debugging
    if (contract.optionalMethods) {
      const implementedOptional = contract.optionalMethods.filter(
        methodName => typeof plugin[methodName] === 'function'
      );
      if (implementedOptional.length > 0) {
        console.debug(`Plugin [${_type}:${name}] implements optional methods: ${implementedOptional.join(', ')}`); // eslint-disable-line no-console
      }
    }
  }

  get(_type, name) {
    const group = this.#registry[_type];
    if (!group) {
      throw new Error(`Unknown plugin _type: '${_type}'`);
    }
    const plugin = group.get(name);
    if (!plugin) {
      throw new Error(`Plugin not found: [${_type}:${name}]`);
    }
    return plugin;
  }

  list(_type) {
    const group = this.#registry[_type];
    if (!group) {
      throw new Error(`Unknown plugin _type: '${_type}'`);
    }
    return [...group.keys()];
  }
}

const _registry = new PluginRegistry();

module.exports = {
  PluginRegistry,
  registry: _registry
};