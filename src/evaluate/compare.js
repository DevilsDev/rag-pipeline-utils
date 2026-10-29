'use strict';

/**
 * Runs an evaluation dataset through a pipeline (runEvaluation) and compares
 * two runs (compareConfigurations). A run's report is plain JSON, so a saved
 * report can stand in for a pipeline: CI compares a pull request against the
 * report saved from its base branch instead of running the base branch.
 */

const { validateDataset } = require('./dataset');

const REPORT_VERSION = 1;

/** Metrics a report can hold; higher is better for all of them. */
const METRICS = [
  'faithfulness',
  'relevance',
  'contextPrecision',
  'contextRecall',
  'groundedness',
  'citationCoverage',
  'sourceRecall',
];

class DatasetError extends Error {
  constructor(errors) {
    const shown = errors.slice(0, 5).map((e) => e.message);
    const more = errors.length > 5 ? ` (and ${errors.length - 5} more)` : '';
    super(`Invalid dataset: ${shown.join('; ')}${more}`);
    this.name = 'DatasetError';
    this.code = 'RAG_INVALID_DATASET';
    this.errors = errors;
  }
}

const isFiniteNumber = (value) =>
  typeof value === 'number' && Number.isFinite(value);

const round = (value) => Math.round(value * 10000) / 10000;

function scoreCase(testCase, result) {
  const scores = {};
  const evaluation = result.evaluation && result.evaluation.scores;
  if (typeof result.answer === 'string' && evaluation) {
    for (const name of METRICS) {
      if (isFiniteNumber(evaluation[name])) scores[name] = evaluation[name];
    }
    if (
      result.citations &&
      isFiniteNumber(result.citations.groundednessScore)
    ) {
      scores.citationCoverage = result.citations.groundednessScore;
    }
  }
  if (testCase.sourceIds) {
    // A source id matches a result's id or its metadata.source, so a case
    // can name a file ("docs/vacation.md") when the index stores chunks
    // ("docs/vacation.md#0").
    const retrieved = new Set();
    for (const doc of result.results || []) {
      if (!doc) continue;
      if (doc.id !== undefined) retrieved.add(String(doc.id));
      if (doc.metadata && doc.metadata.source !== undefined) {
        retrieved.add(String(doc.metadata.source));
      }
    }
    const found = testCase.sourceIds.filter((id) => retrieved.has(id));
    scores.sourceRecall = found.length / testCase.sourceIds.length;
  }
  return scores;
}

function summarise(cases) {
  const metrics = {};
  for (const name of METRICS) {
    const values = cases
      .filter((c) => c.success && isFiniteNumber(c.scores[name]))
      .map((c) => c.scores[name]);
    if (values.length > 0) {
      metrics[name] = {
        mean: round(values.reduce((a, b) => a + b, 0) / values.length),
        count: values.length,
      };
    }
  }
  const failed = cases.filter((c) => !c.success).length;
  return {
    cases: cases.length,
    succeeded: cases.length - failed,
    failed,
    metrics,
  };
}

function checkedCases(dataset) {
  const report = validateDataset(dataset);
  if (!report.valid) throw new DatasetError(report.errors);
  return report.cases;
}

/**
 * Runs every case of a dataset through a pipeline and scores it.
 *
 * Each case runs with citations and evaluation on, and its expected answer
 * as the reference. A case that fails is recorded with its error, not
 * thrown. Throws a DatasetError (`code: 'RAG_INVALID_DATASET'`, `errors`
 * from validateDataset) when the dataset is invalid.
 *
 * @param {Array<Object>|{cases: Array<Object>}} dataset - See validateDataset
 * @param {{ run: Function }} pipeline - A createRagPipeline() pipeline
 * @param {Object} [options]
 * @param {number} [options.concurrency=1] - Cases run at the same time
 * @param {number} [options.timeout] - Per-case timeout in milliseconds
 * @param {AbortSignal} [options.signal] - Stops the run; unstarted cases are not run
 * @param {Object} [options.runOptions] - Extra `run()` options for every case
 * @param {(caseResult: Object, index: number) => void} [options.onCase] - Called as each case finishes
 * @returns {Promise<{
 *   version: number,
 *   createdAt: string,
 *   summary: { cases: number, succeeded: number, failed: number, metrics: Object<string, { mean: number, count: number }> },
 *   cases: Array<{ id: string, prompt: string, success: boolean, error?: string, answer: string|null, retrievedIds: string[], scores: Object<string, number>, durationMs: number }>
 * }>} A JSON-serialisable report
 */
