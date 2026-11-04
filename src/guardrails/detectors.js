'use strict';

/**
 * Pluggable detectors for the guards. A detector finds one kind of problem
 * in a piece of text:
 *
 *   { name, kind: 'injection' | 'pii', detect(text, context) }
 *
 * `detect` returns `{ flagged, score?, labels?, matches? }`, or a promise of
 * it. `matches` is `[{ label, text, start?, end? }]`; a PII detector must
 * fill `text` with the exact matched string, because redaction replaces it.
 * `context` is `{ stage: 'query' | 'document' | 'output', document?, signal? }`.
 *
 * The guards take `detectors: [...]` alongside their built-in pattern checks,
 * and `builtIn: false` to replace them. `patternInjectionDetector()` and
 * `patternPIIDetector()` are the built-in checks as detectors, for measuring
 * or composing them.
 */

const { detectInjection } = require('./injection-detector');

const KINDS = ['injection', 'pii'];

/** The PII patterns PostGenerationGuard redacts by default. */
const DEFAULT_PII_PATTERNS = {
  email: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,
  phone: /\b\d{3}[-.]?\d{3}[-.]?\d{4}\b/g,
  ssn: /\b\d{3}-\d{2}-\d{4}\b/g,
  creditCard: /\b\d{4}[- ]?\d{4}[- ]?\d{4}[- ]?\d{4}\b/g,
};

/**
 * The built-in prompt-injection check as a detector.
 *
 * @param {object} [options]
 * @param {RegExp[]} [options.patterns] - Extra patterns, added to the built-in rules
 * @returns {{name: string, kind: 'injection', detect: (text: string) => {flagged: boolean, labels: string[], matches: Array<{label: string, text: string}>}}}
 */
function patternInjectionDetector({ patterns = [] } = {}) {
  return {
    name: 'pattern-injection',
    kind: 'injection',
    detect(text) {
      const found = detectInjection(String(text ?? ''), { patterns });
      return {
        flagged: found.detected,
        labels: [...new Set(found.matches.map((m) => m.id))],
        matches: found.matches.map((m) => ({ label: m.id, text: m.match })),
      };
    },
  };
}

/**
 * The built-in PII check as a detector: emails, phone numbers, US social
 * security numbers and card numbers, by pattern.
 *
 * @param {object} [options]
 * @param {Object<string, RegExp>} [options.patterns] - Extra patterns by label, merged with the defaults
 * @returns {{name: string, kind: 'pii', detect: (text: string) => {flagged: boolean, labels: string[], matches: Array<{label: string, text: string, start: number, end: number}>}}}
 */
function patternPIIDetector({ patterns } = {}) {
  const all = { ...DEFAULT_PII_PATTERNS, ...patterns };
  return {
    name: 'pattern-pii',
    kind: 'pii',
    detect(text) {
      const matches = [];
      for (const [label, pattern] of Object.entries(all)) {
        const re = new RegExp(
          pattern.source,
          pattern.flags.includes('g') ? pattern.flags : `${pattern.flags}g`,
        );
        for (const m of String(text ?? '').matchAll(re)) {
          if (m[0]) {
            matches.push({
              label,
              text: m[0],
              start: m.index,
              end: m.index + m[0].length,
            });
          }
        }
      }
      return {
        flagged: matches.length > 0,
        labels: [...new Set(matches.map((m) => m.label))],
        matches,
      };
    },
  };
}

/**
 * Check a guard's `detectors` and `builtIn` options.
 *
 * @param {string} guard - Guard name, for messages
 * @param {'injection'|'pii'} kind - The kind of detector this guard runs
 * @param {object} options - The guard's options
 * @returns {object[]} The detectors
 */
function resolveDetectors(guard, kind, options = {}) {
  const { detectors = [], builtIn = true } = options;
  if (!Array.isArray(detectors)) {
    throw new TypeError(`${guard}: detectors must be an array`);
  }
  for (const d of detectors) {
    if (
      !d ||
      typeof d !== 'object' ||
      typeof d.detect !== 'function' ||
      typeof d.name !== 'string' ||
      !KINDS.includes(d.kind)
    ) {
      throw new TypeError(
        `${guard}: a detector is { name, kind: 'injection' | 'pii', detect(text, context) }`,
      );
    }
    if (d.kind !== kind) {
      throw new TypeError(
        `${guard} runs ${kind} detectors; "${d.name}" is a ${d.kind} detector`,
      );
    }
  }
  if (builtIn === false && detectors.length === 0) {
    throw new TypeError(
      `${guard}: builtIn: false needs at least one ${kind} detector, or the check is off`,
    );
  }
  const onDetectorError = options.onDetectorError ?? 'block';
  if (onDetectorError !== 'block' && onDetectorError !== 'skip') {
    throw new TypeError(`${guard}: onDetectorError must be 'block' or 'skip'`);
  }
  return detectors;
}

function normalise(detector, raw) {
  const r = raw && typeof raw === 'object' ? raw : { flagged: Boolean(raw) };
  const matches = Array.isArray(r.matches)
    ? r.matches
        .filter((m) => m && typeof m === 'object')
        .map((m) => ({ ...m, text: m.text == null ? '' : String(m.text) }))
    : [];
  return {
    detector: detector.name,
    kind: detector.kind,
    flagged: Boolean(r.flagged),
    ...(typeof r.score === 'number' && { score: r.score }),
    ...(Array.isArray(r.labels) && { labels: r.labels.map(String) }),
    matches,
  };
}

function failed(detector, error) {
  return {
    detector: detector.name,
    kind: detector.kind,
    flagged: false,
    matches: [],
    error: String((error && error.message) || error),
  };
}

/**
 * Run detectors synchronously. A detector that returns a promise throws a
 * TypeError naming the async method to use, rather than being ignored (an
 * ignored promise is a check that never fires).
 *
 * @returns {object[]} One detection per detector
 */
function runDetectorsSync(detectors, text, context, { guard, asyncMethod }) {
  return detectors.map((detector) => {
    let raw;
    try {
      raw = detector.detect(text, context);
    } catch (error) {
      return failed(detector, error);
    }
    if (raw && typeof raw.then === 'function') {
      // Don't leave a rejection unhandled; the caller gets the TypeError.
      Promise.resolve(raw).catch(() => {});
      throw new TypeError(
        `${guard}: detector "${detector.name}" is async; use ${asyncMethod}()`,
      );
    }
    return normalise(detector, raw);
  });
}

/**
 * Run detectors concurrently, sync or async.
 *
 * @returns {Promise<object[]>} One detection per detector
 */
function runDetectorsAsync(detectors, text, context) {
  return Promise.all(
    detectors.map(async (detector) => {
      try {
        return normalise(detector, await detector.detect(text, context));
      } catch (error) {
        return failed(detector, error);
      }
    }),
  );
}

/**
 * The strings PII detectors found in a PostGenerationGuard result, for
 * `PostGenerationGuard.redact(text, matches)`. The result keeps them in a
 * non-enumerable `matchedText`, so they don't appear in its JSON.
 *
 * @param {object} result - A PostGenerationGuard check() or checkAsync() result
 * @returns {string[]}
 */
function detectedText(result) {
  return (
    (result && Array.isArray(result.matchedText) && result.matchedText) || []
  );
}

module.exports = {
  DEFAULT_PII_PATTERNS,
  patternInjectionDetector,
  patternPIIDetector,
  resolveDetectors,
  runDetectorsSync,
  runDetectorsAsync,
  detectedText,
};
