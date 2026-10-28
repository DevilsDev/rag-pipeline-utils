'use strict';

const { splitSentences, tokenize, computeSupportScore } = require('./scoring');
const { mapSentenceToSources } = require('../citation/source-mapper');

/**
 * Compute faithfulness score for an answer against retrieved documents.
 * Measures how well each sentence in the answer is supported by the retrieved context.
 *
 * @param {string} answer - The generated answer text
 * @param {Array<{content: string}>} retrievedDocs - Array of retrieved documents with content
 * @param {object} [options={}] - Configuration options
 * @param {number} [options.threshold=0.5] - Minimum similarity score to consider a sentence faithful
 * @returns {{ score: number, faithfulSentences: number, totalSentences: number, details: Array<{ sentence: string, score: number, isFaithful: boolean, bestSource: number }> }}
 */
function computeFaithfulness(answer, retrievedDocs, options = {}) {
  const { threshold = 0.5 } = options;

  if (!answer || typeof answer !== 'string' || answer.trim().length === 0) {
    return { score: 0, faithfulSentences: 0, totalSentences: 0, details: [] };
  }

  if (!Array.isArray(retrievedDocs) || retrievedDocs.length === 0) {
    const sentences = splitSentences(answer);
    const details = sentences.map((sentence) => ({
      sentence,
      score: 0,
      isFaithful: false,
      bestSource: -1,
    }));
    return {
      score: 0,
      faithfulSentences: 0,
      totalSentences: sentences.length,
      details,
    };
  }

  const sentences = splitSentences(answer);

  if (sentences.length === 0) {
    return { score: 0, faithfulSentences: 0, totalSentences: 0, details: [] };
  }

  const details = sentences.map((sentence) => {
    const sentenceTokens = tokenize(sentence);
    let bestScore = 0;
    let bestSource = -1;

    for (let i = 0; i < retrievedDocs.length; i++) {
      const doc = retrievedDocs[i];
      const docContent = doc && (doc.content || doc.text || '');

      if (!docContent) {
        continue;
      }

      const docTokens = tokenize(docContent);
      const similarity = computeSupportScore(sentenceTokens, docTokens);

      if (similarity > bestScore) {
        bestScore = similarity;
        bestSource = i;
      }
    }

    return {
      sentence,
      score: bestScore,
      isFaithful: bestScore >= threshold,
      bestSource,
    };
  });

  const faithfulSentences = details.filter((d) => d.isFaithful).length;
  const totalSentences = details.length;
  const score = totalSentences > 0 ? faithfulSentences / totalSentences : 0;

  return { score, faithfulSentences, totalSentences, details };
}

/**
 * Derive faithfulness score from an existing citation result.
 * Shortcut that reuses citation analysis data rather than recomputing.
 *
 * @param {object} citationResult - Result from citation analysis
 * @param {number} citationResult.groundednessScore - Pre-computed groundedness score
 * @param {Array} [citationResult.citations] - Array of citation details
 * @returns {{ score: number, details: Array }}
 */
function computeFaithfulnessFromCitations(citationResult) {
  if (!citationResult || typeof citationResult !== 'object') {
    return { score: 0, details: [] };
  }

  const score =
    typeof citationResult.groundednessScore === 'number'
      ? citationResult.groundednessScore
      : 0;

  // CitationTracker only lists sources at or above its similarity threshold,
  // so a sentence is faithful exactly when it has at least one source.
  const details = Array.isArray(citationResult.citations)
    ? citationResult.citations.map((c) => {
        const best = Array.isArray(c.sources) ? c.sources[0] : undefined;
        return {
          sentence: c.sentence || c.text || '',
          score: best ? best.score : 0,
          isFaithful: Boolean(best),
          bestSource: best ? best.docIndex : -1,
        };
      })
    : [];

  return { score, details };
}

module.exports = { computeFaithfulness, computeFaithfulnessFromCitations };
