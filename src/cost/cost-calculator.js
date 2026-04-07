'use strict';

const { EventEmitter } = require('events');

/**
 * Built-in pricing table for common LLM and embedding models.
 * Prices are in USD per `unit` tokens.
 * @type {Record<string, {input: number, output: number, unit: number}>}
 */
const PRICING = {
  'gpt-4': { input: 0.03, output: 0.06, unit: 1000 },
  'gpt-4-turbo': { input: 0.01, output: 0.03, unit: 1000 },
  'gpt-4o': { input: 0.005, output: 0.015, unit: 1000 },
  'gpt-4o-mini': { input: 0.00015, output: 0.0006, unit: 1000 },
  'gpt-3.5-turbo': { input: 0.0005, output: 0.0015, unit: 1000 },
  'claude-3-opus': { input: 0.015, output: 0.075, unit: 1000 },
  'claude-3-sonnet': { input: 0.003, output: 0.015, unit: 1000 },
  'claude-3-haiku': { input: 0.00025, output: 0.00125, unit: 1000 },
  'claude-3.5-sonnet': { input: 0.003, output: 0.015, unit: 1000 },
  'cohere-command': { input: 0.001, output: 0.002, unit: 1000 },
  'text-embedding-3-small': { input: 0.00002, output: 0, unit: 1000 },
  'text-embedding-3-large': { input: 0.00013, output: 0, unit: 1000 },
};

/**
 * Maps token counts to cost estimates by provider and model.
 *
 * @example
 * const calc = new CostCalculator();
 * const cost = calc.estimate('gpt-4o', 1500, 500);
 * console.log(cost.totalCost); // 0.015
 */
class CostCalculator extends EventEmitter {
  /**
   * @param {object} [options]
   * @param {Record<string, {input: number, output: number, unit: number}>} [options.customPricing]
   *   Additional or override model pricing entries.
   */
  constructor(options = {}) {
    super();
    this.pricing = { ...PRICING, ...(options.customPricing || {}) };
  }

  /**
   * Resolve a model key from the pricing table.
   * Tries exact match (case-insensitive), then partial match.
   * @param {string} model
   * @returns {string|null} The matched pricing key or null.
   * @private
   */
  _resolveModel(model) {
    const lower = model.toLowerCase();
    const keys = Object.keys(this.pricing);

    // Exact case-insensitive match
    const exact = keys.find((k) => k.toLowerCase() === lower);
    if (exact) return exact;

    // Partial match — model string contains a known key or vice-versa
    const partial = keys.find(
      (k) => lower.includes(k.toLowerCase()) || k.toLowerCase().includes(lower),
    );
    return partial || null;
  }

  /**
   * Estimate the cost for a given token count.
   *
   * @param {string} model - Model identifier (case-insensitive, partial match supported).
   * @param {number} inputTokens - Number of input / prompt tokens.
   * @param {number} [outputTokens=0] - Number of output / completion tokens.
   * @returns {{inputCost: number, outputCost: number, totalCost: number, model: string,
   *            inputTokens: number, outputTokens: number, currency: string, warning?: string}}
   */
  estimate(model, inputTokens, outputTokens = 0) {
    const resolvedKey = this._resolveModel(model);

    if (!resolvedKey) {
      return {
        inputCost: 0,
        outputCost: 0,
        totalCost: 0,
        model,
        inputTokens,
        outputTokens,
        currency: 'USD',
        warning: 'Unknown model',
      };
    }

    const price = this.pricing[resolvedKey];
    const inputCost = (inputTokens / price.unit) * price.input;
    const outputCost = (outputTokens / price.unit) * price.output;
    const totalCost = inputCost + outputCost;

    return {
      inputCost,
      outputCost,
      totalCost,
      model: resolvedKey,
      inputTokens,
      outputTokens,
      currency: 'USD',
    };
  }

  /**
   * Register custom model pricing.
   *
   * @param {string} model - Model identifier.
   * @param {{input: number, output: number, unit: number}} pricing - Pricing definition.
   */
  addModel(model, pricing) {
    if (
      !pricing ||
      typeof pricing.input !== 'number' ||
      typeof pricing.output !== 'number'
    ) {
      throw new Error(
        'Pricing must include numeric "input" and "output" fields',
      );
    }
    this.pricing[model] = { unit: 1000, ...pricing };
  }

  /**
   * List all known model names.
   * @returns {string[]}
   */
  listModels() {
    return Object.keys(this.pricing);
  }

  /**
   * Retrieve pricing for a specific model.
   *
   * @param {string} model - Model identifier (supports fuzzy resolution).
   * @returns {{input: number, output: number, unit: number}|null}
   */
  getModelPricing(model) {
    const key = this._resolveModel(model);
    return key ? { ...this.pricing[key] } : null;
  }
}

module.exports = { CostCalculator, PRICING };
