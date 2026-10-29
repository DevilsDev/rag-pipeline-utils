'use strict';

/**
 * Pass/fail verdict and Markdown/HTML rendering for an evaluation run
 * (runEvaluation) and, optionally, its comparison with a baseline
 * (compareConfigurations). The Markdown form is what the rag-eval Action
 * posts on a pull request; the HTML form is a standalone page.
 */

const { EVALUATION_METRICS } = require('./compare');

const LABELS = {
  faithfulness: 'Faithfulness',
  relevance: 'Relevance',
  contextPrecision: 'Context precision',
  contextRecall: 'Context recall',
  groundedness: 'Groundedness',
  citationCoverage: 'Citation coverage',
  sourceRecall: 'Source recall',
};

/** Marks the comment so the Action can find and update it. */
const MARKER = '<!-- rag-eval-report -->';
const MAX_LISTED = 20;

const label = (metric) => LABELS[metric] || metric;
const fixed = (value) =>
  typeof value === 'number' && Number.isFinite(value) ? value.toFixed(3) : '-';
const signed = (value) =>
  typeof value === 'number' && Number.isFinite(value)
    ? `${value > 0 ? '+' : ''}${value.toFixed(3)}`
    : '-';

/**
 * Decides whether a run passes: no case failed, every metric in `min` is at
 * or above its minimum, and the comparison (if any) found no regression.
 *
 * @param {Object} input
 * @param {Object} input.report - A runEvaluation() report
 * @param {Object} [input.comparison] - A compareConfigurations() result
 * @param {Object<string, number>} [input.min] - Minimum mean per metric, e.g. `{ faithfulness: 0.8 }`
 * @returns {{
 *   passed: boolean,
 *   reasons: string[],
 *   thresholds: Array<{ metric: string, min: number, actual: number|null, passed: boolean }>
 * }}
 */
function evaluationVerdict({ report, comparison, min = {} } = {}) {
  if (!report || !report.summary) {
    throw new TypeError('evaluationVerdict needs a runEvaluation() report');
  }
  const reasons = [];
  const { summary } = report;
  if (summary.failed > 0) {
    reasons.push(
      `${summary.failed} of ${summary.cases} case${summary.cases === 1 ? '' : 's'} failed`,
    );
  }
  const thresholds = Object.entries(min).map(([metric, minimum]) => {
    const entry = summary.metrics[metric];
    const actual = entry ? entry.mean : null;
    const passed = actual !== null && actual >= minimum;
    if (!passed) {
      reasons.push(
        actual === null
          ? `${label(metric)} was not measured (minimum ${minimum})`
          : `${label(metric)} ${fixed(actual)} is below the minimum ${minimum}`,
      );
    }
    return { metric, min: minimum, actual, passed };
  });
  if (comparison) {
    for (const [metric, m] of Object.entries(comparison.metrics)) {
      if (m.regressed) {
        reasons.push(
          `${label(metric)} dropped ${signed(m.delta)} from the baseline`,
        );
      }
    }
    const newFailures = comparison.regressions.filter((r) => !r.metric).length;
    if (newFailures > 0) {
      reasons.push(
        `${newFailures} case${newFailures === 1 ? '' : 's'} that passed on the baseline now fail${newFailures === 1 ? 's' : ''}`,
      );
    }
  }
  return { passed: reasons.length === 0, reasons, thresholds };
}

/** Rows for the metrics table: every metric either run measured. */
function metricRows({ report, comparison, min = {} }) {
  const own = report.summary.metrics;
  const base = comparison && comparison.baseline.summary.metrics;
  const names = EVALUATION_METRICS.filter(
    (name) => own[name] || (base && base[name]) || min[name] !== undefined,
  );
  return names.map((name) => {
    const cmp = comparison && comparison.metrics[name];
    return {
      metric: name,
      label: label(name),
      value: own[name] ? own[name].mean : null,
      count: own[name] ? own[name].count : 0,
      baseline: base && base[name] ? base[name].mean : null,
      delta: cmp ? cmp.delta : null,
      regressed: Boolean(cmp && cmp.regressed),
      min: min[name],
      belowMin:
        min[name] !== undefined && !(own[name] && own[name].mean >= min[name]),
    };
  });
}

function caseLines(input) {
  const lines = [];
  const { report, comparison } = input;
  if (comparison) {
    for (const r of comparison.regressions) {
      lines.push({
        kind: 'regression',
        id: r.id,
        prompt: r.prompt,
        text: r.metric
          ? `${label(r.metric)} ${fixed(r.baseline)} → ${fixed(r.candidate)}`
          : r.reason,
      });
    }
  }
  const listed = new Set(lines.map((l) => l.id));
  for (const c of report.cases) {
    if (!c.success && !listed.has(c.id)) {
      lines.push({
        kind: 'failure',
        id: c.id,
        prompt: c.prompt,
        text: `failed: ${c.error}`,
      });
    }
  }
  return lines;
}

