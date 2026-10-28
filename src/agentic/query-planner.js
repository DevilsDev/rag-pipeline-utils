'use strict';

const { EventEmitter } = require('events');

/**
 * Default configuration for the QueryPlanner.
 * @type {object}
 */
const DEFAULT_CONFIG = {
  minComplexityToSplit: 2,
  maxSubQueries: 5,
};

/** Question words that indicate query complexity */
const QUESTION_WORDS = ['who', 'what', 'when', 'where', 'why', 'how', 'which'];

/** Conjunctions used for scoring compound queries */
const CONJUNCTIONS = ['and', 'or', 'also', 'as well as'];

/** Keywords that indicate a comparative strategy */
const COMPARATIVE_KEYWORDS = [
  'compare',
  'contrast',
  'difference',
  'versus',
  'vs',
];

/**
 * Words that start a new question or instruction. A conjunction ("and",
 * "or", "as well as") splits a query only when one of these follows it, so
 * "What is RAG and how does BM25 work" splits while "salt and pepper" and
 * "Should I use A or B" do not.
 */
const CLAUSE_STARTERS = [
  // question words
  'who',
  'whom',
  'whose',
  'what',
  'when',
  'where',
  'why',
  'how',
  'which',
  // auxiliaries opening a yes/no question
  'is',
  'are',
  'was',
  'were',
  'do',
  'does',
  'did',
  'can',
  'could',
  'should',
  'would',
  'will',
  'has',
  'have',
  // imperatives opening an instruction
  'explain',
  'describe',
  'list',
  'compare',
  'contrast',
  'summarize',
  'summarise',
  'tell',
  'show',
  'give',
  'define',
  'find',
];

const STARTER_ALT = CLAUSE_STARTERS.join('|');

/** ", and how ...", " and what ...", " or is ...", " as well as why ..." */
const CONJUNCTION_BOUNDARY = new RegExp(
  `\\s*,?\\s+(?:and|or|as well as|and also|but)\\s+(?=(?:${STARTER_ALT})\\b)`,
  'i',
);

/**
 * Explicit boundaries: "?" / "!" followed by more text, "." followed by a
 * capitalised word (so "e.g. salt" stays whole), and ";".
 */
const PUNCTUATION_BOUNDARY = /(?<=[?!])\s+(?=\S)|(?<=\.)\s+(?=[A-Z])|\s*;\s*/;
/** Abbreviations whose period does not end a sentence. */
const ABBREVIATION_END =
  /\b(?:e\.g|i\.e|etc|vs|cf|approx|mr|mrs|ms|dr|st|no)\.$/i;

/** "compare|contrast X and|with|to|vs Y [for|in terms of|... aspect]" */
const COMPARE_RE =
  /\b(?:compare|contrast)\s+(.+?)\s+(?:and|with|to|against|vs\.?|versus)\s+(.+?)(?:\s+(?:for|in terms of|regarding|when|on)\s+(.+?))?\s*[?.!]?$/i;
/** "difference(s) between X and Y [for|in|... aspect]" */
const DIFFERENCE_RE =
  /\bdifferences?\s+between\s+(.+?)\s+and\s+(.+?)(?:\s+(?:for|in terms of|regarding|when|in|on)\s+(.+?))?\s*[?.!]?$/i;
/** "X vs Y [for|... aspect]" */
const VERSUS_RE =
  /^(.*?)\s+(?:vs\.?|versus)\s+(.+?)(?:\s+(?:for|in terms of|regarding|when|on)\s+(.+?))?\s*[?.!]?$/i;

/** Upper bound on one LLM-proposed sub-query, in characters. */
const MAX_LLM_SUBQUERY_LENGTH = 500;

/**
 * Query decomposition planner. The default heuristic needs no LLM:
 *
 * - splits only at clause/question boundaries: "?" / "." followed by more
 *   text, ";", and "and" / "or" / "as well as" (optionally after a comma)
 *   when a question word, auxiliary verb or imperative follows;
 * - keeps noun-phrase conjunctions intact ("salt and pepper", "A or B");
 * - expands comparisons ("X vs Y", "compare X and Y", "difference between X
 *   and Y") into one sub-query per entity plus the comparison itself.
 *
 * `plan(query, { llm })` can instead ask an LLM for a JSON array of
 * sub-queries (strictly validated, heuristic fallback).
 *
 * @extends EventEmitter
 */
