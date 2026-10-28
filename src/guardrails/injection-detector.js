'use strict';

/**
 * Prompt-injection detection shared by PreRetrievalGuard (user queries) and
 * RetrievalGuard (retrieved documents, opt-in).
 *
 * Text is normalised before matching so trivial obfuscation does not bypass
 * the patterns: Unicode NFKC, removal of zero-width and format characters,
 * control characters turned into spaces, diacritics stripped, common
 * Cyrillic/Greek homoglyphs and leetspeak folded to ASCII letters, and
 * whitespace collapsed. Detection never rewrites the caller's text.
 */

/**
 * Build a character class from code points / [start, end] ranges, so the
 * source stays ASCII-only.
 * @param {Array<number|[number, number]>} items
 * @returns {string}
 */
function charClass(items) {
  const hex = (cp) => '\\u' + cp.toString(16).padStart(4, '0');
  return items
    .map((it) => (Array.isArray(it) ? `${hex(it[0])}-${hex(it[1])}` : hex(it)))
    .join('');
}

/** Zero-width / invisible format characters removed before matching. */
const INVISIBLE_RE = new RegExp(
  `[${charClass([
    0x00ad, // soft hyphen
    0x034f, // combining grapheme joiner
    0x061c, // arabic letter mark
    0x115f,
    0x1160, // hangul fillers
    0x17b4,
    0x17b5,
    [0x180b, 0x180f], // mongolian variation selectors / vowel separator
    [0x200b, 0x200f], // zero-width space/joiners, LRM/RLM
    [0x202a, 0x202e], // bidi embeddings/overrides
    [0x2060, 0x206f], // word joiner, invisible operators, bidi isolates
    0x3164, // hangul filler
    [0xfe00, 0xfe0f], // variation selectors
    0xfeff, // BOM / zero-width no-break space
    0xffa0, // halfwidth hangul filler
  ])}]`,
  'g',
);

/** C0/C1 control characters (other than whitespace), replaced by a space. */
const CONTROL_RE = new RegExp(
  `[${charClass([[0x00, 0x08], 0x0b, 0x0c, [0x0e, 0x1f], [0x7f, 0x9f]])}]`,
  'g',
);

/** Cyrillic and Greek letters that look like Latin letters (code point -> letter). */
const HOMOGLYPH_CODEPOINTS = [
  // Cyrillic
  [0x0430, 'a'],
  [0x0432, 'b'],
  [0x0435, 'e'],
  [0x0451, 'e'],
  [0x043a, 'k'],
  [0x043c, 'm'],
  [0x043d, 'h'],
  [0x043e, 'o'],
  [0x0440, 'p'],
  [0x0441, 'c'],
  [0x0442, 't'],
  [0x0443, 'y'],
  [0x0445, 'x'],
  [0x0455, 's'],
  [0x0456, 'i'],
  [0x0457, 'i'],
  [0x0458, 'j'],
  [0x0501, 'd'],
  [0x051b, 'q'],
  [0x051d, 'w'],
  [0x04cf, 'l'],
  [0x0261, 'g'],
  // Greek
  [0x03b1, 'a'],
  [0x03b2, 'b'],
  [0x03b5, 'e'],
  [0x03b7, 'n'],
  [0x03b9, 'i'],
  [0x03ba, 'k'],
  [0x03bd, 'v'],
  [0x03bf, 'o'],
  [0x03c1, 'p'],
  [0x03c4, 't'],
  [0x03c5, 'u'],
  [0x03c7, 'x'],
  [0x03c9, 'w'],
  [0x03f2, 'c'],
];
const HOMOGLYPHS = Object.fromEntries(
  HOMOGLYPH_CODEPOINTS.map(([cp, letter]) => [
    String.fromCodePoint(cp),
    letter,
  ]),
);

/** Leetspeak substitutions folded to letters (only in the folded copy). */
const LEET = {
  0: 'o',
  1: 'i',
  3: 'e',
  4: 'a',
  5: 's',
  7: 't',
  8: 'b',
  '@': 'a',
  $: 's',
  '!': 'i',
  '|': 'l',
};

