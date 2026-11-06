#!/usr/bin/env node
/**
 * Bug hunt 3: metamorphic testing (benchmarks/fixtures/bug-hunt-plan.md).
 *
 *   node benchmarks/bug-hunt/metamorphic.js --cap=<usd>
 *
 * claude-sonnet-5-5 writes ~400 answer/source sets (grounded, wrong number,
 * negated, dropped condition). Each set is checked with checkAnswer, then
 * transformed in ways that must not change any sentence's verdict, and
 * checked again; every set also runs through each entry point (the built
 * main package by require and import, /edge, @devilsdev/rag-eval from
 * packages/), which must agree. A changed verdict is a lead; it counts once
 * an offline test reproduces it.
 */

"use strict";

const fs = require("fs");
const path = require("path");
const { ClaudeCache } = require("../claude-cache");
const { args, environment } = require("../claude-common");
const { liveAnthropic } = require("../../__tests__/live/live-env.js");

const ROOT = path.join(__dirname, "..", "..");
const SETS_FILE = path.join(
  ROOT,
  "benchmarks",
  "fixtures",
  "bug-hunt-metamorphic-sets.json",
);
const RESULTS_FILE = path.join(
  ROOT,
  "benchmarks",
  "results",
  "bug-hunt-metamorphic.json",
);
const KINDS = ["grounded", "wrong-number", "negated", "dropped-condition"];

const PROMPT = (
  kind,
  k,
) => `Write 25 test sets for a library that checks whether each sentence of an answer is supported by its sources (batch ${k}).
Each set: {"sources": [2 or 3 passages, each 2 to 4 sentences of realistic text from policy, contracts, medicine, products, science or history], "answer": "2 or 3 sentences answering a question from those sources"}.
Kind "${kind}": ${
  {
    grounded:
      "every sentence of the answer is supported by the sources, in close wording.",
    "wrong-number":
      "one sentence of the answer changes a number from the sources (the others are supported).",
    negated:
      "one sentence of the answer negates what a source says (the others are supported).",
    "dropped-condition":
      'one sentence of the answer states a source\'s rule but leaves out its condition (an approval, "only if", "unless", "subject to"); the others are supported.',
  }[kind]
}
Use varied subjects; include numbers, decimals and quotes in some sources. Reply with ONLY a JSON array, no prose, no code fence.`;

const parse = (t) =>
  JSON.parse(
    String(t)
      .trim()
      .replace(/^```(?:json)?\s*|\s*```$/g, ""),
  );

async function sets(cache) {
  if (fs.existsSync(SETS_FILE) && !args.regenerate)
    return JSON.parse(fs.readFileSync(SETS_FILE, "utf8"));
  const out = [];
  for (const kind of KINDS) {
    for (const k of [1, 2, 3, 4]) {
      const r = await cache.messages({
        model: "claude-sonnet-5-5",
        max_tokens: 16000,
        messages: [{ role: "user", content: PROMPT(kind, k) }],
      });
      try {
        parse((r.data.content || []).map((b) => b.text || "").join(""))
          .filter(
            (s) =>
              s &&
              typeof s.answer === "string" &&
              Array.isArray(s.sources) &&
              s.sources.every((x) => typeof x === "string"),
          )
          .forEach((s, i) =>
            out.push({
              id: `mm-${kind}-${k}-${i + 1}`,
              kind,
              answer: s.answer,
              sources: s.sources,
            }),
          );
      } catch (e) {
        console.error(`${kind} ${k}: unparseable (${e.message})`);
      }
    }
  }
  fs.writeFileSync(SETS_FILE, JSON.stringify(out, null, 2) + "\n");
  return out;
}

// ---- transforms: (set) => set, or null when not applicable ----
const onSources = (f) => (s) => ({ ...s, sources: s.sources.map(f) });
// The harness's own splitter must be lossless (an earlier regex dropped text
// at "6.1-inch" and split "10:00 a.m. to"): split only at whitespace after
// .!? and before a capital letter; the pieces join back to the original
const sentencesOf = (t) => t.split(/(?<=[.!?])(?=\s+[A-Z])/);
const FULLWIDTH = (t) =>
  t.replace(/[0-9]/g, (d) => String.fromCharCode(0xff10 + Number(d)));
