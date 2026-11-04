/**
 * Labelled sets for the guardrail benchmark, as evaluateDetectors() cases.
 *
 * - deepset/prompt-injections, test split: 116 prompts labelled injection
 *   or not; some are in German, some mix languages (Apache-2.0).
 * - jackhhao/jailbreak-classification, test split: 262 prompts labelled
 *   jailbreak or benign (Apache-2.0). A jailbreak (a role-play prompt that
 *   talks a model out of its rules) is not the same task as a prompt
 *   injection, so this set is reported on its own.
 * - gretelai/synthetic_pii_finance_multilingual, English test split: 2,891
 *   synthetic financial documents with labelled PII spans (Apache-2.0).
 * - benchmarks/fixtures/rag-attacks.jsonl: 40 cases written for this
 *   project (indirect injection in retrieved documents, poisoned chunks,
 *   benign look-alikes). Illustrative, not a benchmark.
 *
 * The Hugging Face files are downloaded on first use from pinned commits
 * into benchmarks/.data/ (gitignored), and checked against their SHA-256.
 */

"use strict";

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const HF = "https://huggingface.co/datasets";

const SOURCES = {
  deepset: {
    dataset: "deepset/prompt-injections (test split)",
    license: "Apache-2.0",
    revision: "4f61ecb038e9c3fb77e21034b22511b523772cdd",
    file: "data/test-00000-of-00001-701d16158af87368.parquet",
    sha256: "39ac797cabc157eeed58435a08593b2952bb6cb16fc394a2d383f447cc7b246e",
    repo: "deepset/prompt-injections",
  },
  jackhhao: {
    dataset: "jackhhao/jailbreak-classification (test split)",
    license: "Apache-2.0",
    revision: "2f2ceeb39658696fd3f462403562b6eea5306287",
    // The dataset's test split, as its README configures it
    file: "balanced/jailbreak_dataset_test_balanced.csv",
    sha256: "809ef0d7c82fa05c31e818e9c3ff68f769632ac6d11cc3b43254cada577869a9",
    repo: "jackhhao/jailbreak-classification",
  },
  gretel: {
    dataset: "gretelai/synthetic_pii_finance_multilingual (English test split)",
    license: "Apache-2.0",
    revision: "7b844d16738527a04264f50214cb426a4cea0897",
    file: "data/English_test-00000-of-00001.parquet",
    sha256: "c02b06d3c5b7c375525136d6f74acc52ab8fc07fa863d0aa50734910ec0ef2ad",
    repo: "gretelai/synthetic_pii_finance_multilingual",
  },
};

const DEFAULT_DIR = path.join(__dirname, ".data", "guardrails");

const sha256 = (buffer) =>
  crypto.createHash("sha256").update(buffer).digest("hex");

async function ensureFile(dir, key) {
  const s = SOURCES[key];
  const url = `${HF}/${s.repo}/resolve/${s.revision}/${s.file}`;
  const file = path.join(dir, `${key}${path.extname(s.file)}`);
  if (!fs.existsSync(file)) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Download failed (${res.status}): ${url}`);
    const buffer = Buffer.from(await res.arrayBuffer());
    if (sha256(buffer) !== s.sha256) {
      throw new Error(
        `${s.file} from ${url} does not match its pinned SHA-256`,
      );
    }
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(file, buffer);
  }
  const buffer = fs.readFileSync(file);
  if (sha256(buffer) !== s.sha256) {
    throw new Error(`${file} does not match its pinned SHA-256; delete it`);
  }
  return buffer;
}

async function readParquet(buffer, columns) {
  const { parquetReadObjects } = await import("hyparquet");
  const file = buffer.buffer.slice(
    buffer.byteOffset,
    buffer.byteOffset + buffer.byteLength,
  );
  return parquetReadObjects({ file, columns });
}

const source = (key) => {
  const { repo: _repo, ...rest } = SOURCES[key];
  return rest;
};

/** deepset/prompt-injections test split: label 1 is an injection. */
async function loadDeepset(dir = DEFAULT_DIR) {
  const rows = await readParquet(await ensureFile(dir, "deepset"), [
    "text",
    "label",
  ]);
  return {
    source: source("deepset"),
    cases: rows.map((r, i) => ({
      id: `deepset-${i}`,
      kind: "injection",
      text: String(r.text),
      flagged: Number(r.label) === 1,
    })),
  };
}

/** jackhhao/jailbreak-classification test split: type is jailbreak or benign. */
async function loadJailbreaks(dir = DEFAULT_DIR) {
  const { parse } = require("csv-parse/sync");
  const rows = parse(await ensureFile(dir, "jackhhao"), {
    columns: true,
    skip_empty_lines: true,
  });
  return {
    source: source("jackhhao"),
    cases: rows.map((r, i) => {
      if (r.type !== "jailbreak" && r.type !== "benign") {
        throw new Error(`jackhhao row ${i + 1}: unexpected type "${r.type}"`);
      }
      return {
        id: `jackhhao-${i}`,
        kind: "injection",
        text: r.prompt,
        flagged: r.type === "jailbreak",
      };
    }),
  };
}

/**
 * The Gretel labels that the built-in PII patterns are meant to find, and
 * the pattern label for each. The other labels (names, companies, street
 * addresses, dates...) are reported as not covered.
 */
const PATTERN_PII_COVERS = {
  email: "email",
  phone_number: "phone",
  ssn: "ssn",
  credit_card_number: "creditCard",
};

/** Gretel English test split: every document, with its labelled spans. */
async function loadGretel(dir = DEFAULT_DIR) {
  const rows = await readParquet(await ensureFile(dir, "gretel"), [
    "generated_text",
    "pii_spans",
  ]);
  return {
    source: source("gretel"),
    cases: rows.map((r, i) => ({
      id: `gretel-${i}`,
      kind: "pii",
      text: String(r.generated_text),
      spans: JSON.parse(r.pii_spans).map((s) => ({
        label: s.label,
        start: s.start,
        end: s.end,
      })),
    })),
  };
}

/** The project's RAG attack fixtures. */
function loadRagFixtures() {
  const file = path.join(__dirname, "fixtures", "rag-attacks.jsonl");
  const text = fs.readFileSync(file, "utf8");
  return {
    source: {
      dataset: "benchmarks/fixtures/rag-attacks.jsonl",
      license: "Apache-2.0, this repository",
      note: "Written for this project before any detector was run on it, by an author who knew the built-in pattern rules (one case is a sentence chosen earlier because the patterns miss it), so the comparison on these cases is a demonstration, not a fair test.",
      sha256: sha256(Buffer.from(text)),
    },
    cases: text
      .split(/\r?\n/)
      .filter((l) => l.trim())
      .map((l) => JSON.parse(l)),
  };
}

module.exports = {
  loadDeepset,
  loadJailbreaks,
  loadGretel,
  loadRagFixtures,
  PATTERN_PII_COVERS,
};
