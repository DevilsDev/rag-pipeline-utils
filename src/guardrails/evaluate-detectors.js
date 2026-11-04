'use strict';

/**
 * Measure injection and PII detectors on labelled examples: precision,
 * recall and F1, with their confusion counts and 95% Wilson intervals,
 * per detector and per tag. PII cases with spans are also scored span by
 * span. Used by `rag-pipeline eval-guardrails` and benchmarks/guardrails.js.
 *
 * A case is one line of a JSONL file:
 *
 *   { id?, kind: 'injection', text, flagged: boolean, stage?, tags? }
 *   { id?, kind: 'pii', text, spans: [{ label, start, end }], tags? }
 *   { id?, kind: 'pii', text, flagged: boolean, tags? }
 *
 * `stage` is passed to the detector ('query' by default for injection,
 * 'output' for PII). Each detector runs on the cases of its own kind.
 *
 * Span scoring, for PII cases that have `spans`:
 * - A detected match and a labelled span count as the same when they
 *   overlap; offsets need not be exact.
 * - Precision: the share of detected matches that overlap a labelled span
 *   of any label (what was redacted was PII).
 * - Recall, per labelled span label: the share of spans that some match
 *   overlaps. With `coveredLabels`, the headline recall counts only those
 *   labels, and the others are listed as not covered.
 * - Matches without `start`/`end` are located by their `text`.
 */

// The page style of the evaluation report (src/evaluate/report.js), kept
// here so rag-guardrails does not depend on rag-eval.
const REPORT_STYLE = `
:root{--bg:#fff;--fg:#1b1f24;--muted:#57606a;--line:#d0d7de;--ok:#1a7f37;--bad:#cf222e;--chip:#f6f8fa}
@media (prefers-color-scheme:dark){:root{--bg:#0d1117;--fg:#e6edf3;--muted:#8d96a0;--line:#30363d;--ok:#3fb950;--bad:#f85149;--chip:#161b22}}
*{box-sizing:border-box}body{margin:0;padding:24px 16px;background:var(--bg);color:var(--fg);font:15px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif}
main{max-width:1100px;margin:0 auto}h1{font-size:22px;margin:0 0 4px}h2{font-size:17px;margin:28px 0 8px}
.muted{color:var(--muted)}.status{display:inline-block;padding:2px 10px;border-radius:999px;font-weight:600;font-size:13px}
.pass{color:var(--ok);border:1px solid var(--ok)}.fail{color:var(--bad);border:1px solid var(--bad)}
ul.reasons{margin:8px 0;padding-left:20px}.scroll{overflow-x:auto}
table{border-collapse:collapse;width:100%;font-size:14px}th,td{border-bottom:1px solid var(--line);padding:6px 8px;text-align:left;vertical-align:top}
th{color:var(--muted);font-weight:600}td.num,th.num{text-align:right;font-variant-numeric:tabular-nums}
code{background:var(--chip);padding:1px 5px;border-radius:4px;font-size:13px}`;

const esc = (text) =>
  String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const KINDS = ['injection', 'pii'];
const MAX_IDS = 50;
const Z = 1.96;

/**
 * Check labelled cases and fill in their ids.
 *
 * @param {Array<object>} cases
 * @returns {Array<object>} The cases, each with an `id`
 */