const TRANSFORMS = {
  "shuffle sources": (s) =>
    s.sources.length > 1
      ? { ...s, sources: [...s.sources.slice(1), s.sources[0]] }
      : null,
  "duplicate a source": (s) => ({
    ...s,
    sources: [...s.sources, s.sources[0]],
  }),
  "add an unrelated source": (s) => ({
    ...s,
    sources: [
      ...s.sources,
      "The lighthouse on the northern headland was painted white in a later restoration of the harbour.",
    ],
  }),
  "split a source at a sentence boundary": (s) => {
    const i = s.sources.findIndex((x) => sentencesOf(x).length >= 2);
    if (i < 0) return null;
    const parts = sentencesOf(s.sources[i]);
    const half = Math.ceil(parts.length / 2);
    return {
      ...s,
      sources: [
        ...s.sources.slice(0, i),
        parts.slice(0, half).join("").trim(),
        parts.slice(half).join("").trim(),
        ...s.sources.slice(i + 1),
      ],
    };
  },
  "curly quotes in sources": onSources((t) =>
    t.replace(/'/g, "’").replace(/"([^"]*)"/g, "“$1”"),
  ),
  "straight quotes in sources": onSources((t) =>
    t.replace(/[‘’]/g, "'").replace(/[“”]/g, '"'),
  ),
  "NBSP in sources": onSources((t) => t.replace(/ /g, " ")),
  "CRLF in sources": onSources((t) =>
    sentencesOf(t)
      .map((x) => x.trim())
      .join("\r\n"),
  ),
  "zero-width characters in sources": onSources((t) =>
    t.replace(/(\w)(\w)/g, "$1​$2"),
  ),
  "full-width digits in sources": onSources(FULLWIDTH),
  "trailing whitespace": (s) => ({
    answer: s.answer + "   \n",
    sources: s.sources.map((x) => x + "  \t "),
  }),
  // sentence splitter (added before generation)
  "no space after a period": onSources((t) =>
    t.replace(/([a-z0-9][.!?])\s+(?=[A-Z])/g, "$1"),
  ),
  "abbreviations in sources": onSources((t) => {
    const parts = sentencesOf(t);
    return parts.length < 2
      ? `${t} See the U.S. guidance, e.g. section 2, approx. one page.`
      : [
          parts[0],
          " See the U.S. guidance, e.g. section 2, approx. one page.",
          ...parts.slice(1),
        ].join("");
  }),
  "decimals in sources": onSources((t) => {
    const parts = sentencesOf(t);
    return parts.length < 2
      ? `${t} The index rose by 2.5 points.`
      : [parts[0], " The index rose by 2.5 points.", ...parts.slice(1)].join(
          "",
        );
  }),
  "list items without final punctuation": onSources((t) =>
    sentencesOf(t)
      .map((x) => `- ${x.trim().replace(/[.!?]+$/, "")}`)
      .join("\n"),
  ),
};
const FORMATS = {
  "{ id, content }": (s) =>
    s.sources.map((content, i) => ({ id: `doc-${i}`, content })),
  "changed ids": (s) =>
    s.sources.map((content, i) => ({
      id: `renamed-${s.sources.length - i}`,
      content,
    })),
  "LangChain Document": (s) =>
    s.sources.map((pageContent, i) => ({
      pageContent,
      metadata: { source: `doc-${i}.md` },
    })),
  "LlamaIndex node": (s) => s.sources.map((text) => ({ text })),
  "LlamaIndex { node, score }": (s) =>
    s.sources.map((text) => ({ node: { text }, score: 0.9 })),
};

const verdicts = (check) =>
  check.citations
    .map((c) => (check.unsupported.includes(c.sentence) ? 0 : 1))
    .join("");

async function main() {
  const cap = Number(args.cap);
  if (!Number.isFinite(cap)) throw new Error("--cap=<usd> is required");
  const cache = new ClaudeCache({
    apiKey: liveAnthropic().apiKey,
    capUSD: cap,
  });
  const list = await sets(cache);
  const src = require("../../src/grounding/check-answer.js");
  const entries = {
    "main (require)": require("@devilsdev/rag-pipeline-utils"),
    "main (import)": await import("@devilsdev/rag-pipeline-utils"),
    "/edge (import)": await import("@devilsdev/rag-pipeline-utils/edge"),
    "@devilsdev/rag-eval (require)": require(
      path.join(ROOT, "packages", "rag-eval"),
    ),
  };
  const report = {
    generatedAt: new Date().toISOString(),
    environment: environment(),
    sets: list.length,
    byKind: {},
    transforms: {},
    entryPoints: {},
    violations: [],
  };
  for (const s of list)
    report.byKind[s.kind] = (report.byKind[s.kind] || 0) + 1;
  const run = (lib, s, sources = s.sources) =>
    lib.checkAnswer({ answer: s.answer, sources, evaluate: false });
  for (const s of list) {
    const base = await run(src, s);
    const v0 = verdicts(base);
    for (const [name, t] of Object.entries(TRANSFORMS)) {
      const ts = t(s);
      const row = (report.transforms[name] ||= { applied: 0, changed: 0 });
      if (!ts) continue;
      row.applied++;
      const c = await run(src, ts, ts.sources);
      // the answer's sentences must line up (trailing whitespace changes none)
      const v1 = verdicts(c);
      if (v1 !== v0) {
        row.changed++;
        report.violations.push({
          kind: "transform",
          transform: name,
          id: s.id,
          before: v0,
          after: v1,
          answer: s.answer,
          sources: s.sources,
          transformed: ts.sources,
        });
      }
    }
    for (const [name, f] of Object.entries(FORMATS)) {
      const row = (report.transforms[`sources as ${name}`] ||= {
        applied: 0,
        changed: 0,
      });
      row.applied++;
      const v1 = verdicts(await run(src, s, f(s)));
      if (v1 !== v0) {
        row.changed++;
        report.violations.push({
          kind: "format",
          transform: name,
          id: s.id,
          before: v0,
          after: v1,
          answer: s.answer,
          sources: s.sources,
        });
      }
    }
    const fingerprint = (c) =>
      JSON.stringify({ g: c.grounded, u: c.unsupported, n: c.groundedness });
    const want = fingerprint(base);
    for (const [name, lib] of Object.entries(entries)) {
      const row = (report.entryPoints[name] ||= { sets: 0, differ: 0 });
      row.sets++;
      const got = fingerprint(await run(lib, s));
      if (got !== want) {
        row.differ++;
        report.violations.push({
          kind: "entry point",
          transform: name,
          id: s.id,
          before: want,
          after: got,
        });
      }
    }
  }
  report.spend = cache.usageSummary();
  fs.writeFileSync(RESULTS_FILE, JSON.stringify(report, null, 2) + "\n");
  console.log(`${list.length} sets ${JSON.stringify(report.byKind)}`);
  for (const [name, r] of Object.entries(report.transforms))
    console.log(`  ${name.padEnd(42)} changed ${r.changed}/${r.applied}`);
  for (const [name, r] of Object.entries(report.entryPoints))
    console.log(`  entry ${name.padEnd(36)} differ ${r.differ}/${r.sets}`);
  console.log(`cache spend now US$${cache.spentUSD().toFixed(4)} (cap ${cap})`);
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