async function runEvaluation(dataset, pipeline, options = {}) {
  if (!pipeline || typeof pipeline.run !== 'function') {
    throw new TypeError('runEvaluation needs a pipeline with a run() method');
  }
  const { concurrency = 1, timeout, signal, runOptions = {}, onCase } = options;
  if (!Number.isInteger(concurrency) || concurrency < 1) {
    throw new TypeError('concurrency must be a positive integer');
  }
  const testCases = checkedCases(dataset);
  const results = new Array(testCases.length);

  const runCase = async (testCase, index) => {
    const started = Date.now();
    const record = {
      id: testCase.id,
      prompt: testCase.prompt,
      ...(testCase.expected !== undefined && { expected: testCase.expected }),
      ...(testCase.sourceIds && { sourceIds: testCase.sourceIds }),
      ...(testCase.tags && { tags: testCase.tags }),
    };
    let result;
    try {
      result = await pipeline.run({
        query: testCase.prompt,
        options: {
          ...runOptions,
          citations: true,
          evaluate: true,
          ...(testCase.expected !== undefined && {
            referenceAnswer: testCase.expected,
          }),
          ...(timeout !== undefined && { timeout }),
          ...(signal && { signal }),
        },
      });
    } catch (err) {
      result = { success: false, error: err && err.message };
    }
    const success = Boolean(result && result.success);
    Object.assign(record, {
      success,
      ...(!success && {
        error: String((result && result.error) || 'Run failed'),
      }),
      answer:
        success && typeof result.answer === 'string' ? result.answer : null,
      retrievedIds: success
        ? (result.results || []).map((doc) => String(doc && doc.id))
        : [],
      scores: success ? scoreCase(testCase, result) : {},
      durationMs: Date.now() - started,
    });
    results[index] = record;
    if (onCase) onCase(record, index);
  };

  let next = 0;
  const worker = async () => {
    while (next < testCases.length) {
      if (signal && signal.aborted) return;
      const index = next;
      next += 1;
      await runCase(testCases[index], index);
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(concurrency, testCases.length) }, worker),
  );
  if (signal && signal.aborted) {
    const err = new Error('Evaluation aborted');
    err.code = 'ABORT_ERR';
    throw err;
  }

  return {
    version: REPORT_VERSION,
    createdAt: new Date().toISOString(),
    summary: summarise(results),
    cases: results,
  };
}

function isReport(value) {
  return (
    value &&
    typeof value === 'object' &&
    typeof value.run !== 'function' &&
    Array.isArray(value.cases) &&
    value.summary &&
    typeof value.summary === 'object'
  );
}

async function toReport(side, name, dataset, runOptions) {
  if (side && typeof side.run === 'function') {
    if (dataset === undefined || dataset === null) {
      throw new TypeError(`${name} is a pipeline, so a dataset is required`);
    }
    return runEvaluation(dataset, side, runOptions);
  }
  if (isReport(side)) {
    if (side.version !== REPORT_VERSION) {
      throw new TypeError(
        `${name} is a report of version ${side.version}; expected ${REPORT_VERSION}`,
      );
    }
    return side;
  }
  throw new TypeError(
    `${name} must be a pipeline or a report from runEvaluation()`,
  );
}

