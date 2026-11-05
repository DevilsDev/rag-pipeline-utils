/**
 * Tables for the Claude benchmarks on the docs page, from
 * benchmarks/results/judge.json and benchmarks/results/claude-citations.json.
 * Used by benchmarks/render.js.
 */

"use strict";

const fs = require("fs");
const path = require("path");

const NAMES = {
  "claude-haiku-4-5-20251001": "Claude Haiku 4.5",
  "claude-haiku-5-5": "Claude Haiku 5.5",
  "claude-sonnet-5-5": "Claude Sonnet 5.5",
  "claude-opus-5-5": "Claude Opus 5.5",
  "claude-fable-5-1": "Claude Fable 5.1",
};
const nameOf = (id) => NAMES[id] || id;

function table(header, rows) {
  return [
    `| ${header.join(" | ")} |`,
    `| ${header.map(() => "---").join(" | ")} |`,
    ...rows.map((r) => `| ${r.join(" | ")} |`),
  ].join("\n");
}

const cell = (text) =>
  String(text)
    .replace(/\s+/g, " ")
    .replace(/\|/g, "\\|")
    .replace(/</g, "&lt;")
    .trim();
const clip = (text, n = 140) => {
  const t = String(text).replace(/\s+/g, " ").trim();
  return t.length > n ? `${t.slice(0, n - 1)}…` : t;
};
const f3 = (x) => (typeof x === "number" ? x.toFixed(3) : "-");
const pct = (x) => (typeof x === "number" ? `${(x * 100).toFixed(1)}%` : "-");
const ci = (i) => (i ? `${i[0].toFixed(2)}–${i[1].toFixed(2)}` : "-");
const counts = (m) => `${m.tp} / ${m.fp} / ${m.fn} / ${m.tn}`;
const usd = (x) => `$${x.toFixed(2)}`;
const ms = (x) => `${(x / 1000).toFixed(1)} s`;
const num = (x) => x.toLocaleString("en-US");

function measuredLine(env) {
  return (
    `Measured with ${env.libraryVersion}` +
    (env.commit ? ` (commit \`${env.commit}\`)` : "") +
    ` ${env.runner === "local" ? "on a local machine" : `on ${env.runner}`}, Node ${env.node}.`
  );
}

function callDates(models) {
  const dates = Object.values(models)
    .flatMap((m) => m.callDates || [])
    .sort();
  if (!dates.length) return "";
  return dates[0] === dates[dates.length - 1]
    ? dates[0]
    : `${dates[0]} to ${dates[dates.length - 1]}`;
}

// --- judge.json ------------------------------------------------------------

/**
 * What the judge did in 3.4.0, before the connector fixes: kept in
 * benchmarks/results/judge-3.4.0.json as history.
 */
function judgeIn340(models) {
  const file = path.join(__dirname, "results", "judge-3.4.0.json");
  if (!fs.existsSync(file)) return [];
  const h = JSON.parse(fs.readFileSync(file, "utf8"));
  const ids = models.filter((id) => h.models[id]);
  return [
    `**Judge in 3.4.0.** This benchmark found two bugs in \`AnthropicConnector\`, fixed in 3.5.0: it sent the judge's \`temperature: 0\`, which four of these models reject with a 400, and it read \`content[0].text\`, which is a \`thinking\` block when the model thinks first, so the judge got no text and kept every sentence unsupported. What the 3.4.0 connector did on the same cases and replies (measured on ${h.measuredAt.slice(0, 10)}; F1 and edge cases with \`temperature\` removed, so the requests could run):`,
    "",
    table(
      [
        "Model",
        "Request with temperature 0",
        "Replies with no text for the connector",
        "F1",
        "Edge cases correct",
      ],
      ids.map((id) => {
        const m = h.models[id];
        const s = m.asShipped;
        return [
          nameOf(id),
          m.shippedJudge.works
            ? "accepted"
            : "400: `temperature` is deprecated",
          `${num(s.noTextReplies)} of ${num(s.calls)}`,
          f3(s.metrics.unsupported.f1),
          `${s.edge.correct} / ${s.edge.cases}`,
        ];
      }),
    ),
    "",
  ];
}

