'use strict';

/**
 * Test-runner matchers for answers: `expect(answer).toBeGroundedIn(sources)`,
 * `expect(result).toCite("vacation")` and `expect(answer).toContainNoPII()`.
 * Register them with `expect.extend(ragMatchers)` in Jest or Vitest.
 *
 * They use the same deterministic checks as checkAnswer and the
 * post-generation guard, so a test gives the same result on every run and
 * needs no model or network.
 */

const { CitationTracker } = require('../citation/citation-tracker');
const { normalizeSources } = require('../grounding/check-answer');
const {
  DEFAULT_CONFIG: POST_GENERATION_DEFAULTS,
} = require('../guardrails/post-generation-guard');

/** The answer text of a string, a run() result or a checkAnswer() input. */
function answerOf(received, matcher) {
  if (typeof received === 'string') return received;
  if (received && typeof received.answer === 'string') return received.answer;
  throw new TypeError(
    `${matcher}: expected an answer string or an object with an answer (such as a pipeline.run() result), got ${
      received === null ? 'null' : typeof received
    }`,
  );
}

/** Sources passed to the matcher, or the ones a run() result carries. */
function sourcesOf(received, sources, matcher) {
  const list =
    sources ??
    (received && typeof received === 'object'
      ? (received.results ?? received.sources)
      : undefined);
  if (!Array.isArray(list)) {
    throw new TypeError(
      `${matcher}: pass the sources (strings, { id, content }, LangChain Documents or LlamaIndex nodes), or a pipeline.run() result that has results`,
    );
  }
  return normalizeSources(list);
}

function track(answer, docs, options = {}) {
  // An empty answer has no sentences, so it is not grounded (as in
  // checkAnswer); CitationTracker rejects empty text.
  if (!answer.trim()) {
    return { tracked: { groundednessScore: 0, citations: [] }, sentences: [] };
  }
  const tracker = new CitationTracker(
    options.threshold != null ? { similarityThreshold: options.threshold } : {},
  );
  const tracked = tracker.track(answer, docs);
  const sentences =
    (tracked.hallucinationReport && tracked.hallucinationReport.sentences) ||
    [];
  return { tracked, sentences };
}

const list = (items) => items.map((s) => `  - ${s}`).join('\n');

/**
 * Passes when every sentence of the answer is supported by the sources: its
 * content words, numbers and negation match a source (see checkAnswer).
 *
 * @param {string|{answer: string, results?: Array}} received - An answer, or a run() result
 * @param {Array} [sources] - Defaults to the run() result's `results`
 * @param {{threshold?: number}} [options] - Support threshold per sentence (default 0.5)
 */
function toBeGroundedIn(received, sources, options) {
  const answer = answerOf(received, 'toBeGroundedIn');
  const docs = sourcesOf(received, sources, 'toBeGroundedIn');
  const { tracked, sentences } = track(answer, docs, options);
  const unsupported = sentences
    .filter((s) => s.classification !== 'grounded')
    .map((s) => s.text);
  const pass = sentences.length > 0 && unsupported.length === 0;
  return {
    pass,
    message: () =>
      pass
        ? `expected the answer not to be grounded in the ${docs.length} source(s), but every sentence is supported:\n${list(
            sentences.map((s) => s.text),
          )}`
        : sentences.length === 0
          ? 'expected the answer to be grounded in the sources, but it has no sentences'
          : `expected the answer to be grounded in the ${docs.length} source(s), but ${unsupported.length} of ${sentences.length} sentence(s) are not supported (groundedness ${tracked.groundednessScore.toFixed(2)}):\n${list(unsupported)}`,
  };
}

/**
 * Passes when the answer cites each of the given sources: at least one of its
 * sentences is supported by that source.
 *
 * @param {string|{answer: string, results?: Array}} received - An answer, or a run() result
 * @param {string|string[]} ids - Source id(s) that must be cited
 * @param {Array} [sources] - Defaults to the run() result's `results`
 */
function toCite(received, ids, sources) {
  const wanted = (Array.isArray(ids) ? ids : [ids]).map(String);
  if (wanted.length === 0) {
    throw new TypeError('toCite: pass at least one source id');
  }
  const answer = answerOf(received, 'toCite');
  const docs = sourcesOf(received, sources, 'toCite');
  const { tracked } = track(answer, docs);
  const cited = new Set();
  for (const citation of tracked.citations || []) {
    for (const source of citation.sources || []) {
      const doc = docs[source.docIndex];
      cited.add(String(source.docId ?? (doc && doc.id)));
    }
  }
  const missing = wanted.filter((id) => !cited.has(id));
  const pass = missing.length === 0;
  const citedList = [...cited].join(', ') || 'none';
  return {
    pass,
    message: () =>
      pass
        ? `expected the answer not to cite ${wanted.join(', ')}, but it does (cited: ${citedList})`
        : `expected the answer to cite ${missing.join(', ')}, but no sentence is supported by ${
            missing.length === 1 ? 'it' : 'them'
          } (cited: ${citedList})`,
  };
}

/** Every string in a value: the value itself, or the strings nested in it. */
function stringsIn(value, out = []) {
  if (typeof value === 'string') out.push(value);
  else if (Array.isArray(value)) value.forEach((v) => stringsIn(v, out));
  else if (value && typeof value === 'object') {
    Object.values(value).forEach((v) => stringsIn(v, out));
  }
  return out;
}

/**
 * Passes when no email address, phone number, US social security number or
 * card number (the post-generation guard's patterns) appears in the value: a
 * string, or every string nested in an object such as a run() result.
 *
 * @param {*} received
 * @param {{patterns?: Object<string, RegExp>}} [options] - Extra patterns by name
 */
function toContainNoPII(received, options = {}) {
  const patterns = {
    ...POST_GENERATION_DEFAULTS.piiPatterns,
    ...(options.patterns || {}),
  };
  const found = [];
  for (const text of stringsIn(received)) {
    for (const [name, pattern] of Object.entries(patterns)) {
      const global = new RegExp(
        pattern.source,
        pattern.flags.includes('g') ? pattern.flags : `${pattern.flags}g`,
      );
      for (const match of text.match(global) || []) {
        found.push(`${name}: ${match}`);
      }
    }
  }
  const pass = found.length === 0;
  return {
    pass,
    message: () =>
      pass
        ? 'expected the value to contain PII, but none of the patterns matched'
        : `expected no PII, but found ${found.length}:\n${list(found)}`,
  };
}

/** All matchers, for expect.extend(ragMatchers). */
const ragMatchers = { toBeGroundedIn, toCite, toContainNoPII };

module.exports = { ragMatchers, toBeGroundedIn, toCite, toContainNoPII };
