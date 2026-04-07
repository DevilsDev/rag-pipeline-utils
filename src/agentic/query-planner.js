"use strict";

const { EventEmitter } = require("events");

/**
 * Default configuration for the QueryPlanner.
 * @type {object}
 */
const DEFAULT_CONFIG = {
  minComplexityToSplit: 2,
  maxSubQueries: 5,
};

/** Question words that indicate query complexity */
const QUESTION_WORDS = ["who", "what", "when", "where", "why", "how", "which"];

/** Conjunctions used for splitting compound queries */
const CONJUNCTIONS = ["and", "or", "also", "as well as"];

/** Splitter patterns for decomposing compound queries */
const SPLIT_PATTERNS = [/\s+and\s+/i, /\s+or\s+/i, /;\s*/];

/** Keywords that indicate a comparative strategy */
const COMPARATIVE_KEYWORDS = [
  "compare",
  "contrast",
  "difference",
  "versus",
  "vs",
];

/**
 * Heuristic query decomposition planner -- no LLM needed.
 * Splits compound queries into sub-queries with assigned strategies
 * based on detected question types.
 *
 * @extends EventEmitter
 */
class QueryPlanner extends EventEmitter {
  /**
   * @param {object} [options] - Override default configuration
   * @param {number} [options.minComplexityToSplit=2] - Minimum complexity score before splitting
   * @param {number} [options.maxSubQueries=5] - Maximum number of sub-queries to produce
   */
  constructor(options = {}) {
    super();
    this.config = { ...DEFAULT_CONFIG, ...options };
  }

  /**
   * Compute the complexity score of a query string.
   *
   * Scoring rules:
   *   +1 per question word (who, what, when, where, why, how, which)
   *   +1 per conjunction (and, or, also, as well as)
   *   +1 if length > 100 characters
   *   +1 per semicolon
   *   +1 per comma-separated clause (commas - 1 if > 0 commas)
   *
   * @param {string} query
   * @returns {number}
   * @private
   */
  _computeComplexity(query) {
    const lower = query.toLowerCase();
    const words = lower.split(/\s+/);
    let score = 0;

    // +1 per question word
    for (const w of QUESTION_WORDS) {
      if (words.includes(w)) score += 1;
    }

    // +1 per conjunction
    for (const c of CONJUNCTIONS) {
      // "as well as" is multi-word -- use indexOf on the full string
      if (c.includes(" ")) {
        if (lower.includes(c)) score += 1;
      } else if (words.includes(c)) {
        score += 1;
      }
    }

    // +1 if length > 100 chars
    if (query.length > 100) score += 1;

    // +1 per semicolon
    const semicolons = (query.match(/;/g) || []).length;
    score += semicolons;

    // +1 per comma-separated clause (number of commas)
    const commas = (query.match(/,/g) || []).length;
    if (commas > 0) score += commas;

    return score;
  }

  /**
   * Detect the retrieval strategy for a query fragment.
   *
   * @param {string} text
   * @returns {'factual'|'analytical'|'comparative'|'general'}
   * @private
   */
  _detectStrategy(text) {
    const lower = text.toLowerCase();
    const words = lower.split(/\s+/);

    // Check comparative keywords first (more specific)
    for (const kw of COMPARATIVE_KEYWORDS) {
      if (words.includes(kw) || lower.includes(kw)) return "comparative";
    }

    // Check question words
    for (const w of words) {
      if (["who", "what", "where", "when"].includes(w)) return "factual";
      if (["why", "how"].includes(w)) return "analytical";
    }

    return "general";
  }

  /**
   * Plan query decomposition.
   *
   * @param {string} query - The user query to decompose
   * @returns {{
   *   subQueries: Array<{subQuery: string, strategy: string, priority: number}>,
   *   complexity: number,
   *   originalQuery: string
   * }}
   * @throws {Error} If query is not a non-empty string
   * @fires QueryPlanner#planned
   */
  plan(query) {
    // 1. Validate
    if (!query || typeof query !== "string" || !query.trim()) {
      throw new Error("QueryPlanner.plan(): query must be a non-empty string");
    }

    const trimmed = query.trim();

    // 2. Compute complexity
    const complexity = this._computeComplexity(trimmed);

    // 3. If complexity below threshold, return single sub-query
    if (complexity < this.config.minComplexityToSplit) {
      const result = {
        subQueries: [
          {
            subQuery: trimmed,
            strategy: this._detectStrategy(trimmed),
            priority: 0,
          },
        ],
        complexity,
        originalQuery: trimmed,
      };
      this.emit("planned", result);
      return result;
    }

    // 4. Split into sub-queries
    let parts = [trimmed];
    for (const pattern of SPLIT_PATTERNS) {
      const newParts = [];
      for (const part of parts) {
        const split = part
          .split(pattern)
          .map((s) => s.trim())
          .filter(Boolean);
        newParts.push(...split);
      }
      parts = newParts;
    }

    // Build sub-queries with strategy and priority
    let subQueries = parts.map((part, i) => ({
      subQuery: part,
      strategy: this._detectStrategy(part),
      priority: i,
    }));

    // 5. Deduplicate by subQuery text (case-insensitive)
    const seen = new Set();
    subQueries = subQueries.filter((sq) => {
      const key = sq.subQuery.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    // Limit to maxSubQueries
    subQueries = subQueries.slice(0, this.config.maxSubQueries);

    // 6. Emit 'planned' event
    const result = {
      subQueries,
      complexity,
      originalQuery: trimmed,
    };

    this.emit("planned", result);
    return result;
  }
}

module.exports = { QueryPlanner, DEFAULT_CONFIG };