function validateDetectorCases(cases) {
  if (!Array.isArray(cases) || cases.length === 0) {
    throw new TypeError('cases must be a non-empty array');
  }
  const ids = new Set();
  return cases.map((c, i) => {
    const where = `case ${i + 1}${c && c.id != null ? ` ("${c.id}")` : ''}`;
    if (!c || typeof c !== 'object') {
      throw new TypeError(`${where} is not an object`);
    }
    if (!KINDS.includes(c.kind)) {
      throw new TypeError(`${where}: kind must be "injection" or "pii"`);
    }
    if (typeof c.text !== 'string') {
      throw new TypeError(`${where}: text must be a string`);
    }
    if (c.spans !== undefined) {
      if (c.kind !== 'pii') {
        throw new TypeError(`${where}: only pii cases take spans`);
      }
      if (
        !Array.isArray(c.spans) ||
        !c.spans.every(
          (s) =>
            s &&
            Number.isInteger(s.start) &&
            Number.isInteger(s.end) &&
            s.start >= 0 &&
            s.end > s.start &&
            s.end <= c.text.length,
        )
      ) {
        throw new TypeError(
          `${where}: spans must be [{ label, start, end }] inside the text`,
        );
      }
    } else if (typeof c.flagged !== 'boolean') {
      throw new TypeError(
        `${where}: needs flagged: true | false${c.kind === 'pii' ? ', or spans' : ''}`,
      );
    }
    if (c.tags !== undefined && !Array.isArray(c.tags)) {
      throw new TypeError(`${where}: tags must be an array of strings`);
    }
    const id = c.id != null ? String(c.id) : String(i + 1);
    if (ids.has(id)) throw new TypeError(`${where}: duplicate id "${id}"`);
    ids.add(id);
    return { ...c, id, tags: (c.tags || []).map(String) };
  });
}

/** 95% Wilson score interval for `k` successes in `n`. */
function wilson(k, n) {
  if (n === 0) return null;
  const p = k / n;
  const denom = 1 + (Z * Z) / n;
  const centre = (p + (Z * Z) / (2 * n)) / denom;
  const half =
    (Z * Math.sqrt((p * (1 - p)) / n + (Z * Z) / (4 * n * n))) / denom;
  return [round(Math.max(0, centre - half)), round(Math.min(1, centre + half))];
}

const round = (x) => Number(x.toFixed(4));
const ratio = (k, n) => (n === 0 ? null : round(k / n));

function confusionMetrics({ tp, fp, fn, tn }) {
  const precision = ratio(tp, tp + fp);
  const recall = ratio(tp, tp + fn);
  const f1 = ratio(2 * tp, 2 * tp + fp + fn);
  return {
    cases: tp + fp + fn + tn,
    tp,
    fp,
    fn,
    tn,
    precision,
    recall,
    f1,
    accuracy: ratio(tp + tn, tp + fp + fn + tn),
    precisionInterval: wilson(tp, tp + fp),
    recallInterval: wilson(tp, tp + fn),
  };
}

const overlaps = (a, b) => a.start < b.end && b.start < a.end;

/** Give each match a start and end, finding it by text when needed. */
function locate(matches, text) {
  const used = new Set();
  const out = [];
  for (const m of matches) {
    if (Number.isInteger(m.start) && Number.isInteger(m.end)) {
      out.push(m);
      continue;
    }
    if (!m.text) continue;
    let from = 0;
    let at = text.indexOf(m.text, from);
    while (at !== -1 && used.has(at)) {
      from = at + 1;
      at = text.indexOf(m.text, from);
    }
    if (at === -1) continue;
    used.add(at);
    out.push({ ...m, start: at, end: at + m.text.length });
  }
  return out;
}

async function mapLimit(items, limit, fn) {
  const results = new Array(items.length);
  let next = 0;
  const workers = Array.from(
    { length: Math.min(limit, items.length) },
    async () => {
      while (next < items.length) {
        const i = next++;
        results[i] = await fn(items[i], i);
      }
    },
  );
  await Promise.all(workers);
  return results;
}

async function runOne(detector, c, signal) {
  if (signal && signal.aborted) throw signal.reason || new Error('Aborted');
  const stage = c.stage || (c.kind === 'pii' ? 'output' : 'query');
  try {
    const raw = await detector.detect(c.text, { stage, signal });
    const r = raw && typeof raw === 'object' ? raw : { flagged: Boolean(raw) };
    return {
      flagged: Boolean(r.flagged),
      matches: Array.isArray(r.matches)
        ? r.matches.filter((m) => m && typeof m === 'object')
        : [],
    };
  } catch (error) {
    if (signal && signal.aborted) throw error;
    return { error: String((error && error.message) || error) };
  }
}

