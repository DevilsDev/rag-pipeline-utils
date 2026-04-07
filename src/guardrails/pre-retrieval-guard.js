'use strict';

const { EventEmitter } = require('events');
const { validateInput } = require('../security/validator');
const { tokenize } = require('../evaluate/scoring');

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
  injectionPatterns: [
    /ignore\s+(all\s+)?previous\s+instructions/i,
    /you\s+are\s+now/i,
    /forget\s+everything/i,
    /act\s+as\s+(a|an)?\s*/i,
    /pretend\s+(you\s+are|to\s+be)/i,
    /system\s*:/i,
    /\bDAN\b/,
    /bypass\s+(all\s+)?restrictions/i,
    /override\s+(safety|content|system)/i,
    /jailbreak/i,
  ],
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
   *   sanitizedQuery: string
   * }}
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
      const result = { safe: false, issues, sanitizedQuery: '' };
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

    let sanitizedQuery = validation.sanitized;

    // 3. Injection detection
    const matchedPatterns = [];
    if (this.config.enableInjectionDetection) {
      for (const pattern of this.config.injectionPatterns) {
        if (pattern.test(sanitizedQuery)) {
          matchedPatterns.push(pattern);
          issues.push(`Potential prompt injection detected: ${pattern}`);
        }
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

    // 5. Sanitize: strip matched injection patterns from query
    if (matchedPatterns.length > 0) {
      for (const pattern of matchedPatterns) {
        // Create a global version of the pattern for replacement
        const flags = pattern.flags.includes('g')
          ? pattern.flags
          : pattern.flags + 'g';
        const globalPattern = new RegExp(pattern.source, flags);
        sanitizedQuery = sanitizedQuery.replace(globalPattern, '').trim();
      }
      // Collapse multiple spaces left after stripping
      sanitizedQuery = sanitizedQuery.replace(/\s{2,}/g, ' ').trim();
    }

    const result = {
      safe: issues.length === 0,
      issues,
      sanitizedQuery,
    };

    this.emit('checked', result);
    return result;
  }
}

module.exports = { PreRetrievalGuard, DEFAULT_CONFIG };
