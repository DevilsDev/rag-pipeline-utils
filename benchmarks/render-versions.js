/**
 * The 3.5.0 vs 3.6 comparison on the docs page: the same benchmarks, the
 * same cases and the same cached Claude responses, before and after 3.6
 * changed the lexical checks. Reads benchmarks/results/<name>-3.5.0.json
 * (the reports as published with 3.5.0) and benchmarks/results/<name>.json.
 * Used by benchmarks/render.js.
 */

"use strict";

const fs = require("fs");
const path = require("path");

const resultsDir = path.join(__dirname, "results");
const NAMES = {
  "claude-haiku-4-5-20251001": "Claude Haiku 4.5",
  "claude-haiku-5-5": "Claude Haiku 5.5",
  "claude-sonnet-5-5": "Claude Sonnet 5.5",
  "claude-opus-5-5": "Claude Opus 5.5",
  "claude-fable-5-1": "Claude Fable 5.1",
};
const nameOf = (id) => NAMES[id] || `\`${id}\``;

function table(header, rows) {
  return [
    `| ${header.join(" | ")} |`,
    `| ${header.map(() => "---").join(" | ")} |`,
    ...rows.map((r) => `| ${r.join(" | ")} |`),
  ].join("\n");
}

const f3 = (x) => (typeof x === "number" ? x.toFixed(3) : "-");
const pct = (x) => (typeof x === "number" ? `${(x * 100).toFixed(1)}%` : "-");
const pair = (a, b, fmt = f3) => `${fmt(a)} → ${fmt(b)}`;

function load(name) {
  const before = path.join(resultsDir, `${name}-3.5.0.json`);
  const after = path.join(resultsDir, `${name}.json`);
  if (!fs.existsSync(before) || !fs.existsSync(after)) return null;
  return [before, after].map((f) => JSON.parse(fs.readFileSync(f, "utf8")));
}

/** Rows for one set: the lexical check alone, then each judge model. */
function setRows(label, cases, before, after) {
  const row = (who, b, a) => [
    label,
    cases,
    who,
    pair(b && b.unsupported.precision, a && a.unsupported.precision),
    pair(b && b.unsupported.recall, a && a.unsupported.recall),
    pair(b && b.unsupported.f1, a && a.unsupported.f1),
    pair(b && b.flaggedShare, a && a.flaggedShare, pct),
  ];
  const all = (m) => (m && m.metrics && (m.metrics.all || m.metrics)) || null;
  const rows = [row("Lexical check", all(before.lexical), all(after.lexical))];
  for (const id of Object.keys(after.models || {})) {
    const b = before.models && before.models[id];
    rows.push(row(`+ ${nameOf(id)} judge`, all(b), all(after.models[id])));
  }
  return rows;
}