function scoreDetector(detector, cases, outcomes, covered) {
  const counts = { tp: 0, fp: 0, fn: 0, tn: 0 };
  const byTag = {};
  const missed = [];
  const falseAlarms = [];
  const failed = [];
  const spanTotals = { predicted: 0, matched: 0 };
  const byLabel = {};
  const byDetectorLabel = {};
  let spanCases = 0;

  cases.forEach((c, i) => {
    const o = outcomes[i];
    if (o.error) {
      failed.push({ id: c.id, error: o.error });
      return;
    }
    const expected = c.spans ? c.spans.length > 0 : c.flagged;
    const key = expected ? (o.flagged ? 'tp' : 'fn') : o.flagged ? 'fp' : 'tn';
    counts[key]++;
    for (const tag of c.tags) {
      byTag[tag] = byTag[tag] || { tp: 0, fp: 0, fn: 0, tn: 0 };
      byTag[tag][key]++;
    }
    if (key === 'fn') missed.push(c.id);
    if (key === 'fp') falseAlarms.push(c.id);

    if (c.spans) {
      spanCases++;
      const found = locate(o.matches, c.text);
      for (const m of found) {
        const hit = c.spans.some((s) => overlaps(s, m));
        const label = m.label == null ? '(none)' : String(m.label);
        byDetectorLabel[label] = byDetectorLabel[label] || {
          predicted: 0,
          matched: 0,
        };
        byDetectorLabel[label].predicted++;
        spanTotals.predicted++;
        if (hit) {
          byDetectorLabel[label].matched++;
          spanTotals.matched++;
        }
      }
      for (const s of c.spans) {
        const label = s.label == null ? '(none)' : String(s.label);
        byLabel[label] = byLabel[label] || { gold: 0, found: 0 };
        byLabel[label].gold++;
        if (found.some((m) => overlaps(s, m))) byLabel[label].found++;
      }
    }
  });

  const result = {
    kind: detector.kind,
    ...confusionMetrics(counts),
    errors: failed.length,
    byTag: Object.fromEntries(
      Object.entries(byTag)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([tag, t]) => [tag, confusionMetrics(t)]),
    ),
    missed: missed.slice(0, MAX_IDS),
    falseAlarms: falseAlarms.slice(0, MAX_IDS),
    failed: failed.slice(0, MAX_IDS),
  };

  if (spanCases > 0) {
    const inScope = Object.entries(byLabel).filter(
      ([label]) => !covered || covered.includes(label),
    );
    const gold = inScope.reduce((n, [, l]) => n + l.gold, 0);
    const foundSpans = inScope.reduce((n, [, l]) => n + l.found, 0);
    result.spans = {
      cases: spanCases,
      predicted: spanTotals.predicted,
      matched: spanTotals.matched,
      precision: ratio(spanTotals.matched, spanTotals.predicted),
      precisionInterval: wilson(spanTotals.matched, spanTotals.predicted),
      ...(covered && { coveredLabels: covered }),
      gold,
      found: foundSpans,
      recall: ratio(foundSpans, gold),
      recallInterval: wilson(foundSpans, gold),
      byLabel: Object.fromEntries(
        Object.entries(byLabel)
          .sort(([, a], [, b]) => b.gold - a.gold)
          .map(([label, l]) => [
            label,
            {
              gold: l.gold,
              found: l.found,
              recall: ratio(l.found, l.gold),
              covered: covered ? covered.includes(label) : true,
            },
          ]),
      ),
      byDetectorLabel: Object.fromEntries(
        Object.entries(byDetectorLabel)
          .sort(([, a], [, b]) => b.predicted - a.predicted)
          .map(([label, l]) => [
            label,
            { ...l, precision: ratio(l.matched, l.predicted) },
          ]),
      ),
    };
  }
  return result;
}

/**
 * Run detectors over labelled cases and score them.
 *
 * @param {Array<object>} cases - Labelled cases (see the module comment)
 * @param {Array<{name: string, kind: 'injection'|'pii', detect: Function}>} detectors
 * @param {object} [options]
 * @param {number} [options.concurrency=4] - Cases in flight per detector
 * @param {string[]|Object<string, string[]>} [options.coveredLabels] - Span labels each PII detector is meant to find, for the headline span recall; an array applies to every PII detector
 * @param {AbortSignal} [options.signal] - Stops the run
 * @returns {Promise<object>} The report: `{ createdAt, cases, detectors: { [name]: metrics } }`
 */