function renderJudge(report) {
  const rt = report.ragtruth;
  const d = rt.dataset;
  const models = Object.keys(rt.models);
  const parts = [
    `${measuredLine(report.environment)} API calls made on ${callDates(report.models)}; judge \`maxTokens\` ${report.settings.judgeMaxTokens}.`,
    "",
    (() => {
      const dropped = models.filter(
        (id) => report.models[id].temperatureDropped,
      );
      return dropped.length
        ? `The judge asks for temperature 0; ${dropped.map(nameOf).join(", ")} reject it, and \`AnthropicConnector\` sent those requests again without it.`
        : "";
    })(),
    "",
    `**RAGTruth**: ${d.dataset}, revision \`${d.revision.slice(0, 7)}\` (${d.license}). Sample: ${num(d.sample.size)} of ${num(d.cases)} test answers, ${d.sample.perTaskAndLabel} with and ${d.sample.perTaskAndLabel} without an annotated hallucination for each of the three tasks (seed ${d.sample.seed}). An answer counts as flagged when \`checkAnswer\` finds any unsupported sentence; the positive class is an answer with a hallucination.`,
    "",
    table(
      [
        "Check",
        "Precision",
        "Recall",
        "Recall 95% CI",
        "F1",
        "TP / FP / FN / TN",
        "Flagged",
        "Judge calls",
        "Cost per 1,000 checks",
        "Latency p50 / p95",
      ],
      [
        (() => {
          const u = rt.lexical.metrics.all.unsupported;
          return [
            "lexical only",
            f3(u.precision),
            f3(u.recall),
            ci(u.recallInterval),
            f3(u.f1),
            counts(u),
            pct(rt.lexical.metrics.all.flaggedShare),
            "0",
            "$0",
            `${rt.lexical.latencyMs.p50} ms / ${rt.lexical.latencyMs.p95} ms`,
          ];
        })(),
        ...models.map((id) => {
          const m = rt.models[id];
          const u = m.metrics.all.unsupported;
          return [
            `+ judge: ${nameOf(id)}`,
            f3(u.precision),
            f3(u.recall),
            ci(u.recallInterval),
            f3(u.f1),
            counts(u),
            pct(m.metrics.all.flaggedShare),
            num(m.calls),
            usd(m.costPer1000ChecksUSD),
            `${ms(m.latencyMs.p50)} / ${ms(m.latencyMs.p95)}`,
          ];
        }),
      ],
    ),
    "",
    `Latency is per check, including the API call; with a judge, checks with no sentence to send make no call. Cost uses the published per-token prices of ${report.models[models[0]]?.pricesChecked || "the run date"}.`,
    "",
    ...(rt.lexicalFalseAlarms
      ? [
          `Why a judge can clear so few false alarms: the lexical check flags ${rt.lexicalFalseAlarms.answers} of the ${num(d.sample.size / 2)} answers without a hallucination. Only ${rt.lexicalFalseAlarms.onlyLowOverlap} of them fail on word overlap alone, which a judge may overturn; ${rt.lexicalFalseAlarms.answers - rt.lexicalFalseAlarms.onlyLowOverlap} have a sentence that fails the number check (${rt.lexicalFalseAlarms.withNumberMismatch}) or the negation check (${rt.lexicalFalseAlarms.withPolarityMismatch}), which the judge is never asked about.`,
          "",
        ]
      : []),
    "By task: F1 for flagging answers with a hallucination, with TP / FP / FN / TN (75 answers of each label per task).",
    "",
    table(
      [
        "Check",
        "QA (MS MARCO)",
        "Summary (CNN/DM)",
        "Data-to-text (Yelp JSON)",
      ],
      [
        ["lexical only", rt.lexical.metrics],
        ...models.map((id) => [`+ ${nameOf(id)}`, rt.models[id].metrics]),
      ].map(([label, metrics]) => [
        label,
        ...["QA", "Summary", "Data2txt"].map(
          (t) =>
            `${f3(metrics[t].unsupported.f1)} (${counts(metrics[t].unsupported)})`,
        ),
      ]),
    ),
    "",
  ];

  // Sentences
  const first = rt.models[models[0]].sentences;
  parts.push(
    `By sentence: ${num(first.sentences)} sentences as \`checkAnswer\` splits them; a sentence is labelled unsupported when it overlaps an annotated span. ${first.unlocated} could not be located in the answer text and are left out.`,
    "",
    table(
      ["Check", "Precision", "Recall", "F1", "TP / FP / FN / TN"],
      [
        ["lexical only", first.lexical],
        ...models.map((id) => [
          `+ ${nameOf(id)}`,
          rt.models[id].sentences.judge,
        ]),
      ].map(([label, m]) => [
        label,
        f3(m.precision),
        f3(m.recall),
        f3(m.f1),
        counts(m),
      ]),
    ),
    "",
    "Why the lexical check failed each sentence, and what each judge did with the ones it was asked about (only `low_overlap` sentences go to the judge):",
    "",
    table(
      [
        "Lexical reason",
        "Sentences",
        "Labelled unsupported",
        ...models.map(
          (id) =>
            `${nameOf(id)}: judged supported (of them labelled unsupported)`,
        ),
      ],
      ["supported", "low_overlap", "number_mismatch", "polarity_mismatch"]
        .filter((r) => first.byLexicalReason[r])
        .map((r) => {
          const row = first.byLexicalReason[r];
          return [
            `\`${r}\``,
            num(row.sentences),
            num(row.labelledUnsupported),
            ...models.map((id) => {
              const x = rt.models[id].sentences.byLexicalReason[r];
              return r === "low_overlap" && x
                ? `${num(x.judgeSupported)} (${num(x.judgeSupportedButLabelledUnsupported)})`
                : "-";
            }),
          ];
        }),
    ),
    "",
  );
  // Judge errors
  const errs = models
    .map((id) => {
      const m = rt.models[id];
      const bits = [];
      if (m.errors)
        bits.push(
          `${m.errors} replies that were not the expected JSON (their sentences kept unsupported)`,
        );
      if (m.truncated)
        bits.push(`${m.truncated} replies cut off at \`maxTokens\``);
      if (m.firstBlockNotText)
        bits.push(
          `${m.firstBlockNotText} replies that start with a thinking block (the connector reads the text after it)`,
        );
      return bits.length ? `${nameOf(id)}: ${bits.join(", ")}` : null;
    })
    .filter(Boolean);
  parts.push(
    `Judge replies: ${errs.length ? `${errs.join("; ")}.` : "every reply parsed."} ${
      models.every(
        (id) => rt.models[id].usageMatchesApi === rt.models[id].checksWithCall,
      )
        ? "`check.judge.usage` was filled on every check with a judge call and matched the API's token counts."
        : `\`check.judge.usage\` matched the API's token counts on ${models.map((id) => `${num(rt.models[id].usageMatchesApi)} of ${num(rt.models[id].checksWithCall)}`).join(", ")} checks with a call (${models.map(nameOf).join(", ")}).`
    }`,
    "",
  );

  // Edge cases
  const edge = report.edge;
  const cats = Object.keys(edge.lexical.categories);
  parts.push(
    `**Edge cases**: ${edge.cases} cases in \`${edge.file}\`, written for this project and committed before any model saw them; each has an expected verdict for the whole answer. Correct / cases per category; a false alarm flags a supported answer, a miss passes an unsupported one.`,
    "",
    table(
      ["Category", "Cases", "lexical only", ...models.map(nameOf)],
      [
        ...cats.map((c) => [
          `\`${c}\``,
          edge.lexical.categories[c].cases,
          `${edge.lexical.categories[c].correct}`,
          ...models.map((id) => `${edge.models[id].categories[c].correct}`),
        ]),
        [
          "**All**",
          edge.cases,
          `**${edge.lexical.correct}** (${edge.lexical.falseAlarms} FA, ${edge.lexical.misses} miss)`,
          ...models.map(
            (id) =>
              `**${edge.models[id].correct}** (${edge.models[id].falseAlarms} FA, ${edge.models[id].misses} miss)`,
          ),
        ],
      ],
    ),
    "",
  );

  // Failures: every edge case some configuration got wrong
  const configs = [
    ["lexical", edge.lexical],
    ...models.map((id) => [id, edge.models[id]]),
  ];
  const failing = new Map();
  for (const [key, res] of configs) {
    for (const f of res.failures) {
      if (!failing.has(f.id))
        failing.set(f.id, { f, wrong: [], reasons: new Set() });
      const entry = failing.get(f.id);
      entry.wrong.push(
        key === "lexical" ? "lexical" : nameOf(key).replace("Claude ", ""),
      );
      for (const s of f.sentences) {
        if (s.verdict !== "supported" || f.kind === "miss") {
          entry.reasons.add(s.lexicalReason);
        }
      }
    }
  }
  parts.push(
    (() => {
      const inj = models.map(
        (id) => report.edge.models[id].categories["injection-in-source"],
      );
      return inj.every(Boolean)
        ? `The judge ruled on ${inj.map((c) => c.judgeRuled).join(", ")} of the ${inj[0].cases} \`injection-in-source\` cases (${models.map(nameOf).join(", ")}); the others never reach it.`
        : "";
    })(),
    "",
    "Every edge case that at least one configuration got wrong, with the lexical reason recorded for its sentences:",
    "",
    table(
      ["Case", "Expected", "Answer", "Wrong with", "Kind", "Lexical reason"],
      [...failing.values()].map(({ f, wrong, reasons }) => [
        `\`${f.id}\``,
        f.expected,
        cell(clip(f.answer, 110)),
        wrong.join(", "),
        f.kind === "false_alarm" ? "false alarm" : "miss",
        [...reasons].map((r) => `\`${r}\``).join(", "),
      ]),
    ),
    "",
    ...judgeIn340(models),
    `Total cost of this benchmark: ${models
      .map(
        (id) =>
          `${nameOf(id)} ${usd(report.models[id].totalCostUSD)} (${num(report.models[id].totalCalls)} calls)`,
      )
      .join(", ")}.`,
  );
  return parts.join("\n").trim();
}

