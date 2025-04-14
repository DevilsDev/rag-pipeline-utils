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
    return text.toLowerCase().replace(/[^a-z0-9 ]/g, '').split(/\s+/).filter(Boolean);
  }
  
  /**
   * Compute BLEU-1 score: unigram precision
   * @param {string[]} candidate - Generated tokens
   * @param {string[]} reference - Reference tokens
   * @returns {number}
   */
  export function computeBLEU(candidate, reference) {
    const candCounts = candidate.reduce((acc, t) => (acc[t] = (acc[t] || 0) + 1, acc), {});
    const refCounts = reference.reduce((acc, t) => (acc[t] = (acc[t] || 0) + 1, acc), {});
  
    let match = 0;
    for (const token of Object.keys(candCounts)) {
      match += Math.min(candCounts[token], refCounts[token] || 0);
    }
    return candidate.length ? match / candidate.length : 0;
  }
  
  /**
   * Compute ROUGE-L (Longest Common Subsequence) recall
   * @param {string[]} candidate
   * @param {string[]} reference
   * @returns {number}
   */
  export function computeROUGE(candidate, reference) {
    const m = candidate.length;
    const n = reference.length;
    const dp = Array(m + 1).fill(null).map(() => Array(n + 1).fill(0));
  
    for (let i = 1; i <= m; i++) {
      for (let j = 1; j <= n; j++) {
        if (candidate[i - 1] === reference[j - 1]) {
          dp[i][j] = dp[i - 1][j - 1] + 1;
        } else {
          dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
        }
      }
    }
  
    const lcs = dp[m][n];
    return reference.length ? lcs / reference.length : 0;
  }
  
  /**
   * Score a prompt-answer pair using multiple metrics
   * @param {string} actual - LLM response
   * @param {string} expected - Reference answer
   * @returns {{ bleu: number, rouge: number }}
   */
  export function scoreAnswer(actual, expected) {
    const candTokens = tokenize(actual);
    const refTokens = tokenize(expected);
    return {
      bleu: computeBLEU(candTokens, refTokens),
      rouge: computeROUGE(candTokens, refTokens)
    };
  }
  
  