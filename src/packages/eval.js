'use strict';

/**
 * @devilsdev/rag-eval: evaluation metrics, datasets and reports, answer
 * grounding and citations. The metrics createRagPipeline's own `evaluate`
 * and `citations` options use live in @devilsdev/rag-core; this package
 * re-exports them, the same objects.
 */

const {
  scoreAnswer,
  computeBLEU,
  computeROUGE,
  checkNumericConsistency,
  extractNumbers,
} = require('../evaluate/scoring');
const { computeFaithfulness } = require('../evaluate/faithfulness');
const {
  computeSemanticSimilarity,
} = require('../evaluate/semantic-similarity');
const { validateDataset } = require('../evaluate/dataset');
const { generateSyntheticDataset } = require('../evaluate/synthetic');
const { runEvaluation, compareConfigurations } = require('../evaluate/compare');
const {
  evaluationVerdict,
  renderEvaluationReport,
} = require('../evaluate/report');
const { computeAnswerRelevance } = require('../evaluate/relevance');
const {
  computeContextPrecision,
  computeContextRecall,
} = require('../evaluate/context-metrics');
const { computeGroundedness } = require('../evaluate/groundedness');
const { PipelineEvaluator } = require('../evaluate/pipeline-evaluator');
const { evaluateRagDataset } = require('../evaluate/evaluator');
const { checkAnswer, normalizeSources } = require('../grounding/check-answer');
const { CitationTracker } = require('../citation/citation-tracker');
const {
  mapSentenceToSources,
  buildIDFWeights,
} = require('../citation/source-mapper');
const { detectHallucinations } = require('../citation/hallucination-detector');

module.exports = {
  evaluateRagDataset,
  scoreAnswer,
  computeBLEU,
  computeROUGE,
  checkNumericConsistency,
  extractNumbers,
  computeFaithfulness,
  computeSemanticSimilarity,
  validateDataset,
  generateSyntheticDataset,
  runEvaluation,
  compareConfigurations,
  evaluationVerdict,
  renderEvaluationReport,
  computeAnswerRelevance,
  computeContextPrecision,
  computeContextRecall,
  computeGroundedness,
  PipelineEvaluator,
  checkAnswer,
  normalizeSources,
  CitationTracker,
  mapSentenceToSources,
  buildIDFWeights,
  detectHallucinations,
};
