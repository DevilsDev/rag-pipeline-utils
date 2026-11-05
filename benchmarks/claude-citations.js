#!/usr/bin/env node
/**
 * Citation benchmark: when Claude cites its sources, how often does
 * verifyCitations() confirm the citations, and does it catch citations
 * that don't support their claim?
 *
 * 1. Real responses. A seeded sample of BEIR SciFact test claims
 *    (benchmarks/scifact.js, CC BY-SA 4.0, used, not redistributed). For
 *    each, Claude gets three abstracts as `document` blocks with citations
 *    on (the abstracts judged relevant to the claim, then BM25's top
 *    non-relevant abstracts up to three, in id order) and is asked what
 *    they say about the claim. fromAnthropicCitations() + verifyCitations()
 *    check the answer, lexically and with Claude Haiku as the judge.
 * 2. Hand review. The claims marked unsupported are classified by hand
 *    (benchmarks/fixtures/claude-citations-review.json, criteria
 *    committed before the run) as true problems or false alarms.
 * 3. Mutations, with no extra API calls. Each claim the lexical check
 *    supports (checked on its own) is altered: a number changed to one the
 *    cited passages don't contain, a negation added or removed, or its
 *    cited passages swapped for another document's (from an unrelated
 *    claim, or the full text of another abstract in the same request). A
 *    mutation is caught when the claim is no longer supported.
 *
 *   node benchmarks/claude-citations.js [--model=claude-haiku-4-5-20251001]
 *     [--queries=50] [--seed=20261105] [--concurrency=4] [--cap=5]
 *     [--data-dir=dir] [--output=file.json] [--review-out=file.json]
 *
 * --review-out writes the claims to review, with their passages.
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
} = require("./claude-common");

const MODEL = args.model || "claude-haiku-4-5-20251001";
const QUERIES = Number(args.queries || 50);
const SEED = Number(args.seed || 20261105);
const CONCURRENCY = Number(args.concurrency || 4);
const DOCS_PER_QUERY = 3;
const MAX_TOKENS = 800;
const REVIEW_FILE = path.join(
  __dirname,
  "fixtures",
  "claude-citations-review.json",
);
const REVIEW_LIMIT = 60;

const prompt = (claim) =>
  `A reader asks about this claim: "${claim}"\n\nUsing only the documents above, explain in one short paragraph what they say about the claim.`;

/** The seeded sample of claims, each with its three abstracts. */
function selectCases({ documents, queries, qrels }) {
  const bm25 = new BM25Search();
  bm25.index(documents.map((d) => ({ id: d.id, content: d.content })));
  const byId = new Map(documents.map((d) => [d.id, d]));
  const ids = [...queries.keys()].sort((a, b) => Number(a) - Number(b));
  const picked = shuffle(ids, mulberry32(SEED)).slice(0, QUERIES);
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
      queryId,
      claim,
      relevant,
      documents: docIds.map((id) => {
        const d = byId.get(id);
        return { id, title: d.title, text: d.text };
      }),
    };
  });
}

function requestBody(c) {
  return {
    model: MODEL,
    max_tokens: MAX_TOKENS,
    temperature: 0,
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
          { type: "text", text: prompt(c.claim) },
        ],
      },
    ],
  };
}

function judgeFor(cache, sink) {
  const judge = new AnthropicConnector({
    apiKey: cache.apiKey || "cached",
    model: MODEL,
    maxTokens: 2000,
  });
  judge.client.defaults.adapter = cache.axiosAdapter((call) => sink.push(call));
  return judge;
}

// --- Mutations -------------------------------------------------------------

const NUMBER = /\d+(?:\.\d+)?/;
const AUX =
  /\b(is|are|was|were|can|could|does|did|do|has|have|had|may|might|will|would|should)\b/i;
const NEGATION = /\b(not|no|never|cannot)\b|n't\b/i;

