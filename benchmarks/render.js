#!/usr/bin/env node
/**
 * Write the benchmark tables on the docs page from the committed results,
 * so every published number comes from a file in benchmarks/results/.
 *
 * Replaces the text between `<!-- bench:<name>:start -->` and
 * `<!-- bench:<name>:end -->` in docs-site/docs/Benchmarks.md.
 *
 *   node benchmarks/render.js          # rewrite the page
 *   node benchmarks/render.js --check  # exit 1 if the page is out of date
 */

"use strict";

const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const resultsDir = path.join(__dirname, "results");
const page = path.join(root, "docs-site", "docs", "Benchmarks.md");

function table(header, rows) {
  return [
    `| ${header.join(" | ")} |`,
    `| ${header.map(() => "---").join(" | ")} |`,
    ...rows.map((r) => `| ${r.join(" | ")} |`),
  ].join("\n");
}

const num = (x) => x.toLocaleString("en-US");

function environmentLine(env) {
  return (
    `Measured with ${env.libraryVersion}` +
    (env.commit ? ` (commit \`${env.commit}\`)` : "") +
    ` on ${env.runner}: Node ${env.node}, ${env.cpu}, ${env.cores} cores, ${env.memoryGB} GB.`
  );
}

function renderSpeed(report) {
  const parts = [environmentLine(report.environment), ""];
  const services = Object.entries(report.environment.services || {})
    .filter(([, image]) => image)
    .map(([name, image]) => `${name} \`${image}\``);
  if (services.length) {
    parts.push(
      `Databases: ${services.join(", ")}, as CI service containers on the same runner.`,
      "",
    );
  }

  parts.push(
    `**Pipeline overhead**: one \`run()\` with components that return at once, ${num(report.settings.pipelineRuns)} runs after ${num(report.settings.pipelineWarmup)} warmup runs.`,
    "",
    table(
      ["Pipeline", "p50", "p95", "p99"],
      Object.entries(report.pipeline).map(([name, s]) => [
        name,
        `${s.p50} µs`,
        `${s.p95} µs`,
        `${s.p99} µs`,
      ]),
    ),
    "",
  );

  for (const [size, stores] of Object.entries(report.stores)) {
    const rows = [];
    for (const [name, results] of Object.entries(stores)) {
      results.forEach((r, i) => {
        rows.push([
          r.setting ? `\`${name}\`, ${r.setting}` : `\`${name}\``,
          r.index,
          // One ingest per store; its settings only change queries
          i === 0 ? `${num(r.ingest.docsPerSecond)} docs/s` : "same table",
          `${r.query.p50} ms`,
          `${r.query.p95} ms`,
          r.recallAt10.toFixed(3),
        ]);
      });
    }
    parts.push(
      `**${num(Number(size))} vectors** of ${report.settings.dims} dimensions (${report.settings.vectors}); ${report.settings.queries} queries, top 10, after ${report.settings.warmupQueries} warmup queries.`,
      "",
      table(
        ["Store", "Index", "Ingest", "Query p50", "Query p95", "Recall@10"],
        rows,
      ),
      "",
    );
  }
  return parts.join("\n").trim();
}

function renderQuality(report) {
  const d = report.dataset;
  const rev = d.revisions.scifact.slice(0, 7);
  return [
    `Measured with ${report.environment.libraryVersion}` +
      (report.environment.commit
        ? ` (commit \`${report.environment.commit}\`)`
        : "") +
      ` on ${report.environment.runner}, Node ${report.environment.node}.`,
    "",
    `Dataset: ${d.dataset}, ${num(d.documents)} documents, ${num(d.queries)} queries, ${num(d.judgements)} relevance judgements (${d.license}, Hugging Face revision \`${rev}\`). Each system returns ${report.depth} results per query.`,
    "",
    table(
      ["System", "nDCG@10", "Recall@10", "Recall@100", "MRR@10", "Per query"],
      Object.entries(report.systems).map(([name, s]) => [
        `\`${name}\``,
        s.ndcg10.toFixed(3),
        s.recall10.toFixed(3),
        s.recall100.toFixed(3),
        s.mrr10.toFixed(3),
        `${s.msPerQuery} ms`,
      ]),
    ),
  ].join("\n");
}

const f3 = (x) => (typeof x === "number" ? x.toFixed(3) : "-");
const ci = (i) => (i ? `${i[0].toFixed(2)}–${i[1].toFixed(2)}` : "-");

