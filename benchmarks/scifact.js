/**
 * BEIR SciFact for the retrieval-quality benchmark: 5,183 abstracts, and
 * 300 test claims with relevance judgements.
 *
 * The data is CC BY-SA 4.0, so it is not committed or published with the
 * package. It is downloaded on first use from pinned Hugging Face
 * revisions into benchmarks/.data/ (gitignored), and every file is checked
 * against its SHA-256 before it is read.
 */

"use strict";

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const HF = "https://huggingface.co/datasets/BeIR";
const DATASET_REVISION = "b3b5335604bf5ee3c4447671af975ea25143d4f5";
const QRELS_REVISION = "2938d17dc3b09882fdb8c12bbbe2e2dc0e75a029";

const FILES = {
  "corpus.parquet": {
    url: `${HF}/scifact/resolve/${DATASET_REVISION}/corpus/corpus-00000-of-00001.parquet`,
    sha256: "243324b35f03d82bd6d98a5f575966876e86cad7ce16e5333a35b1b793dc4f45",
  },
  "queries.parquet": {
    url: `${HF}/scifact/resolve/${DATASET_REVISION}/queries/queries-00000-of-00001.parquet`,
    sha256: "1c37956c5dc8b810b60302323c24d1a9e79e26411ba8f5ad9d0888642e2a9034",
  },
  "test.tsv": {
    url: `${HF}/scifact-qrels/resolve/${QRELS_REVISION}/test.tsv`,
    sha256: "0864bb985e0ca2367ba217977e72004d549054b2b06666ed9d4825ac7c21284c",
  },
};

const sha256 = (buffer) =>
  crypto.createHash("sha256").update(buffer).digest("hex");

async function ensureFile(dir, name) {
  const { url, sha256: expected } = FILES[name];
  const file = path.join(dir, name);
  if (!fs.existsSync(file)) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Download failed (${res.status}): ${url}`);
    const buffer = Buffer.from(await res.arrayBuffer());
    if (sha256(buffer) !== expected) {
      throw new Error(`${name} from ${url} does not match its pinned SHA-256`);
    }
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(file, buffer);
  }
  const buffer = fs.readFileSync(file);
  if (sha256(buffer) !== expected) {
    throw new Error(`${file} does not match its pinned SHA-256; delete it`);
  }
  return buffer;
}

async function readParquet(buffer) {
  const { parquetReadObjects } = await import("hyparquet");
  const file = buffer.buffer.slice(
    buffer.byteOffset,
    buffer.byteOffset + buffer.byteLength,
  );
  return parquetReadObjects({ file, columns: ["_id", "title", "text"] });
}

/**
 * @param {string} [dir] - Where to keep the downloaded files
 * @returns {Promise<{documents: Array<{id: string, content: string}>,
 *   queries: Map<string, string>, qrels: Map<string, Map<string, number>>,
 *   source: object}>}
 */
async function loadSciFact(dir = path.join(__dirname, ".data", "scifact")) {
  const [corpus, queryRows, qrelsTsv] = await Promise.all([
    ensureFile(dir, "corpus.parquet").then(readParquet),
    ensureFile(dir, "queries.parquet").then(readParquet),
    ensureFile(dir, "test.tsv"),
  ]);

  // BEIR indexes title and text together
  const documents = corpus.map((row) => ({
    id: String(row._id),
    content: `${row.title || ""} ${row.text || ""}`.trim(),
  }));

  const qrels = new Map();
  for (const line of qrelsTsv.toString("utf8").split("\n").slice(1)) {
    const [queryId, docId, score] = line.trim().split("\t");
    if (!queryId) continue;
    if (!qrels.has(queryId)) qrels.set(queryId, new Map());
    qrels.get(queryId).set(docId, Number(score));
  }

  const allQueries = new Map(queryRows.map((r) => [String(r._id), r.text]));
  const queries = new Map(
    [...qrels.keys()].map((id) => {
      if (!allQueries.has(id)) throw new Error(`No text for query ${id}`);
      return [id, allQueries.get(id)];
    }),
  );

  return {
    documents,
    queries,
    qrels,
    source: {
      dataset: "BEIR SciFact (test split)",
      license: "CC BY-SA 4.0",
      revisions: { scifact: DATASET_REVISION, qrels: QRELS_REVISION },
      sha256: Object.fromEntries(
        Object.entries(FILES).map(([name, f]) => [name, f.sha256]),
      ),
    },
  };
}

module.exports = { loadSciFact };
