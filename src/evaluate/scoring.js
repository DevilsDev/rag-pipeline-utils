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

/** Values of English number words. "one" is left out on purpose: it is far
 * more often a pronoun ("no one", "one of") than a quantity. */
const NUMBER_WORDS = {
  zero: 0,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
  thirteen: 13,
  fourteen: 14,
  fifteen: 15,
  sixteen: 16,
  seventeen: 17,
  eighteen: 18,
  nineteen: 19,
  twenty: 20,
  thirty: 30,
  forty: 40,
  fifty: 50,
  sixty: 60,
  seventy: 70,
  eighty: 80,
  ninety: 90,
};
/** Multipliers; "one" counts as 1 only inside a run ("one hundred"). */
const NUMBER_SCALES = {
  hundred: 100,
  thousand: 1000,
  million: 1e6,
  billion: 1e9,
  trillion: 1e12,
};

/**
 * Digit numbers, optionally with thousands separators or a decimal part (a
 * trailing "%" is ignored). The lookbehind skips digits glued to letters (BM25).
 */
const DIGIT_NUMBER_RE = /(?<![\p{L}\p{N}])\d+(?:[.,]\d+)*/gu;

/**
 * Turn one run of number words into its value: "twenty five" -> 25,
 * "two hundred" -> 200, "three thousand four hundred" -> 3400.
 *
 * @param {string[]} words
 * @returns {number}
 */
function parseNumberWords(words) {
  let total = 0;
  let current = 0;
  for (const w of words) {
    if (w === 'one') current += 1;
    else if (w in NUMBER_WORDS) current += NUMBER_WORDS[w];
    else if (w === 'hundred') current = (current || 1) * 100;
    else {
      total += (current || 1) * NUMBER_SCALES[w];
      current = 0;
    }
  }
  return total + current;
}

/**
 * Extract the numbers stated in a text, as normalised value strings, so
 * "20", "20%", "twenty" and "Twenty" all yield "20", "1,000" yields "1000"
 * and "2.5" yields "2.5".
 *
 * @param {string} text
 * @returns {{ values: string[], parts: string[] }} values: one entry per
 *   number as written; parts: values plus each number word on its own
 *   (used on the document side so "twenty-five" also supports "20" and "5"
 *   is not required)
 */
function extractNumbers(text) {
  const values = [];
  const parts = [];
  if (!text || typeof text !== 'string') return { values, parts };

  for (const match of text.matchAll(DIGIT_NUMBER_RE)) {
    const raw = match[0];
    const pieces = /^\d{1,3}(,\d{3})+(\.\d+)?$/.test(raw)
      ? [raw.replace(/,/g, '')]
      : raw.split(',');
    for (const piece of pieces) {
      const n = Number(piece);
      if (Number.isFinite(n)) values.push(String(n));
    }
  }

  const words = text.toLowerCase().split(/[^\p{L}]+/u);
  let run = [];
  const flush = () => {
    // "and" only joins a run ("two hundred and five"); never ends one.
    while (run.length && run[run.length - 1] === 'and') run.pop();
    // A lone "one" is not treated as a number (see NUMBER_WORDS).
    if (run.length && !(run.length === 1 && run[0] === 'one')) {
      const numberWords = run.filter((w) => w !== 'and');
      values.push(String(parseNumberWords(numberWords)));
      for (const w of numberWords) {
        if (w in NUMBER_WORDS) parts.push(String(NUMBER_WORDS[w]));
      }
    }
    run = [];
  };
  for (const w of words) {
    const last = run[run.length - 1];
    const isNumberWord =
      w in NUMBER_WORDS ||
      w in NUMBER_SCALES ||
      w === 'one' ||
      (w === 'and' && last in NUMBER_SCALES);
    if (isNumberWord) {
      run.push(w);
    } else {
      flush();
    }
  }
  flush();

  return { values, parts: [...values, ...parts] };
}

/**
 * Numeric consistency between a claim and a document: every number the claim
 * states (digits, decimals, percentages or number words) must also appear in
 * the document. Lexical overlap alone would ground "thirty days" against a
 * source that says "twenty days".
 *
 * @param {string} claimText
 * @param {string} docText
 * @returns {{ consistent: boolean, claimNumbers: string[], missing: string[] }}
 */
function checkNumericConsistency(claimText, docText) {
  const claimNumbers = [...new Set(extractNumbers(claimText).values)];
  if (claimNumbers.length === 0) {
    return { consistent: true, claimNumbers, missing: [] };
  }
  const docNumbers = new Set(extractNumbers(docText).parts);
  const missing = claimNumbers.filter((n) => !docNumbers.has(n));
  return { consistent: missing.length === 0, claimNumbers, missing };
}

/**
 * Multiplier applied to the support score when a claim states numbers the
 * document does not contain. Together with the share of matching numbers it
 * keeps the score below 0.4, i.e. under the default 0.5 support threshold.
 */
const NUMERIC_MISMATCH_FACTOR = 0.4;

/**
 * How much of a claim is supported by a document: the (optionally
 * IDF-weighted) fraction of the claim's unique content tokens that appear in
 * the document. Unlike Jaccard against the whole document, this does not
 * shrink as the document gets longer, so a sentence copied verbatim from a
 * long chunk scores 1.
 *
 * Numeric consistency: when `options.claimText` and `options.docText` are
 * given and the claim states a number the document does not contain (see
 * checkNumericConsistency), the score becomes
 *   lexicalScore * NUMERIC_MISMATCH_FACTOR (0.4) * matchedNumbers / claimNumbers
 * which is always below 0.4, so the claim fails the default 0.5 threshold.
 *
 * @param {string[]} claimTokens - Tokens of the sentence/claim/query
 * @param {string[]|Set<string>} docTokens - Tokens of the document
 * @param {Map<string, number>|null} [idfWeights] - Optional token weights
 * @param {{ claimText?: string, docText?: string }} [options] - Raw texts
 *   enabling the numeric consistency check
 * @returns {number} Support score between 0 and 1
 */
function computeSupportScore(
  claimTokens,
  docTokens,
  idfWeights = null,
  options = {},
) {
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
  let score = total > 0 ? matched / total : 0;

  const { claimText, docText } = options || {};
  if (
    score > 0 &&
    typeof claimText === 'string' &&
    typeof docText === 'string'
  ) {
    const numeric = checkNumericConsistency(claimText, docText);
    if (!numeric.consistent) {
      const share =
        (numeric.claimNumbers.length - numeric.missing.length) /
        numeric.claimNumbers.length;
      score *= NUMERIC_MISMATCH_FACTOR * share;
    }
  }
  return score;
}

module.exports = {
  STOPWORDS,
  contentTokens,
  computeSupportScore,
  checkNumericConsistency,
  extractNumbers,
  NUMERIC_MISMATCH_FACTOR,
  scoreAnswer,
  tokenize,
  computeBLEU,
  computeROUGE,
  splitSentences,
  computeJaccardSimilarity,
};