function renderGuardrails(report) {
  const env = report.environment;
  const parts = [
    `Measured with ${env.libraryVersion}` +
      (env.commit ? ` (commit \`${env.commit}\`)` : "") +
      ` ${env.runner === "local" ? "on a local machine" : `on ${env.runner}`}, Node ${env.node}.` +
      (report.model
        ? ` Classifier: \`${report.model.model}\` (revision \`${report.model.revision.slice(0, 7)}\`), threshold ${report.model.threshold}, first ${report.model.maxTokens} tokens, transformers.js ${report.model.transformersJs}.`
        : ""),
    "",
  ];
  for (const suite of Object.values(report.suites)) {
    const s = suite.source;
    const rev = s.revision ? `, revision \`${s.revision.slice(0, 7)}\`` : "";
    parts.push(
      `**${suite.title}**: ${s.dataset}, ${num(suite.cases)} cases, ${num(suite.positives)} positive (${s.license}${rev}).${suite.note ? ` ${suite.note}` : ""}${s.note ? ` ${s.note}` : ""}`,
      "",
    );
    const rows = Object.entries(suite.detectors).map(([name, m]) => [
      `\`${name}\``,
      f3(m.precision),
      f3(m.recall),
      ci(m.recallInterval),
      f3(m.f1),
      `${m.tp} / ${m.fp} / ${m.fn} / ${m.tn}`,
    ]);
    if (Object.values(suite.detectors).some((m) => m.spans)) {
      parts.push(
        "By document: a document is positive when it has any labelled span, of any label.",
        "",
      );
    }
    parts.push(
      table(
        [
          "Detector",
          "Precision",
          "Recall",
          "Recall 95% CI",
          "F1",
          "TP / FP / FN / TN",
        ],
        rows,
      ),
      "",
    );
    for (const [name, m] of Object.entries(suite.detectors)) {
      if (!m.spans) continue;
      parts.push(
        `Spans found by \`${name}\`: ${num(m.spans.predicted)} matches, ${f3(m.spans.precision)} of them on a labelled span; recall ${f3(m.spans.recall)} (${ci(m.spans.recallInterval)}) on the ${num(m.spans.gold)} spans of the covered labels.`,
        "",
        table(
          ["Labelled as", "Spans", "Found", "Recall", "Covered"],
          Object.entries(m.spans.byLabel)
            .filter(([, l]) => l.covered || l.gold >= 100)
            .map(([label, l]) => [
              `\`${label}\``,
              num(l.gold),
              num(l.found),
              f3(l.recall),
              l.covered ? "yes" : "no",
            ]),
        ),
        "",
        "Labels with fewer than 100 spans that the patterns don't cover are left out of this table; they are in the report.",
        "",
      );
    }
  }
  return parts.join("\n").trim();
}

const {
  renderJudge,
  renderClaudeCitations,
  renderJudgeMore,
  renderLatency,
} = require("./render-claude");
const { renderVersions } = require("./render-versions");

// Each release that changed the lexical checks, against the one before it
const VERSION_BLOCKS = [
  [
    "versions",
    {
      from: "3.5.0",
      to: "3.6.0",
      label: "3.6.0",
      citationNote:
        ' Of the 3.6 false alarms, 16 are new: the clause rule flags a claim whose subject the source names only in another, positive clause ("varenicline was not more effective than combination NRT" against "Varenicline was more effective than nicotine patch …, but was not more effective than combination NRT"), or whose framing clause ("Based on these data, …") has no negation.',
    },
  ],
  ["versions-3.7", { from: "3.6.0", label: "3.7" }],
];

const MODEL_NAMES = {
  "claude-haiku-5-5": "Claude Haiku 5.5",
  "claude-haiku-4-5": "Claude Haiku 4.5",
  "claude-sonnet-5-5": "Claude Sonnet 5.5",
  "claude-opus-5-5": "Claude Opus 5.5",
  "claude-fable-5-1": "Claude Fable 5.1",
};
const modelName = (id) => MODEL_NAMES[id] || `\`${id}\``;
const usd = (x) => `$${x < 1 ? x.toFixed(3) : x.toFixed(2)}`;
const mtok = (n) => `${(n / 1e6).toFixed(2)}M`;
const modelOrder = (id) => {
  const i = Object.keys(MODEL_NAMES).indexOf(id);
  return i === -1 ? 99 : i;
};

