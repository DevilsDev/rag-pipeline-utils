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

  /**
   * Registers a plugin instance under a specific type and name.
   * @param {'loader' | 'embedder' | 'retriever' | 'llm' | 'reranker'} type - Plugin type category.
   * @param {string} name - Unique name/key for this plugin.
   * @param {object} plugin - Plugin implementation (e.g., instance or factory).
   */
  register(type, name, plugin) {
    const group = this.#registry[type];
    if (!group) {
      throw new Error(`Unknown plugin type: '${type}'`);
    }
    group.set(name, plugin);
  }

  /**
   * Retrieves a plugin by type and name.
   * @param {'loader' | 'embedder' | 'retriever' | 'llm' | 'reranker'} type - Plugin type.
   * @param {string} name - Plugin name/key.
   * @returns {object} - The plugin instance.
   */
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

  /**
   * Lists all registered plugin names for a type.
   * @param {'loader' | 'embedder' | 'retriever' | 'llm' | 'reranker'} type - Plugin category.
   * @returns {string[]} - Array of registered plugin names.
   */
  list(type) {
    const group = this.#registry[type];
    if (!group) {
      throw new Error(`Unknown plugin type: '${type}'`);
    }
    return [...group.keys()];
  }
}
