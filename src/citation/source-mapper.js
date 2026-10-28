'use strict';

const { tokenize, computeSupportScore } = require('../evaluate/scoring');

/**
 * Build IDF (Inverse Document Frequency) weights from a collection of documents.
 * IDF = log(1 + totalDocs / docsContainingToken). The +1 keeps weights
 * positive, so tokens found in every document (and every token when only one
 * document was retrieved) still count instead of weighing zero.
 * @param {Array<{content?: string, text?: string}>} docs - Array of document objects
 * @returns {Map<string, number>} Map of token to IDF weight
 */
function buildIDFWeights(docs) {
  const totalDocs = docs.length;
  if (totalDocs === 0) return new Map();

  const docFrequency = new Map();

  for (const doc of docs) {
    const text = doc.content || doc.text || '';
    const tokens = new Set(tokenize(text));
    for (const token of tokens) {
      docFrequency.set(token, (docFrequency.get(token) || 0) + 1);
    }
  }

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
 * @returns {Array<{docIndex: number, docId: string|undefined, score: number, matchedTokens: string[]}>}
 */
function mapSentenceToSources(sentence, docs, options = {}) {
  const { maxCitations = 3, threshold = 0.5, idfWeights = null } = options;

  const sentenceTokens = tokenize(sentence);
  if (!sentenceTokens.length) return [];

  const results = [];

  for (let i = 0; i < docs.length; i++) {
    const doc = docs[i];
    const docText = doc.content || doc.text || '';
    const docTokens = tokenize(docText);
    if (!docTokens.length) continue;

    // Share of the sentence's content tokens found in this document.
    const docSet = new Set(docTokens);
    const score = computeSupportScore(sentenceTokens, docSet, idfWeights, {
      claimText: sentence,
      docText,
    });
    const matched = [...new Set(sentenceTokens)].filter((t) => docSet.has(t));

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