function renderClaudeUsage(report) {
  const t = report.totals;
  const dates = report.rows
    .flatMap((r) => [r.firstDate, r.lastDate])
    .filter(Boolean)
    .sort();
  let span = "-";
  if (dates.length) {
    const first = dates[0];
    const last = dates[dates.length - 1];
    span = first === last ? first : `${first} to ${last}`;
  }
  const models = Object.entries(report.byModel).sort(
    ([a], [b]) => modelOrder(a) - modelOrder(b),
  );
  return [
    `Every Claude API call behind the Claude sections above, the consumer journeys and the live test suite, from their response cache and usage ledgers (${span}): ${num(t.calls)} calls, ${mtok(t.inputTokens)} input and ${mtok(t.outputTokens)} output tokens, ${usd(t.usd)} at the published prices of ${report.prices.asOf}. Metadata only: no prompt, answer or key is kept in this report.`,
    "",
    "**By model**",
    "",
    table(
      ["Model", "Calls", "Input tokens", "Output tokens", "Cost"],
      models.map(([id, m]) => [
        modelName(id),
        num(m.calls),
        mtok(m.inputTokens),
        mtok(m.outputTokens),
        usd(m.usd),
      ]),
    ),
    "",
    "**By activity**",
    "",
    table(
      [
        "Activity",
        "Model",
        "Calls",
        "Errors",
        "Refusals",
        "Tokens in / out",
        "Cost",
        "Latency p50 / p95",
        "Dates",
      ],
      report.rows.map((r) => [
        r.activity,
        modelName(r.model),
        num(r.calls),
        num(r.errors),
        num(r.refusals),
        `${mtok(r.inputTokens)} / ${mtok(r.outputTokens)}`,
        usd(r.usd) + (r.estimatedUsd ? " (part estimated)" : ""),
        r.latencyMs
          ? `${(r.latencyMs.p50 / 1000).toFixed(1)} s / ${(r.latencyMs.p95 / 1000).toFixed(1)} s`
          : "-",
        r.firstDate === r.lastDate
          ? r.firstDate
          : `${r.firstDate} to ${r.lastDate}`,
      ]),
    ),
    "",
    "Errors are HTTP errors, most of them deliberate: the consumer journeys call a model that doesn't exist and use an invalid key on purpose, and the connector's first request to a model that rejects `temperature` returns a 400 that it retries without it. Latency is per call, network included; streamed calls report theirs in the latency section above, and calls logged before 2026-11-05 05:40 UTC have no latency recorded.",
  ].join("\n");
}

/** The condition-dropped benchmark (3.9; condition-dropped-plan.md). */
function renderConditionDropped(report) {
  const pct = (x) =>
    x === null || x === undefined ? "-" : `${(x * 100).toFixed(1)}%`;
  const runs = [
    ["lexical-before", "Lexical, 3.8.0"],
    ["lexical-after", "Lexical, 3.9"],
    ["claude-haiku-5-5-before", "Judge Claude Haiku 5.5, 3.8.0"],
    ["claude-haiku-5-5-after", "Judge Claude Haiku 5.5, 3.9"],
    ["claude-sonnet-5-5-before", "Judge Claude Sonnet 5.5, 3.8.0"],
    ["claude-sonnet-5-5-after", "Judge Claude Sonnet 5.5, 3.9"],
  ].filter(([key]) => report.runs[key]);
  const groups = Object.keys(report.runs["lexical-after"].test.perStratum);
  const flagged = (key, split, stratum) => {
    const s = report.runs[key] && report.runs[key][split].perStratum[stratum];
    return s ? `${s.flagged}/${s.n}` : "-";
  };
  const sub = (key, split) => {
    const s =
      report.runs[key] &&
      report.runs[key][split].perSubLabel["except-as-required-by-law"];
    return s ? `${s.flagged}/${s.n}` : "-";
  };
  return [
    `${num(report.n.all)} cases (${num(report.n.dev)} dev, ${num(report.n.test)} test), written by Claude Sonnet 5.5 and split by seed ${report.seed}; labels are the generator's and still need human review. Positive class: the claim leaves out a restriction (unsupported). Run ${report.generatedAt.slice(0, 10)}.`,
    "",
    "**Test split.** The 3.9 code was frozen, and committed, before the test split ran.",
    "",
    table(
      ["Run", "Precision", "Recall", "F1", "TP / FP / FN / TN"],
      runs.map(([key, label]) => {
        const t = report.runs[key].test;
        return [
          label,
          pct(t.precision),
          pct(t.recall),
          pct(t.f1),
          `${t.tp} / ${t.fp} / ${t.fn} / ${t.tn}`,
        ];
      }),
    ),
    "",
    "**Flagged per group, test split** (a positive group should be flagged, a control group not):",
    "",
    table(
      [
        "Group",
        "Expected",
        "Lexical, 3.8.0",
        "Lexical, 3.9",
        "Judge Haiku 5.5, 3.9",
        "Judge Sonnet 5.5, 3.9",
      ],
      [
        ...groups.map((g) => [
          `\`${g}\``,
          report.runs["lexical-after"].test.perStratum[g].expected,
          flagged("lexical-before", "test", g),
          flagged("lexical-after", "test", g),
          flagged("claude-haiku-5-5-after", "test", g),
          flagged("claude-sonnet-5-5-after", "test", g),
        ]),
        [
          "of which `except-as-required-by-law`",
          "supported",
          sub("lexical-before", "test"),
          sub("lexical-after", "test"),
          sub("claude-haiku-5-5-after", "test"),
          sub("claude-sonnet-5-5-after", "test"),
        ],
      ],
    ),
    "",
    `Dev split, lexical: F1 ${pct(report.runs["lexical-before"].dev.f1)} on 3.8.0, ${pct(report.runs["lexical-after"].dev.f1)} on 3.9. The dev split informed four changes before the test split ran: a restriction word the main statement also uses doesn't count as keeping it; another sentence of the answer restates a restriction only when the same source supports it; "even if", "if any" and "if applicable" aren't conditions; and "and" splits statements only after a comma.`,
  ].join("\n");
}

