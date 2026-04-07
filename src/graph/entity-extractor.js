"use strict";

const { EventEmitter } = require("events");
const { tokenize } = require("../evaluate/scoring");

/**
 * Default regex patterns for heuristic entity extraction.
 * @type {Object<string, RegExp>}
 */
const DEFAULT_PATTERNS = {
  /** Capitalized multi-word sequences (proper nouns / names) */
  properNoun: /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)\b/g,
  /** Dates in YYYY-MM-DD or YYYY/MM/DD format */
  date: /\b\d{4}[-/]\d{1,2}[-/]\d{1,2}\b/g,
  /** Numbers with units */
  measurement:
    /\b\d+(?:\.\d+)?\s*(?:GB|MB|KB|ms|seconds?|minutes?|hours?|days?|%)\b/gi,
  /** URLs */
  url: /https?:\/\/[^\s]+/g,
  /** Email addresses */
  email: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,
  /** Technical terms (CamelCase or ALLCAPS) */
  technical: /\b[A-Z][a-z]+[A-Z]\w+\b/g,
};

/**
 * Heuristic entity extraction from text — no LLM required.
 *
 * Uses configurable regex patterns to identify named entities,
 * dates, measurements, URLs, emails, and technical terms.
 */
class EntityExtractor extends EventEmitter {
  /**
   * @param {Object} [options={}] - Extractor options
   * @param {Object<string, RegExp>} [options.patterns] - Custom patterns to merge with defaults
   */
  constructor(options = {}) {
    super();
    this.patterns = { ...DEFAULT_PATTERNS, ...(options.patterns || {}) };
    this.config = options;
  }

  /**
   * Extract entities from a single text string.
   *
   * For each configured pattern type, finds all matches, deduplicates
   * by normalized name, and returns an array of entity descriptors.
   *
   * @param {string} text - Input text to extract entities from
   * @returns {Array<{name: string, type: string, positions: Array<{start: number, end: number}>, frequency: number}>}
   */
  extract(text) {
    if (!text || typeof text !== "string") {
      return [];
    }

    /** @type {Map<string, {name: string, type: string, positions: Array<{start: number, end: number}>, frequency: number}>} */
    const entityMap = new Map();

    for (const [type, pattern] of Object.entries(this.patterns)) {
      const regex = new RegExp(pattern.source, pattern.flags);
      let match;

      while ((match = regex.exec(text)) !== null) {
        const name = match[1] || match[0];
        const normalized = name.toLowerCase().trim();
        const position = {
          start: match.index,
          end: match.index + match[0].length,
        };

        if (entityMap.has(normalized)) {
          const existing = entityMap.get(normalized);
          existing.positions.push(position);
          existing.frequency += 1;
        } else {
          entityMap.set(normalized, {
            name,
            type,
            positions: [position],
            frequency: 1,
          });
        }
      }
    }

    const entities = [...entityMap.values()];
    this.emit("extracted", { count: entities.length, entities });
    return entities;
  }

  /**
   * Extract relationships between entities that co-occur in the same sentence.
   *
   * @param {string} text - Input text
   * @param {Array<{name: string, type: string}>} entities - Previously extracted entities
   * @returns {Array<{from: string, to: string, type: string, context: string}>}
   */
  extractRelationships(text, entities) {
    if (!text || !entities || entities.length === 0) {
      return [];
    }

    const sentences = text
      .split(/[.!?]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    const relationships = [];

    for (const sentence of sentences) {
      const sentenceLower = sentence.toLowerCase();
      const present = entities.filter((e) =>
        sentenceLower.includes(e.name.toLowerCase()),
      );

      for (let i = 0; i < present.length; i++) {
        for (let j = i + 1; j < present.length; j++) {
          relationships.push({
            from: present[i].name,
            to: present[j].name,
            type: "co-occurs",
            context: sentence,
          });
        }
      }
    }

    return relationships;
  }

  /**
   * Extract entities and relationships from multiple documents.
   *
   * Combines entities across documents and tracks which source
   * document(s) each entity originates from.
   *
   * @param {Array<{id: string, content: string, metadata?: Object}>} documents
   * @returns {{entities: Array, relationships: Array}}
   */
  extractFromDocuments(documents) {
    if (!Array.isArray(documents)) {
      return { entities: [], relationships: [] };
    }

    /** @type {Map<string, {name: string, type: string, positions: Array, frequency: number, sources: string[]}>} */
    const combinedEntities = new Map();
    const allRelationships = [];

    for (const doc of documents) {
      const text = doc.content || "";
      const entities = this.extract(text);

      for (const entity of entities) {
        const normalized = entity.name.toLowerCase().trim();
        if (combinedEntities.has(normalized)) {
          const existing = combinedEntities.get(normalized);
          existing.frequency += entity.frequency;
          existing.positions.push(...entity.positions);
          if (!existing.sources.includes(doc.id)) {
            existing.sources.push(doc.id);
          }
        } else {
          combinedEntities.set(normalized, {
            ...entity,
            sources: [doc.id],
          });
        }
      }

      const relationships = this.extractRelationships(text, entities);
      for (const rel of relationships) {
        allRelationships.push({ ...rel, source: doc.id });
      }
    }

    return {
      entities: [...combinedEntities.values()],
      relationships: allRelationships,
    };
  }
}

module.exports = { EntityExtractor, DEFAULT_PATTERNS };