// --- claude-citations.json -------------------------------------------------

const MUTATIONS = {
  number: "A number changed to one the passages don't contain",
  negationAdded: "Negation added",
  negationRemoved: "Negation removed",
  swapUnrelated: "Passages swapped for another claim's",
  swapSameRequest: "Passages swapped for another abstract in the request",
};

function renderClaudeCitations(report) {
  const models = Object.keys(report.models);
  const d = report.dataset;
  const parts = [
    `${measuredLine(report.environment)} API calls made on ${callDates(report.models)}; \`max_tokens\` ${report.maxTokens}.`,
    "",
    `**SciFact answers**: ${d.claims} claims from ${d.dataset} (${d.license}, revision \`${d.revisions.scifact.slice(0, 7)}\`, seed ${d.seed}), ${d.documentsPerClaim} abstracts each as \`document\` blocks with citations on. Prompt: "${cell(report.prompts.scifact)}". Each model answers, and \`verifyCitations\` checks the answer lexically and with the same model as judge.`,
    "",
    table(
      [
        "Model",
        "Refused (`refused`)",
        "Answers without citations",
        "Cited claims",
        "Supported, lexical",
        "Supported, + judge",
        "Answers verified, lexical",
        "Answers verified, + judge",
        "Verified of answers not refused, + judge",
        "Uncited sentences (answers with any)",
        "Temperature",
        "Cost",
      ],
      models.map((id) => {
        const m = report.models[id];
        const s = m.scifact;
        return [
          nameOf(id),
          `${s.answers.refused} / ${s.answers.calls}`,
          `${s.answers.withoutCitations} / ${s.answers.calls}`,
          num(s.lexical.claims),
          `${s.lexical.supported} (${pct(s.lexical.supportedShare)})`,
          `${s.judge.supported} (${pct(s.judge.supportedShare)})`,
          `${s.lexical.verifiedAnswers} (${pct(s.lexical.verifiedShare)})`,
          `${s.judge.verifiedAnswers} (${pct(s.judge.verifiedShare)})`,
          (() => {
            const answered = s.answers.calls - s.answers.refused;
            return `${s.judge.verifiedAnswers} / ${answered} (${pct(answered ? s.judge.verifiedAnswers / answered : null)})`;
          })(),
          `${s.answers.uncitedSentences} (${s.answers.answersWithUncitedSentences})`,
          m.temperature === 0 ? "0" : "not sent",
          usd(s.costUSD),
        ];
      }),
    ),
    "",
    `A refused answer has no text and no citations; \`verifyCitations\` reports it as \`refused: true\` and never verifies it. Judge calls: ${models
      .map((id) => {
        const j = report.models[id].scifact.judge;
        return `${nameOf(id)} ${j.calls}`;
      })
      .join(", ")}; the judge only rules on \`low_overlap\` claims.`,
    "",
    "Why the lexical check did not support a claim:",
    "",
    table(
      [
        "Model",
        "`low_overlap`",
        "`number_mismatch`",
        "`polarity_mismatch`",
        "`unverifiable`",
      ],
      models.map((id) => {
        const r = report.models[id].scifact.lexical.byLexicalReason;
        return [
          nameOf(id),
          r.low_overlap || 0,
          r.number_mismatch || 0,
          r.polarity_mismatch || 0,
          r.unverifiable || 0,
        ];
      }),
    ),
    "",
    "**Hand review** of the claims the lexical check marked unsupported (up to 20 per model, seeded), against the passages they cite, with criteria committed before the run (`benchmarks/fixtures/claude-citations-review.json`). Precision is true problems over true problems plus false alarms.",
    "",
    table(
      [
        "Model",
        "Flagged",
        "Reviewed",
        "True problem",
        "False alarm",
        "Unclear",
        "Precision (95% CI)",
        "Judge overturned: true problem / false alarm",
      ],
      models.map((id) => {
        const r = report.models[id].scifact.review;
        return [
          nameOf(id),
          r.flaggedByLexical,
          r.lexical.reviewed,
          r.lexical.true_problem,
          r.lexical.false_alarm,
          r.lexical.unclear,
          `${f3(r.lexical.precision)} (${ci(r.lexical.precisionInterval)})`,
          `${r.judgeOverturned.true_problem} / ${r.judgeOverturned.false_alarm}`,
        ];
      }),
    ),
    "",
    (() => {
      const rates = models.map(
        (id) => report.models[id].scifact.mutation.unmutatedFlagged.rate,
      );
      return `**Mutations** of the claims the lexical check supports, checked one claim at a time with no API call: caught / applicable. The first row is the same check on the unmutated claims: ${pct(Math.min(...rates))} to ${pct(Math.max(...rates))} of each model's cited claims are flagged.`;
    })(),
    "",
    table(
      ["Change", ...models.map(nameOf)],
      [
        [
          "None (flagged share of unmutated claims)",
          ...models.map((id) => {
            const u = report.models[id].scifact.mutation.unmutatedFlagged;
            return `${u.caught} / ${u.applicable} (${pct(u.rate)})`;
          }),
        ],
        ...Object.entries(MUTATIONS).map(([k, label]) => [
          label,
          ...models.map((id) => {
            const m = report.models[id].scifact.mutation.mutations[k];
            return m.applicable
              ? `${m.caught} / ${m.applicable} (${pct(m.rate)})`
              : "-";
          }),
        ]),
      ],
    ),
    "",
  ];

  // Edge cases
  const cats = Object.keys(report.models[models[0]].edge.categories);
  parts.push(
    `**Edge cases**: ${report.models[models[0]].edge.cases} cases in \`${report.edgeFile}\`, committed before any model saw them. Prompt: the question, then "Answer using only the documents above." A model's answer is correct when it matches the case's patterns, corrected by a hand check where the patterns are wrong (\`benchmarks/fixtures/citation-edge-review.json\`: ${models.reduce((n, id) => n + report.models[id].edge.labelsOverriddenByHand, 0)} labels, all in \`instruction-in-document\`, where the patterns also matched answers that report the injected instruction while refusing it). Benchmark rule: the library flags an answer when \`verifyCitations\` does not verify it or finds any sentence with no citation (\`verified\` itself ignores uncited sentences). Per category: model correct / cases; then, with the judge, caught / missed / false alarm under that rule. The last row counts by \`verified\` alone.`,
    "",
    table(
      ["Category", ...models.map(nameOf)],
      [
        ...cats.map((c) => [
          `\`${c}\``,
          ...models.map((id) => {
            const x = report.models[id].edge.categories[c];
            return `${x.modelCorrect}/${x.cases}; ${x.judge.caught} / ${x.judge.missed} / ${x.judge.falseAlarm}`;
          }),
        ]),
        [
          "**All**",
          ...models.map((id) => {
            const e = report.models[id].edge;
            return `**${e.modelCorrect}/${e.cases}**; ${e.judge.caught} / ${e.judge.missed} / ${e.judge.falseAlarm}`;
          }),
        ],
        [
          "All, by `verified` alone",
          ...models.map((id) => {
            const v = report.models[id].edge.judgeVerifiedOnly;
            return `${v.caught} / ${v.missed} / ${v.falseAlarm}`;
          }),
        ],
      ],
    ),
    "",
  );

  // Why each flagged answer was flagged (with the judge)
  const causeOf = (e) => {
    if (e.citedClaims === 0) return "noClaims";
    if (e.unsupportedClaimsJudge > 0) return "unsupportedClaim";
    return "uncitedOnly";
  };
  const CAUSES = {
    noClaims: "No cited claims (the answer says the documents don't cover it)",
    uncitedOnly: "Every claim supported, but some sentences have no citation",
    unsupportedClaim: "A cited claim not supported",
  };
  const byCause = {};
  for (const id of models) {
    for (const e of report.models[id].edge.examples) {
      if (e.judge !== "falseAlarm" && e.judge !== "caught") continue;
      const cause = causeOf(e);
      const slot = (byCause[cause] = byCause[cause] || {
        models: {},
        examples: [],
      });
      const m = (slot.models[id] = slot.models[id] || {
        falseAlarm: 0,
        caught: 0,
      });
      m[e.judge] += 1;
      const bad = e.claims.find((c) => c.judge !== "supported");
      slot.examples.push({
        id,
        e,
        sentence: bad ? bad.text : e.uncited[0] || e.answer,
        reason: bad ? bad.lexicalReason : null,
      });
    }
  }
  const missed = models.flatMap((id) =>
    report.models[id].edge.examples
      .filter((e) => e.judge === "missed")
      .map((e) => `${nameOf(id)} \`${e.id}\``),
  );
  parts.push(
    `Why the library flagged edge-case answers, with the judge: false alarms (correct answers flagged) / caught (wrong answers flagged). Misses: ${missed.length ? missed.join(", ") : "none"}.`,
    "",
    table(
      ["Cause", ...models.map(nameOf)],
      Object.entries(CAUSES)
        .filter(([k]) => byCause[k])
        .map(([k, label]) => [
          label,
          ...models.map((id) => {
            const m = byCause[k].models[id] || { falseAlarm: 0, caught: 0 };
            return `${m.falseAlarm} / ${m.caught}`;
          }),
        ]),
    ),
    "",
    "Examples of each, one sentence per case (the first unsupported claim, or else the first uncited sentence):",
    "",
    table(
      [
        "Cause",
        "Model",
        "Case",
        "Answer correct",
        "Sentence",
        "Lexical reason",
      ],
      Object.entries(CAUSES)
        .filter(([k]) => byCause[k])
        .flatMap(([k, label]) => {
          // Wrong answers first, then one example per case id
          const seen = new Set();
          return byCause[k].examples
            .sort((a, b) => Number(a.e.modelCorrect) - Number(b.e.modelCorrect))
            .filter((x) => {
              if (seen.has(x.e.id)) return false;
              seen.add(x.e.id);
              return true;
            })
            .slice(0, k === "uncitedOnly" ? 6 : 4)
            .map((x) => [
              label.split(" (")[0],
              nameOf(x.id).replace("Claude ", ""),
              `\`${x.e.id}\``,
              x.e.modelCorrect ? "yes" : "**no**",
              cell(clip(x.sentence, 120)),
              x.reason ? `\`${x.reason}\`` : "uncited",
            ]);
        }),
    ),
    "",
    `Total cost of this benchmark: ${models
      .map(
        (id) =>
          `${nameOf(id)} ${usd(report.models[id].totalCostUSD)} (${num(report.models[id].totalCalls)} calls)`,
      )
      .join(", ")}.`,
  );
  return parts.join("\n").trim();
}

module.exports = { renderJudge, renderClaudeCitations };
