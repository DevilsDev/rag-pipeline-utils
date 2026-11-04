'use strict';

/**
 * Verify the citations a model returns: does each cited passage support the
 * claim that cites it? A citation can point at a real document and still
 * not say what the sentence claims.
 *
 * fromAnthropicCitations() and fromOpenAIFileCitations() normalise a
 * provider response into one shape, and verifyCitations() checks it with the
 * same lexical, number and negation checks as checkAnswer(), plus the
 * optional LLM judge for paraphrases:
 *
 *   {
 *     provider: 'anthropic' | 'openai',
 *     answer: string,
 *     claims: [{
 *       text, start, end,          // the claim and its offsets in answer
 *       citations: [{
 *         sourceId, title, location,
 *         passages: string[],      // the cited text; empty when unknown
 *       }],
 *     }],
 *     skipped: { [annotationType]: number },
 *   }
 *
 * Checked against the shapes of @anthropic-ai/sdk 1.5.0 and openai 7.48.
 */

const {
  tokenize,
  computeSupportScore,
  contentTokens,
} = require('../evaluate/scoring');
const { buildIDFWeights } = require('../citation/source-mapper');
const { DEFAULT_CONFIG } = require('../citation/citation-tracker');
const { REASONS, lexicalReasons, runJudge } = require('./llm-judge');

const THRESHOLD = DEFAULT_CONFIG.similarityThreshold;

/**
 * One citation of a claim, normalised.
 *
 * @typedef {Object} ProviderCitation
 * @property {string} sourceId - Your document id, the document title or index, a search result's source, a URL or an OpenAI file id
 * @property {string|null} title
 * @property {Object} location - Where the passage is; `type` is the provider's citation type
 * @property {string[]} passages - The cited text; empty when the response doesn't carry it
 */

/**
 * A claim of the answer and the citations attached to it.
 *
 * @typedef {Object} CitedClaim
 * @property {string} text
 * @property {number} start - Offset in `answer`
 * @property {number} end
 * @property {ProviderCitation[]} citations
 */

/**
 * What fromAnthropicCitations() and fromOpenAIFileCitations() return.
 *
 * @typedef {Object} ProviderCitations
 * @property {'anthropic'|'openai'} provider
 * @property {string} answer - The answer text
 * @property {CitedClaim[]} claims
 * @property {Object<string, number>} skipped - Citations of other kinds, by type
 * @property {boolean} [results] - OpenAI: whether the response had file search results
 */

/**
 * A claim's verdict from verifyCitations().
 *
 * @typedef {Object} VerifiedClaim
 * @property {string} text
 * @property {number} start
 * @property {number} end
 * @property {'supported'|'unsupported'|'unverifiable'} verdict
 * @property {'supported'|'low_overlap'|'number_mismatch'|'polarity_mismatch'|'unverifiable'} lexicalReason
 * @property {string} reason - Why, in words
 * @property {'lexical'|'judge'} decidedBy
 * @property {number|null} score - Support of the claim by all its cited passages together, 0..1
 * @property {Array<{sourceId: string, title: string|null, location: Object, score: number|null, supports: boolean|null}>} citations
 *   - Each citation's own support; null when it had no cited text
 */

/**
 * What verifyCitations() resolves to.
 *
 * @typedef {Object} CitationVerification
 * @property {boolean} verified - Every claim supported and every citation checkable
 * @property {'anthropic'|'openai'} provider
 * @property {VerifiedClaim[]} claims
 * @property {Array<{text: string, start: number, end: number}>} uncited - Sentences with content that no citation covers
 * @property {{claims: number, supported: number, unsupported: number, unverifiable: number, citations: number, unverifiableCitations: number, uncitedSentences: number}} summary
 * @property {Object<string, number>} skipped
 * @property {{calls: number, usage?: Object, error?: string}} [judge] - Only with the `judge` option
 */

/** Sentences of `text` with their offsets (the splitSentences rule). */
function sentencesWithOffsets(text) {
  const out = [];
  const re = /[^]*?(?:[.!?](?=\s)|$)/g;
  let m;
  let from = 0;
  while (from < text.length) {
    re.lastIndex = from;
    m = re.exec(text);
    if (!m || m[0] === '') break;
    const raw = m[0];
    const lead = raw.length - raw.trimStart().length;
    const body = raw.trim();
    if (body) {
      out.push({
        text: body,
        start: from + lead,
        end: from + lead + body.length,
      });
    }
    from += raw.length;
    // Skip the whitespace that ends the sentence
    while (from < text.length && /\s/.test(text[from])) from++;
  }
  return out;
}

const hasContent = (text) => contentTokens(tokenize(text)).length > 0;
const overlaps = (a, b) => a.start < b.end && b.start < a.end;

