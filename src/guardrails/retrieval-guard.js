'use strict';

const { EventEmitter } = require('events');
const { detectInjection } = require('./injection-detector');
const {
  resolveDetectors,
  runDetectorsSync,
  runDetectorsAsync,
} = require('./detectors');

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
   * @param {Array<object>} [options.detectors=[]] - Injection detectors to run on each document's text too, when detectInjection is on (see ./detectors); async ones need filterAsync(), which calls them once per document, concurrently
   * @param {boolean} [options.builtIn=true] - false: use only `detectors` for the injection scan
   * @param {'block'|'skip'} [options.onDetectorError='block'] - A detector that throws counts as a finding ('block': the document is removed or flagged) or is ignored ('skip')
   */
  constructor(options = {}) {
    super();
    this.config = { ...DEFAULT_CONFIG, ...options };
    /** @private */
    this._detectors = resolveDetectors('RetrievalGuard', 'injection', options);
    if (this._detectors.length > 0 && this.config.detectInjection !== true) {
      // Detectors only run in the injection scan; without it they would be
      // configured and never called.
      throw new TypeError(
        'RetrievalGuard: detectors run in the injection scan; set detectInjection: true',
      );
    }
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
    const state = this._screen(results, context);
    if (state.output) return state.output;
    const detections = state.scan.map((i) =>
      this._detectors.length > 0
        ? runDetectorsSync(
            this._detectors,
            documentText(state.results[i]),
            { stage: 'document', document: state.results[i] },
            { guard: 'RetrievalGuard', asyncMethod: 'filterAsync' },
          )
        : [],
    );
    return this._finish(state, detections);
  }

  /**
   * filter() for async detectors, such as a classifier model or a service. Each
   * document that reaches the injection scan is checked by every detector,
   * all concurrently.
   *
   * @param {Array<object>} results
   * @param {object} [context={}]
   * @param {object} [options]
   * @param {AbortSignal} [options.signal] - Passed to each detector in its context
   * @returns {Promise<ReturnType<RetrievalGuard['filter']>>}
   */
  async filterAsync(results, context = {}, { signal } = {}) {
    const state = this._screen(results, context);
    if (state.output) return state.output;
    const detections = await Promise.all(
      state.scan.map((i) =>
        this._detectors.length > 0
          ? runDetectorsAsync(this._detectors, documentText(state.results[i]), {
              stage: 'document',
              document: state.results[i],
              ...(signal && { signal }),
            })
          : [],
      ),
    );
    return this._finish(state, detections);
  }

  /**
   * @private Relevance, freshness and ACL, then which documents go on to
   * the injection scan.
   */
  _screen(results, context) {
    if (!Array.isArray(results)) {
      const output = { results: [], removed: [], metadata: { reasons: {} } };
      this.emit('filtered', output);
      return { output };
    }

    const reasons = {};
    const dropped = new Array(results.length).fill(false);
    const scan = [];

    const now = Date.now();
    const maxAgeMs =
      this.config.maxAgeDays > 0
        ? this.config.maxAgeDays * 24 * 60 * 60 * 1000
        : 0;

    results.forEach((result, i) => {
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
        const userPermissions = permissionsOf(context.userPermissions);
        // Every restriction set on the result, its metadata or its doc must
        // be met; within one, any of its roles is enough.
        const hasAccess = restrictionsOf(result).every((roles) =>
          roles.some((role) => userPermissions.includes(role)),
        );
        if (!hasAccess) {
          dominated = true;
          reasons.acl = (reasons.acl || 0) + 1;
        }
      }

      dropped[i] = dominated;
      if (!dominated && this.config.detectInjection) scan.push(i);
    });

    return { results, reasons, dropped, scan };
  }

  /** @private 4. Indirect prompt injection in document text (opt-in). */
  _finish({ results, reasons, dropped, scan }, detections) {
    const findings = new Map();
    const skip = this.config.onDetectorError === 'skip';
    scan.forEach((i, n) => {
      const matches =
        this.config.builtIn === false
          ? []
          : detectInjection(documentText(results[i]), {
              patterns: this.config.injectionPatterns,
            }).matches;
      const found = detections[n] || [];
      const flagged = found.some((d) => d.flagged || (d.error && !skip));
      if (matches.length > 0 || flagged) {
        findings.set(i, { matches, detections: found });
      }
    });

    const kept = [];
    const removed = [];
    results.forEach((result, i) => {
      const finding = findings.get(i);
      if (finding) {
        reasons.injection = (reasons.injection || 0) + 1;
        if (this.config.injectionAction === 'flag') {
          kept.push({
            ...result,
            injection: {
              detected: true,
              matches: finding.matches,
              ...(this._detectors.length > 0 && {
                detections: finding.detections,
              }),
            },
          });
          return;
        }
        removed.push(result);
        return;
      }
      if (dropped[i]) removed.push(result);
      else kept.push(result);
    });

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

/**
 * The access restrictions of a retrieval result: each `requiredRole` or
 * `acl` set on the result, its metadata or its doc, as a list of roles.
 * null, undefined, '' and [] are no restriction and don't hide one set
 * elsewhere; any other value, such as 0, restricts.
 * @param {object} result
 * @returns {Array<Array<any>>}
 */
function restrictionsOf(result) {
  if (!result || typeof result !== 'object') return [];
  const lists = [];
  for (const source of [result, result.metadata, result.doc]) {
    if (!source || typeof source !== 'object') continue;
    for (const key of ['requiredRole', 'acl']) {
      const value = source[key];
      if (value === undefined || value === null || value === '') continue;
      const roles = [].concat(value);
      if (roles.length > 0) lists.push(roles);
    }
  }
  return lists;
}

/**
 * The user's roles as an array of whole roles: a single role given as a
 * string is one role; anything that isn't a string or iterable is none.
 * @param {any} value
 * @returns {Array<any>}
 */
function permissionsOf(value) {
  if (typeof value === 'string') return [value];
  if (Array.isArray(value)) return value;
  if (value && typeof value[Symbol.iterator] === 'function') {
    return Array.from(value);
  }
  return [];
}

module.exports = { RetrievalGuard, DEFAULT_CONFIG };
