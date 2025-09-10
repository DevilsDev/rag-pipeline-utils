'use strict';

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
