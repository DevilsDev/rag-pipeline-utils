'use strict';

const { EventEmitter } = require('events');
const { CostCalculator } = require('./cost-calculator');
const { TokenBudget } = require('./token-budget');

/**
 * Default tracker configuration.
 * @type {{model: string, embeddingModel: string, enableBudget: boolean, budgetOptions: object}}
 */
const DEFAULT_CONFIG = {
  model: 'gpt-3.5-turbo',
  embeddingModel: 'text-embedding-3-small',
  enableBudget: false,
  budgetOptions: {},
};

/**
 * Estimated tokens per character when actual token counts are unavailable.
 * @private
 */
const CHARS_PER_TOKEN = 4;

/**
 * Wraps pipeline execution to automatically track token usage and costs.
 *
 * @example
 * const tracker = new CostTracker({ model: 'gpt-4o', enableBudget: true, budgetOptions: { maxCost: 10 } });
 * const wrapped = tracker.wrap(pipeline);
 * const result = await wrapped.run(input);
 * console.log(result.cost); // { inputTokens, outputTokens, estimatedCost, model }
 * console.log(tracker.getSummary());
 */
class CostTracker extends EventEmitter {
  /**
   * @param {object} [options]
   * @param {string} [options.model='gpt-3.5-turbo'] - Default LLM model for cost estimation.
   * @param {string} [options.embeddingModel='text-embedding-3-small'] - Default embedding model.
   * @param {boolean} [options.enableBudget=false] - Whether to enforce a token/cost budget.
   * @param {object} [options.budgetOptions] - Options forwarded to {@link TokenBudget}.
   * @param {object} [options.calculatorOptions] - Options forwarded to {@link CostCalculator}.
   */
  constructor(options = {}) {
    super();
    this.config = { ...DEFAULT_CONFIG, ...options };
    this.calculator = new CostCalculator(options.calculatorOptions);
    this.budget = this.config.enableBudget
      ? new TokenBudget(this.config.budgetOptions)
      : null;
    this.sessions = [];
    this.currentSession = null;
  }

  /**
   * Extract token usage from a pipeline result.
   * Checks common locations: result.usage, result.evaluation, or estimates from content length.
   * @param {object} result
   * @returns {{inputTokens: number, outputTokens: number}}
   * @private
   */
  _extractUsage(result) {
    // Direct usage field (OpenAI-style)
    if (result.usage) {
      return {
        inputTokens:
          result.usage.prompt_tokens || result.usage.inputTokens || 0,
        outputTokens:
          result.usage.completion_tokens || result.usage.outputTokens || 0,
      };
    }

    // Evaluation metadata
    if (result.evaluation && result.evaluation.tokens) {
      return {
        inputTokens: result.evaluation.tokens.input || 0,
        outputTokens: result.evaluation.tokens.output || 0,
      };
    }

    // Estimate from content length
    const inputText = result.input || result.query || result.prompt || '';
    const outputText = result.output || result.answer || result.response || '';
    return {
      inputTokens: Math.ceil(String(inputText).length / CHARS_PER_TOKEN),
      outputTokens: Math.ceil(String(outputText).length / CHARS_PER_TOKEN),
    };
  }