function documentId(documents, index, title) {
  const doc = Array.isArray(documents) ? documents[index] : undefined;
  if (doc && typeof doc === 'object') {
    const id = doc.id ?? (doc.metadata && doc.metadata.id);
    if (id != null) return String(id);
  }
  if (title) return title;
  return String(index);
}

function anthropicCitation(c, documents) {
  const passages = typeof c.cited_text === 'string' ? [c.cited_text] : [];
  switch (c.type) {
    case 'char_location':
      return {
        sourceId: documentId(documents, c.document_index, c.document_title),
        title: c.document_title ?? null,
        location: {
          type: c.type,
          documentIndex: c.document_index,
          start: c.start_char_index,
          end: c.end_char_index,
        },
        passages,
      };
    case 'page_location':
      return {
        sourceId: documentId(documents, c.document_index, c.document_title),
        title: c.document_title ?? null,
        location: {
          type: c.type,
          documentIndex: c.document_index,
          startPage: c.start_page_number,
          endPage: c.end_page_number,
        },
        passages,
      };
    case 'content_block_location':
      return {
        sourceId: documentId(documents, c.document_index, c.document_title),
        title: c.document_title ?? null,
        location: {
          type: c.type,
          documentIndex: c.document_index,
          startBlock: c.start_block_index,
          endBlock: c.end_block_index,
        },
        passages,
      };
    case 'search_result_location':
      return {
        sourceId: String(c.source),
        title: c.title ?? null,
        location: {
          type: c.type,
          searchResultIndex: c.search_result_index,
          startBlock: c.start_block_index,
          endBlock: c.end_block_index,
        },
        passages,
      };
    case 'web_search_result_location':
      return {
        sourceId: String(c.url),
        title: c.title ?? null,
        location: { type: c.type, url: c.url },
        passages,
      };
    default:
      return null;
  }
}

/**
 * Normalise the citations of a Claude Messages API response.
 *
 * Each text block that carries citations is a claim. Pass a stream's
 * final message (`stream.finalMessage()`).
 *
 * @param {object} message - The Message, as the SDK returns it or as JSON
 * @param {object} [options]
 * @param {Array<object>} [options.documents] - The request's document blocks
 *   in order (`document_index` counts them), as your own `{ id }` records,
 *   so citations name your ids; otherwise a citation is named by the
 *   document's title, or its index
 * @returns {ProviderCitations}
 */
function fromAnthropicCitations(message, { documents } = {}) {
  if (!message || typeof message !== 'object') {
    throw new TypeError('fromAnthropicCitations needs a Messages API response');
  }
  if (Array.isArray(message.output) || Array.isArray(message.choices)) {
    throw new TypeError(
      'fromAnthropicCitations takes a Claude message; use fromOpenAIFileCitations for an OpenAI response',
    );
  }
  if (!Array.isArray(message.content)) {
    throw new TypeError(
      'fromAnthropicCitations needs a message with content blocks',
    );
  }
  let answer = '';
  const claims = [];
  const skipped = {};
  for (const block of message.content) {
    if (!block || block.type !== 'text' || typeof block.text !== 'string') {
      continue;
    }
    const start = answer.length;
    answer += block.text;
    const citations = [];
    for (const c of block.citations || []) {
      const citation = anthropicCitation(c, documents);
      if (citation) citations.push(citation);
      else skipped[c.type] = (skipped[c.type] || 0) + 1;
    }
    if (citations.length > 0 && block.text.trim()) {
      claims.push({ text: block.text, start, end: answer.length, citations });
    }
  }
  return { provider: 'anthropic', answer, claims, skipped };
}

/**
 * Normalise the file citations of an OpenAI Responses API response.
 *
 * A `file_citation` carries only `file_id`, `filename` and an `index` into
 * the text, not the passage: the passages come from the file search
 * results, which the request must ask for with
 * `include: ["file_search_call.results"]`. Without them every citation is
 * unverifiable. The claim is the sentence that ends at or contains the
 * citation's index (OpenAI gives no span, so the boundary is inferred).
 * Web and container citations are counted in `skipped`. Pass a stream's
 * completed response.
 *
 * @param {object} response - The Response, as the SDK returns it or as JSON
 * @returns {ProviderCitations}
 */
