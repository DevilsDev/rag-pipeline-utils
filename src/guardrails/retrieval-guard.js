'use strict';

const { EventEmitter } = require('events');
const { detectInjection } = require('./injection-detector');

/**
 * Default configuration for the RetrievalGuard.
 * @type {object}
 */
const DEFAULT_CONFIG = {
  minRelevanceScore: 0,
  maxAgeDays: 0, // 0 = disabled
  enforceACL: false,
  // Opt-in scan of retrieved document text for prompt injection (indirect
  // injection). 'remove' drops flagged documents, 'flag' keeps them and
  // marks them with `injection` details.
  detectInjection: false,
  injectionAction: 'remove',
  injectionPatterns: [],
};

/**
 * Retrieval guard that filters search results based on relevance score,
 * document freshness, and access control lists. Applied between the
 * retrieval and generation stages of the pipeline.
 *
 * @extends EventEmitter
 */
class RetrievalGuard extends EventEmitter {
  /**
   * @param {object} [options] - Override default configuration
   * @param {number} [options.minRelevanceScore=0] - Minimum relevance score threshold
   * @param {number} [options.maxAgeDays=0] - Maximum document age in days (0 = disabled)
   * @param {boolean} [options.enforceACL=false] - Whether to enforce access control
   * @param {boolean} [options.detectInjection=false] - Scan document text for prompt injection
   * @param {'remove'|'flag'} [options.injectionAction='remove'] - Remove flagged documents or keep and mark them
   * @param {RegExp[]} [options.injectionPatterns=[]] - Extra injection patterns for the scan
   */
  constructor(options = {}) {
    super();
    this.config = { ...DEFAULT_CONFIG, ...options };
  }

  /**
   * Filter retrieval results based on configured guards.
   *
   * @param {Array<object>} results - Array of retrieval results, each with .score and optional .metadata
   * @param {object} [context={}] - Request context
   * @param {string[]} [context.userPermissions] - User's permission roles for ACL filtering
   * @returns {{
   *   results: Array<object>,
   *   removed: Array<object>,
   *   metadata: { reasons: Object<string, number> }
   * }}
   * @fires RetrievalGuard#filtered
   */
  filter(results, context = {}) {
    if (!Array.isArray(results)) {
      const output = { results: [], removed: [], metadata: { reasons: {} } };
      this.emit('filtered', output);
      return output;
    }

    const kept = [];
    const removed = [];
    const reasons = {};

    const now = Date.now();
    const maxAgeMs =
      this.config.maxAgeDays > 0
        ? this.config.maxAgeDays * 24 * 60 * 60 * 1000
        : 0;

    for (const result of results) {
      let dominated = false;
      const doc = result.metadata || result.doc || result;

      // 1. Relevance score filter
      if (this.config.minRelevanceScore > 0) {
        const score = result.score != null ? result.score : 0;
        if (score < this.config.minRelevanceScore) {
          dominated = true;
          reasons.relevance = (reasons.relevance || 0) + 1;
        }
      }

      // 2. Freshness filter
      if (!dominated && maxAgeMs > 0) {
        const timestamp = doc.updatedAt || doc.timestamp;
        if (timestamp) {
          const docTime = new Date(timestamp).getTime();
          if (!isNaN(docTime) && now - docTime > maxAgeMs) {
            dominated = true;
            reasons.freshness = (reasons.freshness || 0) + 1;
          }
        }
      }

      // 3. ACL filter. Missing userPermissions fails closed: the user is
      // treated as having no roles, so restricted documents are removed.
      if (!dominated && this.config.enforceACL) {
        const userPermissions = context.userPermissions || [];
        // Read the restriction from the result itself or its metadata, so a
        // top-level `acl` is not ignored when the result also has metadata.
        const restriction =
          result.requiredRole ?? result.acl ?? doc.requiredRole ?? doc.acl;
        const requiredRoles = restriction ? [].concat(restriction) : null;

        if (requiredRoles && requiredRoles.length > 0) {
          const hasAccess = requiredRoles.some((role) =>
            userPermissions.includes(role),
          );
          if (!hasAccess) {
            dominated = true;
            reasons.acl = (reasons.acl || 0) + 1;
          }
        }
      }

      // 4. Indirect prompt injection in document text (opt-in)
      if (!dominated && this.config.detectInjection) {
        const text = documentText(result);
        const found = detectInjection(text, {
          patterns: this.config.injectionPatterns,
        });
        if (found.detected) {
          reasons.injection = (reasons.injection || 0) + 1;
          if (this.config.injectionAction === 'flag') {
            kept.push({
              ...result,
              injection: { detected: true, matches: found.matches },
            });
            continue;
          }
          dominated = true;
        }
      }

      if (dominated) {
        removed.push(result);
      } else {
        kept.push(result);
      }
    }

    const output = {
      results: kept,
      removed,
      metadata: { reasons },
    };

    this.emit('filtered', { original: results, filtered: kept, removed });
    return output;
  }
}

/**
 * Text of a retrieval result for injection scanning.
 * @param {object|string} result
 * @returns {string}
 */
function documentText(result) {
  if (typeof result === 'string') return result;
  if (!result || typeof result !== 'object') return '';
  const doc = result.doc && typeof result.doc === 'object' ? result.doc : {};
  return String(
    result.content ||
      result.text ||
      result.pageContent ||
      doc.content ||
      doc.text ||
      '',
  );
}

module.exports = { RetrievalGuard, DEFAULT_CONFIG };
