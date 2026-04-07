"use strict";

const { tokenize, computeJaccardSimilarity } = require("../evaluate/scoring");

/**
 * Build IDF (Inverse Document Frequency) weights from a collection of documents.
 * IDF = log(totalDocs / docsContainingToken)
 * @param {Array<{content?: string, text?: string}>} docs - Array of document objects
 * @returns {Map<string, number>} Map of token to IDF weight
 */
function buildIDFWeights(docs) {
  const totalDocs = docs.length;
  if (totalDocs === 0) return new Map();

  const docFrequency = new Map();

  for (const doc of docs) {
    const text = doc.content || doc.text || "";
    const tokens = new Set(tokenize(text));
    for (const token of tokens) {
      docFrequency.set(token, (docFrequency.get(token) || 0) + 1);
    }
  }

  const idfWeights = new Map();
  for (const [token, df] of docFrequency) {
    idfWeights.set(token, Math.log(totalDocs / df));
  }

  return idfWeights;
}

/**
 * Map a sentence to its most relevant source documents using token similarity.
 * @param {string} sentence - The sentence to map
 * @param {Array<{content?: string, text?: string, id?: string}>} docs - Source documents
 * @param {object} [options] - Configuration options
 * @param {number} [options.maxCitations=3] - Maximum number of citations to return
 * @param {number} [options.threshold=0.3] - Minimum similarity threshold
 * @param {Map<string, number>|null} [options.idfWeights=null] - Optional IDF weights for weighted similarity
 * @returns {Array<{docIndex: number, docId: string|undefined, score: number, matchedTokens: string[]}>}
 */
function mapSentenceToSources(sentence, docs, options = {}) {
  const { maxCitations = 3, threshold = 0.3, idfWeights = null } = options;

  const sentenceTokens = tokenize(sentence);
  if (!sentenceTokens.length) return [];

  const results = [];

  for (let i = 0; i < docs.length; i++) {
    const doc = docs[i];
    const docText = doc.content || doc.text || "";
    const docTokens = tokenize(docText);
    if (!docTokens.length) continue;

    let score;
    const sentenceSet = new Set(sentenceTokens);
    const docSet = new Set(docTokens);
    const matched = [...sentenceSet].filter((t) => docSet.has(t));

    if (idfWeights) {
      // IDF-weighted Jaccard: sum IDF weights of intersection / sum IDF weights of union
      const union = new Set([...sentenceSet, ...docSet]);
      let intersectionWeight = 0;
      let unionWeight = 0;

      for (const token of union) {
        const weight = idfWeights.get(token) || 1;
        if (sentenceSet.has(token) && docSet.has(token)) {
          intersectionWeight += weight;
        }
        unionWeight += weight;
      }

      score = unionWeight > 0 ? intersectionWeight / unionWeight : 0;
    } else {
      score = computeJaccardSimilarity(sentenceTokens, docTokens);
    }

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
