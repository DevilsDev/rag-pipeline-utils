/**
 * Version: 0.1.0
 * Path: /src/evaluate/scoring.js
 * Description: Basic scoring metrics (BLEU, ROUGE-L) for RAG output evaluation
 * Author: Ali Kahwaji
 */

/**
 * Tokenize a string by words
 * @param {string} text
 * @returns {string[]}
 */
function tokenize(text) {
  // Unicode-aware: keep letters/digits in any script, drop apostrophes so
  // "don't" stays one token, and treat every other character (including
  // newlines and hyphens) as a separator.
  return String(text)
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .split(' ')
    .filter(Boolean);
}

/**
 * Compute BLEU-1 score: unigram precision
 * @param {string[]} candidate - Generated tokens
 * @param {string[]} reference - Reference tokens
 * @returns {number}
 */
function computeBLEU(_candidate, _reference) {
  const candCounts = _candidate.reduce(
    (acc, t) => ((acc[t] = (acc[t] || 0) + 1), acc),
    {},
  );
  const refCounts = _reference.reduce(
    (acc, t) => ((acc[t] = (acc[t] || 0) + 1), acc),
    {},
  );

  let match = 0;
  for (const token of Object.keys(candCounts)) {
    match += Math.min(candCounts[token], refCounts[token] || 0);
  }
  return _candidate.length ? match / _candidate.length : 0;
}

/**
 * Compute ROUGE-L (Longest Common Subsequence) recall
 * @param {string[]} candidate
 * @param {string[]} reference
 * @returns {number}
 */
function computeROUGE(_candidate, _reference) {
  const m = _candidate.length;
  const n = _reference.length;
  const dp = Array(m + 1)
    .fill(null)
    .map(() => Array(n + 1).fill(0));

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (_candidate[i - 1] === _reference[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }

  const lcs = dp[m][n];
  return _reference.length ? lcs / _reference.length : 0;
}

/**
 * Score a prompt-answer pair using multiple metrics
 * @param {string} actual - LLM response
 * @param {string} expected - Reference answer
 * @returns {{ bleu: number, rouge: number }}
 */
function scoreAnswer(_actual, _expected) {
  const candTokens = tokenize(_actual);
  const refTokens = tokenize(_expected);
  return {
    bleu: computeBLEU(candTokens, refTokens),
    rouge: computeROUGE(candTokens, refTokens),
  };
}

/**
 * Split text into sentences on sentence-ending punctuation
 * @param {string} text
 * @returns {string[]}
 */
function splitSentences(text) {
  if (!text || typeof text !== 'string') return [];
  return text.split(/(?<=[.!?])\s+/).filter((s) => s.trim().length > 0);
}

/**
 * Compute Jaccard similarity between two token arrays
 * @param {string[]} tokensA
 * @param {string[]} tokensB
 * @returns {number} Similarity score between 0 and 1
 */
function computeJaccardSimilarity(tokensA, tokensB) {
  if (!tokensA.length || !tokensB.length) return 0;
  const setA = new Set(tokensA);
  const setB = new Set(tokensB);
  const intersection = new Set([...setA].filter((x) => setB.has(x)));
  const union = new Set([...setA, ...setB]);
  return intersection.size / union.size;
}

/**
 * Common English function words. Ignored when measuring how much of a
 * sentence a document supports, so "the" and "is" cannot ground a claim.
 */
const STOPWORDS = new Set(
  (
    'a an and are as at be been but by can could did do does for from had has ' +
    'have he her his how i if in into is it its may me might must my no not ' +
    'of on or our she should so than that the their them then there these ' +
    'they this those to was we were what when where which while who why will ' +
    'with would you your'
  ).split(' '),
);

/**
 * Content tokens of a sentence: tokens minus stopwords. Falls back to all
 * tokens when nothing is left (e.g. "Yes."), so short sentences are still
 * scored rather than skipped.
 *
 * @param {string[]} tokens
 * @returns {string[]}
 */
function contentTokens(tokens) {
  const content = tokens.filter((t) => !STOPWORDS.has(t));
  return content.length > 0 ? content : tokens;
}

/**
 * How much of a claim is supported by a document: the (optionally
 * IDF-weighted) fraction of the claim's unique content tokens that appear in
 * the document. Unlike Jaccard against the whole document, this does not
 * shrink as the document gets longer, so a sentence copied verbatim from a
 * long chunk scores 1.
 *
 * @param {string[]} claimTokens - Tokens of the sentence/claim/query
 * @param {string[]|Set<string>} docTokens - Tokens of the document
 * @param {Map<string, number>|null} [idfWeights] - Optional token weights
 * @returns {number} Support score between 0 and 1
 */
function computeSupportScore(claimTokens, docTokens, idfWeights = null) {
  const claim = [...new Set(contentTokens(claimTokens))];
  if (claim.length === 0) return 0;
  const docSet = docTokens instanceof Set ? docTokens : new Set(docTokens);

  let matched = 0;
  let total = 0;
  for (const token of claim) {
    const weight = idfWeights ? (idfWeights.get(token) ?? 1) : 1;
    total += weight;
    if (docSet.has(token)) matched += weight;
  }
  return total > 0 ? matched / total : 0;
}

module.exports = {
  STOPWORDS,
  contentTokens,
  computeSupportScore,
  scoreAnswer,
  tokenize,
  computeBLEU,
  computeROUGE,
  splitSentences,
  computeJaccardSimilarity,
};