  /**
   * Wrap a pipeline so that every `.run()` call is cost-tracked.
   *
   * @param {object} pipeline - Object with a `.run()` method.
   * @returns {object} A proxy pipeline whose `.run()` enriches results with cost data.
   */
  wrap(pipeline) {
    const tracker = this;

    return {
      ...pipeline,

      /**
       * Execute the wrapped pipeline and attach cost metadata to the result.
       * @param {...*} args - Arguments forwarded to the original pipeline.run().
       * @returns {Promise<object>} The pipeline result enriched with a `.cost` property.
       */
      run: async (...args) => {
        if (!tracker.currentSession) {
          tracker.startSession({ autoStarted: true });
        }

        const result = await pipeline.run(...args);

        const { inputTokens, outputTokens } = tracker._extractUsage(result);
        const model = result.model || tracker.config.model;
        const costEstimate = tracker.calculator.estimate(
          model,
          inputTokens,
          outputTokens,
        );

        // Budget enforcement
        if (tracker.budget) {
          const budgetCheck = tracker.budget.check(
            inputTokens + outputTokens,
            costEstimate.totalCost,
          );
          if (!budgetCheck.allowed) {
            const err = new Error(`Budget exceeded: ${budgetCheck.reason}`);
            err.code = 'BUDGET_EXCEEDED';
            err.budgetCheck = budgetCheck;
            throw err;
          }
          tracker.budget.record(
            inputTokens + outputTokens,
            costEstimate.totalCost,
          );
        }

        // Attach cost data to result
        result.cost = {
          inputTokens,
          outputTokens,
          estimatedCost: costEstimate.totalCost,
          model: costEstimate.model,
          currency: 'USD',
        };

        // Record in session
        const entry = {
          timestamp: Date.now(),
          inputTokens,
          outputTokens,
          cost: costEstimate.totalCost,
          model: costEstimate.model,
        };

        if (tracker.currentSession) {
          tracker.currentSession.entries.push(entry);
          tracker.currentSession.totalTokens += inputTokens + outputTokens;
          tracker.currentSession.totalCost += costEstimate.totalCost;
        }

        tracker.emit('tracked', entry);

        return result;
      },
    };
  }

  /**
   * Start a new tracking session.
   *
   * @param {object} [metadata={}] - Arbitrary metadata to attach to the session.
   * @returns {{id: string, startTime: number, metadata: object, entries: Array,
   *            totalTokens: number, totalCost: number}}
   */
  startSession(metadata = {}) {
    const session = {
      id: `session_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      startTime: Date.now(),
      endTime: null,
      metadata,
      entries: [],
      totalTokens: 0,
      totalCost: 0,
    };

    this.currentSession = session;
    this.sessions.push(session);
    return session;
  }

  /**
   * End the current tracking session and compute totals.
   *
   * @returns {object|null} The closed session, or null if no session was active.
   */
  endSession() {
    if (!this.currentSession) return null;

    this.currentSession.endTime = Date.now();
    const closed = this.currentSession;
    this.currentSession = null;
    return closed;
  }

  /**
   * Return an aggregate summary across all sessions.
   *
   * @returns {{totalTokens: number, totalCost: number, sessionCount: number,
   *            avgCostPerQuery: number, breakdown: Record<string, {tokens: number, cost: number, count: number}>}}
   */
  getSummary() {
    let totalTokens = 0;
    let totalCost = 0;
    let totalOps = 0;
    const breakdown = {};

    for (const session of this.sessions) {
      for (const entry of session.entries) {
        totalTokens += entry.inputTokens + entry.outputTokens;
        totalCost += entry.cost;
        totalOps += 1;

        if (!breakdown[entry.model]) {
          breakdown[entry.model] = { tokens: 0, cost: 0, count: 0 };
        }
        breakdown[entry.model].tokens += entry.inputTokens + entry.outputTokens;
        breakdown[entry.model].cost += entry.cost;
        breakdown[entry.model].count += 1;
      }
    }

    return {
      totalTokens,
      totalCost,
      sessionCount: this.sessions.length,
      avgCostPerQuery: totalOps > 0 ? totalCost / totalOps : 0,
      breakdown,
    };
  }

  /**
   * Return the full history of tracked operations across all sessions.
   *
   * @returns {Array<{timestamp: number, inputTokens: number, outputTokens: number,
   *                   cost: number, model: string, sessionId: string}>}
   */
  getHistory() {
    const history = [];
    for (const session of this.sessions) {
      for (const entry of session.entries) {
        history.push({ ...entry, sessionId: session.id });
      }
    }
    return history;
  }
}

module.exports = { CostTracker, DEFAULT_CONFIG };
