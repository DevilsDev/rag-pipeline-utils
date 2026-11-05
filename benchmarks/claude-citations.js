#!/usr/bin/env node
/**
 * Citation benchmark: when Claude cites its sources, how often does
 * verifyCitations() confirm the citations, and does it catch citations
 * that don't support their claim? The same cases for every model.
 *
 * 1. Real responses. A seeded sample of BEIR SciFact test claims
 *    (benchmarks/scifact.js, CC BY-SA 4.0, used, not redistributed). For
 *    each, Claude gets three abstracts as `document` blocks with citations
 *    on (the abstracts judged relevant to the claim, then BM25's top
 *    non-relevant abstracts up to three, in id order) and is asked what
 *    they say about the claim. fromAnthropicCitations() + verifyCitations()
 *    check the answer, lexically and with the same Claude model as judge.
 * 2. Hand review. A seeded sample of the claims marked unsupported is
 *    classified by hand (benchmarks/fixtures/claude-citations-review.json,
 *    criteria committed before the run) as true problems or false alarms.
 * 3. Mutations, with no extra API calls. Each claim the lexical check
 *    supports (checked on its own) is altered: a number changed to one the
 *    cited passages don't contain, a negation added or removed, or its
 *    cited passages swapped for another document's (from an unrelated
 *    claim, or the full text of another abstract in the same request). A
 *    mutation is caught when the claim is no longer supported.
 * 4. Edge cases (benchmarks/fixtures/citation-edge-cases.json), written for
 *    this project and committed before any model saw them: questions the
 *    documents can't answer, conflicting documents, multi-hop questions,
 *    many documents, long documents, near-duplicates and instructions in a
 *    document. Each case decides from the answer text whether the model
 *    answered correctly; the library is right when it flags a wrong answer
 *    (not verified, or sentences without a citation) and passes a correct
 *    one.
 *
 * The answer requests are this script's own: models that reject
 * `temperature` (see the report's `temperature`) get them without it, the
 * others get temperature 0. The judge is AnthropicConnector, unchanged, as
 * in benchmarks/judge.js.
 *
 *   node benchmarks/claude-citations.js [--models=a,b] [--queries=50]
 *     [--seed=20261105] [--concurrency=4] [--cap=90] [--data-dir=dir]
 *     [--output=file.json] [--review-out=file.json] [--dry-run]
 *
 * --review-out writes the sampled claims to review, with their passages.
 */

"use strict";

const fs = require("fs");
const path = require("path");

const {
  fromAnthropicCitations,
  verifyCitations,
} = require("../src/grounding/provider-citations.js");
const {
  AnthropicConnector,
} = require("../src/connectors/anthropic-connector.js");
const { BM25Search } = require("../src/index.js");
const { extractNumbers } = require("../src/evaluate/scoring.js");
const { liveAnthropic } = require("../__tests__/live/live-env.js");
const { loadSciFact } = require("./scifact");
const { mulberry32, shuffle } = require("./judge-datasets");
const { ClaudeCache, PRICES } = require("./claude-cache");
const {
  args,
  environment,
  wilson,
  ratio,
  mapLimit,
  percentile,
  buildLong,
} = require("./claude-common");

const DEFAULT_MODELS = [
  "claude-haiku-4-5-20251001",
  "claude-haiku-5-5",
  "claude-sonnet-5-5",
  "claude-opus-5-5",
  "claude-fable-5-1",
];
const MODELS = args.models ? args.models.split(",") : DEFAULT_MODELS;
// Claims per model (benchmarks/fixtures/claude-bench-plan.md); --queries
// sets one number for every model
const QUERIES_FOR = {
  "claude-haiku-4-5-20251001": 150,
  "claude-haiku-5-5": 150,
  "claude-sonnet-5-5": 150,
  "claude-opus-5-5": 100,
  "claude-fable-5-1": 100,
};
const queriesFor = (model) => Number(args.queries || QUERIES_FOR[model] || 50);
// Every model is also reported on the first SHARED claims
const SHARED = 100;
const SEED = Number(args.seed || 20261105);
const CONCURRENCY = Number(args.concurrency || 4);
const DOCS_PER_QUERY = 3;
const MAX_TOKENS = 4000;
const REVIEW_FILE = path.join(
  __dirname,
  "fixtures",
  "claude-citations-review.json",
);
const EDGE_FILE = path.join(__dirname, "fixtures", "citation-edge-cases.json");
const REVIEW_PER_MODEL = Infinity; // every flagged claim

