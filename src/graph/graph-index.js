'use strict';

/**
 * Fast entity lookup index for the knowledge graph.
 *
 * Maintains secondary indexes by type, name, and arbitrary properties
 * for efficient querying without full graph traversal.
 */
class GraphIndex {
  constructor() {
    /** @type {Map<string, Set<string>>} type -> Set of entity IDs */
    this.byType = new Map();
    /** @type {Map<string, string>} normalized name -> entity ID */
    this.byName = new Map();
    /** @type {Map<string, Map<*, Set<string>>>} propertyKey -> Map of value -> Set of entity IDs */
    this.byProperty = new Map();
  }

  /**
   * Index an entity by type, name, and each of its properties.
   * @param {{id: string, type: string, properties: Object}} entity
   */
  indexEntity(entity) {
    const { id, type, properties } = entity;

    // Index by type
    if (!this.byType.has(type)) {
      this.byType.set(type, new Set());
    }
    this.byType.get(type).add(id);

    // Index by normalized name
    const name = (properties && properties.name) || entity.name || id;
    const normalized = String(name).toLowerCase();
    this.byName.set(normalized, id);

    // Index by each property
    if (properties) {
      for (const [key, value] of Object.entries(properties)) {
        if (!this.byProperty.has(key)) {
          this.byProperty.set(key, new Map());
        }
        const valueMap = this.byProperty.get(key);
        if (!valueMap.has(value)) {
          valueMap.set(value, new Set());
        }
        valueMap.get(value).add(id);
      }
    }
  }

  /**
   * Fuzzy search for entities whose name contains the query (case-insensitive).
   *
   * Results are sorted by relevance: exact matches first, then partial matches.
   *
   * @param {string} query - Search query
   * @returns {string[]} Array of matching entity IDs
   */
  searchByName(query) {
    if (!query || typeof query !== 'string') {
      return [];
    }

    const normalized = query.toLowerCase();
    const exact = [];
    const partial = [];

    for (const [name, entityId] of this.byName.entries()) {
      if (name === normalized) {
        exact.push(entityId);
      } else if (name.includes(normalized)) {
        partial.push(entityId);
      }
    }

    return [...exact, ...partial];
  }

  /**
   * Return all entity IDs of a given type.
   * @param {string} type - Entity type
   * @returns {string[]} Array of entity IDs
   */
  searchByType(type) {
    const ids = this.byType.get(type);
    return ids ? [...ids] : [];
  }

  /**
   * Return entity IDs matching a property key-value pair.
   * @param {string} key - Property key
   * @param {*} value - Property value
   * @returns {string[]} Array of entity IDs
   */
  searchByProperty(key, value) {
    const valueMap = this.byProperty.get(key);
    if (!valueMap) return [];
    const ids = valueMap.get(value);
    return ids ? [...ids] : [];
  }

  /**
   * Clear all indexes.
   */
  clear() {
    this.byType.clear();
    this.byName.clear();
    this.byProperty.clear();
  }
}

module.exports = { GraphIndex };
