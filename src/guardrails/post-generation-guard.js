'use strict';

const { EventEmitter } = require('events');
const {
  DEFAULT_PII_PATTERNS,
  resolveDetectors,
  runDetectorsSync,
  runDetectorsAsync,
} = require('./detectors');

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
  piiPatterns: DEFAULT_PII_PATTERNS,
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
   * @param {Array<object>} [options.detectors=[]] - PII detectors to run on the output too (see ./detectors); their matches are redacted. Async ones need checkAsync()
   * @param {boolean} [options.builtIn=true] - false: use only `detectors`, not the built-in PII patterns
   * @param {'block'|'skip'} [options.onDetectorError='block'] - A detector that throws makes the output unsafe ('block'; what it would have found can't be redacted) or is ignored ('skip')
   */
  constructor(options = {}) {
    super();
    /** @private */
    this._detectors = resolveDetectors('PostGenerationGuard', 'pii', options);
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
    if (output == null || typeof output !== 'string') {
      return this._invalid();
    }
    const detections = this._runDetectors()
      ? runDetectorsSync(this._detectors, output, CONTEXT, {
          guard: 'PostGenerationGuard',
          asyncMethod: 'checkAsync',
        })
      : [];
    return this._check(output, retrievedDocs, detections);
  }

  /**
   * check() for async detectors, such as a model or a PII service.
   * Detectors run concurrently.
   *
   * @param {string} output
   * @param {Array<object>} [retrievedDocs=[]]
   * @returns {Promise<ReturnType<PostGenerationGuard['check']>>}
   */
  async checkAsync(output, retrievedDocs = []) {
    if (output == null || typeof output !== 'string') {
      return this._invalid();
    }
    const detections = this._runDetectors()
      ? await runDetectorsAsync(this._detectors, output, CONTEXT)
      : [];
    return this._check(output, retrievedDocs, detections);
  }

  /** @private */
  _runDetectors() {
    return this.config.enablePIIDetection && this._detectors.length > 0;
  }

  /** @private 1. The output must be a string. */
  _invalid() {
    const result = {
      safe: false,
      issues: ['Output must be a string'],
      sanitizedOutput: '',
    };
    this.emit('checked', result);
    return result;
  }

  /** @private */
  _check(output, retrievedDocs, detections) {
    const issues = [];

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
    if (this.config.enablePIIDetection && this.config.builtIn !== false) {
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

    // Findings of the configured detectors: their matched text is redacted
    // with the built-in matches.
    const skip = this.config.onDetectorError === 'skip';
    const detected = [];
    for (const d of detections) {
      if (d.error) {
        if (!skip) {
          issues.push(`PII detector "${d.detector}" failed: ${d.error}`);
        }
      } else if (d.flagged) {
        const texts = d.matches.map((m) => m.text).filter(Boolean);
        detected.push(...texts);
        const labels =
          d.labels && d.labels.length ? ` (${d.labels.join(', ')})` : '';
        issues.push(
          `PII detected by ${d.detector}${labels}: ${texts.length} occurrence(s)`,
        );
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
    sanitizedOutput = replaceAll(sanitizedOutput, detected);

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
    if (this._detectors.length > 0) {
      // The matched text is the PII itself: keep it out of the result's
      // JSON (logs, reports) and expose it, non-enumerable, for redact().
      result.detections = detections.map(({ matches, ...d }) => ({
        ...d,
        matches: matches.map(({ text, ...m }) => m),
      }));
      Object.defineProperty(result, 'matchedText', {
        value: [...new Set(detected)],
        enumerable: false,
      });
    }

    this.emit('checked', result);
    return result;
  }

  /**
   * Replace PII matches in arbitrary text with [REDACTED], using the same
   * patterns as check(). Used to scrub text derived from the answer, such as
   * citation sentences. Detectors don't run here (they may be async):
   * pass the strings a check found, `detectedText(result)`, as `matches`
   * so they are removed too.
   *
   * @param {string} text
   * @param {string[]} [matches=[]] - Exact strings to redact as well
   * @returns {string}
   */
  redact(text, matches = []) {
    if (typeof text !== 'string' || !this.config.enablePIIDetection) {
      return text;
    }
    let redacted = text;
    if (this.config.builtIn !== false) {
      for (const pattern of Object.values(this.config.piiPatterns)) {
        redacted = redacted.replace(pattern, '[REDACTED]');
      }
    }
    return replaceAll(redacted, matches);
  }
}

const CONTEXT = Object.freeze({ stage: 'output' });

/** Replace every occurrence of each string, longest first. */
function replaceAll(text, strings) {
  const unique = [...new Set(strings.filter(Boolean))].sort(
    (a, b) => b.length - a.length,
  );
  let out = text;
  for (const s of unique) out = out.split(s).join('[REDACTED]');
  return out;
}

module.exports = { PostGenerationGuard, DEFAULT_CONFIG };
