"use strict";

const { computeFaithfulness } = require("./faithfulness");
const {
  computeContextPrecision,
  computeContextRecall,
} = require("./context-metrics");

/**
 * Default weights for the groundedness composite score.
 * @type {{ faithfulness: number, contextPrecision: number, contextRecall: number }}
 */
const DEFAULT_WEIGHTS = {
  faithfulness: 0.4,
  contextPrecision: 0.3,
  contextRecall: 0.3,
};

/**
 * Compute a composite groundedness score combining faithfulness, context precision, and context recall.
 * Uses a weighted average of the three component metrics.
 *
 * @param {string} query - The user query
 * @param {string} answer - The generated answer text
 * @param {Array<{content: string}>} retrievedDocs - Array of retrieved documents
 * @param {object} [options={}] - Configuration options
 * @param {{ faithfulness: number, contextPrecision: number, contextRecall: number }} [options.weights] - Custom weights for each component
 * @param {number} [options.threshold=0.3] - Similarity threshold passed to component metrics
 * @returns {{ score: number, components: { faithfulness: object, contextPrecision: object, contextRecall: object }, weights: { faithfulness: number, contextPrecision: number, contextRecall: number } }}
 */
function computeGroundedness(query, answer, retrievedDocs, options = {}) {
  const { weights = DEFAULT_WEIGHTS, threshold = 0.3 } = options;

  const faithfulness = computeFaithfulness(answer, retrievedDocs, {
    threshold,
  });
  const contextPrecision = computeContextPrecision(query, retrievedDocs, {
    threshold: threshold * 0.67,
  });
  const contextRecall = computeContextRecall(answer, retrievedDocs, {
    threshold,
  });

  const score =
    weights.faithfulness * faithfulness.score +
    weights.contextPrecision * contextPrecision.score +
    weights.contextRecall * contextRecall.score;

  return {
    score,
    components: {
      faithfulness,
      contextPrecision,
      contextRecall,
    },
    weights,
  };
}

module.exports = { computeGroundedness, DEFAULT_WEIGHTS };
