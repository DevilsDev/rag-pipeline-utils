/**
 * Version: 0.1.0
 * Path: /src/evaluate/scoring.js
 * Description: Basic scoring metrics (BLEU, ROUGE-L) for RAG output evaluation
 * Author: Ali Kahwaji
 */

const { normalizeText, normalizeWithOffsets } = require('./normalize-text');

/**
 * Tokenize a string by words
 * @param {string} text
 * @returns {string[]}
 */
function tokenize(text) {
  // Unicode-aware: keep letters/digits in any script, drop apostrophes so
  // "don't" stays one token, and treat every other character (including
  // newlines and hyphens) as a separator. Normalised first, so a
  // zero-width space doesn't split a word and full-width digits are digits.
  return normalizeText(text)
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

/** A sentence end: `.`, `!` or `?`, closing quotes or brackets, then space. */
const SENTENCE_END = /[.!?]["'’”)\]]*\s+/gu;

/**
 * A sentence end with no space after it: "works.Wireless", "$65.Alcohol"
 * (BH-3). Two letters or digits before it, so "U.S.Army" and "e.g.The"
 * stay whole.
 */
const UNSPACED_END = /(?<=[\p{L}\p{N}]{2}[.!?])(?=\p{Lu})/gu;

/** A line that starts a list item or heading: "- ", "* ", "• ", "2. ", "3) ", "# ". */
const LIST_ITEM = /^[ \t]*(?:[-*•‣◦▪]|\d{1,3}[.)]|#{1,6})[ \t]/u;

/**
 * Words whose full stop doesn't end a sentence even before a capital:
 * titles ("Dr. Lee") and Latin abbreviations ("e.g. Paris"). Before a
 * lowercase word no full stop ends a sentence ("10 a.m. and", "the U.S.
 * government"), so these are only the ones commonly followed by a capital.
 */
const ABBREVIATIONS = new Set([
  'mr',
  'mrs',
  'ms',
  'dr',
  'prof',
  'sr',
  'jr',
  'st',
  'vs',
  'e.g',
  'i.e',
  'cf',
]);

/**
 * Where each sentence of a normalised text starts, after the first.
 * @param {string} text - normalised text
 * @returns {number[]}
 */
function sentenceStarts(text) {
  const starts = new Set();
  for (const match of text.matchAll(SENTENCE_END)) {
    const end = match.index + match[0].length;
    if (end >= text.length) continue;
    if (text[match.index] === '.') {
      if (/\p{Ll}/u.test(text[end])) continue;
      // Look back a few characters only, so long texts split in linear time
      const from = Math.max(0, match.index - 12);
      const before = text.slice(from, match.index);
      // The number of a list item: "1. Annual leave"
      const listNumber =
        from === 0 ? /(?:^|\n)[ \t]*\d{1,3}$/ : /\n[ \t]*\d{1,3}$/;
      if (listNumber.test(before)) continue;
      const word = /[\p{L}.]*$/u.exec(before)[0];
      if (ABBREVIATIONS.has(word.toLowerCase())) continue;
      // "form No. 7": a capitalised "No." before a number is an abbreviation
      if (word === 'No' && /\p{N}/u.test(text[end])) continue;
    }
    starts.add(end);
  }
  for (const match of text.matchAll(UNSPACED_END)) starts.add(match.index);

  // Lines: a blank line ends a sentence, and so does the line break before
  // or after a list item or heading, whose lines often have no full stop
  // (BH-4). A single line break inside a paragraph doesn't, so hard-wrapped
  // text stays whole.
  const lines = text.split('\n');
  let at = 0;
  for (let i = 0; i < lines.length - 1; i++) {
    at += lines[i].length + 1;
    const next = lines[i + 1];
    if (
      lines[i].trim() === '' ||
      next.trim() === '' ||
      LIST_ITEM.test(lines[i]) ||
      LIST_ITEM.test(next)
    ) {
      starts.add(at);
    }
  }
  return [...starts].sort((a, b) => a - b);
}

/**
 * Split text into sentences. Boundaries are found on the normalised text
 * (see normalize-text.js), so zero-width characters, no-break spaces and
 * full-width punctuation don't move them; the sentences returned are the
 * original text, trimmed.
 *
 * A sentence ends at `.`, `!` or `?` followed by a space, or directly by a
 * capital after a lowercase word ("works.Wireless"); a full stop before a
 * lowercase word ("10 a.m. and") or after a title or Latin abbreviation
 * ("Dr. Lee", "e.g. Paris") doesn't end one. A blank line, and the line
 * break around a list item or heading, end one too.
 *
 * @param {string} text
 * @returns {string[]}
 */
function splitSentences(text) {
  if (!text || typeof text !== 'string') return [];
  const normalised = normalizeWithOffsets(text);
  const cuts = sentenceStarts(normalised.text).map(
    (i) => normalised.offsets[i],
  );
  const sentences = [];
  let from = 0;
  for (const cut of [...cuts, text.length]) {
    const sentence = text.slice(from, cut).trim();
    if (normalizeText(sentence).trim().length > 0) sentences.push(sentence);
    from = cut;
  }
  return sentences;
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
 * Units a quantity can carry, as [kind, size in the kind's base unit,
 * unit name]. Conversions are exact only: days, weeks, hours, minutes and
 * seconds convert among themselves, months and years among themselves (a
 * month is not a fixed number of days), mass and length within their
 * kind. Ambiguous abbreviations ("m", "s", "h", "in") are left out.
 */
const UNITS = (() => {
  const table = {};
  const add = (kind, size, name, words) => {
    for (const w of words.split(' ')) table[w] = [kind, size, name];
  };
  add('mass', 0.001, 'milligram', 'mg milligram milligrams');
  add('mass', 1, 'gram', 'g gram grams gramme grammes');
  add('mass', 1000, 'kilogram', 'kg kgs kilogram kilograms kilo kilos');
  add('mass', 453.59237, 'pound', 'lb lbs pound pounds');
  add('mass', 28.349523125, 'ounce', 'oz ounce ounces');
  add(
    'length',
    0.001,
    'millimetre',
    'mm millimetre millimetres millimeter millimeters',
  );
  add(
    'length',
    0.01,
    'centimetre',
    'cm centimetre centimetres centimeter centimeters',
  );
  add('length', 1, 'metre', 'metre metres meter meters');
  add(
    'length',
    1000,
    'kilometre',
    'km kilometre kilometres kilometer kilometers',
  );
  add('length', 1609.344, 'mile', 'mile miles');
  add('length', 0.3048, 'foot', 'ft foot feet');
  add('length', 0.0254, 'inch', 'inch inches');
  add('duration', 1, 'second', 'sec secs second seconds');
  add('duration', 60, 'minute', 'min mins minute minutes');
  add('duration', 3600, 'hour', 'hr hrs hour hours');
  add('duration', 86400, 'day', 'day days');
  add('duration', 604800, 'week', 'wk wks week weeks');
  add('calendar', 1, 'month', 'month months');
  add('calendar', 12, 'year', 'yr yrs year years');
  add('percent', 1, 'percent', 'percent');
  return table;
})();

/** "half of", "a quarter of", "three quarters of", "two thirds of", as percentages. */
const FRACTION_WORDS = {
  half: 50,
  quarter: 25,
  quarters: 25,
  third: 100 / 3,
  thirds: 100 / 3,
};

const QUANTITY_TOKEN_RE = /\d+(?:[.,:]\d+)*|\p{L}+|%/gu;

/** A digit token's value ("2,000" is 2000, "1.5" is 1.5); null for clock times and lists. */
function digitValue(raw) {
  if (raw.includes(':')) return null;
  if (/^\d{1,3}(,\d{3})+(\.\d+)?$/.test(raw))
    return Number(raw.replace(/,/g, ''));
  if (raw.includes(',')) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

const isNumberWord = (w) =>
  w in NUMBER_WORDS || w in NUMBER_SCALES || w === 'one';

/**
 * The quantities a text states: a number followed by a unit ("2 kg", "two
 * weeks", "one and a half hours", "half a year", "10 per cent", "75%"), and
 * fractions of something ("three quarters of", "half of"), with where they
 * are in the text, so the plain number check can skip them.
 *
 * @param {string} text
 * @returns {{ items: Array<{ kind: string, value: number, unit: string, number: string, start: number, end: number, words: boolean }>, unitWords: Set<string> }}
 */
function quantities(text) {
  const items = [];
  const unitWords = new Set();
  const tokens = [...String(text || '').matchAll(QUANTITY_TOKEN_RE)].map(
    (m) => ({
      t: m[0].toLowerCase(),
      start: m.index,
      end: m.index + m[0].length,
    }),
  );
  for (const tok of tokens) if (UNITS[tok.t]) unitWords.add(UNITS[tok.t][2]);

  const unitAt = (j) => {
    const tok = tokens[j];
    if (!tok) return null;
    if (tok.t === '%') return [['percent', 1, 'percent'], j];
    if (tok.t === 'per' && tokens[j + 1] && tokens[j + 1].t === 'cent') {
      return [['percent', 1, 'percent'], j + 1];
    }
    return UNITS[tok.t] ? [UNITS[tok.t], j] : null;
  };
  const push = (kind, value, unit, number, from, to, words) =>
    items.push({
      kind,
      value,
      unit,
      number: String(number),
      start: tokens[from].start,
      end: tokens[to].end,
      words,
    });

  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i].t;
    // "half a year", "half an hour"
    if (
      t === 'half' &&
      tokens[i + 1] &&
      (tokens[i + 1].t === 'a' || tokens[i + 1].t === 'an')
    ) {
      const u = unitAt(i + 2);
      if (u && u[0][0] !== 'percent') {
        push(u[0][0], 0.5 * u[0][1], u[0][2], 0.5, i, u[1], true);
        i = u[1];
        continue;
      }
    }
    // Fractions of something: "half of", "a quarter of", "three quarters of"
    if (t in FRACTION_WORDS) {
      const prev = tokens[i - 1] && tokens[i - 1].t;
      const count =
        t === 'half'
          ? 1
          : prev in NUMBER_WORDS
            ? NUMBER_WORDS[prev]
            : prev === 'a' || prev === 'one'
              ? 1
              : null;
      if (count !== null && tokens[i + 1] && tokens[i + 1].t === 'of') {
        const from = t === 'half' ? i : i - 1;
        push(
          'percent',
          count * FRACTION_WORDS[t],
          'percent',
          count * FRACTION_WORDS[t],
          from,
          i,
          true,
        );
        items[items.length - 1].fraction = true;
        if (t === 'third' || t === 'thirds')
          items[items.length - 1].approx = true;
        continue;
      }
    }
    // A number, in digits or words, then a unit (with "and a half" between)
    let value = null;
    let end = i;
    let words = false;
    if (/^\d/.test(t)) {
      value = digitValue(t);
    } else if (isNumberWord(t)) {
      let j = i;
      const run = [];
      while (
        tokens[j] &&
        (isNumberWord(tokens[j].t) ||
          (tokens[j].t === 'and' &&
            tokens[j + 1] &&
            isNumberWord(tokens[j + 1].t) &&
            run.length))
      ) {
        if (tokens[j].t !== 'and') run.push(tokens[j].t);
        j++;
      }
      if (run.length) {
        value = parseNumberWords(run);
        end = j - 1;
        words = true;
      }
    }
    if (value === null) continue;
    let next = end + 1;
    if (
      tokens[next] &&
      tokens[next].t === 'and' &&
      tokens[next + 1] &&
      tokens[next + 1].t === 'a' &&
      tokens[next + 2] &&
      tokens[next + 2].t === 'half'
    ) {
      value += 0.5;
      next += 3;
    }
    const u = unitAt(next);
    if (u) {
      push(u[0][0], value * u[0][1], u[0][2], value, i, u[1], words);
      i = u[1];
    } else {
      i = end;
    }
  }
  return { items, unitWords };
}

/**
 * A source or an answer prepared for the claim checks. The same source is
 * checked against every sentence of an answer, so what the checks read from
 * it (its normalised text, tokens, sentences, clauses, numbers) is worked
 * out on first use and kept on this object, not redone per sentence.
 */
const PREPARED = Symbol('prepared text');

/**
 * Prepare a source text for repeated checks. Pass the result where a check
 * takes the document text; a prepared source is returned unchanged.
 * @param {string|object} text
 * @returns {object}
 */
function prepareSource(text) {
  if (text && text[PREPARED] === 'source') return text;
  return { [PREPARED]: 'source', input: text, memo: {}, byAnswer: new WeakMap() };
}

/**
 * Prepare an answer whose sentences may restate a source's condition (see
 * checkConditionConsistency).
 * @param {string|object} text
 * @returns {object}
 */
function prepareAnswer(text) {
  if (text && text[PREPARED] === 'answer') return text;
  return { [PREPARED]: 'answer', input: text, memo: {} };
}

const isPreparedAnswer = (value) =>
  Boolean(value) && value[PREPARED] === 'answer';
const isPreparedSource = (value) =>
  Boolean(value) && value[PREPARED] === 'source';

/** One analysis of a prepared text, computed on first use. */
function once(prepared, key, compute) {
  const { memo } = prepared;
  if (!(key in memo)) memo[key] = compute();
  return memo[key];
}

/** A document's text as the checks read it, normalised (see normalize-text.js). */
function sourceNorm(doc) {
  const prepared = prepareSource(doc);
  return once(prepared, 'norm', () => normalizeText(prepared.input));
}

/** A source's tokens, as a Set (the words a claim can match). */
function sourceTokenSet(doc) {
  const prepared = prepareSource(doc);
  return once(prepared, 'tokens', () => new Set(tokenize(prepared.input)));
}

// The same claim is checked against every source: keep the last few claims'
// quantities
const claimQuantityCache = new Map();
function cachedQuantities(cache, text) {
  const key = String(text || '');
  let hit = cache.get(key);
  if (!hit) {
    hit = quantities(key);
    if (cache.size >= 256) cache.clear();
    cache.set(key, hit);
  }
  return hit;
}

/** Whether two quantities of one kind are equal (thirds are compared to the nearest point). */
function sameQuantity(a, b) {
  const tolerance =
    a.approx || b.approx
      ? 1
      : Math.max(Math.abs(a.value), Math.abs(b.value)) * 1e-9;
  return Math.abs(a.value - b.value) <= tolerance;
}

/** Hours of the clock times ("17:00") in a text, each also on a 12-hour clock. */
function clockHours(text) {
  const hours24 = new Set();
  const hours12 = new Set();
  for (const m of String(text || '').matchAll(
    // one-digit minutes too ("7:0-23:0", as some listings write hours)
    /(?<!\d)(\d{1,2}):([0-5]?\d)(?!\d)/g,
  )) {
    const h = Number(m[1]);
    if (h > 23) continue;
    hours24.add(h);
    hours12.add(h % 12 === 0 ? 12 : h % 12);
  }
  return { hours24, hours12 };
}

/**
 * Times of day in a claim checked against a source that states clock times:
 * "5 pm" must be a 17:00 in the source, and a bare hour after "at", "from",
 * "to" or "until" ("open from 9 to 5") an hour of the source on a 12-hour
 * clock. Returns the claim's spans it checked and the times it didn't find.
 * The second argument is clockHours() of the source.
 */
function checkClockTimes(claimText, { hours24, hours12 }) {
  const spans = [];
  const matched = [];
  const missing = [];
  if (hours24.size === 0) return { spans, matched, missing };
  const tokens = [...String(claimText || '').matchAll(QUANTITY_TOKEN_RE)].map(
    (m) => ({
      t: m[0].toLowerCase(),
      start: m.index,
      end: m.index + m[0].length,
    }),
  );
  for (let i = 0; i < tokens.length; i++) {
    if (!/^\d{1,2}$/.test(tokens[i].t)) continue;
    const h = Number(tokens[i].t);
    const next = tokens[i + 1] && tokens[i + 1].t;
    const prev = tokens[i - 1] && tokens[i - 1].t;
    if ((next === 'am' || next === 'pm') && h >= 1 && h <= 12) {
      const h24 = (h % 12) + (next === 'pm' ? 12 : 0);
      const span = [tokens[i].start, tokens[i + 1].end];
      if (hours24.has(h24)) matched.push(span);
      else missing.push(`time:${h}${next}`);
      spans.push(span);
    } else if (
      ['at', 'from', 'to', 'until', 'till'].includes(prev) &&
      h >= 1 &&
      h <= 12 &&
      // "open from 9 to 5.", not "up to 8 people" or "at 11 Main Street"
      endsTime(claimText, tokens[i].end, next)
    ) {
      const span = [tokens[i].start, tokens[i].end];
      if (hours12.has(h) || hours24.has(h)) matched.push(span);
      else missing.push(`time:${h}`);
      spans.push(span);
    }
  }
  return { spans, matched, missing };
}

/** Words that can follow a bare hour in a time ("from 9 to 5", "at 6 on Fridays"). */
const AFTER_HOUR = new Set(
  'to until till and or on every each daily sharp then'.split(' '),
);

/** Whether a bare hour ends here: the text ends, punctuation follows, or a range word. */
function endsTime(text, end, next) {
  if (
    next === undefined ||
    /^\s*[.,;:!?)]/.test(String(text).slice(end, end + 3))
  ) {
    return true;
  }
  return AFTER_HOUR.has(next);
}

/** A text with these [start, end) spans blanked out. */
function withoutSpans(text, spans) {
  let out = String(text || '');
  for (const [start, end] of [...spans].sort((a, b) => b[0] - a[0])) {
    out = out.slice(0, start) + ' '.repeat(end - start) + out.slice(end);
  }
  return out;
}

/**
 * Footnote markers glued to a year ("published in 1992.1 It enrolled"): the
 * year, so the source states it. Only year-like numbers, a one- or
 * two-digit marker, then a capital letter.
 */
function footnotedYears(text) {
  const out = [];
  for (const m of String(text || '').matchAll(
    /(?<![\d.])(1[89]\d\d|20\d\d|2100)\.\d{1,2}(?=\s+\p{Lu})/gu,
  )) {
    out.push(String(Number(m[1])));
  }
  return out;
}

/**
 * What the number check reads from a source, prepared once per source: the
 * numbers it states (with each number word on its own, and years with a
 * footnote marker), its quantities, clock times, and every number, month
 * and identifier it states.
 */
function sourceNumbers(doc) {
  return once(prepareSource(doc), 'numbers', () => {
    const text = sourceNorm(doc);
    const parts = new Set([
      ...extractNumbers(text).parts,
      ...footnotedYears(text),
    ]);
    return {
      parts,
      quantities: quantities(text),
      clock: clockHours(text),
      numbers: new Set([
        ...parts,
        ...docMonths(text).map((m) => `month:${m}`),
        ...identifiers(text),
      ]),
    };
  });
}

/**
 * Numeric consistency between a claim and a document: every number the claim
 * states (digits, decimals, percentages or number words) must also appear in
 * the document. Lexical overlap alone would ground "thirty days" against a
 * source that says "twenty days".
 *
 * @param {string} claimText
 * @param {string} docText
 * @returns {{ consistent: boolean, claimNumbers: string[], missing: string[], matchedWords: string[] }}
 *   `matchedWords`: the words of a claim quantity or time the source states
 *   another way ("90 minutes" for "one and a half hours"); computeSupportScore
 *   counts them as matched
 */
function checkNumericConsistency(claimText, docText) {
  claimText = normalizeText(claimText);
  const source = sourceNumbers(docText);
  const claim = withoutReferences(claimText);
  const docParts = source.parts;

  // Quantities with a unit (3.7): "2 kg" is checked as a mass, so it
  // matches "2,000 grams" and not "2 pounds". A quantity the source states
  // in no comparable unit falls back to the plain number check, unless it
  // was written in words ("three quarters of"), which has no plain number.
  const doc = source.quantities;
  const spans = [];
  const matched = [];
  const missing = [];
  const claimNumbers = [];
  for (const q of cachedQuantities(claimQuantityCache, claim).items) {
    const sameKind = doc.items.filter((d) => d.kind === q.kind);
    const equal = sameKind.filter((d) => sameQuantity(d, q));
    const found =
      equal.length > 0 ||
      // the number with the same unit word elsewhere ("20 days" in "20
      // vacation days"), or with no other unit of this kind ("seven days a
      // week" against a source with "7:00")
      (docParts.has(q.number) &&
        (doc.unitWords.has(q.unit) ||
          !sameKind.some((d) => d.number === q.number)));
    if (sameKind.length === 0 && !q.words && !found) continue;
    spans.push([q.start, q.end]);
    // Its words count as supported only when the source states it in
    // another unit ("90 minutes" for "one and a half hours"); "20 days"
    // against "twenty days" is left to the overlap, as before
    const converted = (d) =>
      d.unit !== q.unit || Boolean(d.fraction) !== Boolean(q.fraction);
    if (equal.length > 0 && equal.every(converted)) {
      matched.push([q.start, q.end]);
    }
    claimNumbers.push(`${q.kind}:${q.number} ${q.unit}`);
    if (!found && (sameKind.length > 0 || !q.words))
      missing.push(`${q.kind}:${q.number} ${q.unit}`);
  }
  const clock = checkClockTimes(claim, source.clock);
  spans.push(...clock.spans);
  matched.push(...clock.matched);
  missing.push(...clock.missing);

  const plain = [
    ...new Set(extractNumbers(withoutSpans(claim, spans)).values),
    ...claimMonths(claimText).map((m) => `month:${m}`),
    ...identifiers(claimText),
  ];
  claimNumbers.push(...plain, ...clock.missing);
  // The words of a quantity or time the source states another way
  // ("90 minutes" for "one and a half hours"): supported, for the overlap
  const matchedWords = [
    ...new Set(matched.flatMap(([a, b]) => tokenize(claim.slice(a, b)))),
  ];
  if (claimNumbers.length === 0) {
    return { consistent: true, claimNumbers, missing: [], matchedWords };
  }
  const docNumbers = source.numbers;
  missing.push(...plain.filter((n) => !docNumbers.has(n)));
  return {
    consistent: missing.length === 0,
    claimNumbers,
    missing,
    matchedWords,
  };
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
const IDENTIFIER_RE = /(?<![\p{L}\p{N}])(\p{N}*)(\p{L}[\p{L}\p{N}]*)-(\d+)\b/gu;

/**
 * Identifiers in a text, compared whole and without case ("id:kinesin-8"):
 * their number isn't a quantity, but "IL-2" and "IL-3" are different things.
 */
function identifiers(text) {
  if (!text || typeof text !== 'string') return [];
  return [
    ...new Set(
      [...text.matchAll(IDENTIFIER_RE)].map(
        // m[1] is digits before the word ("2kinesin-8"), not part of it
        (m) => `id:${m[0].slice(m[1].length).toLowerCase()}`,
      ),
    ),
  ];
}

/** A claim's text without reference phrases and identifier numbers. */
function withoutReferences(text) {
  if (!text || typeof text !== 'string') return text;
  return text
    .replace(REFERENCE_RE, ' ')
    .replace(IDENTIFIER_RE, (_, lead, word) => lead + word);
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

/**
 * A clause starting with one of these continues the previous clause's
 * subject ("... but was not better", "... but did not reduce").
 */
const ELLIPTICAL_START = new Set(
  (
    'not never was were is are be been did does do has have had can could ' +
    'will would should may might must shall'
  ).split(' '),
);

/** An opening claim clause starting with one of these only frames the claim. */
const FRAMING_WORDS = new Set(
  'according based in on given as from per under after before during'.split(
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
 * The document sentences sharing most of these (distinct) words, in
 * document order, looked up in a word -> sentence index.
 * @param {Iterable<string>} words
 * @param {Map<string, number[]>} byWord
 * @returns {number[]}
 */
function closest(words, byWord) {
  const shared = new Map();
  for (const w of words) {
    for (const i of byWord.get(w) || []) shared.set(i, (shared.get(i) || 0) + 1);
  }
  let best = 0;
  for (const n of shared.values()) if (n > best) best = n;
  const out = [];
  for (const [i, n] of shared) if (n === best) out.push(i);
  return out.sort((a, b) => a - b);
}

/** Add each item's keys to a key -> item indices index, each index once per key. */
function indexBy(items, keysOf) {
  const index = new Map();
  items.forEach((item, i) => {
    for (const key of keysOf(item)) {
      const list = index.get(key);
      if (!list) index.set(key, [i]);
      else if (list[list.length - 1] !== i) list.push(i);
    }
  });
  return index;
}

/**
 * A source's sentences as the polarity check reads them: each clause's
 * negation and stems, a stem -> clause index per sentence and a stem ->
 * sentence index, prepared once per source.
 */
function polaritySentences(doc) {
  return once(prepareSource(doc), 'polarity', () => {
    const sentences = splitSentences(sourceNorm(doc)).map((sentence) => {
      const clauses = clauseTokens(sentence).map((tokens, i) => ({
        negated: isNegated(tokens),
        stems: new Set(tokens.map(stem)),
        // "... but was not better than Y", "... but did not reduce Y": no
        // subject of its own, so it continues the first clause's (3.7)
        continues: i > 0 && ELLIPTICAL_START.has(tokens[0]),
      }));
      const clausesByStem = indexBy(clauses, (c) => c.stems);
      return { sentence, clauses, clausesByStem, agreed: new Map() };
    });
    const sentencesByStem = indexBy(sentences, (s) => s.clausesByStem.keys());
    return { sentences, sentencesByStem };
  });
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
  claimText = normalizeText(claimText);
  const doc = prepareSource(docText);
  // Negation is scoped to its clause (3.6): "requires X but not Y" negates
  // Y, not X, and "may not use X and may not park Y" has two negated
  // clauses, not an even count that reads as positive. Each clause of the
  // claim is compared with the closest clause of the document.
  const words = (tokens) => [
    ...new Set(
      contentTokens(tokens.filter((t) => !NEGATION_WORDS.has(t))).map(stem),
    ),
  ];
  let claimClauses = clauseTokens(claimText)
    .map((tokens) => ({ tokens, words: words(tokens) }))
    .filter((c) => c.words.length > 0);
  // An opening framing clause ("Based on these results, ...", "According
  // to the study, ...") states no fact of its own: the clauses after it
  // decide (3.7)
  if (
    claimClauses.length > 1 &&
    FRAMING_WORDS.has(claimClauses[0].tokens[0]) &&
    !isNegated(claimClauses[0].tokens)
  ) {
    claimClauses = claimClauses.slice(1);
  }
  const claimNegated = claimClauses.some((c) => isNegated(c.tokens));
  if (claimClauses.length === 0) {
    return { consistent: true, claimNegated, sourceSentence: null };
  }

  const { sentences, sentencesByStem } = polaritySentences(doc);

  /**
   * Whether one claim clause agrees with one document sentence. The claim's
   * words that occur in only one clause of the sentence decide: each such
   * clause must be negated exactly when the claim clause is ("allowed on
   * Mondays" fails against "allowed on Fridays, whereas it is not allowed
   * on Mondays", because "Mondays" is only in the negated clause). With no
   * such word, the closest clause decides. The sentence's clauses are
   * looked up by stem, and an answer of repeated clauses is decided once
   * per sentence.
   */
  const agrees = (clause, sentence) => {
    const negated = isNegated(clause.tokens);
    const key = `${negated} ${clause.words.join(' ')}`;
    if (sentence.agreed.has(key)) return sentence.agreed.get(key);
    const owners = (w) => sentence.clausesByStem.get(w) || [];
    let distinctive = clause.words
      .map(owners)
      .filter((list) => list.length === 1)
      .map((list) => sentence.clauses[list[0]]);
    // A subject named once, in the first clause, also belongs to a later
    // clause that continues it: when such a clause holds some of the
    // claim's words, the first clause's words don't decide on their own
    // ("the drug did not reduce mortality" against "The drug lowered blood
    // pressure but did not reduce mortality")
    const first = sentence.clauses[0];
    if (distinctive.some((c) => c.continues)) {
      distinctive = distinctive.filter((c) => c !== first);
    }
    let result;
    if (distinctive.length > 0) {
      result = distinctive.every((c) => c.negated === negated);
    } else {
      // The clauses sharing most of the claim clause's words decide
      const support = new Map();
      for (const w of clause.words) {
        for (const i of owners(w)) support.set(i, (support.get(i) || 0) + 1);
      }
      if (support.size === 0) {
        result = true;
      } else {
        let best = 0;
        for (const n of support.values()) if (n > best) best = n;
        result = [...support].some(
          ([i, n]) => n === best && sentence.clauses[i].negated === negated,
        );
      }
    }
    sentence.agreed.set(key, result);
    return result;
  };

  let consistent = true;
  let sourceSentence = null;
  for (const clause of claimClauses) {
    // Only the closest sentences: "contractors receive paid vacation" must be
    // judged by "contractors do not receive paid vacation", not by a sentence
    // about employees that happens to share "receive paid vacation".
    const compared = closest(clause.words, sentencesByStem).map(
      (i) => sentences[i],
    );
    if (compared.length === 0) continue;
    const match = compared.find((s) => agrees(clause, s));
    if (!match) consistent = false;
    if (sourceSentence === null || !match) {
      sourceSentence = (match || compared[0]).sentence;
    }
  }
  return { consistent, claimNegated, sourceSentence };
}

/**
 * Markers that open a restricting clause: a condition, an approval, an
 * exception or an eligibility rule. Dropping one broadens what the claim
 * grants ("allowed two days per week" from "... with manager approval").
 * Contrasting markers (but, whereas, while, however) are not here: dropping
 * a contrasting clause leaves a narrower claim that is still true. For
 * "for <people> who/with ...", the restriction starts at who/with: the
 * people are who it applies to.
 */
const NUMBER_WORD =
  '(?:\\d[\\d,.]*|a|an|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirty|sixty|ninety)';
const RESTRICTING_MARKERS = [
  /\bwith\b(?:\s+[\w'’-]+){0,4}?\s+(?:approval|permission|consent|sign-?off|authori[sz]ation)\b/g,
  /\bonly\s+(?:if|when)\b/g,
  // not "even if" (concessive) or "if any", "if applicable" (no condition on
  // the statement): the condition-dropped dev split (3.9). Not "if
  // necessary", "if needed", "if possible" closing their clause, or an
  // anaphoric "if not," / "if so," (it points back at another sentence):
  // first seen as false alarms on RAGTruth, fixed on new dev cases
  /(?<!\beven\s)\bif\b(?!\s+(?:any|applicable)\b)(?!\s+(?:necessary|needed|need\s+be|possible)\s*(?:[,;:.!?)]|$|\s(?:and|or|but)\b))(?!\s+(?:not|so)\s*,)/g,
  /\bunless\b/g,
  /\bprovided(?:\s+that)?\b/g,
  /\bsubject\s+to\b/g,
  /\bas\s+long\s+as\b/g,
  new RegExp(
    `\\bafter\\s+${NUMBER_WORD}\\s+(?:hours?|days?|weeks?|months?|years?)\\b`,
    'g',
  ),
  /\bfor\s+(?:[\w'’-]+\s+){1,3}?(?=(?:who|with|whose)\b)/g,
  // legal boilerplate ("except as required by law") restricts nothing the
  // reader can act on (3.9)
  /\bexcept\b(?!\s+(?:as|where)\s+(?:required|permitted)\s+by\s+(?:applicable\s+)?law\b)/g,
];

/** Words that only mark a restriction, not what it requires. */
const MARKER_WORDS = new Set([
  'with',
  'only',
  'if',
  'when',
  'unless',
  'provided',
  'that',
  'subject',
  'to',
  'as',
  'long',
  'after',
  'for',
  'who',
  'whose',
  'except',
]);

/**
 * Coordinators that join independent statements: a restriction in one of
 * them does not restrict the other ("..., and the office is open on
 * weekends"). Commas alone are not here, so "If approved, ..." and "...,
 * subject to approval" stay with their statement. "and" needs a comma before
 * it, so "with manager and HR approval" stays one restriction (the
 * condition-dropped dev split, 3.9).
 */
const STATEMENT_BOUNDARY =
  /\s*;\s*|,\s+and\s+|,?\s+\b(?:but|whereas|while|however)\b\s+/i;

/** Where a restricting clause ends: punctuation or a coordinator. */
const CLAUSE_END = /[,;:.!?]|\s(?:and|but|whereas|while|however)\s/gi;

/**
 * Words whose full stop doesn't end a restricting clause: the sentence
 * splitter's titles and Latin abbreviations, and company and number
 * abbreviations ("Acme Inc. or its subsidiaries", "form No. 7").
 */
const CLAUSE_ABBREVIATIONS = new Set([
  ...ABBREVIATIONS,
  'inc',
  'ltd',
  'co',
  'corp',
  'no',
]);

/**
 * Where the restricting clause at the start of `text` (lowercased) ends, or
 * -1 when it runs to the end. A full stop inside a word or number ("U.S",
 * "2.5"), after a single letter ("U.S.", "e.g.", "i.e.") or after an
 * abbreviation ("Inc.", "No.") doesn't end it, so "if the U.S. economy
 * grows" is one clause, not "if the U" (3.9, on new dev cases).
 * @param {string} text
 * @returns {number}
 */
function clauseEnd(text) {
  for (const match of text.matchAll(CLAUSE_END)) {
    if (match[0] === '.') {
      const next = text[match.index + 1];
      if (next !== undefined && /[\p{L}\p{N}]/u.test(next)) continue;
      const before = text.slice(Math.max(0, match.index - 12), match.index);
      const word = /[\p{L}.]*$/u.exec(before)[0];
      if (/(?:^|\.)\p{L}$/u.test(word) || CLAUSE_ABBREVIATIONS.has(word)) {
        continue;
      }
    }
    return match.index;
  }
  return -1;
}

/**
 * Text as the condition check reads it: an initialism with full stops reads
 * as one word ("U.S." as "US", so an answer writing "US" keeps a "U.S."
 * restriction), and "e.g." and "i.e." restrict nothing.
 * @param {string} text
 * @returns {string}
 */
const conditionText = (text) =>
  normalizeText(text)
    .replace(/\b(?:e\.g|i\.e)\b\.?/gi, ' ')
    .replace(/(?<![\p{L}.])(?:\p{Lu}\.){2,}(?!\p{L})/gu, (initialism) =>
      initialism.replace(/\./g, ''),
    );

/** Light stemming for matching a restriction: approval/approves/approve. */
const conditionStem = (t) => {
  const s = stem(t.replace(/['’]s$/, ''));
  return s.length > 5 ? s.replace(/al$/, '') : s;
};
const conditionWords = (text) =>
  contentTokens(tokenize(conditionText(text)))
    .filter((t) => !MARKER_WORDS.has(t))
    .map(conditionStem);

/**
 * The restricting clauses of one statement, each with its distinctive
 * content words: those the rest of the statement doesn't also use. A word
 * the restriction shares with the main statement ("... a workplace injury
 * ... if the injury requires treatment") is in the claim either way, so it
 * can't show the restriction was kept. A clause with no distinctive word
 * keeps all its words.
 * @param {string} statement
 * @returns {Array<{text: string, words: string[]}>}
 */
function restrictingClauses(statement) {
  const lower = statement.toLowerCase();
  const found = [];
  for (const marker of RESTRICTING_MARKERS) {
    marker.lastIndex = 0;
    let m;
    while ((m = marker.exec(lower)) !== null) {
      const matchEnd = m.index + m[0].length;
      const start = m[0].startsWith('for ') ? matchEnd : m.index;
      // "with ... approval" ends at its match; the others run to the end of
      // their clause
      const rest = lower.slice(matchEnd);
      const until = clauseEnd(rest);
      const end = m[0].startsWith('with ')
        ? matchEnd
        : matchEnd + (until < 0 ? rest.length : until);
      if (found.some((f) => start >= f.start && start < f.end)) continue;
      const text = statement.slice(start, end).trim();
      const words = conditionWords(text);
      if (words.length > 0) found.push({ start, end, text, words });
    }
  }
  return found.map(({ start, end, text, words }) => {
    const elsewhere = new Set(
      conditionWords(statement.slice(0, start) + ' ' + statement.slice(end)),
    );
    const distinctive = words.filter((w) => !elsewhere.has(w));
    return { text, words: distinctive.length > 0 ? distinctive : words };
  });
}

/**
 * A source's sentences as the condition check reads them: each sentence's
 * condition words, a word -> sentence index and, on first use, its
 * statements with their restricting clauses, prepared once per source.
 */
function conditionSentences(doc) {
  return once(prepareSource(doc), 'conditionSentences', () => {
    const sentences = splitSentences(sourceNorm(doc)).map((sentence) => {
      let statements = null;
      return {
        sentence,
        words: new Set(conditionWords(sentence)),
        statements: () => {
          if (!statements) {
            statements = sentence.split(STATEMENT_BOUNDARY).map((text) => ({
              words: conditionWords(text),
              clauses: restrictingClauses(text),
            }));
          }
          return statements;
        },
      };
    });
    const sentencesByWord = indexBy(sentences, (s) => s.words);
    return { sentences, sentencesByWord };
  });
}

/**
 * The condition words of an answer's sentences that this document supports
 * (most of their content words are in it), worked out once per answer and
 * document.
 * @param {object} doc - prepareSource()
 * @param {object} answer - prepareAnswer()
 * @returns {string[]}
 */
function restatingWords(doc, answer) {
  let words = doc.byAnswer.get(answer);
  if (!words) {
    // Other sentences of the answer count only when this document supports
    // them: "Remote work requires manager approval." restates the source's
    // approval; "Your manager sets the team schedule." (from another source)
    // does not
    const docWords = once(
      doc,
      'conditionWords',
      () => new Set(conditionWords(sourceNorm(doc))),
    );
    const sentences = once(answer, 'conditionWords', () =>
      splitSentences(normalizeText(answer.input)).map(conditionWords),
    );
    words = sentences
      .filter(
        (sentence) =>
          sentence.length > 0 &&
          sentence.filter((w) => docWords.has(w)).length / sentence.length >=
            0.5,
      )
      .flat();
    doc.byAnswer.set(answer, words);
  }
  return words;
}

/**
 * Condition consistency between a claim and a document. A claim that keeps
 * every noun and number of its source but drops a restriction on it grants
 * more than the source does: "Remote work is allowed two days per week"
 * from "Remote work is allowed two days per week with manager approval".
 * Word overlap passes it, so it is checked here (3.9).
 *
 * The claim is compared with the document sentence that shares most of its
 * content words (any of them, on a tie). In the statements of that sentence
 * that hold the claim's words (a sentence is split at and, but, whereas,
 * while, however and semicolons, not at commas), each restricting clause
 * ("with ... approval", "only if", "if", "unless", "provided", "subject to",
 * "as long as", "after <number> <unit>", "for <people> who/with ...",
 * "except") must be kept: at least one of its distinctive words (see
 * restrictingClauses) must appear in the claim, or in another sentence of
 * the answer that this document supports (most of its content words are in
 * the document), so a condition restated from the same source still counts
 * and a word from a sentence about something else doesn't. Contrasting
 * clauses ("but not in children") may be left out, as the polarity check
 * allows since 3.6. Phrases that restrict nothing are not restrictions:
 * "even if", "if any", "if applicable", "if necessary", "if needed", "if
 * need be", "if possible", an anaphoric "If not," or "If so,", and "except
 * as required (or permitted) by law". A source with no space after a
 * sentence's full stop ("per week.If you need") is split there too.
 *
 * @param {string} claimText
 * @param {string} docText
 * @param {string} [answerText] - The whole answer; defaults to the claim
 * @returns {{ consistent: boolean, missing: string[], sourceSentence: string|null }}
 *   missing: the restricting clauses the claim leaves out
 */
function checkConditionConsistency(claimText, docText, answerText) {
  claimText = normalizeText(claimText);
  const doc = prepareSource(docText);
  const claimWords = new Set(conditionWords(claimText));
  if (claimWords.size === 0) {
    return { consistent: true, missing: [], sourceSentence: null };
  }
  const restating =
    typeof answerText === 'string' || isPreparedAnswer(answerText)
      ? restatingWords(doc, prepareAnswer(answerText))
      : [];
  const answerWords = new Set([...claimWords, ...restating]);

  // splitSentences also splits a source scraped without a space between
  // sentences ("...per week.If you need"), which would otherwise lend one
  // sentence the next one's restriction (first seen on RAGTruth, fixed on
  // new dev cases)
  const { sentences, sentencesByWord } = conditionSentences(doc);
  const tied = closest(claimWords, sentencesByWord);
  if (tied.length === 0) {
    return { consistent: true, missing: [], sourceSentence: null };
  }
  let first = null;
  for (const i of tied) {
    const { sentence, statements } = sentences[i];
    const missing = statements()
      .filter((statement) => statement.words.some((w) => claimWords.has(w)))
      .flatMap((statement) => statement.clauses)
      .filter((clause) => !clause.words.some((w) => answerWords.has(w)))
      .map((clause) => clause.text);
    if (missing.length === 0) {
      return { consistent: true, missing: [], sourceSentence: sentence };
    }
    if (!first) first = { consistent: false, missing, sourceSentence: sentence };
  }
  return first;
}

/**
 * Multiplier applied to the support score when a claim's polarity
 * contradicts the document (see checkPolarityConsistency). It keeps the
 * score below 0.4, under the default 0.5 support threshold.
 */
const POLARITY_MISMATCH_FACTOR = 0.4;

/**
 * Multiplier applied to the support score when a claim leaves out a
 * restricting clause of its source (see checkConditionConsistency). It keeps
 * the score below 0.4, under the default 0.5 support threshold.
 */
const CONDITION_MISMATCH_FACTOR = 0.4;

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
 * Condition consistency: a claim that leaves out a restricting clause of its
 * source, and doesn't restate it elsewhere in `options.answerText` (see
 * checkConditionConsistency), has its score multiplied by
 * CONDITION_MISMATCH_FACTOR (0.4); `options.conditionCheck: false` turns this
 * check off, for scores comparable with a baseline saved before 3.9.
 *
 * @param {string[]} claimTokens - Tokens of the sentence/claim/query
 * @param {string[]|Set<string>} docTokens - Tokens of the document
 * @param {Map<string, number>|null} [idfWeights] - Optional token weights
 * @param {{ claimText?: string, docText?: string, answerText?: string, conditionCheck?: boolean }} [options] - Raw texts
 *   enabling the numeric, polarity and condition consistency checks;
 *   `answerText` is the whole answer the claim comes from
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
  /** @type {Array<[string, number]>} */
  const unmatched = [];
  for (const token of claim) {
    const weight = idfWeights ? (idfWeights.get(token) ?? 1) : 1;
    total += weight;
    if (docSet.has(token)) matched += weight;
    else unmatched.push([token, weight]);
  }
  // No word in common: nothing to check (the number and polarity checks
  // run only on documents that share some words with the claim)
  if (matched === 0) return 0;

  const { claimText, docText } = options || {};
  const texts =
    typeof claimText === 'string' &&
    (typeof docText === 'string' || isPreparedSource(docText));
  const numeric = texts ? checkNumericConsistency(claimText, docText) : null;
  if (numeric && numeric.matchedWords.length) {
    const restated = new Set(numeric.matchedWords);
    for (const [token, weight] of unmatched) {
      if (restated.has(token)) matched += weight;
    }
  }
  let score = total > 0 ? matched / total : 0;

  if (texts) {
    if (!numeric.consistent) {
      const share =
        (numeric.claimNumbers.length - numeric.missing.length) /
        numeric.claimNumbers.length;
      score *= NUMERIC_MISMATCH_FACTOR * share;
    }
    if (!checkPolarityConsistency(claimText, docText).consistent) {
      score *= POLARITY_MISMATCH_FACTOR;
    }
    if (
      options.conditionCheck !== false &&
      !checkConditionConsistency(claimText, docText, options.answerText)
        .consistent
    ) {
      score *= CONDITION_MISMATCH_FACTOR;
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
  checkConditionConsistency,
  CONDITION_MISMATCH_FACTOR,
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
  prepareSource,
  prepareAnswer,
  sourceTokenSet,
};
