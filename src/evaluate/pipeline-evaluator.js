'use strict';

const { EventEmitter } = require('events');
const {
  computeFaithfulness,
  computeFaithfulnessFromCitations,
} = require('./faithfulness');
const { computeAnswerRelevance } = require('./relevance');
const {
  computeContextPrecision,
  computeContextRecall,
} = require('./context-metrics');
const { computeGroundedness } = require('./groundedness');
const { scoreAnswer } = require('./scoring');

/**
 * Default configuration for PipelineEvaluator.
 * @type {{ metrics: string[], threshold: number, includeBLEU: boolean, includeROUGE: boolean }}
 */
const DEFAULT_CONFIG = {
  metrics: [
    'faithfulness',
    'relevance',
    'contextPrecision',
    'contextRecall',
    'groundedness',
  ],
  threshold: 0.3,
  includeBLEU: false,
  includeROUGE: false,
};

/**
 * Evaluates RAG pipeline outputs using multiple quality metrics.
 * Emits an 'evaluated' event after each evaluation with the full result.
 *
 * @extends EventEmitter
 *
 * @example
 * const evaluator = new PipelineEvaluator({ metrics: ['faithfulness', 'relevance'] });
 * evaluator.on('evaluated', (result) => console.log(result.scores));
 * const result = evaluator.evaluate({ query: 'What is RAG?', answer: '...', results: [...] });
 */
class PipelineEvaluator extends EventEmitter {
  /**
   * Create a new PipelineEvaluator.
   * @param {object} [options={}] - Configuration options
   * @param {string[]} [options.metrics] - List of metrics to compute
   * @param {number} [options.threshold] - Similarity threshold for metrics
   * @param {boolean} [options.includeBLEU] - Whether to include BLEU score when reference answer is provided
   * @param {boolean} [options.includeROUGE] - Whether to include ROUGE score when reference answer is provided
   */
  constructor(options = {}) {
    super();
    this.config = { ...DEFAULT_CONFIG, ...options };
  }

  /**
   * Evaluate a pipeline result across all configured metrics.
   *
   * @param {object} pipelineResult - The pipeline output to evaluate
   * @param {string} pipelineResult.query - The original user query
   * @param {string} pipelineResult.answer - The generated answer
   * @param {Array<{content: string}>} pipelineResult.results - Retrieved documents
   * @param {object} [options={}] - Additional evaluation options
   * @param {object} [options.citationResult] - Pre-computed citation result for faithfulness shortcut
   * @param {string} [options.referenceAnswer] - Reference answer for BLEU/ROUGE scoring
   * @returns {{ scores: Object<string, number>, details: Object<string, object>, metadata: { metricsComputed: string[], threshold: number, timestamp: string } }}
   */
  evaluate(pipelineResult, options = {}) {
    const { citationResult, referenceAnswer } = options;
    const query = (pipelineResult && pipelineResult.query) || '';
    const answer = (pipelineResult && pipelineResult.answer) || '';
    const results = (pipelineResult && pipelineResult.results) || [];

    const scores = {};
    const details = {};
    const metricsComputed = [];
    const { metrics, threshold } = this.config;

    if (metrics.includes('faithfulness')) {
      let faithResult;
      if (citationResult) {
        faithResult = computeFaithfulnessFromCitations(citationResult);
      } else {
        faithResult = computeFaithfulness(answer, results, { threshold });
      }
      scores.faithfulness = faithResult.score;
      details.faithfulness = faithResult;
      metricsComputed.push('faithfulness');
    }

    if (metrics.includes('relevance')) {
      const relevanceResult = computeAnswerRelevance(query, answer);
      scores.relevance = relevanceResult.score;
      details.relevance = relevanceResult;
      metricsComputed.push('relevance');
    }

    if (metrics.includes('contextPrecision')) {
      const precisionResult = computeContextPrecision(query, results, {
        threshold: threshold * 0.67,
      });
      scores.contextPrecision = precisionResult.score;
      details.contextPrecision = precisionResult;
      metricsComputed.push('contextPrecision');
    }

    if (metrics.includes('contextRecall')) {
      const recallResult = computeContextRecall(answer, results, { threshold });
      scores.contextRecall = recallResult.score;
      details.contextRecall = recallResult;
      metricsComputed.push('contextRecall');
    }

    if (metrics.includes('groundedness')) {
      const groundednessResult = computeGroundedness(query, answer, results, {
        threshold,
      });
      scores.groundedness = groundednessResult.score;
      details.groundedness = groundednessResult;
      metricsComputed.push('groundedness');
    }

    // Optional BLEU/ROUGE when reference answer is provided
    if (referenceAnswer && typeof referenceAnswer === 'string') {
      if (this.config.includeBLEU || this.config.includeROUGE) {
        const refScores = scoreAnswer(answer, referenceAnswer);
        if (this.config.includeBLEU) {
          scores.bleu = refScores.bleu;
          metricsComputed.push('bleu');
        }
        if (this.config.includeROUGE) {
          scores.rouge = refScores.rouge;
          metricsComputed.push('rouge');
        }
      }
    }

    const result = {
      scores,
      details,
      metadata: {
        metricsComputed,
        threshold,
        timestamp: new Date().toISOString(),
      },
    };

    this.emit('evaluated', result);

    return result;
  }
}

module.exports = { PipelineEvaluator, DEFAULT_CONFIG };
