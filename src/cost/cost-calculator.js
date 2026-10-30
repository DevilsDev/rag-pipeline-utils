'use strict';

const { EventEmitter } = require('events');

/**
 * Where the built-in prices come from and when they were recorded.
 *
 * The values are the providers' published list prices as copied into this
 * library on `asOf` (entries added later carry their own `asOf`); they have not been re-verified since and providers
 * change prices often. Pass `pricing` or `customPricing` to CostCalculator
 * to use current or negotiated prices.
 */
const PRICING_METADATA = Object.freeze({
  asOf: '2026-04-07',
  verified: false,
  currency: 'USD',
  sources: Object.freeze({
    openai: 'https://openai.com/api/pricing/',
    anthropic: 'https://www.anthropic.com/pricing#api',
    cohere: 'https://cohere.com/pricing',
  }),
  note: 'Built-in list prices, not re-verified since asOf. Override with the `pricing` or `customPricing` option.',
});

const OPENAI = PRICING_METADATA.sources.openai;
const ANTHROPIC = PRICING_METADATA.sources.anthropic;
const COHERE = PRICING_METADATA.sources.cohere;
const AS_OF = PRICING_METADATA.asOf;

/**
 * Built-in pricing table for common LLM and embedding models.
 * Prices are in USD per `unit` tokens. Each entry records its `source`
 * (provider pricing page) and `asOf` date.
 * @type {Record<string, {input: number, output: number, unit: number, source: string, asOf: string}>}
 */
const PRICING = {
  'gpt-4': {
    input: 0.03,
    output: 0.06,
    unit: 1000,
    source: OPENAI,
    asOf: AS_OF,
  },
  'gpt-4-turbo': {
    input: 0.01,
    output: 0.03,
    unit: 1000,
    source: OPENAI,
    asOf: AS_OF,
  },
  'gpt-4o': {
    input: 0.005,
    output: 0.015,
    unit: 1000,
    source: OPENAI,
    asOf: AS_OF,
  },
  'gpt-4o-mini': {
    input: 0.00015,
    output: 0.0006,
    unit: 1000,
    source: OPENAI,
    asOf: AS_OF,
  },
  'gpt-3.5-turbo': {
    input: 0.0005,
    output: 0.0015,
    unit: 1000,
    source: OPENAI,
    asOf: AS_OF,
  },
  'claude-3-opus': {
    input: 0.015,
    output: 0.075,
    unit: 1000,
    source: ANTHROPIC,
    asOf: AS_OF,
  },
  'claude-3-sonnet': {
    input: 0.003,
    output: 0.015,
    unit: 1000,
    source: ANTHROPIC,
    asOf: AS_OF,
  },
  'claude-3-haiku': {
    input: 0.00025,
    output: 0.00125,
    unit: 1000,
    source: ANTHROPIC,
    asOf: AS_OF,
  },
  'claude-3.5-sonnet': {
    input: 0.003,
    output: 0.015,
    unit: 1000,
    source: ANTHROPIC,
    asOf: AS_OF,
  },
  // Claude Sonnet 5.5, AnthropicConnector's default since 3.0.1:
  // $2 / $10 per million input / output tokens.
  'claude-sonnet-5.5': {
    input: 0.002,
    output: 0.01,
    unit: 1000,
    source: 'https://platform.claude.com/docs/en/about-claude/pricing',
    asOf: '2026-10-30',
  },
  'cohere-command': {
    input: 0.001,
    output: 0.002,
    unit: 1000,
    source: COHERE,
    asOf: AS_OF,
  },
  'text-embedding-3-small': {
    input: 0.00002,
    output: 0,
    unit: 1000,
    source: OPENAI,
    asOf: AS_OF,
  },
  'text-embedding-3-large': {
    input: 0.00013,
    output: 0,
    unit: 1000,
    source: OPENAI,
    asOf: AS_OF,
  },
};

/**
 * Canonical form used for model-name matching: lower case, with '.' and '_'
 * treated like '-' so "claude-3-5-sonnet-20241022" matches "claude-3.5-sonnet".
 * @param {string} name
 * @returns {string}
 */
