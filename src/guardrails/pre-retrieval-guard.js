'use strict';

const { EventEmitter } = require('events');
const { validateInput } = require('../security/validator');
const { tokenize } = require('../evaluate/scoring');
const { detectInjection, DEFAULT_RULES } = require('./injection-detector');

/**
 * Default configuration for the PreRetrievalGuard.
 * @type {object}
 */
const DEFAULT_CONFIG = {
  maxQueryLength: 10000,
  enableInjectionDetection: true,
  enableTopicFiltering: false,
  blockedTopics: [],
  allowedTopics: [],
  // Built-in rules (see ./injection-detector). They match against normalised
  // text (NFKC, zero-width/control characters removed, homoglyph and
  // leetspeak folding). options.injectionPatterns adds extra patterns.
  injectionPatterns: DEFAULT_RULES.map((rule) => rule.pattern),
};

/**
 * Pre-retrieval guard that validates and sanitizes user queries before
 * they reach the retrieval layer. Checks for injection attacks, topic
 * violations, and input length constraints.
 *
 * @extends EventEmitter
 */
class PreRetrievalGuard extends EventEmitter {
  /**
   * @param {object} [options] - Override default configuration
   * @param {number} [options.maxQueryLength=10000] - Maximum allowed query length
   * @param {boolean} [options.enableInjectionDetection=true] - Whether to check for prompt injection
   * @param {boolean} [options.enableTopicFiltering=false] - Whether to enforce topic constraints
   * @param {string[]} [options.blockedTopics=[]] - Topics to reject
   * @param {string[]} [options.allowedTopics=[]] - If non-empty, only these topics are permitted
   * @param {RegExp[]} [options.injectionPatterns] - Additional injection patterns (merged with defaults)
   */
  constructor(options = {}) {
    super();
    this.config = { ...DEFAULT_CONFIG, ...options };
    /** @private Extra patterns supplied by the caller */
    this._customPatterns = options.injectionPatterns
      ? [...options.injectionPatterns]
      : [];
    if (options.injectionPatterns) {
      this.config.injectionPatterns = [
        ...DEFAULT_CONFIG.injectionPatterns,
        ...options.injectionPatterns,
      ];
    }
  }

  /**
   * Check a query for safety issues, injection attempts, and topic violations.
   *
   * @param {string} query - The user query to validate
   * @returns {{
   *   safe: boolean,
   *   issues: string[],
   *   sanitizedQuery: string,
   *   injection: { detected: boolean, matches: Array<{id: string, pattern: string, match: string}> }
   * }}
   * `sanitizedQuery` is the query truncated to maxQueryLength; it is never
   * rewritten. Injection findings are reported in `issues` and `injection`
   * and make `safe` false; blocking is up to the caller (GuardrailsPipeline
   * blocks in strict mode).
   * @fires PreRetrievalGuard#checked
   */
  check(query) {
    const issues = [];

    // 1. Validate query is a non-empty string
    if (
      query == null ||
      typeof query !== 'string' ||
      query.trim().length === 0
    ) {
      issues.push('Query must be a non-empty string');
      const result = {
        safe: false,
        issues,
        sanitizedQuery: '',
        injection: { detected: false, matches: [] },
      };
      this.emit('checked', result);
      return result;
    }

    // 2. Run basic input validation (length + disallowed tokens)
    const validation = validateInput(query, {
      maxLength: this.config.maxQueryLength,
    });
    if (!validation.valid) {
      for (const reason of validation.reasons) {
        issues.push(reason);
      }
    }

    // The query is passed on unchanged (apart from length truncation).
    // Deleting only the matched phrase used to leave the rest of an attack
    // payload in place, so detections are reported instead.
    const sanitizedQuery = validation.sanitized;

    // 3. Injection detection on a normalised copy of the query
    let injection = { detected: false, matches: [] };
    if (this.config.enableInjectionDetection) {
      const found = detectInjection(sanitizedQuery, {
        patterns: this._customPatterns,
      });
      injection = { detected: found.detected, matches: found.matches };
      for (const m of found.matches) {
        issues.push(
          `Potential prompt injection detected: ${m.id} (${JSON.stringify(m.match)})`,
        );
      }
    }

    // 4. Topic filtering
    if (this.config.enableTopicFiltering) {
      const tokens = tokenize(sanitizedQuery);

      // Check blocked topics
      if (this.config.blockedTopics.length > 0) {
        for (const topic of this.config.blockedTopics) {
          const topicLower = topic.toLowerCase();
          if (tokens.includes(topicLower)) {
            issues.push(`Query contains blocked topic: ${topic}`);
          }
        }
      }

      // Check allowed topics (whitelist mode)
      if (this.config.allowedTopics.length > 0) {
        const allowedLower = this.config.allowedTopics.map((t) =>
          t.toLowerCase(),
        );
        const hasAllowedTopic = tokens.some((token) =>
          allowedLower.includes(token),
        );
        if (!hasAllowedTopic) {
          issues.push('Query does not match any allowed topics');
        }
      }
    }

    const result = {
      safe: issues.length === 0,
      issues,
      sanitizedQuery,
      injection,
    };

    this.emit('checked', result);
    return result;
  }
}

module.exports = { PreRetrievalGuard, DEFAULT_CONFIG };