/**
 * Normalise text for matching, without leetspeak/homoglyph folding.
 * Case is preserved so case-sensitive custom patterns still work.
 * @param {string} text
 * @returns {string}
 */
function normalizeText(text) {
  return String(text)
    .normalize('NFKC')
    .replace(INVISIBLE_RE, '')
    .replace(CONTROL_RE, ' ')
    .normalize('NFD')
    .replace(/\p{Mn}+/gu, '')
    .normalize('NFC')
    .replace(/[^\S\n]+/g, ' ')
    .replace(/ ?\n\s*/g, '\n')
    .trim();
}

/**
 * Fully folded, lower-case form used by the built-in patterns.
 * @param {string} text
 * @returns {string}
 */
function foldText(text) {
  const lower = normalizeText(text).toLowerCase();
  let out = '';
  for (const ch of lower) {
    out += HOMOGLYPHS[ch] || LEET[ch] || ch;
  }
  // Separator tricks such as "i.g.n.o.r.e" or "i-g-n-o-r-e": join single
  // letters separated by one punctuation/space character.
  return out.replace(/\b(?:[a-z][.\-_* ]){3,}[a-z]\b/g, (m) =>
    m.replace(/[.\-_* ]/g, ''),
  );
}

/**
 * Built-in injection patterns. They run against the folded, lower-case text,
 * so they are written in lower case and must stay narrow enough not to flag
 * ordinary questions (e.g. "How does Redis act as a cache?").
 * @type {Array<{ id: string, pattern: RegExp }>}
 */