/**
 * Compares two configurations on the same dataset and reports what got
 * worse. Each side is a pipeline (run now) or a saved runEvaluation()
 * report, so CI can compare against the base branch's saved report.
 *
 * A metric has regressed when its mean drops by more than `tolerance`.
 * A case has regressed when it now fails, or a metric drops by more than
 * `caseTolerance`; those cases are listed but don't set `regressed` on
 * their own, except failures. Scores from LLM answers vary between runs,
 * so keep the tolerances above the noise you see on repeated runs.
 *
 * @param {Array<Object>|{cases: Array<Object>}|null} dataset - Needed when either side is a pipeline
 * @param {Object} options
 * @param {Object} options.baseline - Pipeline or report
 * @param {Object} options.candidate - Pipeline or report
 * @param {number} [options.tolerance=0.02] - Allowed drop in a metric's mean
 * @param {number} [options.caseTolerance=0.1] - Drop in one case's metric that lists the case
 * @param {string[]} [options.metrics] - Metrics to compare (default: all both runs have)
 * @param {Object} [options.runOptions] - Options for runEvaluation when a side is a pipeline
 * @returns {Promise<{
 *   regressed: boolean,
 *   metrics: Object<string, { baseline: number, candidate: number, delta: number, regressed: boolean }>,
 *   regressions: Array<{ id: string, prompt: string, reason: string, metric?: string, baseline?: number, candidate?: number, delta?: number }>,
 *   improvements: Array<{ id: string, prompt: string, reason: string, metric?: string, baseline?: number, candidate?: number, delta?: number }>,
 *   warnings: string[],
 *   baseline: Object,
 *   candidate: Object
 * }>}
 */
async function compareConfigurations(dataset, options = {}) {
  const {
    baseline,
    candidate,
    tolerance = 0.02,
    caseTolerance = 0.1,
    metrics: only,
    runOptions,
  } = options;
  for (const [name, value] of [
    ['tolerance', tolerance],
    ['caseTolerance', caseTolerance],
  ]) {
    if (!isFiniteNumber(value) || value < 0) {
      throw new TypeError(`${name} must be a number of 0 or more`);
    }
  }
  const base = await toReport(baseline, 'baseline', dataset, runOptions);
  const cand = await toReport(candidate, 'candidate', dataset, runOptions);
  const warnings = [];

  const names = (only || METRICS).filter(
    (name) =>
      base.summary.metrics &&
      cand.summary.metrics &&
      base.summary.metrics[name] &&
      cand.summary.metrics[name],
  );
  if (only) {
    for (const name of only) {
      if (!names.includes(name)) {
        warnings.push(`Metric "${name}" is missing from one of the runs`);
      }
    }
  }

  const metrics = {};
  for (const name of names) {
    const b = base.summary.metrics[name].mean;
    const c = cand.summary.metrics[name].mean;
    const delta = round(c - b);
    metrics[name] = {
      baseline: b,
      candidate: c,
      delta,
      regressed: delta < -tolerance,
    };
  }

  const regressions = [];
  const improvements = [];
  const baseById = new Map(base.cases.map((c) => [c.id, c]));
  const candIds = new Set(cand.cases.map((c) => c.id));
  for (const c of cand.cases) {
    const b = baseById.get(c.id);
    if (!b) {
      warnings.push(`Case "${c.id}" is only in the candidate run`);
      continue;
    }
    if (b.prompt !== c.prompt) {
      warnings.push(`Case "${c.id}" has a different prompt in the two runs`);
    }
    const entry = { id: c.id, prompt: c.prompt };
    if (b.success && !c.success) {
      regressions.push({ ...entry, reason: `now fails: ${c.error}` });
      continue;
    }
    if (!b.success && c.success) {
      improvements.push({ ...entry, reason: 'no longer fails' });
      continue;
    }
    if (!c.success) continue;
    for (const name of names) {
      if (!isFiniteNumber(b.scores[name]) || !isFiniteNumber(c.scores[name])) {
        continue;
      }
      const delta = round(c.scores[name] - b.scores[name]);
      const change = {
        ...entry,
        metric: name,
        baseline: b.scores[name],
        candidate: c.scores[name],
        delta,
      };
      if (delta < -caseTolerance) {
        regressions.push({ ...change, reason: `${name} dropped` });
      } else if (delta > caseTolerance) {
        improvements.push({ ...change, reason: `${name} rose` });
      }
    }
  }
  for (const b of base.cases) {
    if (!candIds.has(b.id)) {
      warnings.push(`Case "${b.id}" is only in the baseline run`);
    }
  }

  const newFailures = regressions.some((r) => r.reason.startsWith('now fails'));
  return {
    regressed:
      newFailures || Object.values(metrics).some((metric) => metric.regressed),
    metrics,
    regressions,
    improvements,
    warnings,
    baseline: base,
    candidate: cand,
  };
}

module.exports = {
  runEvaluation,
  compareConfigurations,
  DatasetError,
  EVALUATION_METRICS: METRICS,
};