function fromOpenAIFileCitations(response) {
  if (!response || typeof response !== 'object') {
    throw new TypeError(
      'fromOpenAIFileCitations needs a Responses API response',
    );
  }
  if (Array.isArray(response.choices)) {
    throw new TypeError(
      'fromOpenAIFileCitations takes a Responses API response; Chat Completions has no file citations',
    );
  }
  if (Array.isArray(response.content) && !Array.isArray(response.output)) {
    throw new TypeError(
      'fromOpenAIFileCitations takes an OpenAI Responses API response; use fromAnthropicCitations for a Claude message',
    );
  }
  if (!Array.isArray(response.output)) {
    throw new TypeError('fromOpenAIFileCitations needs a response with output');
  }

  // Passages by file, from every file search call
  const chunks = new Map();
  let results = false;
  for (const item of response.output) {
    if (!item || item.type !== 'file_search_call') continue;
    if (Array.isArray(item.results)) results = true;
    for (const r of item.results || []) {
      if (!r || !r.file_id || typeof r.text !== 'string') continue;
      if (!chunks.has(r.file_id)) chunks.set(r.file_id, []);
      chunks.get(r.file_id).push(r.text);
    }
  }

  let answer = '';
  const cited = new Map(); // sentence start -> { sentence, citations }
  const skipped = {};
  for (const item of response.output) {
    if (!item || item.type !== 'message' || !Array.isArray(item.content)) {
      continue;
    }
    for (const part of item.content) {
      if (
        !part ||
        part.type !== 'output_text' ||
        typeof part.text !== 'string'
      ) {
        continue;
      }
      // Parts are separate paragraphs: keep their sentences apart
      if (answer) answer += '\n\n';
      const offset = answer.length;
      answer += part.text;
      const sentences = sentencesWithOffsets(part.text);
      for (const a of part.annotations || []) {
        if (!a || a.type !== 'file_citation') {
          const type = (a && a.type) || 'unknown';
          skipped[type] = (skipped[type] || 0) + 1;
          continue;
        }
        // The citation follows its claim: take the sentence before index
        const at = Math.max(0, Math.min(a.index, part.text.length) - 1);
        const sentence =
          sentences.find((s) => at >= s.start && at < s.end) ||
          [...sentences].reverse().find((s) => s.end <= a.index) ||
          sentences[0];
        if (!sentence) continue;
        const key = offset + sentence.start;
        if (!cited.has(key)) {
          cited.set(key, {
            text: sentence.text,
            start: key,
            end: offset + sentence.end,
            citations: [],
          });
        }
        const claim = cited.get(key);
        if (!claim.citations.some((c) => c.sourceId === a.file_id)) {
          claim.citations.push({
            sourceId: a.file_id,
            title: a.filename ?? null,
            location: { type: 'file_citation', index: offset + a.index },
            passages: chunks.get(a.file_id) || [],
          });
        }
      }
    }
  }
  return {
    provider: 'openai',
    answer,
    claims: [...cited.values()].sort((x, y) => x.start - y.start),
    skipped,
    results,
  };
}

function checkInput(input) {
  if (
    !input ||
    typeof input !== 'object' ||
    typeof input.answer !== 'string' ||
    !Array.isArray(input.claims)
  ) {
    throw new TypeError(
      'verifyCitations takes the result of fromAnthropicCitations() or fromOpenAIFileCitations()',
    );
  }
}

const REASON_TEXT = {
  [REASONS.supported]: 'the cited passages support the claim',
  [REASONS.lowOverlap]: 'the cited passages do not contain the claim',
  [REASONS.numberMismatch]: 'the numbers do not match the cited passages',
  [REASONS.polarityMismatch]:
    'the cited passages say the opposite (negation does not match)',
  unverifiable: 'no cited text to check',
};

/**
 * Check every claim against the passages it cites: together, so a claim
 * that takes one fact from each of two passages is supported. Each
 * citation's own score is reported too.
 *
 * @param {ProviderCitations} input - From fromAnthropicCitations() or fromOpenAIFileCitations()
 * @param {object} [options]
 * @param {{generate: Function}} [options.judge] - Opt-in LLM judge for claims
 *   that failed for lack of word overlap (paraphrases), as in checkAnswer();
 *   it may only name a passage the claim cites, and never overturns a
 *   number or negation mismatch. One call at most. Errors from
 *   `judge.generate` are not caught.
 * @param {Array<object>} [options.documents] - Documents to weight terms by
 *   (IDF); default: all cited passages
 * @returns {Promise<CitationVerification>}
 */
