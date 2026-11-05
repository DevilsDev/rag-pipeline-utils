/**
 * Helpers shared by the Claude benchmarks (judge.js, claude-citations.js).
 */

"use strict";

const os = require("os");
const path = require("path");
const { execFileSync } = require("child_process");
const { version } = require("../package.json");

const args = Object.fromEntries(
  process.argv
    .slice(2)
    .filter((a) => a.startsWith("--"))
    .map((a) => {
      const [k, v = "true"] = a.slice(2).split("=");
      return [k, v];
    }),
);

function environment() {
  let commit = null;
  try {
    commit = execFileSync("git", ["rev-parse", "--short", "HEAD"], {
      cwd: path.join(__dirname, ".."),
      stdio: ["ignore", "pipe", "ignore"],
    })
      .toString()
      .trim();
  } catch {
    // not a git checkout
  }
  return {
    libraryVersion: version,
    commit,
    node: process.version,
    platform: `${os.platform()} ${os.release()}`,
    runner: process.env.GITHUB_ACTIONS
      ? `GitHub Actions ${process.env.RUNNER_OS || ""}`.trim()
      : "local",
  };
}

// The same 95% Wilson interval and confusion metrics as evaluateDetectors()
// (src/guardrails/evaluate-detectors.js), which doesn't export them.
const Z = 1.96;
const round = (x) => Number(x.toFixed(4));
const ratio = (k, n) => (n === 0 ? null : round(k / n));

function wilson(k, n) {
  if (n === 0) return null;
  const p = k / n;
  const denom = 1 + (Z * Z) / n;
  const centre = (p + (Z * Z) / (2 * n)) / denom;
  const half =
    (Z * Math.sqrt((p * (1 - p)) / n + (Z * Z) / (4 * n * n))) / denom;
  return [round(Math.max(0, centre - half)), round(Math.min(1, centre + half))];
}

function confusionMetrics({ tp, fp, fn, tn }) {
  return {
    cases: tp + fp + fn + tn,
    tp,
    fp,
    fn,
    tn,
    precision: ratio(tp, tp + fp),
    recall: ratio(tp, tp + fn),
    f1: ratio(2 * tp, 2 * tp + fp + fn),
    accuracy: ratio(tp + tn, tp + fp + fn + tn),
    precisionInterval: wilson(tp, tp + fp),
    recallInterval: wilson(tp, tp + fn),
  };
}

/** Nearest-rank percentile. */
function percentile(values, p) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const rank = Math.ceil((p / 100) * sorted.length);
  return sorted[Math.min(sorted.length - 1, Math.max(0, rank - 1))];
}

/** Map with at most `limit` calls in flight; results keep their order. */
async function mapLimit(items, limit, fn) {
  const out = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i], i);
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, worker),
  );
  return out;
}

module.exports = {
  buildLong,
  args,
  environment,
  wilson,
  confusionMetrics,
  percentile,
  mapLimit,
  ratio,
};

const FILLER = require("./fixtures/filler.json").sentences;

/**
 * A long source for the edge cases: the filler sentences
 * cycled to about `words` words, with `needle` inserted at the
 * fraction `at` of the way through.
 */
function buildLong({ words, at, needle }) {
  const parts = [];
  let count = 0;
  for (let i = 0; count < words; i++) {
    const s = FILLER[i % FILLER.length];
    parts.push(s);
    count += s.split(/\s+/).length;
  }
  parts.splice(Math.round(parts.length * at), 0, needle);
  return parts.join(" ");
}