const mdCell = (text) =>
  String(text).replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');

function renderMarkdown(input, verdict, title) {
  const { report, comparison } = input;
  const rows = metricRows(input);
  const out = [MARKER, ''];
  const status = verdict.passed ? '✅ Passed' : '❌ Failed';
  out.push(`### ${title}: ${status}`, '');
  out.push(
    `${report.summary.cases} case${report.summary.cases === 1 ? '' : 's'}, ${report.summary.failed} failed${comparison ? ', compared with the baseline' : ''}.`,
    '',
  );
  if (!verdict.passed) {
    for (const reason of verdict.reasons) out.push(`- ${reason}`);
    out.push('');
  }
  if (rows.length > 0) {
    const header = ['Metric', comparison ? 'This run' : 'Mean'];
    if (comparison) header.push('Baseline', 'Change');
    if (rows.some((r) => r.min !== undefined)) header.push('Minimum');
    out.push(`| ${header.join(' | ')} |`);
    out.push(
      `| ${header.map((h, i) => (i === 0 ? '---' : '---:')).join(' | ')} |`,
    );
    for (const r of rows) {
      const cells = [r.label, fixed(r.value)];
      if (comparison) {
        cells.push(
          fixed(r.baseline),
          `${signed(r.delta)}${r.regressed ? ' ⚠️' : ''}`,
        );
      }
      if (header.includes('Minimum')) {
        cells.push(
          r.min === undefined ? '' : `${r.min}${r.belowMin ? ' ❌' : ''}`,
        );
      }
      out.push(`| ${cells.map(mdCell).join(' | ')} |`);
    }
    out.push('');
  }
  const lines = caseLines(input);
  if (lines.length > 0) {
    out.push(
      `<details${verdict.passed ? '' : ' open'}><summary>Cases that got worse or failed (${lines.length})</summary>`,
      '',
    );
    for (const l of lines.slice(0, MAX_LISTED)) {
      out.push(`- \`${mdCell(l.id)}\` ${mdCell(l.prompt)}: ${mdCell(l.text)}`);
    }
    if (lines.length > MAX_LISTED) {
      out.push(`- …and ${lines.length - MAX_LISTED} more`);
    }
    out.push('', '</details>', '');
  }
  if (comparison && comparison.warnings.length > 0) {
    out.push('<details><summary>Warnings</summary>', '');
    for (const w of comparison.warnings) out.push(`- ${mdCell(w)}`);
    out.push('', '</details>', '');
  }
  return out.join('\n');
}

const esc = (text) =>
  String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const STYLE = `
:root{--bg:#fff;--fg:#1b1f24;--muted:#57606a;--line:#d0d7de;--ok:#1a7f37;--bad:#cf222e;--warn:#9a6700;--chip:#f6f8fa}
@media (prefers-color-scheme:dark){:root{--bg:#0d1117;--fg:#e6edf3;--muted:#8d96a0;--line:#30363d;--ok:#3fb950;--bad:#f85149;--warn:#d29922;--chip:#161b22}}
*{box-sizing:border-box}body{margin:0;padding:24px 16px;background:var(--bg);color:var(--fg);font:15px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif}
main{max-width:1100px;margin:0 auto}h1{font-size:22px;margin:0 0 4px}h2{font-size:17px;margin:28px 0 8px}
.muted{color:var(--muted)}.status{display:inline-block;padding:2px 10px;border-radius:999px;font-weight:600;font-size:13px}
.pass{color:var(--ok);border:1px solid var(--ok)}.fail{color:var(--bad);border:1px solid var(--bad)}
ul.reasons{margin:8px 0;padding-left:20px}.scroll{overflow-x:auto}
table{border-collapse:collapse;width:100%;font-size:14px}th,td{border-bottom:1px solid var(--line);padding:6px 8px;text-align:left;vertical-align:top}
th{color:var(--muted);font-weight:600}td.num,th.num{text-align:right;font-variant-numeric:tabular-nums}
.bad{color:var(--bad);font-weight:600}.warn{color:var(--warn)}.answer{max-width:420px;color:var(--muted)}
code{background:var(--chip);padding:1px 5px;border-radius:4px;font-size:13px}`;

