'use strict';

const { EventEmitter } = require('events');

/**
 * Default configuration for the SelfCritiqueChecker.
 * @type {object}
 */
const DEFAULT_CONFIG = {
  approvalThreshold: 0.5,
};

/**
 * Answer verification against retrieved source documents.
 * Uses CitationTracker (lazy-loaded) to compute groundedness and detect hallucinations.
 *
 * @extends EventEmitter
 */
class SelfCritiqueChecker extends EventEmitter {
  /**
   * @param {object} [options] - Override default configuration
   * @param {number} [options.approvalThreshold=0.5] - Minimum groundedness score to approve an answer
   */
  constructor(options = {}) {
    super();
    this.config = { ...DEFAULT_CONFIG, ...options };
  }

  /**
   * Check an answer against retrieved documents for groundedness.
   *
   * @param {string} answer - The LLM-generated answer to verify
   * @param {Array<object>} retrievedDocs - Source documents to check against
   * @returns {{
   *   approved: boolean,
   *   score: number,
   *   issues: Array<{sentence: string, classification: string}>,
   *   citationResult: object
   * }}
   * @throws {Error} If answer or retrievedDocs are invalid
   * @fires SelfCritiqueChecker#checked
   */
  check(answer, retrievedDocs) {
    // 1. Validate inputs
    if (!answer || typeof answer !== 'string' || !answer.trim()) {
      throw new Error(
        'SelfCritiqueChecker.check(): answer must be a non-empty string',
      );
    }
    if (!Array.isArray(retrievedDocs) || retrievedDocs.length === 0) {
      throw new Error(
        'SelfCritiqueChecker.check(): retrievedDocs must be a non-empty array',
      );
    }

    // 2. Lazy-require CitationTracker (not loaded at module level)
    const { CitationTracker } = require('../citation/citation-tracker');

    // 3. Create tracker instance
    const tracker = new CitationTracker();

    // 4. Track citations
    const citationResult = tracker.track(answer, retrievedDocs);

    // 5. Extract groundedness and hallucination data
    const { groundednessScore, hallucinationReport } = citationResult;

    // 6. Determine approval
    const approved = groundednessScore >= this.config.approvalThreshold;

    // 7. Build issues array from hallucination report
    const issues = [];
    if (hallucinationReport && Array.isArray(hallucinationReport.sentences)) {
      for (const s of hallucinationReport.sentences) {
        if (
          s.classification === 'definite_hallucination' ||
          s.classification === 'likely_hallucination'
        ) {
          issues.push({
            sentence: s.sentence || s.text || '',
            classification: s.classification,
          });
        }
      }
    }

    // 8. Emit 'checked' event
    const result = {
      approved,
      score: groundednessScore,
      issues,
      citationResult,
    };

    this.emit('checked', result);

    // 9. Return
    return result;
  }
}

module.exports = { SelfCritiqueChecker, DEFAULT_CONFIG };
