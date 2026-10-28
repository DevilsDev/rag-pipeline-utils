'use strict';

const { tokenize, splitSentences, computeSupportScore } = require('./scoring');

/**
 * Compute context precision: the fraction of retrieved documents that are relevant to the query.
 *
 * @param {string} query - The user query
 * @param {Array<{content: string}>} retrievedDocs - Array of retrieved documents
 * @param {object} [options={}] - Configuration options
 * @param {number} [options.threshold=0.2] - Minimum share of query content terms a doc must contain to be considered relevant
 * @returns {{ score: number, relevantDocs: number, totalDocs: number, perDocScores: Array<{ index: number, score: number, isRelevant: boolean }> }}
 */
function computeContextPrecision(query, retrievedDocs, options = {}) {
  const { threshold = 0.2 } = options;

  if (!query || typeof query !== 'string' || query.trim().length === 0) {
    return { score: 0, relevantDocs: 0, totalDocs: 0, perDocScores: [] };
  }

  if (!Array.isArray(retrievedDocs) || retrievedDocs.length === 0) {
    return { score: 0, relevantDocs: 0, totalDocs: 0, perDocScores: [] };
  }

  const queryTokens = tokenize(query);
  const perDocScores = [];

  for (let i = 0; i < retrievedDocs.length; i++) {
    const doc = retrievedDocs[i];
    const docContent = doc && (doc.content || doc.text || '');

    if (!docContent) {
      perDocScores.push({ index: i, score: 0, isRelevant: false });
      continue;
    }

    const docTokens = tokenize(docContent);
    // Share of the query's content terms that the document contains.
    const score = computeSupportScore(queryTokens, docTokens);
    perDocScores.push({ index: i, score, isRelevant: score >= threshold });
  }

  const relevantDocs = perDocScores.filter((d) => d.isRelevant).length;
  const totalDocs = perDocScores.length;
  const score = totalDocs > 0 ? relevantDocs / totalDocs : 0;

  return { score, relevantDocs, totalDocs, perDocScores };
}

/**
 * Compute context recall: the fraction of the claims in a REFERENCE
 * (ground-truth) answer that the retrieved documents support. It measures
 * whether retrieval found everything needed to answer correctly; pass the
 * expected answer, not the generated one (scoring the generated answer
 * against the documents is faithfulness).
 *
 * A claim is one sentence of the reference answer. It is supported when some
 * document scores at least `threshold` with computeSupportScore, including
 * the numeric consistency check.
 *
 * @param {string} referenceAnswer - The reference (ground-truth) answer text
 * @param {Array<{content: string}>} retrievedDocs - Array of retrieved documents
 * @param {object} [options={}] - Configuration options
 * @param {number} [options.threshold=0.5] - Minimum share of a claim's content terms a doc must contain to support it
 * @returns {{ score: number, supportedClaims: number, totalClaims: number, details: Array<{ claim: string, score: number, isSupported: boolean, bestDocIndex: number }> }}
 */
function computeContextRecall(referenceAnswer, retrievedDocs, options = {}) {
  const { threshold = 0.5 } = options;

  if (
    !referenceAnswer ||
    typeof referenceAnswer !== 'string' ||
    referenceAnswer.trim().length === 0
  ) {
    return { score: 0, supportedClaims: 0, totalClaims: 0, details: [] };
  }

  const claims = splitSentences(referenceAnswer);

  if (claims.length === 0) {
    return { score: 0, supportedClaims: 0, totalClaims: 0, details: [] };
  }

  if (!Array.isArray(retrievedDocs) || retrievedDocs.length === 0) {
    const details = claims.map((claim) => ({
      claim,
      score: 0,
      isSupported: false,
      bestDocIndex: -1,
    }));
    return {
      score: 0,
      supportedClaims: 0,
      totalClaims: claims.length,
      details,
    };
  }

  const details = claims.map((claim) => {
    const claimTokens = tokenize(claim);
    let bestScore = 0;
    let bestDocIndex = -1;

    for (let i = 0; i < retrievedDocs.length; i++) {
      const doc = retrievedDocs[i];
      const docContent = doc && (doc.content || doc.text || '');

      if (!docContent) {
        continue;
      }

      const docTokens = tokenize(docContent);
      const similarity = computeSupportScore(claimTokens, docTokens, null, {
        claimText: claim,
        docText: docContent,
      });

      if (similarity > bestScore) {
        bestScore = similarity;
        bestDocIndex = i;
      }
    }

    return {
      claim,
      score: bestScore,
      isSupported: bestScore >= threshold,
      bestDocIndex,
    };
  });

  const supportedClaims = details.filter((d) => d.isSupported).length;
  const totalClaims = details.length;
  const score = totalClaims > 0 ? supportedClaims / totalClaims : 0;

  return { score, supportedClaims, totalClaims, details };
}

module.exports = { computeContextPrecision, computeContextRecall };