class QueryPlanner extends EventEmitter {
  /**
   * @param {object} [options] - Override default configuration
   * @param {number} [options.minComplexityToSplit=2] - Minimum complexity
   *   score before splitting at conjunctions; punctuation boundaries and
   *   comparisons are always split
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
   *   +1 per conjunction followed by a question word, auxiliary or
   *      imperative ("... and how ...", "... and explain ...")
   *
   * @param {string} query
   * @returns {number}
   * @private
   */
  _computeComplexity(query) {
    const lower = query.toLowerCase();
    const words = lower.split(/\s+/);
    let score = 0;

    for (const w of QUESTION_WORDS) {
      if (words.includes(w)) score += 1;
    }

    for (const c of CONJUNCTIONS) {
      // "as well as" is multi-word -- use indexOf on the full string
      if (c.includes(' ')) {
        if (lower.includes(c)) score += 1;
      } else if (words.includes(c)) {
        score += 1;
      }
    }

    if (query.length > 100) score += 1;

    const semicolons = (query.match(/;/g) || []).length;
    score += semicolons;

    const commas = (query.match(/,/g) || []).length;
    if (commas > 0) score += commas;

    // +1 per conjunction that opens a new question or instruction
    score += query.split(CONJUNCTION_BOUNDARY).length - 1;

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
    const words = lower.split(/[^a-z]+/);

    for (const kw of COMPARATIVE_KEYWORDS) {
      if (words.includes(kw) || words.includes(`${kw}s`)) return 'comparative';
    }

    for (const w of words) {
      if (['who', 'what', 'where', 'when'].includes(w)) return 'factual';
      if (['why', 'how'].includes(w)) return 'analytical';
    }

    return 'general';
  }

  /**
   * Split a clause describing a comparison into its entities.
   *
   * @param {string} clause
   * @returns {{ entities: string[], aspect: string|null }|null}
   * @private
   */
  _parseComparison(clause) {
    const text = clause.trim();
    let match = text.match(COMPARE_RE) || text.match(DIFFERENCE_RE);
    let left;
    if (match) {
      left = match[1];
    } else {
      match = text.match(VERSUS_RE);
      if (!match) return null;
      // "Which is faster, Postgres vs MySQL" -> "Postgres"
      left = match[1].split(/[,:]/).pop();
      left = left.replace(
        /^\s*(?:(?:what|which|who)\s+(?:is|are)\s+\w+(?:\s+\w+)?\s*[:,-]?\s*)/i,
        '',
      );
    }
    const clean = (s) =>
      String(s || '')
        .trim()
        .replace(/^(?:the|a|an)\s+/i, '')
        .replace(/[?.!,;:]+$/, '')
        .trim();
    const entities = [...left.split(/\s*,\s*(?:and\s+)?|\s+and\s+/i), match[2]]
      .map(clean)
      .filter(Boolean);
    if (entities.length < 2) return null;
    const aspect = match[3] ? clean(match[3]) : null;
    return { entities, aspect };
  }

  /**
   * Heuristic decomposition into sub-query strings.
   *
   * @param {string} query - Trimmed query
   * @param {number} complexity
   * @returns {Array<{subQuery: string, strategy: string}>}
   * @private
   */
  _decompose(query, complexity) {
    const tidy = (s) =>
      s
        .trim()
        .replace(/^[,;]+\s*|[,;]+$/g, '')
        .trim();

    let clauses = [];
    for (const piece of query.split(PUNCTUATION_BOUNDARY)) {
      const prev = clauses[clauses.length - 1];
      // "e.g. Google" / "Dr. Smith": an abbreviation, not a sentence end.
      if (prev && ABBREVIATION_END.test(prev)) {
        clauses[clauses.length - 1] = `${prev} ${piece}`;
      } else {
        clauses.push(piece);
      }
    }
    clauses = clauses.map(tidy).filter(Boolean);
    if (complexity >= this.config.minComplexityToSplit) {
      clauses = clauses.flatMap((c) =>
        c.split(CONJUNCTION_BOUNDARY).map(tidy).filter(Boolean),
      );
    }

    const out = [];
    for (const clause of clauses) {
      const comparison = this._parseComparison(clause);
      if (comparison) {
        for (const entity of comparison.entities) {
          out.push({
            subQuery: comparison.aspect
              ? `${entity} ${comparison.aspect}`
              : entity,
            strategy: 'factual',
          });
        }
        out.push({ subQuery: clause, strategy: 'comparative' });
      } else {
        out.push({ subQuery: clause, strategy: this._detectStrategy(clause) });
      }
    }
    return out;
  }