function renderHtml(input, verdict, title) {
  const { report, comparison } = input;
  const rows = metricRows(input);
  const metricsShown = rows.map((r) => r.metric);
  const hasMin = rows.some((r) => r.min !== undefined);
  const parts = [];
  parts.push(`<!doctype html><html lang="en"><head><meta charset="utf-8">`);
  parts.push(
    `<meta name="viewport" content="width=device-width,initial-scale=1">`,
  );
  parts.push(
    `<title>${esc(title)}</title><style>${STYLE}</style></head><body><main>`,
  );
  parts.push(`<h1>${esc(title)}</h1>`);
  parts.push(
    `<p><span class="status ${verdict.passed ? 'pass' : 'fail'}">${verdict.passed ? 'Passed' : 'Failed'}</span> <span class="muted">${report.summary.cases} cases, ${report.summary.failed} failed · ${esc(report.createdAt || '')}${comparison ? ' · compared with the baseline' : ''}</span></p>`,
  );
  if (!verdict.passed) {
    parts.push(
      `<ul class="reasons">${verdict.reasons.map((r) => `<li>${esc(r)}</li>`).join('')}</ul>`,
    );
  }

  if (rows.length > 0) {
    parts.push(
      '<h2>Metrics</h2><div class="scroll"><table><thead><tr><th>Metric</th>',
    );
    parts.push(
      `<th class="num">${comparison ? 'This run' : 'Mean'}</th><th class="num">Cases</th>`,
    );
    if (comparison)
      parts.push('<th class="num">Baseline</th><th class="num">Change</th>');
    parts.push(
      `${hasMin ? '<th class="num">Minimum</th>' : ''}</tr></thead><tbody>`,
    );
    for (const r of rows) {
      parts.push(
        `<tr><td>${esc(r.label)}</td><td class="num${r.belowMin ? ' bad' : ''}">${fixed(r.value)}</td><td class="num">${r.count}</td>`,
      );
      if (comparison) {
        parts.push(
          `<td class="num">${fixed(r.baseline)}</td><td class="num${r.regressed ? ' bad' : ''}">${signed(r.delta)}</td>`,
        );
      }
      parts.push(
        `${hasMin ? `<td class="num">${r.min === undefined ? '' : esc(r.min)}</td>` : ''}</tr>`,
      );
    }
    parts.push('</tbody></table></div>');
  }

  const lines = caseLines(input);
  if (lines.length > 0) {
    parts.push(
      '<h2>Cases that got worse or failed</h2><div class="scroll"><table><thead><tr><th>Case</th><th>Question</th><th>What changed</th></tr></thead><tbody>',
    );
    for (const l of lines) {
      parts.push(
        `<tr><td><code>${esc(l.id)}</code></td><td>${esc(l.prompt)}</td><td class="${l.kind === 'failure' ? 'bad' : 'warn'}">${esc(l.text)}</td></tr>`,
      );
    }
    parts.push('</tbody></table></div>');
  }

  parts.push(
    '<h2>All cases</h2><div class="scroll"><table><thead><tr><th>Case</th><th>Question</th>',
  );
  for (const name of metricsShown)
    parts.push(`<th class="num">${esc(label(name))}</th>`);
  parts.push('<th>Answer</th></tr></thead><tbody>');
  for (const c of report.cases) {
    parts.push(
      `<tr><td><code>${esc(c.id)}</code></td><td>${esc(c.prompt)}</td>`,
    );
    for (const name of metricsShown) {
      parts.push(
        `<td class="num">${c.success ? fixed(c.scores[name]) : ''}</td>`,
      );
    }
    const answer = c.success
      ? c.answer === null
        ? '<span class="muted">retrieval only</span>'
        : esc(c.answer.length > 300 ? `${c.answer.slice(0, 300)}…` : c.answer)
      : `<span class="bad">${esc(c.error)}</span>`;
    parts.push(`<td class="answer">${answer}</td></tr>`);
  }
  parts.push('</tbody></table></div>');

  if (comparison && comparison.warnings.length > 0) {
    parts.push(
      `<h2>Warnings</h2><ul>${comparison.warnings.map((w) => `<li>${esc(w)}</li>`).join('')}</ul>`,
    );
  }
  parts.push('</main></body></html>');
  return parts.join('');
}

/**
 * Renders an evaluation run, and its comparison with a baseline if given,
 * as Markdown (for a pull request comment) or a standalone HTML page.
 *
 * @param {Object} input
 * @param {Object} input.report - A runEvaluation() report
 * @param {Object} [input.comparison] - A compareConfigurations() result
 * @param {Object<string, number>} [input.min] - Minimum mean per metric
 * @param {Object} [options]
 * @param {'markdown'|'html'} [options.format='markdown']
 * @param {string} [options.title='RAG evaluation']
 * @returns {string}
 */
function renderEvaluationReport(input, options = {}) {
  const { format = 'markdown', title = 'RAG evaluation' } = options;
  const verdict = evaluationVerdict(input);
  if (format === 'markdown') return renderMarkdown(input, verdict, title);
  if (format === 'html') return renderHtml(input, verdict, title);
  throw new TypeError(`format must be "markdown" or "html", not "${format}"`);
}

module.exports = {
  evaluationVerdict,
  renderEvaluationReport,
  REPORT_MARKER: MARKER,
};