const scifactPrompt = (claim) =>
  `A reader asks about this claim: "${claim}"\n\nUsing only the documents above, explain in one short paragraph what they say about the claim.`;
const edgePrompt = (question) =>
  `${question}\n\nAnswer using only the documents above.`;

/** The seeded sample of claims, each with its three abstracts. */
function selectCases({ documents, queries, qrels }, count) {
  const bm25 = new BM25Search();
  bm25.index(documents.map((d) => ({ id: d.id, content: d.content })));
  const byId = new Map(documents.map((d) => [d.id, d]));
  const ids = [...queries.keys()].sort((a, b) => Number(a) - Number(b));
  const picked = shuffle(ids, mulberry32(SEED)).slice(0, count);
  return picked.map((queryId) => {
    const claim = queries.get(queryId);
    const relevant = [...qrels.get(queryId).keys()]
      .filter((id) => byId.has(id))
      .sort((a, b) => Number(a) - Number(b))
      .slice(0, DOCS_PER_QUERY);
    const others = bm25
      .search(claim, { k: 20 })
      .map((r) => String(r.id))
      .filter((id) => !relevant.includes(id))
      .slice(0, DOCS_PER_QUERY - relevant.length);
    const docIds = [...relevant, ...others].sort(
      (a, b) => Number(a) - Number(b),
    );
    return {
      id: queryId,
      question: scifactPrompt(claim),
      claim,
      relevant,
      documents: docIds.map((id) => {
        const d = byId.get(id);
        return { id, title: d.title, text: d.text };
      }),
    };
  });
}

function loadEdgeCases() {
  const spec = JSON.parse(fs.readFileSync(EDGE_FILE, "utf8"));
  // The second batch reuses the first file's refusal pattern and distractors
  const spec2 = JSON.parse(
    fs.readFileSync(
      path.join(__dirname, "fixtures", "citation-edge-cases-2.json"),
      "utf8",
    ),
  );
  const tagged = [
    ...spec.cases.map((c) => ({ ...c, batch: 1 })),
    ...spec2.cases.map((c) => ({ ...c, batch: 2 })),
  ];
  return tagged.map((c) => {
    const documents = [
      ...c.documents.map((d) =>
        d.long ? { id: d.id, title: d.title, text: buildLong(d.long) } : d,
      ),
      ...(c.distractors ? spec.distractors : []),
    ];
    const pattern = (p) =>
      new RegExp(p === "$refusal" ? spec.refusal : p, c.correct.flags ?? "i");
    return {
      id: c.id,
      batch: c.batch,
      category: c.category,
      question: edgePrompt(c.question),
      documents,
      mustMatch: (c.correct.mustMatch || []).map(pattern),
      mustNotMatch: (c.correct.mustNotMatch || []).map(pattern),
    };
  });
}

function requestBody(model, c, temperature) {
  return {
    model,
    max_tokens: MAX_TOKENS,
    ...(temperature && { temperature: 0 }),
    messages: [
      {
        role: "user",
        content: [
          ...c.documents.map((d) => ({
            type: "document",
            source: { type: "text", media_type: "text/plain", data: d.text },
            title: d.title,
            citations: { enabled: true },
          })),
          { type: "text", text: c.question },
        ],
      },
    ],
  };
}

/** Whether `model` accepts temperature 0; a 400 costs nothing. */
async function acceptsTemperature(cache, model) {
  try {
    await cache.messages({
      model,
      max_tokens: 5,
      temperature: 0,
      messages: [{ role: "user", content: "Reply with OK." }],
    });
    return { accepted: true };
  } catch (error) {
    const status = error.response && error.response.status;
    if (status === 400 && /temperature/i.test(error.message)) {
      return { accepted: false, error: error.message };
    }
    throw error;
  }
}

function makeJudge(cache, model, sink) {
  const judge = new AnthropicConnector({
    apiKey: cache.apiKey || "cached",
    model,
    maxTokens: 2000,
  });
  judge.client.defaults.adapter = cache.axiosAdapter((call) => sink.push(call));
  return judge;
}