function renderVersions() {
  const judge = load("judge");
  const more = load("judge-more");
  const citations = load("claude-citations");
  if (!judge || !more || !citations) return null;
  const commit = judge[1].environment.commit;

  const flagging = [
    ...setRows(
      "RAGTruth sample",
      judge[1].ragtruth.dataset.sample.size,
      judge[0].ragtruth,
      judge[1].ragtruth,
    ),
    ...setRows(
      "RAGTruth, all",
      more[1].ragtruthFull.dataset.cases,
      more[0].ragtruthFull,
      more[1].ragtruthFull,
    ),
    ...setRows(
      "HaluEval QA",
      more[1].halueval.dataset.cases,
      more[0].halueval,
      more[1].halueval,
    ),
  ];

  // By sentence: RAGTruth's annotated spans, as judge.js scores them
  const sent = (who, b, a) => [
    who,
    `${b.fp} → ${a.fp}`,
    `${b.fn} → ${a.fn}`,
    pair(b.precision, a.precision),
    pair(b.recall, a.recall),
  ];
  const sentenceRows = [];
  const reasonRows = [];
  const firstId = Object.keys(judge[1].ragtruth.models || {})[0];
  if (firstId && judge[0].ragtruth.models[firstId]) {
    const [sb, sa] = [
      judge[0].ragtruth.models[firstId].sentences,
      judge[1].ragtruth.models[firstId].sentences,
    ];
    sentenceRows.push(sent("Lexical check", sb.lexical, sa.lexical));
    for (const id of Object.keys(judge[1].ragtruth.models)) {
      const b = judge[0].ragtruth.models[id];
      if (!b) continue;
      sentenceRows.push(
        sent(
          `+ ${nameOf(id)} judge`,
          b.sentences.judge,
          judge[1].ragtruth.models[id].sentences.judge,
        ),
      );
    }
    for (const reason of Object.keys(sa.byLexicalReason)) {
      const b = sb.byLexicalReason[reason] || {};
      const a = sa.byLexicalReason[reason];
      reasonRows.push([
        `\`${reason}\``,
        `${b.sentences || 0} → ${a.sentences}`,
        `${b.labelledUnsupported || 0} → ${a.labelledUnsupported}`,
      ]);
    }
  }

  const edge = (who, b, a) => [
    who,
    pair(b.accuracy, a.accuracy, pct),
    `${b.falseAlarms} → ${a.falseAlarms}`,
    `${b.misses} → ${a.misses}`,
  ];
  const [eb, ea] = [judge[0].edgeAll, judge[1].edgeAll];
  const edgeRows = [edge("Lexical check", eb.lexical, ea.lexical)];
  for (const id of Object.keys(ea.models || {})) {
    if (eb.models && eb.models[id]) {
      edgeRows.push(
        edge(`+ ${nameOf(id)} judge`, eb.models[id], ea.models[id]),
      );
    }
  }

  // Hand review of every claim the lexical check flagged
  const review = (r) => {
    const l = r && r.lexical;
    if (!l) return "-";
    const left = r.flaggedByLexical - l.reviewed;
    return `${r.flaggedByLexical}: ${l.true_problem} / ${l.false_alarm} / ${l.unclear}${left ? ` (${left} unreviewed)` : ""}`;
  };
  const citeRows = [];
  for (const id of Object.keys(citations[1].models)) {
    const b = citations[0].models[id];
    const a = citations[1].models[id];
    if (!b || !b.scifact || !a.scifact) continue;
    const [bl, al] = [b.scifact.lexical, a.scifact.lexical];
    const [bj, aj] = [b.scifact.judge, a.scifact.judge];
    citeRows.push([
      nameOf(id),
      String(al.claims),
      pair(bl.supportedShare, al.supportedShare, pct),
      pair(bl.verifiedShare, al.verifiedShare, pct),
      bj && aj ? pair(bj.supportedShare, aj.supportedShare, pct) : "-",
      review(b.scifact.review),
      review(a.scifact.review),
    ]);
  }

  return [
    `Each cell is 3.5.0 → 3.6 (commit \`${commit}\`): the same cases and the same Claude responses, replayed from the response cache, so only the checks changed. A judge only rules on the sentences the lexical check flags, so a judge row changes only through the sentences whose lexical verdict changed; those that newly needed a ruling were new Claude calls.`,
    "",
    "Flagging answers with a hallucination (precision, recall and F1 for the unsupported class, and the share of answers flagged):",
    "",
    table(
      ["Set", "Answers", "Checked by", "Precision", "Recall", "F1", "Flagged"],
      flagging,
    ),
    "",
    `By sentence on the RAGTruth sample (${judge[1].ragtruth.models[firstId].sentences.sentences} sentences; a sentence is labelled unsupported when it overlaps an annotated span): false alarms (a supported sentence flagged), misses (an unsupported one passed), precision and recall. An answer is flagged when any sentence is, so most answers stay flagged by another sentence, which is why the answer-level table barely moves.`,
    "",
    table(
      ["Checked by", "False alarms", "Misses", "Precision", "Recall"],
      sentenceRows,
    ),
    "",
    "Why the lexical check flagged each sentence, and how many of them are labelled unsupported. The judge rules only on `low_overlap` sentences, so a sentence moved there from a wrong number or polarity verdict can now be cleared by the judge.",
    "",
    table(["Lexical verdict", "Sentences", "Labelled unsupported"], reasonRows),
    "",
    `The project's edge cases (${ea.cases}, written for the 3.5.0 benchmarks): accuracy, false alarms (a correct claim flagged) and misses (a wrong claim passed). The 3.6 changes target categories these cases found, so they are not an independent measure; the published sets above are.`,
    "",
    table(["Checked by", "Accuracy", "False alarms", "Misses"], edgeRows),
    "",
    'Provider citations on SciFact (`verifyCitations`): the share of cited claims supported, and of answers whose every citation is supported, by the lexical check, then with the model as judge; and every claim the lexical check flagged, hand-reviewed against the criteria in `benchmarks/fixtures/claude-citations-review.json` (flagged: real problems / false alarms / unclear). Of the 3.6 false alarms, 16 are new: the clause rule flags a claim whose subject the source names only in another, positive clause ("varenicline was not more effective than combination NRT" against "Varenicline was more effective than nicotine patch …, but was not more effective than combination NRT"), or whose framing clause ("Based on these data, …") has no negation.',
    "",
    table(
      [
        "Model",
        "Claims",
        "Claims supported",
        "Answers verified",
        "Claims supported, with judge",
        "Flagged in 3.5.0",
        "Flagged in 3.6",
      ],
      citeRows,
    ),
  ].join("\n");
}

module.exports = { renderVersions };