function canonical(name) {
  return String(name).toLowerCase().replace(/[._]/g, '-');
}

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
   * @param {Record<string, {input: number, output: number, unit?: number, source?: string, asOf?: string}>} [options.pricing]
   *   Replaces the built-in pricing table entirely (only these models are known).
   * @param {Record<string, {input: number, output: number, unit: number}>} [options.customPricing]
   *   Additional or override model pricing entries, merged over the base table.
   */
  constructor(options = {}) {
    super();
    const base = options.pricing ? {} : PRICING;
    const overrides = {
      ...(options.pricing || {}),
      ...(options.customPricing || {}),
    };
    this.pricing = { ...base };
    for (const [model, entry] of Object.entries(overrides)) {
      this.pricing[model] = {
        unit: 1000,
        source: 'custom',
        asOf: null,
        ...entry,
      };
    }
    /** @private Models already warned about as unknown */
    this._warnedModels = new Set();
  }

  /**
   * Resolve a model key from the pricing table.
   * Tries an exact match (case-insensitive, '.' and '-' equivalent), then the
   * longest known key contained in the model name (so dated snapshots such
   * as "gpt-4o-mini-2024-07-18" resolve to "gpt-4o-mini", not "gpt-4"), then
   * a known key that contains the model name.
   * @param {string} model
   * @returns {string|null} The matched pricing key or null.
   * @private
   */
  _resolveModel(model) {
    if (model == null) return null;
    const wanted = canonical(model);
    const keys = Object.keys(this.pricing);

    const exact = keys.find((k) => canonical(k) === wanted);
    if (exact) return exact;

    let best = null;
    for (const k of keys) {
      if (wanted.includes(canonical(k)) && (!best || k.length > best.length)) {
        best = k;
      }
    }
    if (best) return best;

    const containing = keys.find((k) => canonical(k).includes(wanted));
    return containing || null;
  }

  /**
   * Emit a one-time warning for a model with no known price.
   * Listeners on 'warning' receive `{ type: 'unknown-model', model, message }`;
   * without a listener the warning goes to process.emitWarning.
   * @param {string} model
   * @private
   */
  _warnUnknownModel(model) {
    const key = String(model);
    if (this._warnedModels.has(key)) return;
    this._warnedModels.add(key);
    const message =
      `No pricing known for model "${key}"; cost reported as 0. ` +
      'Pass `pricing` or `customPricing` to CostCalculator to set a price.';
    if (this.listenerCount('warning') > 0) {
      this.emit('warning', { type: 'unknown-model', model: key, message });
    } else {
      process.emitWarning(message, { code: 'RAG_UNKNOWN_MODEL_PRICING' });
    }
  }

  /**
   * Estimate the cost for a given token count.
   *
   * @param {string} model - Model identifier (case-insensitive, partial match supported).
   * @param {number} inputTokens - Number of input / prompt tokens.
   * @param {number} [outputTokens=0] - Number of output / completion tokens.
   * @returns {{inputCost: number, outputCost: number, totalCost: number, model: string,
   *            inputTokens: number, outputTokens: number, currency: string,
   *            pricingSource?: string, pricingAsOf?: string|null, warning?: string}}
   */
  estimate(model, inputTokens, outputTokens = 0) {
    const resolvedKey = this._resolveModel(model);

    if (!resolvedKey) {
      this._warnUnknownModel(model);
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
    const unit = price.unit || 1000;
    const inputCost = (inputTokens / unit) * price.input;
    const outputCost = (outputTokens / unit) * price.output;
    const totalCost = inputCost + outputCost;

    return {
      inputCost,
      outputCost,
      totalCost,
      model: resolvedKey,
      inputTokens,
      outputTokens,
      currency: 'USD',
      pricingSource: price.source || 'custom',
      pricingAsOf: price.asOf ?? null,
    };
  }

  /**
   * Register custom model pricing.
   *
   * @param {string} model - Model identifier.
   * @param {{input: number, output: number, unit?: number, source?: string, asOf?: string}} pricing - Pricing definition.
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
    this.pricing[model] = {
      unit: 1000,
      source: 'custom',
      asOf: null,
      ...pricing,
    };
    this._warnedModels.clear();
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
   * @returns {{input: number, output: number, unit: number, source?: string, asOf?: string|null}|null}
   */
  getModelPricing(model) {
    const key = this._resolveModel(model);
    return key ? { ...this.pricing[key] } : null;
  }

  /**
   * Provenance of the built-in pricing table.
   * @returns {typeof PRICING_METADATA}
   */
  static getPricingMetadata() {
    return PRICING_METADATA;
  }
}

module.exports = { CostCalculator, PRICING, PRICING_METADATA };
