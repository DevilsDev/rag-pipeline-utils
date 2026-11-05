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
  const claimNumbers = [
    ...new Set(extractNumbers(withoutReferences(claimText)).values),
    ...claimMonths(claimText).map((m) => `month:${m}`),
  ];
  if (claimNumbers.length === 0) {
    return { consistent: true, claimNumbers, missing: [] };
  }
  const docNumbers = new Set([
    ...extractNumbers(docText).parts,
    ...docMonths(docText).map((m) => `month:${m}`),
  ]);
  const missing = claimNumbers.filter((n) => !docNumbers.has(n));
  return { consistent: missing.length === 0, claimNumbers, missing };
}

/**
 * Words after which a number names a part of the material, not a quantity
 * the source must contain: "Document 3 shows", "according to Table 2",
 * "Step 2".
 */
const REFERENCE_WORDS =
  'document|documents|doc|docs|source|sources|table|tables|figure|figures|fig|section|sections|step|steps|study|studies|appendix|chapter|page|pages|claim|claims|passage|passages|item|items|reference|ref|part|exhibit|equation|eq|line|row|column|note|footnote|paragraph';
const REFERENCE_RE = new RegExp(
  `\\b(${REFERENCE_WORDS})\\.?\\s+\\d+[a-z]?\\b`,
  'giu',
);
/** Identifiers: a number joined by a hyphen to a word (kinesin-8, ZAP-70). */
const IDENTIFIER_RE = /(\p{L}[\p{L}\p{N}]*)-(\d+)\b/gu;

/** A claim's text without reference phrases and identifier numbers. */
function withoutReferences(text) {
  if (!text || typeof text !== 'string') return text;
  return text
    .replace(REFERENCE_RE, ' ')
    .replace(IDENTIFIER_RE, (_, word) => word);
}

const MONTHS = [
  ['january', 'jan'],
  ['february', 'feb'],
  ['march', 'mar'],
  ['april', 'apr'],
  ['may'],
  ['june', 'jun'],
  ['july', 'jul'],
  ['august', 'aug'],
  ['september', 'sep', 'sept'],
  ['october', 'oct'],
  ['november', 'nov'],
  ['december', 'dec'],
];
const MONTH_OF = new Map(
  MONTHS.flatMap((names, i) => names.map((n) => [n, i + 1])),
);

/**
 * Months named next to a number ("12 May 2019", "May 12", "March 2021"):
 * the source must state the same month, by name or in a numeric date, so
 * "12 June 2019" does not pass against "12 May 2019". A month name with no
 * number beside it ("you may") is not a date.
 */
function claimMonths(text) {
  const words = String(text || '')
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);
  const out = [];
  words.forEach((w, i) => {
    const m = MONTH_OF.get(w);
    if (!m) return;
    const near = [words[i - 1], words[i + 1]].some((x) =>
      /^\d+$/.test(x || ''),
    );
    if (near) out.push(m);
  });
  return [...new Set(out)];
}

/** Months a source states: by name, or in a numeric date (either order). */
function docMonths(text) {
  const t = String(text || '');
  const out = new Set();
  for (const w of t.toLowerCase().split(/[^\p{L}]+/u)) {
    const m = MONTH_OF.get(w);
    if (m) out.add(m);
  }
  // 12/05/2019, 05/12/2019, 12.05.2019: either of the first two may be the month
  for (const [, a, b] of t.matchAll(
    /\b(\d{1,2})[/.-](\d{1,2})[/.-]\d{2,4}\b/g,
  )) {
    for (const v of [Number(a), Number(b)]) if (v >= 1 && v <= 12) out.add(v);
  }
  // 2019-05-12
  for (const [, mm] of t.matchAll(/\b\d{4}-(\d{1,2})-\d{1,2}\b/g)) {
    const v = Number(mm);
    if (v >= 1 && v <= 12) out.add(v);
  }
  return [...out];
}

/**
 * Words that negate a sentence. tokenize() drops apostrophes, so "don't" is
 * "dont" and "can't" is "cant".
 */
