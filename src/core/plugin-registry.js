'use strict';

const fs = require('fs');
const path = require('path');

class PluginRegistry {
  constructor() {
    this._plugins = new Map();
    this._validTypes = new Set([
      'loader',
      'embedder',
      'retriever',
      'reranker',
      'llm',
      'evaluator',
    ]);
    this._contracts = new Map();
    this._loadContracts();
  }

  _loadContracts() {
    const contractsDir = path.join(__dirname, '../../contracts');

    try {
      const contractFiles = {
        loader: 'loader-contract.json',
        embedder: 'embedder-contract.json',
        retriever: 'retriever-contract.json',
        llm: 'llm-contract.json',
      };

      for (const [type, filename] of Object.entries(contractFiles)) {
        try {
          const contractPath = path.join(contractsDir, filename);
          if (fs.existsSync(contractPath)) {
            const contractContent = fs.readFileSync(contractPath, 'utf8');
            const contract = JSON.parse(contractContent);
            this._contracts.set(type, contract);
          }
        } catch (error) {
          // Contract loading is optional - don't fail if missing
        }
      }
    } catch (error) {
      // Contracts directory may not exist in all environments
    }
  }

  _validatePluginContract(category, impl) {
    const contract = this._contracts.get(category);
    if (!contract) {
      return; // No contract to validate against
    }

    // Check if plugin has metadata
    if (!impl.metadata) {
      throw new Error('Plugin missing metadata property');
    }

    if (!impl.metadata.name || typeof impl.metadata.name !== 'string') {
      throw new Error('Plugin metadata must have a name property');
    }

    if (!impl.metadata.version || typeof impl.metadata.version !== 'string') {
      throw new Error('Plugin metadata must have a version property');
    }

    if (!impl.metadata.type || impl.metadata.type !== category) {
      throw new Error(`Plugin metadata type must be '${category}'`);
    }

    // Validate required methods based on contract
    const requiredMethods = this._getRequiredMethodsFromContract(contract);

    for (const methodName of requiredMethods) {
      if (!impl[methodName]) {
        throw new Error(`Plugin missing required method: ${methodName}`);
      }

      if (typeof impl[methodName] !== 'function') {
        throw new Error(`Plugin method '${methodName}' must be a function`);
      }
    }
  }

  _getRequiredMethodsFromContract(contract) {
    const methods = [];

    if (contract.required && Array.isArray(contract.required)) {
      methods.push(...contract.required);
    }

    if (contract.properties) {
      for (const [methodName, methodSpec] of Object.entries(
        contract.properties,
      )) {
        if (methodSpec.type === 'function') {
          methods.push(methodName);
        }
      }
    }

    return methods;
  }

  register(category, name, impl) {
    if (!category || typeof category !== 'string') {
      throw new Error('Category must be a non-empty string');
    }
    if (!name || typeof name !== 'string') {
      throw new Error('Name must be a non-empty string');
    }
    if (impl == null) {
      throw new Error('Implementation cannot be null or undefined');
    }
    if (!this._validTypes.has(category)) {
      throw new Error(`Unknown plugin type: ${category}`);
    }

    // Validate plugin against contract
    this._validatePluginContract(category, impl);

    const key = `${category}:${name}`;
    this._plugins.set(key, impl);
    return this;
  }

  get(category, name) {
    const key = `${category}:${name}`;
    const impl = this._plugins.get(key);
    if (impl === undefined) {
      throw new Error(`Plugin not found: ${category}/${name}`);
    }
    return impl;
  }

  resolve(category, name) {
    return this.get(category, name);
  }

  list(category) {
    if (!this._validTypes.has(category)) {
      throw new Error(`Unknown plugin type: ${category}`);
    }

    const names = [];
    const prefix = `${category}:`;

    for (const key of this._plugins.keys()) {
      if (key.startsWith(prefix)) {
        names.push(key.substring(prefix.length));
      }
    }

    return names;
  }

  clear() {
    this._plugins.clear();
  }
}

// Create singleton instance
const registry = new PluginRegistry();

// CJS+ESM interop pattern
module.exports = registry;
module.exports.PluginRegistry = PluginRegistry;
module.exports.default = module.exports;
