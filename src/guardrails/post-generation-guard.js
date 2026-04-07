'use strict';

const { EventEmitter } = require('events');

/**
 * Default configuration for the PostGenerationGuard.
 * @type {object}
 */
const DEFAULT_CONFIG = {
  enablePIIDetection: true,
  enableGroundednessCheck: true,
  groundednessThreshold: 0.3,
  maxResponseLength: 50000,
  minResponseLength: 0,
  piiPatterns: {
    email: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,
    phone: /\b\d{3}[-.]?\d{3}[-.]?\d{4}\b/g,
    ssn: /\b\d{3}-\d{2}-\d{4}\b/g,
    creditCard: /\b\d{4}[- ]?\d{4}[- ]?\d{4}[- ]?\d{4}\b/g,
  },
};

/**
 * Post-generation guard that checks LLM output for PII leakage,
 * groundedness against source documents, and length constraints.
 * Sanitizes output by redacting detected PII.
 *
 * @extends EventEmitter
 */
class PostGenerationGuard extends EventEmitter {
  /**
   * @param {object} [options] - Override default configuration
   * @param {boolean} [options.enablePIIDetection=true] - Whether to detect PII in output
   * @param {boolean} [options.enableGroundednessCheck=true] - Whether to check groundedness
   * @param {number} [options.groundednessThreshold=0.3] - Minimum groundedness score
   * @param {number} [options.maxResponseLength=50000] - Maximum allowed response length
   * @param {number} [options.minResponseLength=0] - Minimum response length
   * @param {object} [options.piiPatterns] - Custom PII regex patterns (merged with defaults)
   */
  constructor(options = {}) {
    super();
    this.config = { ...DEFAULT_CONFIG, ...options };
    if (options.piiPatterns) {
      this.config.piiPatterns = {
        ...DEFAULT_CONFIG.piiPatterns,
        ...options.piiPatterns,
      };
    }
  }

  /**
   * Check generated output for safety issues, PII, and groundedness.
   *
   * @param {string} output - The LLM-generated output text
   * @param {Array<object>} [retrievedDocs=[]] - Source documents for groundedness checking
   * @returns {{
   *   safe: boolean,
   *   issues: string[],
   *   sanitizedOutput: string,
   *   groundednessScore?: number
   * }}
   * @fires PostGenerationGuard#checked
   */
  check(output, retrievedDocs = []) {
    const issues = [];

    // 1. Validate output is a string
    if (output == null || typeof output !== 'string') {
      issues.push('Output must be a string');
      const result = { safe: false, issues, sanitizedOutput: '' };
      this.emit('checked', result);
      return result;
    }

    // 2. Check length constraints
    if (
      this.config.maxResponseLength > 0 &&
      output.length > this.config.maxResponseLength
    ) {
      issues.push(
        `Output exceeds maximum length of ${this.config.maxResponseLength} characters`,
      );
    }
    if (
      this.config.minResponseLength > 0 &&
      output.length < this.config.minResponseLength
    ) {
      issues.push(
        `Output is shorter than minimum length of ${this.config.minResponseLength} characters`,
      );
    }

    // 3. PII detection
    const piiMatches = {};
    if (this.config.enablePIIDetection) {
      for (const [name, pattern] of Object.entries(this.config.piiPatterns)) {
        // Reset lastIndex for global regex patterns
        pattern.lastIndex = 0;
        const matches = output.match(pattern);
        if (matches && matches.length > 0) {
          piiMatches[name] = matches;
          issues.push(
            `PII detected (${name}): ${matches.length} occurrence(s)`,
          );
        }
      }
    }

    // 4. Groundedness check
    let groundednessScore;
    if (
      this.config.enableGroundednessCheck &&
      Array.isArray(retrievedDocs) &&
      retrievedDocs.length > 0
    ) {
      try {
        // Lazy-require CitationTracker to avoid circular dependencies
        const { CitationTracker } = require('../citation/citation-tracker');
        const tracker = new CitationTracker();
        const tracking = tracker.track(output, retrievedDocs);
        groundednessScore = tracking.groundednessScore;

        if (groundednessScore < this.config.groundednessThreshold) {
          issues.push(
            `Groundedness score (${groundednessScore.toFixed(2)}) is below threshold (${this.config.groundednessThreshold})`,
          );
        }
      } catch (err) {
        // If citation tracking fails, log as issue but don't block
        issues.push(`Groundedness check failed: ${err.message}`);
      }
    }

    // 5. Sanitize: replace PII matches with [REDACTED]
    let sanitizedOutput = output;
    if (Object.keys(piiMatches).length > 0) {
      for (const [, matches] of Object.entries(piiMatches)) {
        for (const match of matches) {
          sanitizedOutput = sanitizedOutput.split(match).join('[REDACTED]');
        }
      }
    }

    // Truncate if over max length
    if (
      this.config.maxResponseLength > 0 &&
      sanitizedOutput.length > this.config.maxResponseLength
    ) {
      sanitizedOutput = sanitizedOutput.substring(
        0,
        this.config.maxResponseLength,
      );
    }

    const result = {
      safe: issues.length === 0,
      issues,
      sanitizedOutput,
    };

    if (groundednessScore !== undefined) {
      result.groundednessScore = groundednessScore;
    }

    this.emit('checked', result);
    return result;
  }
}

module.exports = { PostGenerationGuard, DEFAULT_CONFIG };