  /**
   * Turn sub-query texts into the plan result (dedupe, limit, priorities).
   *
   * @param {Array<{subQuery: string, strategy: string}>} items
   * @param {number} complexity
   * @param {string} originalQuery
   * @param {'heuristic'|'llm'} source
   * @returns {object}
   * @private
   */
  _finalize(items, complexity, originalQuery, source) {
    const seen = new Set();
    const unique = items.filter((sq) => {
      const key = sq.subQuery.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    const subQueries = unique
      .slice(0, this.config.maxSubQueries)
      .map((sq, i) => ({
        subQuery: sq.subQuery,
        strategy: sq.strategy,
        priority: i,
      }));
    return { subQueries, complexity, originalQuery, source };
  }

  /**
   * Heuristic plan for a trimmed query.
   * @private
   */
  _heuristicPlan(trimmed) {
    const complexity = this._computeComplexity(trimmed);
    const items = this._decompose(trimmed, complexity);
    if (items.length === 0) {
      items.push({
        subQuery: trimmed,
        strategy: this._detectStrategy(trimmed),
      });
    }
    return this._finalize(items, complexity, trimmed, 'heuristic');
  }

  /**
   * Strictly validate an LLM's sub-query proposal: a JSON array (optionally
   * in a ```json fence) of 1..maxSubQueries non-empty, single-line strings of
   * at most 500 characters. Anything else is rejected.
   *
   * @param {*} raw - Value returned by llm.generate()
   * @returns {string[]|null}
   * @private
   */
  _parseLlmSubQueries(raw) {
    let text = raw;
    if (text && typeof text === 'object') {
      text = text.text ?? text.content ?? text.answer;
    }
    if (typeof text !== 'string') return null;
    text = text.trim();
    const fenced = text.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
    if (fenced) text = fenced[1].trim();
    if (!text.startsWith('[') || !text.endsWith(']')) return null;

    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch (_err) {
      return null;
    }
    if (!Array.isArray(parsed)) return null;
    if (parsed.length === 0 || parsed.length > this.config.maxSubQueries) {
      return null;
    }
    const out = [];
    for (const item of parsed) {
      if (typeof item !== 'string') return null;
      const s = item.trim();
      if (!s || s.length > MAX_LLM_SUBQUERY_LENGTH || /[\r\n]/.test(s)) {
        return null;
      }
      out.push(s);
    }
    return out;
  }

  /**
   * Ask the LLM for sub-queries; fall back to the heuristic plan.
   * @private
   */
  async _planWithLlm(trimmed, { llm, signal }) {
    const heuristic = this._heuristicPlan(trimmed);
    let result = heuristic;
    try {
      const prompt =
        'Split the user question into independent search queries for a ' +
        'retrieval system. Keep phrases such as "salt and pepper" intact; ' +
        'for a comparison, give one query per compared item plus the ' +
        `comparison. Reply with ONLY a JSON array of 1 to ${this.config.maxSubQueries} ` +
        `strings.\n\nQuestion: ${trimmed}`;
      const raw = await llm.generate(prompt, [], signal ? { signal } : {});
      const proposed = this._parseLlmSubQueries(raw);
      if (proposed) {
        result = this._finalize(
          proposed.map((s) => ({
            subQuery: s,
            strategy: this._detectStrategy(s),
          })),
          heuristic.complexity,
          trimmed,
          'llm',
        );
      }
    } catch (err) {
      // A cancelled run must not continue with the heuristic plan.
      if (signal && signal.aborted) throw err;
    }
    this.emit('planned', result);
    return result;
  }

  /**
   * Plan query decomposition.
   *
   * Without `options.llm` this is synchronous and returns the plan. With
   * `options.llm` (an object with `generate()`), it returns a Promise of the
   * plan: the LLM is asked for a JSON array of sub-queries, which is strictly
   * validated (see _parseLlmSubQueries); on any failure the heuristic plan is
   * used. `result.source` says which one was used.
   *
   * @param {string} query - The user query to decompose
   * @param {object} [options]
   * @param {{ generate: Function }} [options.llm] - Optional LLM planner
   * @param {AbortSignal} [options.signal] - Passed to llm.generate()
   * @returns {{
   *   subQueries: Array<{subQuery: string, strategy: string, priority: number}>,
   *   complexity: number,
   *   originalQuery: string,
   *   source: 'heuristic'|'llm'
   * }|Promise<object>}
   * @throws {Error} If query is not a non-empty string
   * @fires QueryPlanner#planned
   */
  plan(query, options = {}) {
    if (!query || typeof query !== 'string' || !query.trim()) {
      throw new Error('QueryPlanner.plan(): query must be a non-empty string');
    }
    const trimmed = query.trim();

    const llm = options && options.llm;
    if (llm && typeof llm.generate === 'function') {
      return this._planWithLlm(trimmed, options);
    }

    const result = this._heuristicPlan(trimmed);
    this.emit('planned', result);
    return result;
  }
}

module.exports = { QueryPlanner, DEFAULT_CONFIG };
