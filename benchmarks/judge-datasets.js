/**
 * Labelled set for the groundedness benchmark (benchmarks/judge.js).
 *
 * RAGTruth (Niu et al., ACL 2024), test split, as repackaged in
 * wandb/RAGTruth-processed: 2,700 answers written by six LLMs (GPT-3.5,
 * GPT-4, Llama 2 7B/13B/70B, Mistral 7B) from retrieved context, for three
 * tasks (question answering over MS MARCO passages, news summaries of
 * CNN/Daily Mail articles, and overviews of Yelp businesses from JSON), with
 * expert-annotated hallucination spans. The wandb card says MIT; the
 * upstream repository (github.com/ParticleMedia/RAGTruth) is MIT. The
 * source texts keep their own terms (MS MARCO, CNN/Daily Mail, Yelp), so
 * the data is used here, not committed or redistributed.
 *
 * Downloaded on first use from a pinned commit into benchmarks/.data/
 * (gitignored) and checked against its SHA-256.
 */

"use strict";

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const SOURCE = {
  dataset: "RAGTruth (test split), wandb/RAGTruth-processed",
  license:
    "MIT (dataset card and upstream ParticleMedia/RAGTruth); source texts from MS MARCO, CNN/Daily Mail and Yelp keep their own terms; used, not redistributed",
  revision: "eb4f4b9d1b68eb7092d3e1a61c0cd82d9808737b",
  file: "data/test-00000-of-00001.parquet",
  sha256: "2fc4fb703ea47ee0d4ab6110b86312f94fdf0bda157bc6ee67c7e61fb90d3bbd",
};
const URL = `https://huggingface.co/datasets/wandb/RAGTruth-processed/resolve/${SOURCE.revision}/${SOURCE.file}`;
const DEFAULT_DIR = path.join(__dirname, ".data", "judge");

const sha256 = (buffer) =>
  crypto.createHash("sha256").update(buffer).digest("hex");

async function ensureFile(dir) {
  const file = path.join(dir, "ragtruth-test.parquet");
  if (!fs.existsSync(file)) {
    const res = await fetch(URL);
    if (!res.ok) throw new Error(`Download failed (${res.status}): ${URL}`);
    const buffer = Buffer.from(await res.arrayBuffer());
    if (sha256(buffer) !== SOURCE.sha256) {
      throw new Error(
        `${SOURCE.file} from ${URL} does not match its pinned SHA-256`,
      );
    }
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(file, buffer);
  }
  const buffer = fs.readFileSync(file);
  if (sha256(buffer) !== SOURCE.sha256) {
    throw new Error(`${file} does not match its pinned SHA-256; delete it`);
  }
  return buffer;
}

/**
 * The retrieved context as separate sources: passages are separated by a
 * blank line (the QA task has three MS MARCO passages; a news article or a
 * business's JSON is one source). The summary prompts end with an
 * "output:" line that is part of the prompt template, not the source; it
 * is dropped.
 */
function splitContext(context) {
  return context
    .replace(/\n\s*output:\s*$/, "")
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);
}

/**
 * Every test case: `{ id, task, model, question, answer, sources, spans,
 * hallucinated, quality }`. `spans` are the annotated hallucinations as
 * character offsets into `answer`.
 */
async function loadRagTruth(dir = DEFAULT_DIR) {
  const { parquetReadObjects } = await import("hyparquet");
  const buffer = await ensureFile(dir);
  const rows = await parquetReadObjects({
    file: buffer.buffer.slice(
      buffer.byteOffset,
      buffer.byteOffset + buffer.byteLength,
    ),
    columns: [
      "id",
      "query",
      "context",
      "output",
      "task_type",
      "quality",
      "model",
      "hallucination_labels",
    ],
  });
  return {
    source: SOURCE,
    cases: rows.map((r) => {
      const spans = JSON.parse(r.hallucination_labels).map((s) => ({
        start: s.start,
        end: s.end,
        type: s.label_type,
      }));
      return {
        id: `ragtruth-${r.id}`,
        task: r.task_type,
        model: r.model,
        quality: r.quality,
        question: r.query,
        answer: r.output,
        sources: splitContext(r.context).map((content, i) => ({
          id: String(i + 1),
          content,
        })),
        spans,
        hallucinated: spans.length > 0,
      };
    }),
  };
}

