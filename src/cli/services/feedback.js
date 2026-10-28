"use strict";

/**
 * Relevance feedback for `rag-pipeline ai feedback` / `ai search`.
 *
 * Feedback is stored as JSON next to the index. Scoring is deterministic and
 * explainable: every stored vote for a result's docId contributes
 *
 *   sign(vote) * VOTE_WEIGHT * jaccard(terms(question), terms(votedQuestion))
 *
 * and the summed adjustment is capped to +/- MAX_ADJUSTMENT before being added
 * to the retrieval score. Votes on unrelated questions (no shared terms)
 * contribute nothing.
 */

const fs = require("fs");
const path = require("path");
const { tokenize } = require("../../evaluate/scoring");

const FORMAT_VERSION = 1;
const VOTE_WEIGHT = 0.1;
const MAX_ADJUSTMENT = 0.3;
const RATINGS = ["up", "down"];

/**
 * Where feedback lives: next to a file-store index, else <configDir>/.rag.
 *
 * @param {object} retriever - Built retriever (FileVectorStore has `path`)
 * @param {string} configDir
 * @returns {string}
 */
function feedbackPath(retriever, configDir) {
  const dir =
    retriever && typeof retriever.path === "string"
      ? path.dirname(retriever.path)
      : path.join(configDir, ".rag");
  return path.join(dir, "feedback.json");
}

/**
 * @param {string} file
 * @returns {{version: number, entries: Array<{question: string, docId: string, rating: string, at: string}>}}
 */
function loadFeedback(file) {
  if (!fs.existsSync(file)) return { version: FORMAT_VERSION, entries: [] };
  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (error) {
    throw new Error(
      `Feedback file ${file} is not valid JSON: ${error.message}`,
    );
  }
  if (parsed.version !== FORMAT_VERSION || !Array.isArray(parsed.entries)) {
    throw new Error(`Unsupported feedback file format in ${file}`);
  }
  return parsed;
}

/**
 * Append one vote and write the file atomically (temp file, then rename).
 *
 * @param {string} file
 * @param {{question: string, docId: string, rating: string}} vote
 * @returns {{entry: object, total: number}}
 */
function addFeedback(file, { question, docId, rating }) {
  if (!RATINGS.includes(rating)) {
    throw new Error(`Rating must be one of: ${RATINGS.join(", ")}`);
  }
  if (!String(question || "").trim()) throw new Error("Question is empty");
  const data = loadFeedback(file);
  const entry = { question, docId, rating, at: new Date().toISOString() };
  data.entries.push(entry);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
  fs.renameSync(tmp, file);
  return { entry, total: data.entries.length };
}

/**
 * Jaccard similarity of the two texts' token sets (0..1).
 * @param {string} a
 * @param {string} b
 * @returns {number}
 */
function termSimilarity(a, b) {
  const sa = new Set(tokenize(a));
  const sb = new Set(tokenize(b));
  if (sa.size === 0 || sb.size === 0) return 0;
  let shared = 0;
  for (const t of sa) if (sb.has(t)) shared++;
  return shared / (sa.size + sb.size - shared);
}

/**
 * Re-score retrieval results with stored feedback.
 *
 * @param {Array<{id: string, score: number}>} results - Retrieval results
 * @param {Array<{question: string, docId: string, rating: string}>} entries - Stored votes
 * @param {string} question - Current question
 * @param {object} [options]
 * @param {number} [options.voteWeight=VOTE_WEIGHT]
 * @param {number} [options.maxAdjustment=MAX_ADJUSTMENT]
 * @returns {Array<object>} Results sorted by finalScore (ties keep retrieval
 *   order), each with baseScore, adjustment, finalScore and `reasons`.
 */
function applyFeedback(results, entries, question, options = {}) {
  const voteWeight = options.voteWeight ?? VOTE_WEIGHT;
  const maxAdjustment = options.maxAdjustment ?? MAX_ADJUSTMENT;

  const scored = results.map((result, rank) => {
    const reasons = [];
    let raw = 0;
    for (const vote of entries) {
      if (vote.docId !== result.id) continue;
      const similarity = termSimilarity(question, vote.question);
      if (similarity === 0) continue;
      const contribution =
        (vote.rating === "up" ? 1 : -1) * voteWeight * similarity;
      raw += contribution;
      reasons.push({
        rating: vote.rating,
        question: vote.question,
        similarity,
        contribution,
      });
    }
    const adjustment = Math.max(-maxAdjustment, Math.min(maxAdjustment, raw));
    const baseScore = typeof result.score === "number" ? result.score : 0;
    return {
      ...result,
      baseScore,
      adjustment,
      finalScore: baseScore + adjustment,
      reasons,
      rank,
    };
  });

  scored.sort((a, b) => b.finalScore - a.finalScore || a.rank - b.rank);
  return scored.map(({ rank, ...rest }) => rest);
}

module.exports = {
  feedbackPath,
  loadFeedback,
  addFeedback,
  termSimilarity,
  applyFeedback,
  RATINGS,
  VOTE_WEIGHT,
  MAX_ADJUSTMENT,
};