const RENDERERS = {
  speed: renderSpeed,
  quality: renderQuality,
  guardrails: renderGuardrails,
  judge: renderJudge,
  "claude-citations": renderClaudeCitations,
  "judge-more": renderJudgeMore,
  "claude-latency": renderLatency,
  "claude-usage": renderClaudeUsage,
  "condition-dropped": renderConditionDropped,
};

function render(content) {
  let out = content;
  for (const [name, renderer] of Object.entries(RENDERERS)) {
    const file = path.join(resultsDir, `${name}.json`);
    if (!fs.existsSync(file)) continue;
    const start = `<!-- bench:${name}:start -->`;
    const end = `<!-- bench:${name}:end -->`;
    const from = out.indexOf(start);
    const to = out.indexOf(end);
    if (from === -1 || to === -1) {
      throw new Error(`${page} has no ${start} ... ${end} block`);
    }
    const body = renderer(JSON.parse(fs.readFileSync(file, "utf8")));
    out =
      out.slice(0, from + start.length) +
      "\n\n<!-- Generated by benchmarks/render.js from benchmarks/results/" +
      `${name}.json; do not edit. -->\n\n${body}\n\n` +
      out.slice(to);
  }
  // Two reports per benchmark (an earlier version's and a later one's), so
  // not in RENDERERS
  for (const [block, options] of VERSION_BLOCKS) {
    const start = `<!-- bench:${block}:start -->`;
    const end = `<!-- bench:${block}:end -->`;
    const from = out.indexOf(start);
    const to = out.indexOf(end);
    const body = from !== -1 && to !== -1 ? renderVersions(options) : null;
    if (!body) continue;
    const files = options.to
      ? `{judge,judge-more,claude-citations}-{${options.from},${options.to}}.json`
      : `{judge,judge-more,claude-citations}{,-${options.from}}.json`;
    out =
      out.slice(0, from + start.length) +
      `\n\n<!-- Generated by benchmarks/render.js from benchmarks/results/${files}; do not edit. -->\n\n` +
      `${body}\n\n` +
      out.slice(to);
  }
  return out;
}

async function main() {
  const prettier = require("prettier");
  const current = fs.readFileSync(page, "utf8");
  // Formatted like the rest of the repo, so format:check agrees with --check
  const options = { ...(await prettier.resolveConfig(page)), filepath: page };
  const next = await prettier.format(render(current), options);
  if (process.argv.includes("--check")) {
    if (next !== current) {
      console.error(
        "docs-site/docs/Benchmarks.md is out of date. Run `node benchmarks/render.js`.",
      );
      process.exit(1);
    }
  } else if (next !== current) {
    fs.writeFileSync(page, next);
    console.log("Updated docs-site/docs/Benchmarks.md");
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
