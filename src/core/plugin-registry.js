/**
 * Version: 1.0.0
 * Path: /src/core/plugin-registry.js
 * Description: Registry for managing pluggable components (loader, embedder, retriever, llm)
 * Author: Ali Kahwaji
 */

export class PluginRegistry {
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
    group.set(name, plugin);
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

export default registry;
