/**
 * Version: 0.1.0
 * Path: /src/core/plugin-registry.js
 * Description: Generic plugin registry for registering and retrieving pluggable components
 * Author: Ali Kahwaji
 */

/**
 * PluginRegistry is a central registry for managing pluggable components (e.g., loaders, embedders, retrievers, LLMs).
 * It enables decoupled module resolution based on type and name identifiers.
 *
 * SOLID Compliance:
 * - SRP: Manages only plugin registration and lookup
 * - OCP: Supports extension via dynamic registration without code changes
 * - DIP: Consumers depend on abstract contracts (interfaces)
 */
export class PluginRegistry {
    constructor() {
      // Internal registry structure by plugin type and name
      this.registry = {
        loader: new Map(),
        embedder: new Map(),
        retriever: new Map(),
        llm: new Map()
      };
    }
  
    /**
     * Register a plugin instance under a given type and name.
     * @param {string} type - Plugin category (loader, embedder, retriever, llm)
     * @param {string} name - Unique name for the plugin
     * @param {object} instance - Plugin instance implementing its respective interface
     */
    register(type, name, instance) {
      if (!this.registry[type]) {
        throw new Error(`Unknown plugin type: '${type}'`);
      }
      this.registry[type].set(name, instance);
    }
  
    /**
     * Retrieve a plugin instance by type and name.
     * @param {string} type - Plugin category
     * @param {string} name - Plugin identifier
     * @returns {object} - Registered plugin instance
     */
    get(type, name) {
      const plugin = this.registry[type]?.get(name);
      if (!plugin) {
        throw new Error(`Plugin not found: ${type}/${name}`);
      }
      return plugin;
    }
  
    /**
     * List all registered plugins of a given type.
     * @param {string} type - Plugin category
     * @returns {string[]} - Array of registered plugin names
     */
    list(type) {
      if (!this.registry[type]) {
        throw new Error(`Unknown plugin type: '${type}'`);
      }
      return Array.from(this.registry[type].keys());
    }
  }
  

  