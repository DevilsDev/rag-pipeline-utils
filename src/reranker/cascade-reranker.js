'use strict';

/**
 * Version: 1.0.0
 * Path: /src/reranker/cascade-reranker.js
 * Description: Chains multiple rerankers in sequence for multi-stage reranking
 * Author: Ali Kahwaji
 */

const { EventEmitter } = require('events');
const { throwIfAborted } = require('../connectors/connector-utils');

/** @type {object} */
const DEFAULT_CONFIG = {};

/**
 * Chains multiple rerankers in sequence, passing the output of each
 * stage as input to the next. Implements the reranker contract:
 * rerank(query, documents, options).
 *
 * @extends EventEmitter
 */
class CascadeReranker extends EventEmitter {
  /**
   * @param {object[]} [rerankers=[]] - Array of objects with .rerank() method
   * @param {object} [options]
   */
  constructor(rerankers = [], options = {}) {
    super();
    this.rerankers = rerankers;
    this.config = { ...DEFAULT_CONFIG, ...options };
  }

  /**
   * Run documents through each reranker in sequence.
   *
   * @template {object} T
   * @param {string} query - The search query
   * @param {Array<T|string>} documents - Documents to rerank (a string
   *   becomes `{ text }`)
   * @param {object} [options]
   * @param {number} [options.topK] - Maximum number of results to return
   * @param {AbortSignal} [options.signal] - Forwarded to every stage; checked between stages
   * @returns {Promise<Array<T & { relevanceScore: number }>>} Reranked documents from the final stage
   * @throws {Error} If no rerankers are configured
   */
  async rerank(query, documents, options = {}) {
    if (this.rerankers.length === 0) {
      throw new Error('CascadeReranker requires at least one reranker');
    }

    if (!Array.isArray(documents) || documents.length === 0) {
      return [];
    }

    let currentDocs = documents;

    for (let i = 0; i < this.rerankers.length; i++) {
      throwIfAborted(options.signal);
      const reranker = this.rerankers[i];
      currentDocs = await reranker.rerank(query, currentDocs, options);

      this.emit('stage', {
        rerankerIndex: i,
        resultCount: currentDocs.length,
      });
    }

    this.emit('reranked', { count: currentDocs.length });

    return currentDocs;
  }

  /**
   * Add a reranker to the end of the cascade.
   *
   * @param {object} reranker - Must have a .rerank() method
   */
  addReranker(reranker) {
    this.rerankers.push(reranker);
  }
}

module.exports = { CascadeReranker, DEFAULT_CONFIG };
