'use strict';

/**
 * Fit retrieved documents into a token budget before they reach the LLM.
 *
 * Documents keep their order (the retriever's or reranker's ranking). Each
 * one that fits is kept; one that doesn't is skipped, and later, shorter
 * documents may still fit. The top document is always included: when it
 * alone exceeds the budget it is cut at a word boundary, so a small budget
 * never leaves the model with no context. Inputs are never modified; a cut
 * document is a copy marked `metadata.truncated: true`.
 */

/**
 * The library's token estimate: about four characters per token. Pass
 * `countTokens` to use a real tokenizer.
 * @param {string} text
 * @returns {number}
 */
function estimateTokens(text) {
  return Math.ceil(String(text || '').length / 4);
}

function documentText(doc) {
  if (doc == null) return '';
  if (typeof doc === 'string') return doc;
  return String(doc.content ?? doc.text ?? '');
}

function documentId(doc, index) {
  if (doc && typeof doc === 'object' && doc.id != null) return doc.id;
  return index;
}

/**
 * Cut text to the longest prefix, ending at a word boundary, that fits in
 * `budget` tokens. Binary search on length, because a tokenizer's count
 * isn't proportional to characters.
 * @returns {string} The prefix (empty when not even one word fits)
 */
function cutToFit(text, budget, countTokens) {
  if (countTokens(text) <= budget) return text;
  let lo = 0;
  let hi = text.length;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (countTokens(text.slice(0, mid)) <= budget) lo = mid;
    else hi = mid - 1;
  }
  let prefix = text.slice(0, lo);
  // Back up to the last whitespace so no word is cut in half.
  if (lo < text.length && !/\s/.test(text[lo])) {
    const space = prefix.search(/\s\S*$/);
    prefix = space > 0 ? prefix.slice(0, space) : '';
  }
  return prefix.trimEnd();
}

/**
 * Fit documents into a token budget.
 *
 * The budget covers the documents and the per-document wrapper the built-in
 * connectors add (`<document index="n">`). The system prompt, the
 * instructions around the documents and the question come on top.
 *
 * @example
 * const { documents, tokens, dropped } = packContext(results, {
 *   maxTokens: 2000,
 * });
 *
 * @param {Array<object|string>} documents - Ranked documents, best first
 * @param {object} options
 * @param {number} options.maxTokens - Token budget for the documents
 * @param {(text: string) => number} [options.countTokens] - Token counter (default: about four characters per token)
 * @param {boolean} [options.truncate=true] - Cut the top document to fit when it alone exceeds the budget
 * @returns {{ documents: Array<object|string>, tokens: number, maxTokens: number, kept: Array<string|number>, dropped: Array<string|number>, truncated: Array<string|number> }}
 */
function packContext(documents, options = {}) {
  const { maxTokens, countTokens = estimateTokens, truncate = true } = options;
  if (!Number.isFinite(maxTokens) || maxTokens < 0) {
    throw new TypeError('packContext: maxTokens must be a non-negative number');
  }
  if (typeof countTokens !== 'function') {
    throw new TypeError('packContext: countTokens must be a function');
  }
  const list = Array.isArray(documents) ? documents : [];
  const packed = [];
  const kept = [];
  const dropped = [];
  const truncated = [];
  let tokens = 0;

  list.forEach((doc, index) => {
    const id = documentId(doc, index);
    // Wrapper cost for the position this document would take.
    const overhead = countTokens(
      `<document index="${packed.length + 1}">\n\n</document>`,
    );
    const cost = countTokens(documentText(doc)) + overhead;
    if (tokens + cost <= maxTokens) {
      packed.push(doc);
      kept.push(id);
      tokens += cost;
      return;
    }
    if (index === 0 && truncate) {
      const text = cutToFit(
        documentText(doc),
        Math.max(0, maxTokens - overhead),
        countTokens,
      );
      if (text) {
        const copy =
          typeof doc === 'string'
            ? text
            : {
                ...doc,
                content: text,
                metadata: { ...(doc.metadata || {}), truncated: true },
              };
        packed.push(copy);
        kept.push(id);
        truncated.push(id);
        tokens += countTokens(text) + overhead;
        return;
      }
    }
    dropped.push(id);
  });

  return { documents: packed, tokens, maxTokens, kept, dropped, truncated };
}

module.exports = { packContext, estimateTokens };
