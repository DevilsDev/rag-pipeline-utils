/**
 * Version: 2.0.0
 * Path: /src/core/plugin-registry.js
 * Description: Registry for managing pluggable components with runtime contract validation
 * Author: Ali Kahwaji
 */

const { pluginContracts  } = require('./plugin-contracts.js');

class PluginRegistry {
  #registry = {
    loader: new Map(),
    embedder: new Map(),
    retriever: new Map(),
    llm: new Map(),
    reranker: new Map(),
  };

  register(type, name, plugin) {
    const group = this.#registry[type];
    if (!group) {
      throw new Error(`Unknown plugin type: '${type}'`);
    }
    
    // Validate plugin implements required contract
    this.#validatePluginContract(type, name, plugin);
    
    group.set(name, plugin);
  }

  /**
   * Validates that a plugin implements the required contract methods
   * @param {string} type - Plugin type (loader, embedder, retriever, llm, reranker)
   * @param {string} name - Plugin name for error reporting
   * @param {object} plugin - Plugin instance to validate
   * @throws {Error} If plugin doesn't implement required methods
   */
  #validatePluginContract(type, name, plugin) {
    const contract = pluginContracts[type];
    if (!contract) {
      throw new Error(`No contract defined for plugin type: '${type}'`);
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
        `Plugin [${type}:${name}] missing required methods: ${missingMethods.join(', ')}. ` +
        `Expected methods: ${contract.requiredMethods.join(', ')}`
      );
    }

    // Log info about optional methods for debugging
    if (contract.optionalMethods) {
      const implementedOptional = contract.optionalMethods.filter(
        methodName => typeof plugin[methodName] === 'function'
      );
      if (implementedOptional.length > 0) {
        console.debug(`Plugin [${type}:${name}] implements optional methods: ${implementedOptional.join(', ')}`);
      }
    }
  }

  get(type, name) {
    const group = this.#registry[type];
    if (!group) {
      throw new Error(`Unknown plugin type: '${type}'`);
    }
    const plugin = group.get(name);
    if (!plugin) {
      throw new Error(`Plugin not found: [${type}:${name}]`);
    }
    return plugin;
  }

  list(type) {
    const group = this.#registry[type];
    if (!group) {
      throw new Error(`Unknown plugin type: '${type}'`);
    }
    return [...group.keys()];
  }
}

const registry = new PluginRegistry();

;


module.exports = {
  PluginRegistry
};