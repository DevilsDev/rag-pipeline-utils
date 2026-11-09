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
// Rough size of the RAG prompt around the passages (instructions and
// delimiters) and of each passage's wrapper, for estimates
const PROMPT_OVERHEAD_CHARS = 600;
const PASSAGE_WRAPPER_CHARS = 40;

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

    // Estimate from content length. The model reads the query and every
    // retrieved passage, inside a prompt, so count all of it, not just
    // the query (which under-counted about 25x on a three-passage run).
    const inputText = result.input || result.query || result.prompt || '';
    const outputText = result.output || result.answer || result.response || '';
    const passages = Array.isArray(result.results) ? result.results : [];
    const passageChars = passages.reduce((n, doc) => {
      const text =
        typeof doc === 'string'
          ? doc
          : (doc && (doc.content || doc.text)) || '';
      return n + String(text).length + PASSAGE_WRAPPER_CHARS;
    }, 0);
    const promptChars = passages.length > 0 ? PROMPT_OVERHEAD_CHARS : 0;
    return {
      inputTokens: Math.ceil(
        (String(inputText).length + passageChars + promptChars) /
          CHARS_PER_TOKEN,
      ),
      outputTokens: Math.ceil(String(outputText).length / CHARS_PER_TOKEN),
      estimated: true,
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

        // Refuse a run the budget cannot cover before any money is spent,
        // using what is known up front: the query.
        tracker._preCheck(args[0]);

        const result = await pipeline.run(...args);

        if (result && typeof result[Symbol.asyncIterator] === 'function') {
          return tracker._trackStream(result, args[0]);
        }

        const usage = tracker._extractUsage(result);
        const cacheHit = Boolean(result.cache && result.cache.generation === 'hit');
        // A routed run (createModelRouter) names the model it used.
        const model =
          result.model ||
          (result.route && result.route.model) ||
          tracker.config.model;
        const { cost, budgetError } = tracker._settle({
          ...usage,
          model,
          cacheHit,
        });
        result.cost = cost;
        if (budgetError) {
          budgetError.result = result;
          throw budgetError;
        }
        return result;
      },
    };
  }

  /**
   * Throw BUDGET_EXCEEDED before a run when the budget is already spent or
   * the query alone would not fit.
   * @private
   */
  _preCheck(input) {
    if (!this.budget) return;
    const query = typeof input === 'string' ? input : input && input.query;
    const inputTokens = Math.ceil(String(query || '').length / CHARS_PER_TOKEN);
    const est = this.calculator.estimate(this.config.model, inputTokens, 0);
    const check = this.budget.check(inputTokens, est.totalCost);
    if (!check.allowed) {
      const err = new Error(`Budget exceeded: ${check.reason}`);
      err.code = 'BUDGET_EXCEEDED';
      err.budgetCheck = check;
      throw err;
    }
  }

  /**
   * Price a finished run, record it (the money is spent even when it is over
   * budget), and report a BUDGET_EXCEEDED error when it did not fit.
   * @private
   */
  _settle({ inputTokens, outputTokens, estimated, model, cacheHit }) {
    // A generation cache hit makes no model call, so it costs nothing.
    const tokensIn = cacheHit ? 0 : inputTokens;
    const tokensOut = cacheHit ? 0 : outputTokens;
    const costEstimate = this.calculator.estimate(model, tokensIn, tokensOut);

    let budgetError = null;
    if (this.budget) {
      const budgetCheck = this.budget.check(
        tokensIn + tokensOut,
        costEstimate.totalCost,
      );
      this.budget.record(tokensIn + tokensOut, costEstimate.totalCost);
      if (!budgetCheck.allowed) {
        budgetError = new Error(`Budget exceeded: ${budgetCheck.reason}`);
        budgetError.code = 'BUDGET_EXCEEDED';
        budgetError.budgetCheck = budgetCheck;
      }
    }

    const cost = {
      inputTokens: tokensIn,
      outputTokens: tokensOut,
      estimatedCost: costEstimate.totalCost,
      // The price-table entry used (as before), and the model the run
      // asked for, which can differ in form (claude-haiku-4-5 is priced
      // as claude-haiku-4.5)
      model: costEstimate.model,
      requestedModel: model,
      currency: 'USD',
      // Token counts estimated from text length (no usage reported)
      ...(estimated && { tokensEstimated: true }),
      ...(cacheHit && { cacheHit: true }),
    };

    const entry = {
      timestamp: Date.now(),
      inputTokens: tokensIn,
      outputTokens: tokensOut,
      cost: costEstimate.totalCost,
      model: costEstimate.model,
    };
    if (this.currentSession) {
      this.currentSession.entries.push(entry);
      this.currentSession.totalTokens += tokensIn + tokensOut;
      this.currentSession.totalCost += costEstimate.totalCost;
    }
    this.emit('tracked', entry);

    if (budgetError) budgetError.cost = cost;
    return { cost, budgetError };
  }

  /**
   * Wrap a token stream so its usage is recorded when it ends. Tokens are
   * counted from the text that streamed (or the usage the final chunk
   * reports); the final chunk carries the cost.
   * @private
   */
  _trackStream(stream, input) {
    const tracker = this;
    const query = typeof input === 'string' ? input : (input && input.query) || '';
    const model = tracker.config.model;
    const state = { text: '', settled: false };

    const settle = (doneChunk) => {
      state.settled = true;
      const usage = tracker._extractUsage({
        query,
        answer: state.text,
        usage: doneChunk && doneChunk.usage,
        model: doneChunk && doneChunk.model,
        route: doneChunk && doneChunk.route,
      });
      return tracker._settle({
        ...usage,
        model:
          (doneChunk && (doneChunk.model || (doneChunk.route && doneChunk.route.model))) ||
          model,
        cacheHit: Boolean(
          doneChunk && doneChunk.cache && doneChunk.cache.generation === 'hit',
        ),
      });
    };

    const wrapped = (async function* () {
      try {
        for await (const chunk of stream) {
          if (chunk && chunk.done) {
            const { cost, budgetError } = settle(chunk);
            wrapped.cost = cost;
            if (budgetError) throw budgetError;
            yield { ...chunk, cost };
            return;
          }
          const token = chunk && chunk.token !== undefined ? chunk.token : chunk;
          if (typeof token === 'string') state.text += token;
          yield chunk;
        }
      } finally {
        // Ended without a final chunk (consumer stopped, or the source
        // failed): the tokens were still produced, so record them.
        if (!state.settled) {
          try {
            wrapped.cost = settle(null).cost;
          } catch (_e) {
            /* recording must not mask the stream's own outcome */
          }
        }
      }
    })();
    return wrapped;
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
