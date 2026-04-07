'use strict';

const { EventEmitter } = require('events');
const { KnowledgeGraph } = require('./knowledge-graph');
const { EntityExtractor } = require('./entity-extractor');
const { GraphIndex } = require('./graph-index');
const { tokenize } = require('../evaluate/scoring');

/**
 * Default configuration for the GraphRetriever.
 * @type {Object}
 */
const DEFAULT_CONFIG = {
  traversalDepth: 2,
  maxResults: 10,
  entityWeight: 0.6,
  textWeight: 0.4,
};

/**
 * Retriever that uses a knowledge graph for document retrieval.
 *
 * Combines entity-based graph traversal with token-overlap text scoring
 * to rank and retrieve relevant documents from a corpus.
 */
class GraphRetriever extends EventEmitter {
  /**
   * @param {Object} [options={}] - Retriever options
   * @param {number} [options.traversalDepth=2] - Graph traversal depth
   * @param {number} [options.maxResults=10] - Maximum results to return
   * @param {number} [options.entityWeight=0.6] - Weight for entity-graph score
   * @param {number} [options.textWeight=0.4] - Weight for text-overlap score
   * @param {Object} [options.extractorOptions] - Options for the EntityExtractor
   */
  constructor(options = {}) {
    super();
    this.config = { ...DEFAULT_CONFIG, ...options };
    this.graph = new KnowledgeGraph();
    this.extractor = new EntityExtractor(options.extractorOptions);
    this.index = new GraphIndex();
    /** @type {Map<string, {id: string, content: string, metadata: Object}>} */
    this.documents = new Map();
  }

  /**
   * Store documents, extract entities and relationships, and build the graph.
   *
   * @param {Array<{id: string, content: string, metadata?: Object}>} documents
   * @returns {Promise<void>}
   */
  async store(documents) {
    if (!Array.isArray(documents)) return;

    for (const doc of documents) {
      const id = doc.id || `doc_${this.documents.size + 1}`;
      this.documents.set(id, {
        id,
        content: doc.content || '',
        metadata: doc.metadata || {},
      });
    }

    const { entities, relationships } = this.extractor.extractFromDocuments(
      documents.map((doc) => ({
        id: doc.id || `doc_${this.documents.size}`,
        content: doc.content || '',
        metadata: doc.metadata || {},
      })),
    );

    for (const entity of entities) {
      const entityId = entity.name.toLowerCase().trim().replace(/\s+/g, '_');
      this.graph.addEntity(entityId, entity.type, {
        name: entity.name,
        frequency: entity.frequency,
        sources: entity.sources || [],
      });
      this.index.indexEntity({
        id: entityId,
        type: entity.type,
        name: entity.name,
        properties: {
          name: entity.name,
          frequency: entity.frequency,
        },
      });
    }

    for (const rel of relationships) {
      const fromId = rel.from.toLowerCase().trim().replace(/\s+/g, '_');
      const toId = rel.to.toLowerCase().trim().replace(/\s+/g, '_');

      if (this.graph.getEntity(fromId) && this.graph.getEntity(toId)) {
        this.graph.addRelationship(fromId, toId, rel.type, {
          context: rel.context,
          source: rel.source,
        });
      }
    }

    this.emit('stored', {
      documentCount: documents.length,
      stats: this.graph.getStats(),
    });
  }

  /**
   * Retrieve documents relevant to a query using graph + text scoring.
   *
   * @param {string|{query: string, topK?: number}} queryOrObj - Query string or options object
   * @param {number} [k] - Number of results (overrides config.maxResults)
   * @returns {Promise<Array<{id: string, score: number, content: string, metadata: Object}>>}
   */
  async retrieve(queryOrObj, k) {
    const query =
      typeof queryOrObj === 'string' ? queryOrObj : queryOrObj.query;
    const topK =
      k ||
      (typeof queryOrObj === 'object' && queryOrObj.topK) ||
      this.config.maxResults;

    // Extract entities from query
    const queryEntities = this.extractor.extract(query);
    const queryTokens = tokenize(query);

    // Score documents
    /** @type {Map<string, {graphScore: number, textScore: number, entities: string[], relationships: Array}>} */
    const docScores = new Map();

    // Initialize all documents with zero scores
    for (const [docId] of this.documents) {
      docScores.set(docId, {
        graphScore: 0,
        textScore: 0,
        entities: [],
        relationships: [],
      });
    }

    // Graph-based scoring: find matching entities and traverse
    for (const qEntity of queryEntities) {
      const normalized = qEntity.name.toLowerCase().trim();
      const matchingIds = this.index.searchByName(normalized);

      for (const entityId of matchingIds) {
        const traversal = this.graph.traverse(
          entityId,
          this.config.traversalDepth,
        );

        for (const entity of traversal.entities) {
          const sources =
            (entity.properties && entity.properties.sources) || [];
          for (const sourceDocId of sources) {
            if (docScores.has(sourceDocId)) {
              const scores = docScores.get(sourceDocId);
              scores.graphScore += 1;
              if (!scores.entities.includes(entity.id)) {
                scores.entities.push(entity.id);
              }
            }
          }
        }

        for (const rel of traversal.relationships) {
          for (const [docId, scores] of docScores) {
            const docEntities = scores.entities;
            if (
              docEntities.includes(rel.from) ||
              docEntities.includes(rel.to)
            ) {
              scores.relationships.push(rel);
            }
          }
        }
      }
    }

    // Text-based scoring: token overlap
    if (queryTokens.length > 0) {
      for (const [docId, doc] of this.documents) {
        const docTokens = tokenize(doc.content);
        if (docTokens.length === 0) continue;

        const querySet = new Set(queryTokens);
        let overlap = 0;
        for (const token of docTokens) {
          if (querySet.has(token)) {
            overlap += 1;
          }
        }
        const textScore = overlap / Math.max(queryTokens.length, 1);

        if (docScores.has(docId)) {
          docScores.get(docId).textScore = textScore;
        }
      }
    }

    // Combine scores and sort
    const results = [];
    for (const [docId, scores] of docScores) {
      const doc = this.documents.get(docId);
      const combinedScore =
        this.config.entityWeight * scores.graphScore +
        this.config.textWeight * scores.textScore;

      if (combinedScore > 0) {
        results.push({
          id: docId,
          score: combinedScore,
          content: doc.content,
          metadata: {
            ...doc.metadata,
            entities: scores.entities,
            relationships: scores.relationships,
          },
        });
      }
    }

    results.sort((a, b) => b.score - a.score);
    return results.slice(0, topK);
  }

  /**
   * Return basic graph statistics.
   * @returns {{entityCount: number, relationshipCount: number}}
   */
  getGraphStats() {
    return this.graph.getStats();
  }

  /**
   * Clear all stored data, the graph, and indexes.
   */
  clear() {
    this.graph.clear();
    this.index.clear();
    this.documents.clear();
  }
}

module.exports = { GraphRetriever, DEFAULT_CONFIG };