async function verifyCitations(input, { judge, documents } = {}) {
  checkInput(input);
  if (judge != null && typeof judge.generate !== 'function') {
    throw new TypeError('judge must have a generate() method');
  }

  // One doc per passage, with an id the judge can name
  const passageDocs = [];
  const claimPassageIds = input.claims.map((claim, ci) =>
    claim.citations.flatMap((citation, ki) =>
      (citation.passages || []).map((content, pi) => {
        const id = `${ci + 1}.${ki + 1}.${pi + 1}`;
        passageDocs.push({ id, content: String(content) });
        return id;
      }),
    ),
  );
  const weightDocs = Array.isArray(documents)
    ? documents.map((d) => ({
        content: typeof d === 'string' ? d : d.content || d.text || '',
      }))
    : passageDocs;
  const idfWeights = DEFAULT_CONFIG.useIDFWeighting
    ? buildIDFWeights(weightDocs)
    : null;
  const byId = new Map(passageDocs.map((d) => [d.id, d]));

  const score = (text, contents) =>
    contents.length === 0
      ? 0
      : computeSupportScore(
          tokenize(text),
          new Set(tokenize(contents.join('\n'))),
          idfWeights,
          { claimText: text, docText: contents.join('\n') },
        );

  const claims = input.claims.map((claim, ci) => {
    const contents = claimPassageIds[ci].map((id) => byId.get(id).content);
    const citations = claim.citations.map((citation) => {
      const passages = citation.passages || [];
      if (passages.length === 0) {
        return { ...stripPassages(citation), score: null, supports: null };
      }
      // Any one of a file's chunks may support the claim
      const best = Math.max(...passages.map((p) => score(claim.text, [p])));
      return {
        ...stripPassages(citation),
        score: round(best),
        supports: best >= THRESHOLD,
      };
    });
    const combined = score(claim.text, contents);
    return {
      text: claim.text,
      start: claim.start,
      end: claim.end,
      verifiable: contents.length > 0,
      combined,
      citations,
    };
  });

  // Lexical verdicts, each claim against its own passages only
  const verifiable = claims
    .map((c, i) => i)
    .filter((i) => claims[i].verifiable);
  const sentences = verifiable.map((i) => ({
    text: claims[i].text,
    classification:
      claims[i].combined >= THRESHOLD ? 'grounded' : 'likely_hallucination',
    bestSource: null,
  }));
  const allowed = verifiable.map((i) => claimPassageIds[i]);
  let verdicts = lexicalReasons(sentences, passageDocs, allowed).map(
    (reason) => ({
      verdict: reason === REASONS.supported ? 'supported' : 'unsupported',
      lexicalReason: reason,
      reason: REASON_TEXT[reason],
      decidedBy: 'lexical',
    }),
  );
  let judged;
  if (judge != null && sentences.length > 0) {
    judged = await runJudge({ judge, sentences, docs: passageDocs, allowed });
    verdicts = judged.verdicts.map((v) => ({
      verdict: v.verdict,
      lexicalReason: v.lexicalReason,
      reason: v.decidedBy === 'judge' ? v.reason : REASON_TEXT[v.lexicalReason],
      decidedBy: v.decidedBy,
    }));
  }

  const out = claims.map((c, i) => {
    const { combined, verifiable: canCheck, ...rest } = c;
    const k = verifiable.indexOf(i);
    const v =
      k === -1
        ? {
            verdict: 'unverifiable',
            lexicalReason: 'unverifiable',
            reason:
              input.provider === 'openai' && input.results === false
                ? 'no file search results: request them with include: ["file_search_call.results"]'
                : REASON_TEXT.unverifiable,
            decidedBy: 'lexical',
          }
        : verdicts[k];
    return { ...rest, score: canCheck ? round(combined) : null, ...v };
  });

  const citedSpans = input.claims;
  const uncited = sentencesWithOffsets(input.answer).filter(
    (s) => hasContent(s.text) && !citedSpans.some((c) => overlaps(c, s)),
  );
  const count = (verdict) => out.filter((c) => c.verdict === verdict).length;
  const citationCount = out.reduce((n, c) => n + c.citations.length, 0);
  const unverifiableCitations = out.reduce(
    (n, c) => n + c.citations.filter((k) => k.supports === null).length,
    0,
  );
  const summary = {
    claims: out.length,
    supported: count('supported'),
    unsupported: count('unsupported'),
    unverifiable: count('unverifiable'),
    citations: citationCount,
    unverifiableCitations,
    uncitedSentences: uncited.length,
  };
  return {
    verified:
      out.length > 0 &&
      summary.supported === out.length &&
      unverifiableCitations === 0,
    provider: input.provider,
    claims: out,
    uncited,
    summary,
    skipped: input.skipped || {},
    ...(judged && {
      judge: {
        calls: judged.calls,
        ...(judged.usage && { usage: judged.usage }),
        ...(judged.error && { error: judged.error }),
      },
    }),
  };
}

function stripPassages(citation) {
  const { passages: _p, ...rest } = citation;
  return rest;
}

const round = (x) => Number(x.toFixed(4));

module.exports = {
  fromAnthropicCitations,
  fromOpenAIFileCitations,
  verifyCitations,
  sentencesWithOffsets,
};
