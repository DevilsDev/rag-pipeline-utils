/**
 * Ranking metrics for the retrieval-quality benchmark, as BEIR and
 * trec_eval define them for binary or graded relevance judgements.
 *
 * `ranked` is a list of document ids, best first. `relevant` maps each
 * relevant document id to its grade (> 0); ids not in it are not relevant.
 */

"use strict";

/** Normalized discounted cumulative gain over the top k. */
function ndcgAtK(ranked, relevant, k) {
  let dcg = 0;
  ranked.slice(0, k).forEach((id, i) => {
    const gain = relevant.get(id) || 0;
    if (gain > 0) dcg += gain / Math.log2(i + 2);
  });
  const ideal = [...relevant.values()]
    .filter((g) => g > 0)
    .sort((a, b) => b - a)
    .slice(0, k);
  const idcg = ideal.reduce((sum, g, i) => sum + g / Math.log2(i + 2), 0);
  return idcg === 0 ? 0 : dcg / idcg;
}

/** Share of the relevant documents found in the top k. */
function recallAtK(ranked, relevant, k) {
  const wanted = [...relevant].filter(([, g]) => g > 0).map(([id]) => id);
  if (wanted.length === 0) return 0;
  const top = new Set(ranked.slice(0, k));
  return wanted.filter((id) => top.has(id)).length / wanted.length;
}

/** Reciprocal rank of the first relevant document in the top k, else 0. */
function mrrAtK(ranked, relevant, k) {
  const i = ranked.slice(0, k).findIndex((id) => (relevant.get(id) || 0) > 0);
  return i === -1 ? 0 : 1 / (i + 1);
}

/**
 * Mean of each metric over all judged queries. A query with no results
 * scores 0, so a retriever can't gain by skipping hard queries.
 * @param {Map<string, string[]>} runs - query id -> ranked document ids
 * @param {Map<string, Map<string, number>>} qrels - query id -> judgements
 */
function evaluateRuns(runs, qrels) {
  const sums = { ndcg10: 0, recall10: 0, recall100: 0, mrr10: 0 };
  for (const [queryId, relevant] of qrels) {
    const ranked = runs.get(queryId) || [];
    sums.ndcg10 += ndcgAtK(ranked, relevant, 10);
    sums.recall10 += recallAtK(ranked, relevant, 10);
    sums.recall100 += recallAtK(ranked, relevant, 100);
    sums.mrr10 += mrrAtK(ranked, relevant, 10);
  }
  const n = qrels.size;
  return Object.fromEntries(
    Object.entries(sums).map(([k, v]) => [k, n ? v / n : 0]),
  );
}

module.exports = { ndcgAtK, recallAtK, mrrAtK, evaluateRuns };
