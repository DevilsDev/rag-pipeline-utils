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
  function computeBLEU(_candidate, _reference) {
    const candCounts = _candidate.reduce((acc, t) => (acc[t] = (acc[t] || 0) + 1, acc), {});
    const refCounts = _reference.reduce((acc, t) => (acc[t] = (acc[t] || 0) + 1, acc), {});
  
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
    const dp = Array(m + 1).fill(null).map(() => Array(n + 1).fill(0));
  
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
      rouge: computeROUGE(candTokens, refTokens)
    };
  }
  
  

// Default export



module.exports = {
  computeBLEU,
  computeROUGE,
  scoreAnswer
};