async function answerAndVerify(cache, model, c, temperature) {
  const res = await cache.messages(requestBody(model, c, temperature));
  const message = res.data;
  const normalized = fromAnthropicCitations(message, {
    documents: c.documents.map((d) => ({ id: d.id })),
  });
  const lexical = await verifyCitations(normalized);
  const sink = [];
  const judge = await verifyCitations(normalized, {
    judge: makeJudge(cache, model, sink),
  });
  return {
    id: c.id,
    case: c,
    stopReason: message.stop_reason,
    latencyMs: res.latencyMs,
    normalized,
    lexical,
    judge,
    judgeCalls: sink,
  };
}

// --- Mutations -------------------------------------------------------------

// A standalone number, as the library reads one: not part of a name such
// as "CD4" or "Th17" (changing those changes an entity, not a number)
const NUMBER = /(?<![\p{L}\p{N}.])\d+(?:\.\d+)?(?![\p{L}\p{N}])/u;
const AUX =
  /\b(is|are|was|were|can|could|does|did|do|has|have|had|may|might|will|would|should)\b/i;
const NEGATION = /\b(not|no|never|cannot)\b|n't\b/i;

function changeNumber(text, passages) {
  const m = NUMBER.exec(text);
  if (!m) return null;
  const inPassages = new Set(extractNumbers(passages.join("\n")).parts);
  const decimals = (m[0].split(".")[1] || "").length;
  const step = decimals ? 10 ** -decimals : 1;
  for (let k = 1; k < 50; k++) {
    const candidate = (Number(m[0]) + k * step).toFixed(decimals);
    if (!inPassages.has(String(Number(candidate)))) {
      return (
        text.slice(0, m.index) + candidate + text.slice(m.index + m[0].length)
      );
    }
  }
  return null;
}

function addNegation(text) {
  if (NEGATION.test(text)) return null;
  const m = AUX.exec(text);
  if (!m) return null;
  const at = m.index + m[0].length;
  return `${text.slice(0, at)} not${text.slice(at)}`;
}

