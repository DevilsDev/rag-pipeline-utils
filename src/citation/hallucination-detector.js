"use strict";

/**
 * Detect hallucinations by analyzing citation results and classifying each sentence.
 *
 * Classification:
 * - 'definite_hallucination': bestScore === 0 (no overlap with any source)
 * - 'likely_hallucination': bestScore > 0 but below threshold
 * - 'grounded': bestScore >= threshold
 *
 * @param {Array<{sentence: string, sources: Array<{docId: string|undefined, docIndex: number, score: number}>}>} citationResults
 * @param {object} [options]
 * @param {number} [options.threshold=0.3] - Score threshold for grounded classification
 * @returns {{
 *   hallucinationRate: number,
 *   sentences: Array<{text: string, classification: string, bestScore: number, bestSource: object|null}>,
 *   summary: {grounded: number, likely_hallucination: number, definite_hallucination: number}
 * }}
 */
function detectHallucinations(citationResults, options = {}) {
  const { threshold = 0.3 } = options;

  if (!Array.isArray(citationResults) || citationResults.length === 0) {
    return {
      hallucinationRate: 0,
      sentences: [],
      summary: {
        grounded: 0,
        likely_hallucination: 0,
        definite_hallucination: 0,
      },
    };
  }

  const summary = {
    grounded: 0,
    likely_hallucination: 0,
    definite_hallucination: 0,
  };
  const sentences = [];

  for (const entry of citationResults) {
    const sources = entry.sources || [];
    const bestSource = sources.length > 0 ? sources[0] : null;
    const bestScore = bestSource ? bestSource.score : 0;

    let classification;
    if (bestScore === 0) {
      classification = "definite_hallucination";
    } else if (bestScore < threshold) {
      classification = "likely_hallucination";
    } else {
      classification = "grounded";
    }

    summary[classification]++;
    sentences.push({
      text: entry.sentence,
      classification,
      bestScore,
      bestSource,
    });
  }

  const total = sentences.length;
  const hallucinationRate =
    total > 0
      ? (summary.definite_hallucination + summary.likely_hallucination) / total
      : 0;

  return { hallucinationRate, sentences, summary };
}

module.exports = { detectHallucinations };
