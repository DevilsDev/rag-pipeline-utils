'use strict';

const { EventEmitter } = require('events');

/**
 * Default configuration for the RetrievalGuard.
 * @type {object}
 */
const DEFAULT_CONFIG = {
  minRelevanceScore: 0,
  maxAgeDays: 0, // 0 = disabled
  enforceACL: false,
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

      // 3. ACL filter
      if (!dominated && this.config.enforceACL && context.userPermissions) {
        const requiredRoles = doc.requiredRole
          ? [].concat(doc.requiredRole)
          : doc.acl
            ? [].concat(doc.acl)
            : null;

        if (requiredRoles && requiredRoles.length > 0) {
          const hasAccess = requiredRoles.some((role) =>
            context.userPermissions.includes(role),
          );
          if (!hasAccess) {
            dominated = true;
            reasons.acl = (reasons.acl || 0) + 1;
          }
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

module.exports = { RetrievalGuard, DEFAULT_CONFIG };
