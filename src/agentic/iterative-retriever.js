'use strict';

const { EventEmitter } = require('events');
const { retry } = require('../utils/retry');
const { tokenize, computeJaccardSimilarity } = require('../evaluate/scoring');

/**
 * Default configuration for the IterativeRetriever.
 * @type {object}
 */
const DEFAULT_CONFIG = {
  maxIterations: 3,
  coverageThreshold: 0.6,
  retryOptions: { retries: 2, baseDelay: 100 },
};

/**
 * Iterative retriever that loops: retrieve -> check coverage -> refine -> re-retrieve.
 * Continues until coverage threshold is met or maxIterations is reached.
 *
 * @extends EventEmitter
 */
class IterativeRetriever extends EventEmitter {
  /**
   * @param {object} [options] - Override default configuration
   * @param {number} [options.maxIterations=3] - Maximum retrieval iterations
   * @param {number} [options.coverageThreshold=0.6] - Jaccard similarity threshold for convergence
   * @param {object} [options.retryOptions] - Options passed to retry() on each retrieval call
   */
  constructor(options = {}) {
    super();
    this.config = { ...DEFAULT_CONFIG, ...options };
  }

  /**
   * Merge new results into accumulated results, deduplicating by id.
   * When duplicates exist, keep the one with the higher score.
   *
   * @param {Array<object>} accumulated - Existing accumulated results
   * @param {Array<object>} newResults - Newly retrieved results
   * @returns {Array<object>}
   * @private
   */
  _mergeResults(accumulated, newResults) {
    const seen = new Map();

    for (const r of accumulated) {
      const id = r?.id || JSON.stringify(r);
      seen.set(id, r);
    }

    for (const r of newResults) {
      const id = r?.id || JSON.stringify(r);
      if (!seen.has(id) || (r.score && r.score > (seen.get(id).score || 0))) {
        seen.set(id, r);
      }
    }

    return Array.from(seen.values());
  }

  /**
   * Compute query coverage against accumulated result contents using Jaccard similarity.
   *
   * @param {string} query - Original query
   * @param {Array<object>} results - Accumulated results
   * @returns {number} Coverage score between 0 and 1
   * @private
   */
  _computeCoverage(query, results) {
    const queryTokens = tokenize(query);
    if (queryTokens.length === 0) return 0;

    // Combine all result content into a single token set
    const resultText = results
      .map((r) => r?.content || r?.text || r?.chunk || '')
      .join(' ');
    const resultTokens = tokenize(resultText);

    return computeJaccardSimilarity(queryTokens, resultTokens);
  }

  /**
   * Heuristic query refinement: find query tokens missing from results
   * and append them to the original query.
   *
   * @param {string} originalQuery - The original user query
   * @param {Array<object>} results - Accumulated results
   * @returns {string} Refined query
   * @private
   */
  _heuristicRefine(originalQuery, results) {
    const queryTokens = tokenize(originalQuery);
    const resultText = results
      .map((r) => r?.content || r?.text || r?.chunk || '')
      .join(' ');
    const resultTokenSet = new Set(tokenize(resultText));

    const missing = queryTokens.filter((t) => !resultTokenSet.has(t));

    if (missing.length === 0) return originalQuery;
    return `${originalQuery} more about ${missing.join(' ')}`;
  }

  /**
   * Perform iterative retrieval with coverage checking and query refinement.
   *
   * @param {object} params
   * @param {string} params.query - The search query
   * @param {object} params.retriever - Retriever instance with .retrieve() method
   * @param {object} [params.llm] - Optional LLM for query refinement
   * @param {Array<number>} [params.queryVector] - Optional pre-computed query vector
   * @returns {Promise<{results: Array<object>, iterations: number, converged: boolean, coverage: number}>}
   * @throws {Error} If query or retriever is missing
   */
  async retrieve({ query, retriever, llm, queryVector }) {
    // 1. Validate inputs
    if (!query || typeof query !== 'string' || !query.trim()) {
      throw new Error(
        'IterativeRetriever.retrieve(): query must be a non-empty string',
      );
    }
    if (!retriever || typeof retriever.retrieve !== 'function') {
      throw new Error(
        'IterativeRetriever.retrieve(): retriever with .retrieve() method is required',
      );
    }

    // 2. Initialize
    let accumulatedResults = [];
    let currentQuery = query;
    let iterations = 0;
    let coverage = 0;
    let converged = false;

    // 3. Retrieval loop
    while (iterations < this.config.maxIterations) {
      // a. Retrieve with retry
      const retrieveQuery = currentQuery;
      const newResults = await retry(
        () =>
          retriever.retrieve({ query: retrieveQuery, queryVector, topK: 10 }),
        this.config.retryOptions,
      );

      // b. Merge and deduplicate
      const resultsArray = Array.isArray(newResults) ? newResults : [];
      accumulatedResults = this._mergeResults(accumulatedResults, resultsArray);

      // c. Compute coverage
      coverage = this._computeCoverage(query, accumulatedResults);

      // d. Emit 'iteration' event
      this.emit('iteration', {
        iteration: iterations,
        coverage,
        resultCount: accumulatedResults.length,
        query: currentQuery,
      });

      iterations += 1;

      // e. Check convergence
      if (coverage >= this.config.coverageThreshold) {
        converged = true;
        break;
      }

      // f. Refine query (skip on last iteration since we won't retrieve again)
      if (iterations < this.config.maxIterations) {
        let refined = null;

        // Try LLM-based refinement first
        if (llm && typeof llm.generate === 'function') {
          try {
            refined = await llm.generate(
              `Given the query "${query}" and that current results don't fully cover the topic, generate a refined search query to find missing information.`,
              accumulatedResults,
            );
            if (refined && typeof refined === 'string' && refined.trim()) {
              refined = refined.trim();
            } else {
              refined = null;
            }
          } catch (_err) {
            // LLM failed -- fall through to heuristic
            refined = null;
          }
        }

        // Heuristic fallback
        if (!refined) {
          refined = this._heuristicRefine(query, accumulatedResults);
        }

        currentQuery = refined;
      }
    }

    // 4. Emit 'completed' event
    this.emit('completed', {
      results: accumulatedResults,
      iterations,
      converged,
      coverage,
    });

    // 5. Return
    return { results: accumulatedResults, iterations, converged, coverage };
  }
}

module.exports = { IterativeRetriever, DEFAULT_CONFIG };