function changeNumber(text, passages) {
  const m = NUMBER.exec(text);
  if (!m) return null;
  const haystack = passages.join("\n");
  const decimals = (m[0].split(".")[1] || "").length;
  const step = decimals ? 10 ** -decimals : 1;
  for (let k = 1; k < 50; k++) {
    const candidate = (Number(m[0]) + k * step).toFixed(decimals);
    if (
      !new RegExp(`(^|[^\\d.])${candidate.replace(".", "\\.")}(?![\\d])`).test(
        haystack,
      )
    ) {
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

async function verifyOne(provider, claim) {
  const result = await verifyCitations({
    provider,
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
  // Claims with cited text, checked on their own
  const pool = [];
  responses.forEach((r) => {
    r.normalized.claims.forEach((claim, i) => {
      const passages = claim.citations.flatMap((c) => c.passages);
      if (passages.length === 0) return;
      pool.push({ r, claim, index: i, passages });
    });
  });
  const baseline = [];
  for (const p of pool) {
    const v = await verifyOne("anthropic", p.claim);
    baseline.push(v.verdict);
  }
  const supported = pool.filter((p, i) => baseline[i] === "supported");
  const counts = {
    number: [0, 0],
    negationAdded: [0, 0],
    negationRemoved: [0, 0],
    swapUnrelated: [0, 0],
    swapSameRequest: [0, 0],
  };
  const tally = async (key, claim) => {
    if (!claim) return;
    const v = await verifyOne("anthropic", claim);
    counts[key][1] += 1;
    if (v.verdict !== "supported") counts[key][0] += 1;
  };
  for (let i = 0; i < supported.length; i++) {
    const p = supported[i];
    const withText = (text) => (text ? { ...p.claim, text } : null);
    await tally("number", withText(changeNumber(p.claim.text, p.passages)));
    await tally("negationAdded", withText(addNegation(p.claim.text)));
    await tally("negationRemoved", withText(removeNegation(p.claim.text)));

    // Another response's claim: a different SciFact claim and documents
    const cited = new Set(p.claim.citations.map((c) => c.sourceId));
    let other = null;
    for (let k = 1; k < supported.length && !other; k++) {
      const q = supported[(i + k) % supported.length];
      if (q.r.queryId === p.r.queryId) continue;
      const qDocs = new Set(q.r.case.documents.map((d) => d.id));
      if ([...cited].some((id) => qDocs.has(id))) continue;
      other = q;
    }
    if (other) {
      await tally("swapUnrelated", {
        ...p.claim,
        citations: p.claim.citations.map((c) => ({
          ...c,
          passages: other.passages,
        })),
      });
    }
    // Another abstract of the same request, which this claim does not cite
    const sibling = p.r.case.documents.find((d) => !cited.has(d.id));
    if (sibling) {
      await tally("swapSameRequest", {
        ...p.claim,
        citations: p.claim.citations.map((c) => ({
          ...c,
          passages: [documentsById.get(sibling.id).text],
        })),
      });
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
      Object.entries(counts).map(([k, [caught, n]]) => [k, rate(caught, n)]),
    ),
  };
}

// --- Summary ---------------------------------------------------------------

function summarize(responses, key) {
  const claims = responses.flatMap((r) => r[key].claims);
  const count = (v) => claims.filter((c) => c.verdict === v).length;
  const byReason = {};
  for (const c of claims)
    byReason[c.lexicalReason] = (byReason[c.lexicalReason] || 0) + 1;
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

function reviewSummary(responses, review) {
  const flagged = responses.flatMap((r) =>
    r.lexical.claims
      .map((c, i) => ({
        id: `${r.queryId}#${i}`,
        lexical: c,
        judge: r.judge.claims[i],
      }))
      .filter((x) => x.lexical.verdict === "unsupported"),
  );
  const sampled =
    flagged.length > REVIEW_LIMIT
      ? shuffle(flagged, mulberry32(SEED)).slice(0, REVIEW_LIMIT)
      : flagged;
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
    flaggedByLexical: flagged.length,
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

async function main() {
  const data = await loadSciFact(args["data-dir"]);
  const cases = selectCases(data);
  const documentsById = new Map(data.documents.map((d) => [d.id, d]));
  if (args["dry-run"]) {
    for (const c of cases) {
      console.log(
        `${c.queryId}\t${c.documents.map((d) => d.id).join(",")}\t${c.relevant.join(",")}\t${c.claim}`,
      );
    }
    return;
  }
  const { apiKey } = liveAnthropic();
  const cache = new ClaudeCache({ apiKey, capUSD: Number(args.cap || 5) });
  console.log(
    `${cases.length} SciFact claims, ${DOCS_PER_QUERY} abstracts each`,
  );

  const answerCalls = [];
  const judgeCalls = [];
  const responses = await mapLimit(cases, CONCURRENCY, async (c) => {
    const res = await cache.messages(requestBody(c));
    answerCalls.push(res);
    const message = res.data;
    const normalized = fromAnthropicCitations(message, {
      documents: c.documents.map((d) => ({ id: d.id })),
    });
    const lexical = await verifyCitations(normalized);
    const sink = [];
    const judge = await verifyCitations(normalized, {
      judge: judgeFor(cache, sink),
    });
    judgeCalls.push(...sink);
    return {
      queryId: c.queryId,
      case: c,
      stopReason: message.stop_reason,
      normalized,
      lexical,
      judge,
    };
  });

  const review = JSON.parse(fs.readFileSync(REVIEW_FILE, "utf8"));
  const used = cache.usageSummary();
  const answerUsage = answerCalls.reduce(
    (acc, r) => {
      acc.calls += 1;
      acc.inputTokens += r.data.usage.input_tokens;
      acc.outputTokens += r.data.usage.output_tokens;
      return acc;
    },
    { calls: 0, inputTokens: 0, outputTokens: 0 },
  );
  const judgeUsage = judgeCalls.reduce(
    (acc, k) => {
      acc.calls += 1;
      acc.inputTokens += k.usage.input_tokens;
      acc.outputTokens += k.usage.output_tokens;
      return acc;
    },
    { calls: 0, inputTokens: 0, outputTokens: 0 },
  );
  const price = PRICES[MODEL];
  const cost = (u) =>
    Number(
      (
        (u.inputTokens * price.input + u.outputTokens * price.output) /
        1e6
      ).toFixed(4),
    );

  const uncited = responses.map((r) => r.lexical.summary.uncitedSentences);
  const report = {
    benchmark: "claude-citations",
    createdAt: new Date().toISOString(),
    environment: environment(),
    dataset: {
      ...data.source,
      claims: cases.length,
      documentsPerClaim: DOCS_PER_QUERY,
      seed: SEED,
      rule: "A seeded sample of SciFact test claims; for each, the abstracts judged relevant to it and BM25's top non-relevant abstracts up to three, in id order.",
    },
    model: {
      id: MODEL,
      temperature: 0,
      maxTokens: MAX_TOKENS,
      pricesPerMTok: price,
      pricesChecked: "2026-11-05",
      callDates: (() => {
        const dates = cache.used.map((e) => e.createdAt.slice(0, 10)).sort();
        return dates.length ? [dates[0], dates[dates.length - 1]] : null;
      })(),
      prompt: prompt("<claim>"),
    },
    answers: {
      ...answerUsage,
      costUSD: cost(answerUsage),
      stopReasons: responses.reduce((acc, r) => {
        acc[r.stopReason] = (acc[r.stopReason] || 0) + 1;
        return acc;
      }, {}),
      withoutCitations: responses.filter(
        (r) => r.normalized.claims.length === 0,
      ).length,
      skippedCitations: responses.reduce(
        (n, r) =>
          n + Object.values(r.normalized.skipped).reduce((a, b) => a + b, 0),
        0,
      ),
      uncitedSentences: uncited.reduce((a, b) => a + b, 0),
      answersWithUncitedSentences: uncited.filter((n) => n > 0).length,
      citationsPerAnswerP50: percentile(
        responses.map((r) => r.lexical.summary.citations),
        50,
      ),
    },
    lexical: summarize(responses, "lexical"),
    judge: {
      ...summarize(responses, "judge"),
      model: MODEL,
      ...judgeUsage,
      costUSD: cost(judgeUsage),
      errors: responses.filter((r) => r.judge.judge && r.judge.judge.error)
        .length,
    },
    review: reviewSummary(responses, review),
    mutation: await mutationTest(responses, documentsById),
    spend: used,
  };

  console.log(
    JSON.stringify(
      { ...report, review: { ...report.review, sample: undefined } },
      null,
      2,
    ),
  );

  if (args["review-out"]) {
    const rows = report.review.sample.map((id) => {
      const [queryId, i] = id.split("#");
      const r = responses.find((x) => x.queryId === queryId);
      const claim = r.normalized.claims[Number(i)];
      return {
        id,
        claim: claim.text,
        passages: claim.citations.map((c) => ({
          doc: c.sourceId,
          text: c.passages,
        })),
        lexicalReason: r.lexical.claims[Number(i)].lexicalReason,
        judge: r.judge.claims[Number(i)].verdict,
        sciFactClaim: r.case.claim,
      };
    });
    fs.writeFileSync(args["review-out"], JSON.stringify(rows, null, 2) + "\n");
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
