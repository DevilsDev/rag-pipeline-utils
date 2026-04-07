'use strict';

const { EventEmitter } = require('events');

/**
 * In-memory knowledge graph with entities and relationships.
 *
 * Stores typed entities and directed relationships between them,
 * supporting traversal, pattern-based querying, and adjacency lookups.
 */
class KnowledgeGraph extends EventEmitter {
  /**
   * @param {Object} [options={}] - Graph configuration options
   */
  constructor(options = {}) {
    super();
    /** @type {Map<string, {id: string, type: string, properties: Object, labels: string[]}>} */
    this.entities = new Map();
    /** @type {Map<string, {id: string, from: string, to: string, type: string, properties: Object}>} */
    this.relationships = new Map();
    /** @type {Map<string, Set<string>>} */
    this.adjacency = new Map();
    this.options = options;
    this._relationshipCounter = 0;
  }

  /**
   * Add an entity to the graph.
   * @param {string} id - Unique entity identifier
   * @param {string} type - Entity type (e.g. 'person', 'date', 'url')
   * @param {Object} [properties={}] - Arbitrary key-value properties
   * @returns {{id: string, type: string, properties: Object, labels: string[]}}
   */
  addEntity(id, type, properties = {}) {
    const entity = {
      id,
      type,
      properties: { ...properties },
      labels: properties.labels || [type],
    };
    this.entities.set(id, entity);

    if (!this.adjacency.has(id)) {
      this.adjacency.set(id, new Set());
    }

    this.emit('entityAdded', entity);
    return entity;
  }

  /**
   * Add a directed relationship between two entities.
   * @param {string} fromId - Source entity ID
   * @param {string} toId - Target entity ID
   * @param {string} type - Relationship type (e.g. 'co-occurs', 'references')
   * @param {Object} [properties={}] - Arbitrary key-value properties
   * @returns {{id: string, from: string, to: string, type: string, properties: Object}}
   * @throws {Error} If either entity does not exist
   */
  addRelationship(fromId, toId, type, properties = {}) {
    if (!this.entities.has(fromId)) {
      throw new Error(`Entity not found: ${fromId}`);
    }
    if (!this.entities.has(toId)) {
      throw new Error(`Entity not found: ${toId}`);
    }

    this._relationshipCounter += 1;
    const id = `rel_${this._relationshipCounter}`;

    const relationship = {
      id,
      from: fromId,
      to: toId,
      type,
      properties: { ...properties },
    };

    this.relationships.set(id, relationship);

    if (!this.adjacency.has(fromId)) {
      this.adjacency.set(fromId, new Set());
    }
    if (!this.adjacency.has(toId)) {
      this.adjacency.set(toId, new Set());
    }
    this.adjacency.get(fromId).add(id);
    this.adjacency.get(toId).add(id);

    this.emit('relationshipAdded', relationship);
    return relationship;
  }

  /**
   * Retrieve an entity by ID.
   * @param {string} id - Entity ID
   * @returns {{id: string, type: string, properties: Object, labels: string[]}|null}
   */
  getEntity(id) {
    return this.entities.get(id) || null;
  }

  /**
   * Get relationships for an entity, optionally filtered.
   * @param {string} entityId - Entity ID
   * @param {Object} [options={}] - Filter options
   * @param {string} [options.type] - Filter by relationship type
   * @param {'outgoing'|'incoming'|'both'} [options.direction='both'] - Direction filter
   * @returns {Array<{id: string, from: string, to: string, type: string, properties: Object}>}
   */
  getRelationships(entityId, options = {}) {
    const { type, direction = 'both' } = options;
    const relIds = this.adjacency.get(entityId);
    if (!relIds) {
      return [];
    }

    const results = [];
    for (const relId of relIds) {
      const rel = this.relationships.get(relId);
      if (!rel) continue;

      if (type && rel.type !== type) continue;

      if (direction === 'outgoing' && rel.from !== entityId) continue;
      if (direction === 'incoming' && rel.to !== entityId) continue;

      results.push(rel);
    }
    return results;
  }

  /**
   * BFS traversal from startId up to a given depth.
   * @param {string} startId - Starting entity ID
   * @param {number} [depth=2] - Maximum traversal depth
   * @returns {{entities: Array, relationships: Array, paths: Array<string[]>}}
   */
  traverse(startId, depth = 2) {
    const visited = new Set();
    const resultEntities = [];
    const resultRelationships = [];
    const paths = [];

    /** @type {Array<{id: string, depth: number, path: string[]}>} */
    const queue = [{ id: startId, depth: 0, path: [startId] }];
    visited.add(startId);

    const startEntity = this.entities.get(startId);
    if (startEntity) {
      resultEntities.push(startEntity);
    }

    while (queue.length > 0) {
      const { id, depth: currentDepth, path } = queue.shift();

      if (currentDepth >= depth) {
        paths.push(path);
        continue;
      }

      const relIds = this.adjacency.get(id);
      if (!relIds || relIds.size === 0) {
        paths.push(path);
        continue;
      }

      let expanded = false;
      for (const relId of relIds) {
        const rel = this.relationships.get(relId);
        if (!rel) continue;

        const neighborId = rel.from === id ? rel.to : rel.from;
        if (visited.has(neighborId)) continue;

        visited.add(neighborId);
        expanded = true;

        const neighborEntity = this.entities.get(neighborId);
        if (neighborEntity) {
          resultEntities.push(neighborEntity);
        }
        resultRelationships.push(rel);

        const newPath = [...path, neighborId];
        queue.push({ id: neighborId, depth: currentDepth + 1, path: newPath });
      }

      if (!expanded) {
        paths.push(path);
      }
    }

    return {
      entities: resultEntities,
      relationships: resultRelationships,
      paths,
    };
  }

  /**
   * Query the graph by pattern matching.
   * @param {Object} pattern - Query pattern
   * @param {string} [pattern.entityType] - Filter entities by type
   * @param {string} [pattern.relationshipType] - Filter relationships by type
   * @param {Object} [pattern.properties] - Filter by property key-value pairs
   * @returns {{entities: Array, relationships: Array}}
   */
  query(pattern) {
    const { entityType, relationshipType, properties } = pattern || {};

    let matchedEntities = [...this.entities.values()];
    if (entityType) {
      matchedEntities = matchedEntities.filter((e) => e.type === entityType);
    }
    if (properties) {
      matchedEntities = matchedEntities.filter((e) =>
        Object.entries(properties).every(
          ([key, value]) => e.properties[key] === value,
        ),
      );
    }

    let matchedRelationships = [...this.relationships.values()];
    if (relationshipType) {
      matchedRelationships = matchedRelationships.filter(
        (r) => r.type === relationshipType,
      );
    }

    return { entities: matchedEntities, relationships: matchedRelationships };
  }

  /**
   * Return basic graph statistics.
   * @returns {{entityCount: number, relationshipCount: number}}
   */
  getStats() {
    return {
      entityCount: this.entities.size,
      relationshipCount: this.relationships.size,
    };
  }

  /**
   * Clear all graph data.
   */
  clear() {
    this.entities.clear();
    this.relationships.clear();
    this.adjacency.clear();
    this._relationshipCounter = 0;
  }
}

module.exports = { KnowledgeGraph };