const DEFAULT_RULES = [
  {
    id: 'ignore-instructions',
    pattern:
      /\b(?:ignore|disregard|forget|skip|override|bypass)\s+(?:all\s+|any\s+|the\s+|your\s+|my\s+|of\s+)*(?:previous|prior|above|preceding|earlier|former|original|system|initial)\s+(?:instructions?|prompts?|directions?|directives?|rules|guidelines|context|messages?)\b/,
  },
  {
    id: 'forget-everything',
    pattern:
      /\bforget\s+(?:everything|all)\s+(?:you(?:'ve|\s+have|\s+were|\s+know|\s+learned)|(?:previous|prior|above|before|that\s+came))/,
  },
  {
    id: 'role-override',
    pattern:
      /\byou\s+are\s+now\s+(?:an?\s+|my\s+|the\s+)?(?:[a-z'-]+\s+){0,2}(?:ai|assistant|bot|chatbot|model|llm|dan|hacker|unrestricted|unfiltered|uncensored|jailbroken|evil|persona|character)\b|\byou\s+are\s+now\s+(?:in\s+)?(?:developer|dan|god|admin|jailbreak|unrestricted)\s+mode\b|\byou\s+are\s+no\s+longer\s+(?:an?\s+)?(?:ai|assistant|bound|restricted|limited|chatgpt|claude)\b|\byou\s+are\s+dan\b/,
  },
  {
    // "act as" only in imperative position: start of text/sentence, or after
    // please/now/you must/will/should. "Redis acts as a cache" is not flagged.
    id: 'act-as',
    pattern:
      /(?:^|[.!?:;\n]\s*|\b(?:please|now|you\s+(?:must|will|should|shall|can|are\s+to)|i\s+want\s+you\s+to)\s+)act\s+as\s+(?:if\s+you\b|an?\s+|my\s+|the\s+|though\b)/,
  },
  {
    id: 'pretend',
    pattern:
      /\bpretend\s+(?:that\s+)?(?:you\s+are|you're|youre|you\s+have\s+no|to\s+be\s+(?:an?\s+)?(?:\w+\s+)?(?:ai|assistant|model|bot|chatbot|dan|unrestricted|unfiltered|uncensored|evil|hacker|jailbroken))\b/,
  },
  {
    // Chat-template role markers: "system:" as a line prefix, [system],
    // <|im_start|>system, [INST], <<SYS>>, "### system".
    id: 'role-marker',
    pattern:
      /(?:^|\n)\s*(?:system|assistant|developer)\s*:|\[\s*(?:system|inst)\s*\]|<\|?\s*(?:im_start|system)\s*\|?>|<<\s*sys\s*>>|#{2,}\s*(?:system|instruction)s?\b/,
  },
  {
    id: 'dan',
    pattern: /\bdan\s+(?:mode|prompt|jailbreak)\b|\bdo\s+anything\s+now\b/,
  },
  {
    id: 'bypass-restrictions',
    pattern:
      /\b(?:bypass|circumvent|evade)\s+(?:all\s+|any\s+|your\s+|the\s+|of\s+)*(?:ai\s+|safety\s+|content\s+|ethical\s+)?(?:restrictions|guardrails|safeguards|safety\s+(?:rules|measures|guidelines|filters?)|content\s+(?:polic(?:y|ies)|filters?)|moderation)\b|\b(?:disable|ignore|remove|turn\s+off|drop)\s+(?:all\s+(?:of\s+)?)?your\s+(?:safety\s+|content\s+|ethical\s+)?(?:restrictions|filters?|guardrails|safeguards|safety|rules|guidelines|programming)\b/,
  },
  {
    id: 'override-safety',
    pattern:
      /\boverride\s+(?:your\s+|the\s+|all\s+)?(?:safety|content\s+(?:filters?|polic(?:y|ies))|system\s+(?:prompt|instructions?))\b/,
  },
  {
    id: 'jailbreak',
    pattern:
      /\bjailbr(?:ea|o)k(?:ing|en)?\s+(?:the\s+|this\s+|your\s+|an?\s+)?(?:model|ai|assistant|llm|chatbot|gpt|claude|system|prompt|you)\b|\bjailbreak\s+(?:mode|prompt)\b|\byou\s+are\s+jailbroken\b/,
  },
  {
    id: 'prompt-exfiltration',
    pattern:
      /\b(?:reveal|show|print|repeat|output|leak|display|tell\s+me)\s+(?:me\s+)?(?:your|the)\s+(?:system\s+prompt|hidden\s+(?:prompt|instructions)|initial\s+(?:prompt|instructions)|original\s+(?:prompt|instructions)|instructions\s+above)\b/,
  },
];

/**
 * Prepare a user-supplied pattern for repeated .test() calls: a global or
 * sticky flag would keep lastIndex state between calls.
 * @param {RegExp|string} pattern
 * @returns {RegExp}
 */
function toStatelessRegExp(pattern) {
  if (pattern instanceof RegExp) {
    if (!pattern.global && !pattern.sticky) return pattern;
    return new RegExp(pattern.source, pattern.flags.replace(/[gy]/g, ''));
  }
  return new RegExp(String(pattern), 'i');
}

/**
 * Detect prompt-injection attempts in text.
 *
 * Built-in rules run on the folded text. Custom patterns run on the
 * normalised text (case preserved) and on the folded text.
 *
 * @param {string} text
 * @param {object} [opts]
 * @param {Array<RegExp|string>} [opts.patterns=[]] - Extra patterns
 * @param {boolean} [opts.useDefaults=true] - Include the built-in rules
 * @returns {{ detected: boolean, matches: Array<{ id: string, pattern: string, match: string }>, normalized: string }}
 */
function detectInjection(text, opts = {}) {
  const normalized = normalizeText(text == null ? '' : text);
  const lower = normalized.toLowerCase();
  const folded = foldText(normalized);
  const matches = [];

  if (opts.useDefaults !== false) {
    for (const rule of DEFAULT_RULES) {
      const m = rule.pattern.exec(lower) || rule.pattern.exec(folded);
      if (m) {
        matches.push({
          id: rule.id,
          pattern: String(rule.pattern),
          match: m[0].trim(),
        });
      }
    }
  }

  for (const raw of opts.patterns || []) {
    const re = toStatelessRegExp(raw);
    const m = re.exec(normalized) || re.exec(folded);
    if (m) {
      matches.push({ id: 'custom', pattern: String(raw), match: m[0].trim() });
    }
  }

  return { detected: matches.length > 0, matches, normalized };
}

module.exports = {
  detectInjection,
  normalizeText,
  foldText,
  DEFAULT_RULES,
};