function removeNegation(text) {
  if (!NEGATION.test(text)) return null;
  const out = text
    .replace(/\bcannot\b/i, "can")
    .replace(/\b(\w+)n't\b/i, (_, w) => (w.toLowerCase() === "ca" ? "can" : w))
    .replace(/\s*\b(not|never)\b/i, "")
    .replace(/\bno\s+/i, "");
  return out === text ? null : out;
}

async function verifyOne(claim) {
  const result = await verifyCitations({
    provider: "anthropic",
    answer: claim.text,
    claims: [{ ...claim, start: 0, end: claim.text.length }],
    skipped: {},
  });
  return result.claims[0];
}

const rate = (k, n) => ({
  caught: k,
  applicable: n,
  rate: ratio(k, n),
  interval: wilson(k, n),
});

async function mutationTest(responses, documentsById) {
  const pool = [];
  responses.forEach((r) => {
    r.normalized.claims.forEach((claim) => {
      const passages = claim.citations.flatMap((c) => c.passages);
      if (passages.length === 0) return;
      pool.push({ r, claim: { ...claim, queryId: r.id }, passages });
    });
  });
  const baseline = [];
  for (const p of pool) baseline.push((await verifyOne(p.claim)).verdict);
  const supported = pool.filter((p, i) => baseline[i] === "supported");
  const counts = {
    number: [0, 0],
    negationAdded: [0, 0],
    negationRemoved: [0, 0],
    swapUnrelated: [0, 0],
    swapSameRequest: [0, 0],
  };
  const missed = Object.fromEntries(Object.keys(counts).map((k) => [k, []]));
  const tally = async (key, claim, original) => {
    if (!claim) return;
    const v = await verifyOne(claim);
    counts[key][1] += 1;
    if (v.verdict !== "supported") counts[key][0] += 1;
    else if (missed[key].length < 5) {
      // The SciFact query id only: claim text quotes CC BY-SA abstracts
      missed[key].push({ query: original.queryId });
      // Local inspection only (never written to the report): BENCH_DEBUG=1
      if (process.env.BENCH_DEBUG && key === "negationRemoved") {
        console.error(`MISSED ${key}: ${original.text}  =>  ${claim.text}`);
      }
    }
  };
  for (let i = 0; i < supported.length; i++) {
    const p = supported[i];
    const withText = (text) => (text ? { ...p.claim, text } : null);
    await tally(
      "number",
      withText(changeNumber(p.claim.text, p.passages)),
      p.claim,
    );
    await tally("negationAdded", withText(addNegation(p.claim.text)), p.claim);
    await tally(
      "negationRemoved",
      withText(removeNegation(p.claim.text)),
      p.claim,
    );

    // Another response's claim: a different SciFact claim and documents
    const cited = new Set(p.claim.citations.map((c) => c.sourceId));
    let other = null;
    for (let k = 1; k < supported.length && !other; k++) {
      const q = supported[(i + k) % supported.length];
      if (q.r.id === p.r.id) continue;
      const qDocs = new Set(q.r.case.documents.map((d) => d.id));
      if ([...cited].some((id) => qDocs.has(id))) continue;
      other = q;
    }
    if (other) {
      await tally(
        "swapUnrelated",
        {
          ...p.claim,
          citations: p.claim.citations.map((c) => ({
            ...c,
            passages: other.passages,
          })),
        },
        p.claim,
      );
    }
    // Another abstract of the same request, which this claim does not cite
    const sibling = p.r.case.documents.find((d) => !cited.has(d.id));
    if (sibling) {
      await tally(
        "swapSameRequest",
        {
          ...p.claim,
          citations: p.claim.citations.map((c) => ({
            ...c,
            passages: [documentsById.get(sibling.id).text],
          })),
        },
        p.claim,
      );
    }
  }
  return {
    claimsWithCitedText: pool.length,
    unmutatedFlagged: rate(
      baseline.filter((v) => v !== "supported").length,
      pool.length,
    ),
    supportedClaims: supported.length,
    mutations: Object.fromEntries(
      Object.entries(counts).map(([k, [caught, n]]) => [
        k,
        { ...rate(caught, n), missedExamples: missed[k] },
      ]),
    ),
  };
}

// --- Summaries -------------------------------------------------------------

function summarize(responses, key) {
  const claims = responses.flatMap((r) => r[key].claims);
  const count = (v) => claims.filter((c) => c.verdict === v).length;
  const byReason = {};
  for (const c of claims) {
    byReason[c.lexicalReason] = (byReason[c.lexicalReason] || 0) + 1;
  }
  const verified = responses.filter((r) => r[key].verified).length;
  return {
    claims: claims.length,
    supported: count("supported"),
    unsupported: count("unsupported"),
    unverifiable: count("unverifiable"),
    supportedShare: ratio(count("supported"), claims.length),
    supportedInterval: wilson(count("supported"), claims.length),
    byLexicalReason: byReason,
    verifiedAnswers: verified,
    verifiedShare: ratio(verified, responses.length),
    verifiedInterval: wilson(verified, responses.length),
  };
}

function reviewSample(model, responses) {
  const flagged = responses.flatMap((r) =>
    r.lexical.claims
      .map((c, i) => ({
        id: `${model}|${r.id}#${i}`,
        r,
        i,
        lexical: c,
        judge: r.judge.claims[i],
      }))
      .filter((x) => x.lexical.verdict === "unsupported"),
  );
  const sampled =
    flagged.length > REVIEW_PER_MODEL
      ? shuffle(flagged, mulberry32(SEED)).slice(0, REVIEW_PER_MODEL)
      : flagged;
  return { flagged: flagged.length, sampled };
}

function reviewSummary({ flagged, sampled }, review) {
  const labels = review.reviews || {};
  const tally = (rows) => {
    const out = { reviewed: 0, true_problem: 0, false_alarm: 0, unclear: 0 };
    for (const x of rows) {
      const l = labels[x.id];
      if (!l) continue;
      out.reviewed += 1;
      out[l.label] += 1;
    }
    out.precision = ratio(out.true_problem, out.true_problem + out.false_alarm);
    out.precisionInterval = wilson(
      out.true_problem,
      out.true_problem + out.false_alarm,
    );
    return out;
  };
  return {
    flaggedByLexical: flagged,
    sampled: sampled.length,
    lexical: tally(sampled),
    // The same reviewed claims, as the judge left them
    judgeStillUnsupported: tally(
      sampled.filter((x) => x.judge.verdict !== "supported"),
    ),
    judgeOverturned: tally(
      sampled.filter((x) => x.judge.verdict === "supported"),
    ),
    sample: sampled.map((x) => x.id),
  };
}

const flaggedBy = (v) => !v.verified || v.summary.uncitedSentences > 0;

function scoreEdge(cases, responses, model, overrides = {}) {
  const categories = {};
  const examples = [];
  const empty = () => ({ caught: 0, missed: 0, falseAlarm: 0, passed: 0 });
  let overridden = 0;
  cases.forEach((c, i) => {
    const r = responses[i];
    const text = r.normalized.answer;
    const automatic =
      c.mustMatch.every((p) => p.test(text)) &&
      !c.mustNotMatch.some((p) => p.test(text));
    // The hand check (benchmarks/fixtures/citation-edge-review.json) wins
    const override = overrides[`${model}|${c.id}`];
    const correct = override ? override.modelCorrect : automatic;
    if (override && override.modelCorrect !== automatic) overridden += 1;
    const cat = (categories[c.category] = categories[c.category] || {
      cases: 0,
      modelCorrect: 0,
      modelCorrectAutomatic: 0,
      lexical: empty(),
      judge: empty(),
      judgeVerifiedOnly: empty(),
    });
    cat.cases += 1;
    if (correct) cat.modelCorrect += 1;
    if (automatic) cat.modelCorrectAutomatic += 1;
    const outcomes = {};
    for (const key of ["lexical", "judge"]) {
      const flagged = flaggedBy(r[key]);
      const outcome = correct
        ? flagged
          ? "falseAlarm"
          : "passed"
        : flagged
          ? "caught"
          : "missed";
      cat[key][outcome] += 1;
      outcomes[key] = outcome;
    }
    // The library's own rule: verified or not, uncited sentences aside
    {
      const flagged = !r.judge.verified;
      const outcome = correct
        ? flagged
          ? "falseAlarm"
          : "passed"
        : flagged
          ? "caught"
          : "missed";
      cat.judgeVerifiedOnly[outcome] += 1;
      outcomes.judgeVerifiedOnly = outcome;
    }
    examples.push({
      id: c.id,
      citedClaims: r.lexical.claims.length,
      unsupportedClaims: r.lexical.claims.filter(
        (k) => k.verdict !== "supported",
      ).length,
      unsupportedClaimsJudge: r.judge.claims.filter(
        (k) => k.verdict !== "supported",
      ).length,
      category: c.category,
      modelCorrect: correct,
      modelCorrectAutomatic: automatic,
      ...(override && { handCheck: override.note }),
      lexical: outcomes.lexical,
      judge: outcomes.judge,
      judgeVerifiedOnly: outcomes.judgeVerifiedOnly,
      answer: text,
      claims: r.judge.claims.map((k, j) => ({
        text: k.text,
        lexical: r.lexical.claims[j].verdict,
        lexicalReason: r.lexical.claims[j].lexicalReason,
        judge: k.verdict,
        cites: k.citations.map((x) => x.sourceId),
      })),
      uncited: r.lexical.uncited.map((u) => u.text),
    });
  });
  const total = (key, outcome) =>
    Object.values(categories).reduce((n, c) => n + c[key][outcome], 0);
  return {
    cases: cases.length,
    modelCorrect: Object.values(categories).reduce(
      (n, c) => n + c.modelCorrect,
      0,
    ),
    modelCorrectAutomatic: Object.values(categories).reduce(
      (n, c) => n + c.modelCorrectAutomatic,
      0,
    ),
    labelsOverriddenByHand: overridden,
    lexical: {
      caught: total("lexical", "caught"),
      missed: total("lexical", "missed"),
      falseAlarm: total("lexical", "falseAlarm"),
      passed: total("lexical", "passed"),
    },
    judge: {
      caught: total("judge", "caught"),
      missed: total("judge", "missed"),
      falseAlarm: total("judge", "falseAlarm"),
      passed: total("judge", "passed"),
    },
    judgeVerifiedOnly: {
      caught: total("judgeVerifiedOnly", "caught"),
      missed: total("judgeVerifiedOnly", "missed"),
      falseAlarm: total("judgeVerifiedOnly", "falseAlarm"),
      passed: total("judgeVerifiedOnly", "passed"),
    },
    categories,
    examples,
  };
}

function usageOf(entries) {
  const u = { calls: entries.length, inputTokens: 0, outputTokens: 0 };
  for (const e of entries) {
    u.inputTokens += e.response.usage.input_tokens || 0;
    u.outputTokens += e.response.usage.output_tokens || 0;
  }
  return u;
}

// --- Main ------------------------------------------------------------------

async function main() {
  const data = await loadSciFact(args["data-dir"]);
  const cases = selectCases(
    data,
    Math.max(...MODELS.map((m) => queriesFor(m))),
  );
  const edge = loadEdgeCases();
  const documentsById = new Map(data.documents.map((d) => [d.id, d]));
  if (args["dry-run"]) {
    for (const c of cases) {
      console.log(
        `${c.id}\t${c.documents.map((d) => d.id).join(",")}\t${c.relevant.join(",")}\t${c.claim}`,
      );
    }
    for (const c of edge) {
      console.log(
        `${c.id}\t${c.documents.length} docs\t${c.documents.map((d) => d.text.split(/\s+/).length).join(",")} words`,
      );
    }
    return;
  }
  const { apiKey } = liveAnthropic();
  const cache = new ClaudeCache({ apiKey, capUSD: Number(args.cap || 90) });
  const review = JSON.parse(fs.readFileSync(REVIEW_FILE, "utf8"));
  const edgeReview = JSON.parse(
    fs.readFileSync(
      path.join(__dirname, "fixtures", "citation-edge-review.json"),
      "utf8",
    ),
  );
  console.log(
    `${cases.length} SciFact claims, ${DOCS_PER_QUERY} abstracts each; ${edge.length} edge cases`,
  );

  const report = {
    benchmark: "claude-citations",
    createdAt: new Date().toISOString(),
    environment: environment(),
    dataset: {
      ...data.source,
      claims: Object.fromEntries(MODELS.map((m) => [m, queriesFor(m)])),
      sharedClaims: SHARED,
      documentsPerClaim: DOCS_PER_QUERY,
      seed: SEED,
      rule: "A seeded sample of SciFact test claims; for each, the abstracts judged relevant to it and BM25's top non-relevant abstracts up to three, in id order.",
    },
    prompts: {
      scifact: scifactPrompt("<claim>"),
      edge: edgePrompt("<question>"),
    },
    maxTokens: MAX_TOKENS,
    edgeFile: "benchmarks/fixtures/citation-edge-cases.json",
    edgeFile2: "benchmarks/fixtures/citation-edge-cases-2.json",
    models: {},
  };
  const reviewRows = [];

  for (const model of MODELS) {
    const start = cache.used.length;
    const temperature = await acceptsTemperature(cache, model);
    const temp = temperature.accepted;
    console.log(
      `${model}: temperature 0 ${temp ? "accepted" : `rejected (${temperature.error})`}`,
    );
    const mainStart = cache.used.length;
    const responses = await mapLimit(
      cases.slice(0, queriesFor(model)),
      CONCURRENCY,
      (c) => answerAndVerify(cache, model, c, temp),
    );
    const mainEntries = cache.used.slice(mainStart);
    const edgeStart = cache.used.length;
    const edgeResponses = await mapLimit(edge, CONCURRENCY, (c) =>
      answerAndVerify(cache, model, c, temp),
    );
    const edgeEntries = cache.used.slice(edgeStart);
    const allEntries = cache.used.slice(start);
    const summary = cache.usageSummary((e) => allEntries.includes(e))[model];
    const costOfEntries = (entries) =>
      cache.usageSummary((e) => entries.includes(e))[model]?.costUSD ?? 0;
    const judgeCalls = responses.flatMap((r) => r.judgeCalls);
    const uncited = responses.map((r) => r.lexical.summary.uncitedSentences);
    const sample = reviewSample(model, responses);
    for (const x of sample.sampled) {
      const claim = x.r.normalized.claims[x.i];
      reviewRows.push({
        id: x.id,
        claim: claim.text,
        passages: claim.citations.map((c) => ({
          doc: c.sourceId,
          text: c.passages,
        })),
        lexicalReason: x.lexical.lexicalReason,
        judge: x.judge.verdict,
        sciFactClaim: x.r.case.claim,
      });
    }

    report.models[model] = {
      pricesPerMTok: PRICES[model],
      pricesChecked: "2026-11-05",
      temperature: temp ? 0 : "not sent (model rejects it)",
      temperatureCheck: temperature,
      callDates: (() => {
        const dates = allEntries.map((e) => e.createdAt.slice(0, 10)).sort();
        return dates.length ? [dates[0], dates[dates.length - 1]] : null;
      })(),
      totalCalls: allEntries.length,
      totalCostUSD: summary ? summary.costUSD : 0,
      scifact: {
        answers: {
          calls: responses.length,
          stopReasons: responses.reduce((acc, r) => {
            acc[r.stopReason] = (acc[r.stopReason] || 0) + 1;
            return acc;
          }, {}),
          // verifyCitations reports a refusal (3.5.0)
          refused: responses.filter((r) => r.lexical.refused).length,
          withoutCitations: responses.filter(
            (r) => r.normalized.claims.length === 0,
          ).length,
          skippedCitations: responses.reduce(
            (n, r) =>
              n +
              Object.values(r.normalized.skipped).reduce((a, b) => a + b, 0),
            0,
          ),
          uncitedSentences: uncited.reduce((a, b) => a + b, 0),
          answersWithUncitedSentences: uncited.filter((n) => n > 0).length,
          citationsPerAnswerP50: percentile(
            responses.map((r) => r.lexical.summary.citations),
            50,
          ),
          latencyMs: {
            p50: percentile(
              responses.map((r) => r.latencyMs),
              50,
            ),
            p95: percentile(
              responses.map((r) => r.latencyMs),
              95,
            ),
          },
        },
        // The first SHARED claims, which every model answered
        shared: {
          claims: Math.min(SHARED, responses.length),
          refused: responses.slice(0, SHARED).filter((r) => r.lexical.refused)
            .length,
          lexical: summarize(responses.slice(0, SHARED), "lexical"),
          judge: summarize(responses.slice(0, SHARED), "judge"),
        },
        lexical: summarize(responses, "lexical"),
        judge: {
          ...summarize(responses, "judge"),
          calls: judgeCalls.length,
          errors: responses.filter((r) => r.judge.judge && r.judge.judge.error)
            .length,
        },
        usage: usageOf(mainEntries),
        costUSD: costOfEntries(mainEntries),
        review: reviewSummary(sample, review),
        mutation: await mutationTest(responses, documentsById),
      },
      edge: scoreEdge(
        edge.filter((c) => c.batch === 1),
        edgeResponses.filter((r, i) => edge[i].batch === 1),
        model,
        edgeReview.overrides,
      ),
      edge2: scoreEdge(
        edge.filter((c) => c.batch === 2),
        edgeResponses.filter((r, i) => edge[i].batch === 2),
        model,
        edgeReview.overrides,
      ),
      edgeAll: {
        ...scoreEdge(edge, edgeResponses, model, edgeReview.overrides),
        usage: usageOf(edgeEntries),
        costUSD: costOfEntries(edgeEntries),
      },
    };
    const s = report.models[model].scifact;
    const e = report.models[model].edgeAll;
    console.log(
      `  SciFact: ${s.lexical.claims} claims, lexical supported ${s.lexical.supportedShare}, judge ${s.judge.supportedShare}, verified ${s.lexical.verifiedShare}/${s.judge.verifiedShare}; edge model correct ${e.modelCorrect}/${e.cases}, judge caught ${e.judge.caught} missed ${e.judge.missed} false alarms ${e.judge.falseAlarm}; US$${report.models[model].totalCostUSD}; total spend US$${cache.spentUSD().toFixed(4)}`,
    );
  }

  if (args["review-out"]) {
    fs.writeFileSync(
      args["review-out"],
      JSON.stringify(reviewRows, null, 2) + "\n",
    );
  }
  if (args.output) {
    fs.mkdirSync(path.dirname(path.resolve(args.output)), { recursive: true });
    fs.writeFileSync(args.output, JSON.stringify(report, null, 2) + "\n");
    console.log(`Report written to ${args.output}`);
  }
}

main().catch((error) => {
  // Never print an error object: an HTTP client error can carry the API key
  console.error(error && error.message ? error.message : "failed");
  process.exit(1);
});