const NEGATION_WORDS = new Set(
  (
    'not no never none nobody nothing nowhere neither nor cannot without ' +
    'dont doesnt didnt isnt arent wasnt werent wont wouldnt shouldnt ' +
    'couldnt cant hasnt havent hadnt mustnt neednt ' +
    // German, Spanish and French ("no" is Spanish too; "n'" is dropped by
    // tokenize(), so French relies on "pas", "jamais", "rien", "aucun")
    'nicht kein keine keinen keinem keiner keines nie niemals ' +
    'nunca jamás jamas nadie nada tampoco ni ' +
    'pas jamais rien aucun aucune'
  ).split(' '),
);

/**
 * Words that start a new clause for negation scope: a negation in one
 * clause does not reach the next ("requires X but not Y", "may not use X
 * and may not park Y"). Punctuation (, ; : and brackets) also ends one.
 */
const CLAUSE_BOUNDARY_WORDS = new Set(
  'but whereas although though while however yet and or except unlike'.split(
    ' ',
  ),
);

/** A sentence's clauses, each as its tokens. */
function clauseTokens(text) {
  const out = [];
  for (const part of String(text || '').split(/[,;:()[\]]+/)) {
    let current = [];
    for (const t of tokenize(part)) {
      if (CLAUSE_BOUNDARY_WORDS.has(t)) {
        if (current.length) out.push(current);
        current = [];
      } else {
        current.push(t);
      }
    }
    if (current.length) out.push(current);
  }
  return out;
}

/**
 * A light stem for matching a claim's words to a clause: "activates" and
 * "activate", "binds" and "bind". Used only to pick the closest clause.
 */
const stem = (t) => (t.length > 4 ? t.replace(/(ing|ed|es|s|e)$/, '') : t);

/** Negation words that continue an earlier negation in the clause. */
const CONTINUING_NEGATIONS = new Set(['nor', 'ni']);

/** Negation words followed by these are not negations ("not only", "no doubt"). */
const NON_NEGATING_NEXT = {
  not: new Set(['only', 'just', 'merely']),
  no: new Set(['doubt', 'matter']),
  nothing: new Set(['but']),
};

/**
 * Whether a token list reads as negated: an odd number of negations, so
 * "not without approval" counts as positive.
 *
 * @param {string[]} tokens
 * @returns {boolean}
 */
function isNegated(tokens) {
  let count = 0;
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (!NEGATION_WORDS.has(t)) continue;
    // "never X nor Y", "nunca X ni Y": the second word continues the first
    // negation rather than cancelling it
    if (CONTINUING_NEGATIONS.has(t) && count > 0) continue;
    if (NON_NEGATING_NEXT[t] && NON_NEGATING_NEXT[t].has(tokens[i + 1])) {
      continue;
    }
    count += 1;
  }
  return count % 2 === 1;
}

/**
 * Polarity consistency between a claim and a document. Word overlap alone
 * grounds "employees never receive paid vacation" against a source that says
 * "employees receive twenty days of paid vacation", because the negation is
 * one word among many. The claim is compared with the document sentence that
 * shares most of its content words (any of them, on a tie): it is consistent
 * when that sentence is negated exactly when the claim is.
 *
 * Errs on the side of not grounding: a source that negates in other words
 * ("contractors are excluded from vacation") does not match a negated claim,
 * and a sentence joining a positive and a negative statement is judged by
 * the source sentence closest to it as a whole.
 *
 * @param {string} claimText
 * @param {string} docText
 * @returns {{ consistent: boolean, claimNegated: boolean, sourceSentence: string|null }}
 *   sourceSentence: the closest document sentence the claim was compared with
 */