async function evaluateDetectors(cases, detectors, options = {}) {
  const { concurrency = 4, coveredLabels, signal } = options;
  const checked = validateDetectorCases(cases);
  if (!Array.isArray(detectors) || detectors.length === 0) {
    throw new TypeError('detectors must be a non-empty array');
  }
  const names = new Set();
  for (const d of detectors) {
    if (
      !d ||
      typeof d.detect !== 'function' ||
      typeof d.name !== 'string' ||
      !KINDS.includes(d.kind)
    ) {
      throw new TypeError(
        'a detector is { name, kind: \'injection\' | \'pii\', detect(text, context) }',
      );
    }
    if (names.has(d.name)) {
      throw new TypeError(`two detectors are named "${d.name}"`);
    }
    names.add(d.name);
  }
  if (!Number.isInteger(concurrency) || concurrency < 1) {
    throw new TypeError('concurrency must be a positive integer');
  }

  const report = {
    createdAt: new Date().toISOString(),
    cases: {
      injection: checked.filter((c) => c.kind === 'injection').length,
      pii: checked.filter((c) => c.kind === 'pii').length,
    },
    detectors: {},
  };
  for (const detector of detectors) {
    const mine = checked.filter((c) => c.kind === detector.kind);
    if (mine.length === 0) continue;
    const started = Date.now();
    const outcomes = await mapLimit(mine, concurrency, (c) =>
      runOne(detector, c, signal),
    );
    const covered = Array.isArray(coveredLabels)
      ? coveredLabels
      : coveredLabels && coveredLabels[detector.name];
    report.detectors[detector.name] = {
      ...scoreDetector(detector, mine, outcomes, covered),
      msPerCase: round((Date.now() - started) / mine.length),
    };
  }
  return report;
}

/**
 * Check minimums such as `{ 'pattern-injection.recall': 0.5 }` against a
 * report. A key is `<detector>.<metric>`, where metric is precision,
 * recall, f1 or accuracy, or spans.precision / spans.recall.
 *
 * @param {object} report - An evaluateDetectors() report
 * @param {Object<string, number>} [min]
 * @returns {{passed: boolean, reasons: string[]}}
 */
function detectorVerdict(report, min = {}) {
  const reasons = [];
  for (const [d, m] of Object.entries(report.detectors)) {
    if (m.errors > 0) {
      reasons.push(`${d}: ${m.errors} case(s) failed with an error`);
    }
  }
  for (const [key, minimum] of Object.entries(min)) {
    const dot = key.indexOf('.');
    const name = key.slice(0, dot);
    const path = key.slice(dot + 1).split('.');
    const entry = report.detectors[name];
    const actual = entry
      ? path.reduce((v, k) => (v == null ? v : v[k]), entry)
      : undefined;
    if (typeof actual !== 'number') {
      reasons.push(`${key} was not measured (minimum ${minimum})`);
    } else if (actual < minimum) {
      reasons.push(
        `${key} ${actual.toFixed(3)} is below the minimum ${minimum}`,
      );
    }
  }
  return { passed: reasons.length === 0, reasons };
}

const fixed = (v) => (typeof v === 'number' ? v.toFixed(3) : '-');
const interval = (i) => (i ? `${i[0].toFixed(2)}–${i[1].toFixed(2)}` : '-');
const mdCell = (text) =>
  String(text).replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');