/** Deterministic PRNG (mulberry32), so a seed fixes the sample. */
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Fisher-Yates over a copy, with the seeded PRNG. */
function shuffle(items, random) {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * The benchmark's sample: for each task, `perClass` hallucinated and
 * `perClass` clean answers, drawn with a seeded shuffle from the answers
 * annotated as good quality (the 25 others are refusals or truncated).
 */
function sampleRagTruth(cases, { perClass = 75, seed = 20261105 } = {}) {
  const random = mulberry32(seed);
  const good = [...cases]
    .filter((c) => c.quality === "good")
    .sort((a, b) => a.id.localeCompare(b.id, "en", { numeric: true }));
  const out = [];
  for (const task of ["QA", "Summary", "Data2txt"]) {
    for (const hallucinated of [true, false]) {
      const pool = good.filter(
        (c) => c.task === task && c.hallucinated === hallucinated,
      );
      if (pool.length < perClass) {
        throw new Error(`${task}: only ${pool.length} cases, need ${perClass}`);
      }
      out.push(...shuffle(pool, random).slice(0, perClass));
    }
  }
  return out;
}

/**
 * HaluEval, qa config (Li et al., EMNLP 2023), as repackaged in
 * pminervini/HaluEval: 10,000 HotpotQA questions, each with a Wikipedia
 * knowledge snippet, the right answer and a hallucinated answer that
 * ChatGPT wrote to be plausible. Apache-2.0 on the card; upstream
 * RUCAIBox/HaluEval is MIT. Used, not redistributed.
 */
const HALUEVAL = {
  dataset: "HaluEval qa, pminervini/HaluEval",
  license:
    "Apache-2.0 (dataset card); upstream RUCAIBox/HaluEval is MIT; used, not redistributed",
  revision: "12a856119f03975a94509091e8cada3e6be6ead7",
  file: "qa/data-00000-of-00001.parquet",
  sha256: "1b7118e6dcc3881e5fc87b77b48d9334f0a24d51073ea9dc05baf5a74814580f",
};

async function loadHaluEvalQA(dir = DEFAULT_DIR) {
  const { parquetReadObjects } = await import("hyparquet");
  const file = path.join(dir, "halueval-qa.parquet");
  const url = `https://huggingface.co/datasets/pminervini/HaluEval/resolve/${HALUEVAL.revision}/${HALUEVAL.file}`;
  if (!fs.existsSync(file)) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Download failed (${res.status}): ${url}`);
    const buffer = Buffer.from(await res.arrayBuffer());
    if (sha256(buffer) !== HALUEVAL.sha256) {
      throw new Error(`${HALUEVAL.file} does not match its pinned SHA-256`);
    }
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(file, buffer);
  }
  const buffer = fs.readFileSync(file);
  if (sha256(buffer) !== HALUEVAL.sha256) {
    throw new Error(`${file} does not match its pinned SHA-256; delete it`);
  }
  const rows = await parquetReadObjects({
    file: buffer.buffer.slice(
      buffer.byteOffset,
      buffer.byteOffset + buffer.byteLength,
    ),
  });
  return { source: HALUEVAL, rows };
}

/**
 * 2 x `half` cases: a seeded shuffle of the rows; the first `half` give
 * their right answer (supported), the next `half` their hallucinated
 * answer (unsupported), so no question appears twice.
 */
function sampleHaluEval(rows, { half = 250, seed = 20261107 } = {}) {
  const order = shuffle(
    rows.map((r, i) => ({ ...r, index: i })),
    mulberry32(seed),
  );
  const make = (r, hallucinated) => ({
    id: `halueval-qa-${r.index}`,
    question: r.question,
    answer: String(hallucinated ? r.hallucinated_answer : r.right_answer),
    sources: [{ id: "1", content: r.knowledge }],
    hallucinated,
  });
  return [
    ...order.slice(0, half).map((r) => make(r, false)),
    ...order.slice(half, 2 * half).map((r) => make(r, true)),
  ];
}

module.exports = {
  loadRagTruth,
  sampleRagTruth,
  loadHaluEvalQA,
  sampleHaluEval,
  mulberry32,
  shuffle,
};