function checkPolarityConsistency(claimText, docText) {
  // Negation is scoped to its clause (3.6): "requires X but not Y" negates
  // Y, not X, and "may not use X and may not park Y" has two negated
  // clauses, not an even count that reads as positive. Each clause of the
  // claim is compared with the closest clause of the document.
  const words = (tokens) => [
    ...new Set(
      contentTokens(tokens.filter((t) => !NEGATION_WORDS.has(t))).map(stem),
    ),
  ];
  const claimClauses = clauseTokens(claimText)
    .map((tokens) => ({ tokens, words: words(tokens) }))
    .filter((c) => c.words.length > 0);
  const claimNegated = claimClauses.some((c) => isNegated(c.tokens));
  if (claimClauses.length === 0) {
    return { consistent: true, claimNegated, sourceSentence: null };
  }

  const sentences = splitSentences(docText).map((sentence) => {
    const clauses = clauseTokens(sentence).map((tokens) => ({
      negated: isNegated(tokens),
      stems: new Set(tokens.map(stem)),
    }));
    const stems = new Set(clauses.flatMap((c) => [...c.stems]));
    return { sentence, clauses, stems };
  });

  /**
   * Whether one claim clause agrees with one document sentence. The claim's
   * words that occur in only one clause of the sentence decide: each such
   * clause must be negated exactly when the claim clause is ("allowed on
   * Mondays" fails against "allowed on Fridays, whereas it is not allowed
   * on Mondays", because "Mondays" is only in the negated clause). With no
   * such word, the closest clause decides.
   */
  const agrees = (clause, sentence) => {
    const negated = isNegated(clause.tokens);
    const distinctive = clause.words
      .map((w) => sentence.clauses.filter((c) => c.stems.has(w)))
      .filter((owners) => owners.length === 1)
      .map((owners) => owners[0]);
    if (distinctive.length > 0) {
      return distinctive.every((c) => c.negated === negated);
    }
    const ranked = sentence.clauses
      .map((c) => ({
        c,
        support: clause.words.filter((w) => c.stems.has(w)).length,
      }))
      .filter((r) => r.support > 0)
      .sort((a, b) => b.support - a.support);
    if (ranked.length === 0) return true;
    const best = ranked[0].support;
    return ranked
      .filter((r) => r.support === best)
      .some((r) => r.c.negated === negated);
  };

  let consistent = true;
  let sourceSentence = null;
  for (const clause of claimClauses) {
    const candidates = sentences
      .map((s) => ({
        ...s,
        support:
          clause.words.filter((w) => s.stems.has(w)).length /
          clause.words.length,
      }))
      .filter((s) => s.support > 0)
      .sort((a, b) => b.support - a.support);
    if (candidates.length === 0) continue;
    // Only the closest sentences: "contractors receive paid vacation" must be
    // judged by "contractors do not receive paid vacation", not by a sentence
    // about employees that happens to share "receive paid vacation".
    const best = candidates[0].support;
    const compared = candidates.filter((s) => s.support === best);
    const match = compared.find((s) => agrees(clause, s));
    if (!match) consistent = false;
    if (sourceSentence === null || !match) {
      sourceSentence = (match || compared[0]).sentence;
    }
  }
  return { consistent, claimNegated, sourceSentence };
}

/**
 * Multiplier applied to the support score when a claim's polarity
 * contradicts the document (see checkPolarityConsistency). It keeps the
 * score below 0.4, under the default 0.5 support threshold.
 */
const POLARITY_MISMATCH_FACTOR = 0.4;

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
 * Polarity consistency: with the same texts, a claim that is negated where
 * the document is not, or the reverse (see checkPolarityConsistency), has its
 * score multiplied by POLARITY_MISMATCH_FACTOR (0.4).
 *
 * @param {string[]} claimTokens - Tokens of the sentence/claim/query
 * @param {string[]|Set<string>} docTokens - Tokens of the document
 * @param {Map<string, number>|null} [idfWeights] - Optional token weights
 * @param {{ claimText?: string, docText?: string }} [options] - Raw texts
 *   enabling the numeric and polarity consistency checks
 * @returns {number} Support score between 0 and 1
 */
function computeSupportScore(
  claimTokens,
  docTokens,
  idfWeights = null,
  options = {},
) {
  // A reference phrase ("Document 3 shows", "Table 2") names where a claim
  // comes from, not what it says: leave it out of the words to support.
  const rawClaim = options && options.claimText;
  const fromText =
    typeof rawClaim === 'string' && rawClaim !== withoutReferences(rawClaim)
      ? tokenize(withoutReferences(rawClaim))
      : claimTokens;
  const claim = [...new Set(contentTokens(fromText))];
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
    if (!checkPolarityConsistency(claimText, docText).consistent) {
      score *= POLARITY_MISMATCH_FACTOR;
    }
  }
  return score;
}

module.exports = {
  STOPWORDS,
  contentTokens,
  computeSupportScore,
  checkNumericConsistency,
  checkPolarityConsistency,
  isNegated,
  extractNumbers,
  NUMERIC_MISMATCH_FACTOR,
  POLARITY_MISMATCH_FACTOR,
  scoreAnswer,
  tokenize,
  computeBLEU,
  computeROUGE,
  splitSentences,
  computeJaccardSimilarity,
};
