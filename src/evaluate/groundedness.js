'use strict';

const { computeFaithfulness } = require('./faithfulness');
const {
  computeContextPrecision,
  computeContextRecall,
} = require('./context-metrics');

/**
 * Default weights for the groundedness composite score.
 * @type {{ faithfulness: number, contextPrecision: number, contextRecall: number }}
 */
const DEFAULT_WEIGHTS = {
  faithfulness: 0.4,
  contextPrecision: 0.3,
  contextRecall: 0.3,
};

/** Reason reported when context recall cannot be computed. */
const NO_REFERENCE_REASON =
  'No reference answer provided: context recall measures how much of a ' +
  'reference (ground-truth) answer the retrieved documents support.';

/**
 * Compute a composite groundedness score from faithfulness, context precision
 * and (when a reference answer is given) context recall.
 *
 * Formula: a weighted mean over the components that are available,
 *
 *   score = sum(w_i * m_i) / sum(w_i)
 *
 * With a reference answer and the default weights this is
 *   0.4 * faithfulness + 0.3 * contextPrecision + 0.3 * contextRecall.
 * Without one, context recall is left out and the remaining weights are
 * renormalised:
 *   (0.4 * faithfulness + 0.3 * contextPrecision) / 0.7.
 * If every available weight is 0 the score is 0.
 *
 * @param {string} query - The user query
 * @param {string} answer - The generated answer text
 * @param {Array<{content: string}>} retrievedDocs - Array of retrieved documents
 * @param {object} [options={}] - Configuration options
 * @param {{ faithfulness: number, contextPrecision: number, contextRecall: number }} [options.weights] - Custom weights for each component
 * @param {number} [options.threshold=0.5] - Similarity threshold passed to component metrics
 * @param {string} [options.referenceAnswer] - Reference (ground-truth) answer used for context recall
 * @returns {{ score: number, components: { faithfulness: object, contextPrecision: object, contextRecall: object }, weights: { faithfulness: number, contextPrecision: number, contextRecall: number } }}
 *   `components.contextRecall` is `{ score: null, skipped: true, reason }`
 *   when no reference answer was given.
 */
function computeGroundedness(query, answer, retrievedDocs, options = {}) {
  const { threshold = 0.5, referenceAnswer } = options;
  const weights = { ...DEFAULT_WEIGHTS, ...(options.weights || {}) };

  const faithfulness = computeFaithfulness(answer, retrievedDocs, {
    threshold,
  });
  const contextPrecision = computeContextPrecision(query, retrievedDocs, {
    threshold: threshold * 0.67,
  });
  const hasReference =
    typeof referenceAnswer === 'string' && referenceAnswer.trim().length > 0;
  const contextRecall = hasReference
    ? computeContextRecall(referenceAnswer, retrievedDocs, { threshold })
    : { score: null, skipped: true, reason: NO_REFERENCE_REASON };

  const parts = [
    [weights.faithfulness, faithfulness.score],
    [weights.contextPrecision, contextPrecision.score],
  ];
  if (hasReference) parts.push([weights.contextRecall, contextRecall.score]);

  let weighted = 0;
  let totalWeight = 0;
  for (const [w, m] of parts) {
    weighted += w * m;
    totalWeight += w;
  }
  const score = totalWeight > 0 ? weighted / totalWeight : 0;

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

module.exports = { computeGroundedness, DEFAULT_WEIGHTS, NO_REFERENCE_REASON };