function tables(report) {
  const out = [];
  const main = {
    title: 'Detectors',
    header: [
      'Detector',
      'Kind',
      'Cases',
      'TP',
      'FP',
      'FN',
      'TN',
      'Precision',
      'Recall',
      'F1',
      'Recall 95% CI',
      'Errors',
    ],
    rows: Object.entries(report.detectors).map(([name, m]) => [
      name,
      m.kind,
      m.cases,
      m.tp,
      m.fp,
      m.fn,
      m.tn,
      fixed(m.precision),
      fixed(m.recall),
      fixed(m.f1),
      interval(m.recallInterval),
      m.errors,
    ]),
  };
  out.push(main);
  for (const [name, m] of Object.entries(report.detectors)) {
    const tags = Object.entries(m.byTag);
    if (tags.length > 0) {
      out.push({
        title: `${name} by tag`,
        header: ['Tag', 'Cases', 'TP', 'FP', 'FN', 'TN', 'Precision', 'Recall'],
        rows: tags.map(([tag, t]) => [
          tag,
          t.cases,
          t.tp,
          t.fp,
          t.fn,
          t.tn,
          fixed(t.precision),
          fixed(t.recall),
        ]),
      });
    }
    if (m.spans) {
      out.push({
        title: `${name} spans: ${m.spans.predicted} matches, precision ${fixed(m.spans.precision)}; recall ${fixed(m.spans.recall)} on ${m.spans.gold} ${m.spans.coveredLabels ? 'covered ' : ''}spans`,
        header: ['Labelled as', 'Spans', 'Found', 'Recall', 'Covered'],
        rows: Object.entries(m.spans.byLabel).map(([label, l]) => [
          label,
          l.gold,
          l.found,
          fixed(l.recall),
          l.covered ? 'yes' : 'no',
        ]),
      });
    }
  }
  return out;
}

/**
 * Render an evaluateDetectors() report as Markdown or a standalone HTML page.
 *
 * @param {object} report
 * @param {object} [options]
 * @param {'markdown'|'html'} [options.format='markdown']
 * @param {string} [options.title='Guardrail detectors']
 * @param {Object<string, number>} [options.min] - Minimums, as for detectorVerdict()
 * @returns {string}
 */
function renderDetectorReport(report, options = {}) {
  const { format = 'markdown', title = 'Guardrail detectors', min } = options;
  const verdict = detectorVerdict(report, min);
  const summary = `${report.cases.injection} injection case(s), ${report.cases.pii} PII case(s).`;
  const sections = tables(report);
  if (format === 'markdown') {
    const out = [
      `### ${title}: ${verdict.passed ? '✅ Passed' : '❌ Failed'}`,
      '',
      summary,
      '',
    ];
    for (const r of verdict.reasons) out.push(`- ${r}`);
    if (verdict.reasons.length) out.push('');
    for (const s of sections) {
      out.push(`**${mdCell(s.title)}**`, '');
      out.push(`| ${s.header.join(' | ')} |`);
      out.push(
        `| ${s.header.map((_, i) => (i === 0 ? '---' : '---:')).join(' | ')} |`,
      );
      for (const row of s.rows) out.push(`| ${row.map(mdCell).join(' | ')} |`);
      out.push('');
    }
    return out.join('\n');
  }
  if (format === 'html') {
    const parts = [
      '<!doctype html><html lang="en"><head><meta charset="utf-8">',
      '<meta name="viewport" content="width=device-width,initial-scale=1">',
      `<title>${esc(title)}</title><style>${REPORT_STYLE}</style></head><body><main>`,
      `<h1>${esc(title)}</h1>`,
      `<p><span class="status ${verdict.passed ? 'pass' : 'fail'}">${verdict.passed ? 'Passed' : 'Failed'}</span> <span class="muted">${esc(summary)} · ${esc(report.createdAt || '')}</span></p>`,
    ];
    if (verdict.reasons.length) {
      parts.push(
        `<ul class="reasons">${verdict.reasons.map((r) => `<li>${esc(r)}</li>`).join('')}</ul>`,
      );
    }
    for (const s of sections) {
      parts.push(
        `<h2>${esc(s.title)}</h2><div class="scroll"><table><thead><tr>`,
      );
      parts.push(
        s.header
          .map((h, i) => `<th${i === 0 ? '' : ' class="num"'}>${esc(h)}</th>`)
          .join(''),
      );
      parts.push('</tr></thead><tbody>');
      for (const row of s.rows) {
        parts.push(
          `<tr>${row.map((v, i) => `<td${i === 0 ? '' : ' class="num"'}>${i === 0 ? `<code>${esc(v)}</code>` : esc(v)}</td>`).join('')}</tr>`,
        );
      }
      parts.push('</tbody></table></div>');
    }
    parts.push('</main></body></html>');
    return parts.join('');
  }
  throw new TypeError(`format must be "markdown" or "html", not "${format}"`);
}

module.exports = {
  evaluateDetectors,
  validateDetectorCases,
  detectorVerdict,
  renderDetectorReport,
};
