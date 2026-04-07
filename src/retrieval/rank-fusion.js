'use strict';

const DEFAULT_CONFIG = { k: 60 };

/**
 * Reciprocal Rank Fusion - merges multiple ranked result lists
 * @param {Array<Array>} resultSets - Array of result arrays, each result has {id, score, ...}
 * @param {object} options - {k: 60, weights: number[] (per result set)}
 * @returns {Array} Fused, deduplicated, sorted results
 */
function reciprocalRankFusion(resultSets, options = {}) {
  const { k = DEFAULT_CONFIG.k, weights } = options;

  if (!Array.isArray(resultSets) || resultSets.length === 0) {
    return [];
  }

  /** @type {Map<string, {score: number, fields: object}>} */
  const scoreMap = new Map();

  for (let setIndex = 0; setIndex < resultSets.length; setIndex++) {
    const results = resultSets[setIndex];
    if (!Array.isArray(results)) {
      continue;
    }

    const weight =
      Array.isArray(weights) && weights[setIndex] != null
        ? weights[setIndex]
        : 1.0;

    for (let rank = 0; rank < results.length; rank++) {
      const doc = results[rank];
      if (!doc || doc.id == null) {
        continue;
      }

      const id = String(doc.id);
      const rrfScore = weight / (k + rank);

      if (scoreMap.has(id)) {
        const entry = scoreMap.get(id);
        entry.score += rrfScore;
      } else {
        // Copy all original fields except score
        const { score: _origScore, ...rest } = doc;
        scoreMap.set(id, { score: rrfScore, fields: rest });
      }
    }
  }

  const fused = [];
  for (const [id, entry] of scoreMap) {
    fused.push({ ...entry.fields, id, score: entry.score });
  }

  fused.sort((a, b) => b.score - a.score);

  return fused;
}

module.exports = { reciprocalRankFusion, DEFAULT_CONFIG };
