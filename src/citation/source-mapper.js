'use strict';

const {
  tokenize,
  computeSupportScore,
  prepareDocument,
  sourceNorm,
  sourceTokenSet,
} = require('../evaluate/scoring');

/**
 * Build IDF (Inverse Document Frequency) weights from a collection of documents.
 * IDF = log(1 + totalDocs / docsContainingToken). The +1 keeps weights
 * positive, so tokens found in every document (and every token when only one
 * document was retrieved) still count instead of weighing zero. Identical
 * documents (the same text after normalisation) count once, so a duplicated
 * source doesn't move any weight (3.9, BH-7).
 * @param {Array<{content?: string, text?: string}>} docs - Array of document objects
 * @returns {Map<string, number>} Map of token to IDF weight
 */
function buildIDFWeights(docs) {
  if (docs.length === 0) return new Map();

  const docFrequency = new Map();
  const seen = new Set();

  for (const doc of docs) {
    const text = doc.content || doc.text || '';
    const prepared = prepareDocument(doc, text);
    const key = sourceNorm(prepared);
    if (seen.has(key)) continue;
    seen.add(key);
    const tokens = sourceTokenSet(prepared);
    for (const token of tokens) {
      docFrequency.set(token, (docFrequency.get(token) || 0) + 1);
    }
  }

  const totalDocs = seen.size;
  const idfWeights = new Map();
  for (const [token, df] of docFrequency) {
    idfWeights.set(token, Math.log(1 + totalDocs / df));
  }

  return idfWeights;
}

/**
 * Map a sentence to its most relevant source documents by how much of the
 * sentence each document supports (see computeSupportScore).
 * @param {string} sentence - The sentence to map
 * @param {Array<{content?: string, text?: string, id?: string}>} docs - Source documents
 * @param {object} [options] - Configuration options
 * @param {number} [options.maxCitations=3] - Maximum number of citations to return
 * @param {number} [options.threshold=0.5] - Minimum similarity threshold
 * @param {Map<string, number>|null} [options.idfWeights=null] - Optional IDF weights for weighted similarity
 * @param {string} [options.answerText] - The whole answer the sentence comes
 *   from: a condition it restates in another sentence counts as kept
 * @param {boolean} [options.conditionCheck=true] - false: skip the condition
 *   check (see computeSupportScore)
 * @param {{bestScore: number}} [options.best] - Filled with the best score of
 *   any document, also when below the threshold (CitationTracker's near
 *   misses)
 * @param {object[]} [options.preparedSources] - prepareDocument() of each doc,
 *   in order, when the same docs are mapped for several sentences
 * @returns {Array<{docIndex: number, docId: string|undefined, score: number, matchedTokens: string[]}>}
 */
function mapSentenceToSources(sentence, docs, options = {}) {
  const {
    maxCitations = 3,
    threshold = 0.5,
    idfWeights = null,
    answerText,
    conditionCheck,
    preparedSources,
    best,
  } = options;

  const sentenceTokens = tokenize(sentence);
  if (!sentenceTokens.length) return [];

  const results = [];

  for (let i = 0; i < docs.length; i++) {
    const doc = docs[i];
    const prepared =
      (preparedSources && preparedSources[i]) ||
      prepareDocument(doc, doc.content || doc.text || '');
    const docSet = sourceTokenSet(prepared);
    if (docSet.size === 0) continue;

    // Share of the sentence's content tokens found in this document.
    const score = computeSupportScore(sentenceTokens, docSet, idfWeights, {
      claimText: sentence,
      docText: prepared,
      answerText,
      conditionCheck,
    });
    const matched = [...new Set(sentenceTokens)].filter((t) => docSet.has(t));
    if (best && score > best.bestScore) best.bestScore = score;

    if (score >= threshold) {
      results.push({
        docIndex: i,
        docId: doc.id,
        score,
        matchedTokens: matched,
      });
    }
  }

  results.sort((a, b) => b.score - a.score);
  return results.slice(0, maxCitations);
}

module.exports = { mapSentenceToSources, buildIDFWeights };
