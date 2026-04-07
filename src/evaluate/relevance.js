'use strict';

const { tokenize, computeJaccardSimilarity } = require('./scoring');

/**
 * Common English stopwords to skip when measuring query token coverage.
 * Only tokens longer than 3 characters are considered, but these are
 * additionally excluded to avoid inflating coverage scores.
 * @type {Set<string>}
 */
const STOPWORDS = new Set([
  'the',
  'that',
  'this',
  'with',
  'from',
  'have',
  'been',
  'will',
  'would',
  'could',
  'should',
  'does',
  'what',
  'when',
  'where',
  'which',
  'their',
  'there',
  'they',
  'them',
  'then',
  'than',
  'these',
  'those',
  'your',
  'about',
  'into',
  'each',
  'also',
  'more',
  'some',
  'such',
  'only',
  'over',
  'very',
  'just',
  'being',
  'were',
  'here',
]);

/**
 * Compute answer relevance score measuring how well the answer addresses the query.
 * Combines Jaccard similarity with query token coverage for a balanced metric.
 *
 * @param {string} query - The user query
 * @param {string} answer - The generated answer text
 * @param {object} [options={}] - Configuration options
 * @param {number} [options.jaccardWeight=0.5] - Weight for Jaccard similarity component
 * @param {number} [options.coverageWeight=0.5] - Weight for query token coverage component
 * @returns {{ score: number, jaccardSimilarity: number, queryTokensCovered: number, totalQueryTokens: number, missingQueryTerms: string[] }}
 */
function computeAnswerRelevance(query, answer, options = {}) {
  const { jaccardWeight = 0.5, coverageWeight = 0.5 } = options;

  if (!query || typeof query !== 'string' || query.trim().length === 0) {
    return {
      score: 0,
      jaccardSimilarity: 0,
      queryTokensCovered: 0,
      totalQueryTokens: 0,
      missingQueryTerms: [],
    };
  }

  if (!answer || typeof answer !== 'string' || answer.trim().length === 0) {
    const significantQueryTokens = tokenize(query).filter(
      (t) => t.length > 3 && !STOPWORDS.has(t),
    );
    return {
      score: 0,
      jaccardSimilarity: 0,
      queryTokensCovered: 0,
      totalQueryTokens: significantQueryTokens.length,
      missingQueryTerms: [...new Set(significantQueryTokens)],
    };
  }

  const queryTokens = tokenize(query);
  const answerTokens = tokenize(answer);

  // Jaccard similarity between full token sets
  const jaccardSimilarity = computeJaccardSimilarity(queryTokens, answerTokens);

  // Query token coverage: filter to significant query tokens (length > 3, not stopwords)
  const significantQueryTokens = queryTokens.filter(
    (t) => t.length > 3 && !STOPWORDS.has(t),
  );

  const answerTokenSet = new Set(answerTokens);
  const coveredTokens = significantQueryTokens.filter((t) =>
    answerTokenSet.has(t),
  );
  const totalQueryTokens = significantQueryTokens.length;
  const queryTokensCovered = coveredTokens.length;

  const coverage =
    totalQueryTokens > 0 ? queryTokensCovered / totalQueryTokens : 0;

  // Combined score
  const score = jaccardWeight * jaccardSimilarity + coverageWeight * coverage;

  // Missing query terms (unique)
  const coveredSet = new Set(coveredTokens);
  const missingQueryTerms = [
    ...new Set(significantQueryTokens.filter((t) => !coveredSet.has(t))),
  ];

  return {
    score,
    jaccardSimilarity,
    queryTokensCovered,
    totalQueryTokens,
    missingQueryTerms,
  };
}

module.exports = { computeAnswerRelevance };
