'use strict';

/**
 * Cost-aware model routing: an llm for createRagPipeline that sends each
 * query to the cheapest model suited to it.
 *
 * A classifier puts the query in a class ('simple' or 'complex' by default),
 * and among the routes that handle that class the router picks the one with
 * the lowest estimated cost for this query: its prompt (query plus the
 * documents) and the expected answer length, at the route's price.
 */

const { CostCalculator } = require('./cost-calculator');
const { estimateTokens } = require('../core/context-packing');
const { isAbortError } = require('../connectors/connector-utils');

const DEFAULT_EXPECTED_OUTPUT_TOKENS = 300;
// Instructions and delimiters around the documents, roughly.
const PROMPT_OVERHEAD_TOKENS = 100;

const REASONING_CUES =
  /\b(?:why|explain|compare|comparison|contrast|differences?|versus|vs\.?|analy[sz]e|analysis|evaluate|trade-?offs?|pros and cons|step[- ]by[- ]step|implications?|justify|recommend)\b|\bhow (?:does|do|would|could|should|can)\b/i;

/**
 * The default classifier: 'complex' for questions that ask for reasoning
 * (why, explain, compare, trade-offs, ...), ask several things at once or
 * are long; 'simple' otherwise. A heuristic: pass your own `classify` for
 * your traffic.
 *
 * @param {string} query
 * @returns {'simple'|'complex'}
 */
function classifyQuery(query) {
  const text = String(query || '');
  const words = text.split(/\s+/).filter(Boolean).length;
  const questions = (text.match(/\?/g) || []).length;
  if (words > 30 || questions > 1 || REASONING_CUES.test(text)) {
    return 'complex';
  }
  return 'simple';
}

function documentText(doc) {
  if (typeof doc === 'string') return doc;
  return (doc && (doc.content || doc.text)) || '';
}

function routeCacheKey(llm, role) {
  if (!llm) return null;
  if (typeof llm.getCacheKey === 'function') return llm.getCacheKey(role);
  return typeof llm.cacheKey === 'string' ? llm.cacheKey : null;
}

/**
 * A stream from an llm, emulated from generate() when it cannot stream.
 * @private
 */
async function* streamFrom(llm, query, docs, options) {
  if (typeof llm.generateStream === 'function') {
    yield* await llm.generateStream(query, docs, options);
    return;
  }
  const answer = await llm.generate(query, docs, options);
  yield { token: String(answer ?? ''), done: false };
  yield { token: '', done: true };
}

/**
 * Create a cost-aware router over several LLMs.
 *
 * @example
 * const llm = createModelRouter({
 *   routes: [
 *     { model: 'claude-haiku-4-5', llm: new AnthropicConnector({ model: 'claude-haiku-4-5' }), handles: ['simple'] },
 *     { model: 'claude-sonnet-5-5', llm: new AnthropicConnector() },
 *   ],
 * });
 * const pipeline = createRagPipeline({ embedder, retriever, llm });
 * const result = await pipeline.run({ query });
 * result.route; // { class: 'simple', model: 'claude-haiku-4-5', estimatedCost: 0.0021 }
 *
 * @param {object} options
 * @param {Array<{llm: object, model: string, handles?: string[], pricing?: {input: number, output: number, unit?: number}}>} options.routes
 *   The models to choose from. `handles` lists the query classes a route
 *   may serve (all classes when omitted); `pricing` is in USD per `unit`
 *   tokens (default 1000), and defaults to CostCalculator's price for
 *   `model`. A route with no known price is an error.
 * @param {(query: string, docs: Array) => string|Promise<string>} [options.classify]
 *   Query class; defaults to {@link classifyQuery}
 * @param {number} [options.expectedOutputTokens=300] - Answer length used in
 *   the cost estimate (or `options.maxTokens` of a run, when set)
 * @param {(text: string) => number} [options.countTokens] - Token counter
 *   for the estimate (default: about 4 characters per token)
 * @param {boolean} [options.fallback=false] - When the chosen model fails,
 *   try the next cheapest route for the class (a stream only before its
 *   first token). Never on abort.
 * @param {CostCalculator} [options.calculator] - Prices for routes without
 *   `pricing`
 * @param {string} [options.cacheKey] - Identity of a custom `classify` for
 *   createRagPipeline({ cache }); without it, a custom classifier turns
 *   the generation cache off
 * @returns {{ route: Function, generate: Function, generateStream: Function, getCacheKey: Function, routes: Array }}
 */
function createModelRouter(options = {}) {
  const {
    routes: given,
    classify = classifyQuery,
    expectedOutputTokens = DEFAULT_EXPECTED_OUTPUT_TOKENS,
    countTokens = estimateTokens,
    fallback = false,
    calculator = new CostCalculator(),
    cacheKey,
  } = options;

  if (!Array.isArray(given) || given.length === 0) {
    throw new TypeError(
      'createModelRouter: `routes` must be a non-empty array',
    );
  }
  if (typeof classify !== 'function') {
    throw new TypeError('createModelRouter: `classify` must be a function');
  }

  const routes = given.map((r, i) => {
    if (!r || !r.llm || typeof r.llm.generate !== 'function') {
      throw new TypeError(
        `createModelRouter: routes[${i}].llm must have a generate() method`,
      );
    }
    if (typeof r.model !== 'string' || !r.model) {
      throw new TypeError(
        `createModelRouter: routes[${i}].model must be a model name`,
      );
    }
    if (r.handles !== undefined && !Array.isArray(r.handles)) {
      throw new TypeError(
        `createModelRouter: routes[${i}].handles must be an array of class names`,
      );
    }
    // An unknown price must not count as 0, or that model always wins.
    const pricing = r.pricing || calculator.getModelPricing(r.model);
    if (
      !pricing ||
      !Number.isFinite(pricing.input) ||
      !Number.isFinite(pricing.output)
    ) {
      throw new Error(
        `createModelRouter: no price for "${r.model}" (routes[${i}]). Pass \`pricing: { input, output, unit }\` (USD per unit tokens).`,
      );
    }
    return {
      llm: r.llm,
      model: r.model,
      handles: r.handles ? r.handles.map(String) : null,
      pricing: {
        input: pricing.input,
        output: pricing.output,
        unit: pricing.unit || 1000,
      },
    };
  });

  const estimate = (route, inputTokens, outputTokens) =>
    (inputTokens * route.pricing.input + outputTokens * route.pricing.output) /
    route.pricing.unit;

  /** Routes for a class, cheapest first (ties keep the given order). */
  function candidates(queryClass, inputTokens, outputTokens) {
    return routes
      .filter((r) => !r.handles || r.handles.includes(queryClass))
      .map((r, order) => ({
        route: r,
        order,
        cost: estimate(r, inputTokens, outputTokens),
      }))
      .sort((a, b) => a.cost - b.cost || a.order - b.order);
  }

  function plan(decision) {
    return candidates(decision.class, decision._input, decision._output);
  }

  /**
   * Choose the model for a query. createRagPipeline calls this once per
   * run (after retrieval, reranking and packing) and reports the result as
   * `result.route`.
   *
   * @param {string} query
   * @param {Array} [docs]
   * @param {object} [runOptions] - The run's options (`maxTokens` is used
   *   as the expected answer length)
   * @returns {Promise<{class: string, model: string, estimatedCost: number}>}
   */
  async function route(query, docs = [], runOptions = {}) {
    const queryClass = String(await classify(query, docs));
    const prompt = [query, ...(docs || []).map(documentText)].join('\n');
    const input = countTokens(prompt) + PROMPT_OVERHEAD_TOKENS;
    const output = runOptions.maxTokens ?? expectedOutputTokens;
    const ranked = candidates(queryClass, input, output);
    if (!ranked.length) {
      throw new Error(
        `createModelRouter: no route handles query class "${queryClass}"`,
      );
    }
    const decision = {
      class: queryClass,
      model: ranked[0].route.model,
      estimatedCost: ranked[0].cost,
    };
    // Kept off JSON and logs: what plan() needs for fallback.
    Object.defineProperties(decision, {
      _input: { value: input },
      _output: { value: output },
    });
    return decision;
  }

  /** The decision for this call: the run's, or a new one. */
  async function decide(query, docs, callOptions) {
    const { route: given, ...rest } = callOptions || {};
    const decision =
      given && typeof given === 'object' && '_input' in given
        ? given
        : await route(query, docs, rest);
    return { decision, rest };
  }

  /** Record that `next` serves the run after `failed` did not. */
  function fellBack(decision, failed, next) {
    decision.fallbackFrom = [...(decision.fallbackFrom || []), failed.model];
    decision.model = next.route.model;
    decision.estimatedCost = next.cost;
  }

  async function generate(query, docs = [], callOptions = {}) {
    const { decision, rest } = await decide(query, docs, callOptions);
    const ranked = plan(decision);
    let i = ranked.findIndex((c) => c.route.model === decision.model);
    if (i < 0) i = 0;
    for (;;) {
      const { route: chosen } = ranked[i];
      try {
        return await chosen.llm.generate(query, docs, rest);
      } catch (error) {
        const next = ranked[i + 1];
        if (!fallback || !next || isAbortError(error)) throw error;
        fellBack(decision, chosen, next);
        i += 1;
      }
    }
  }

  async function* generateStream(query, docs = [], callOptions = {}) {
    const { decision, rest } = await decide(query, docs, callOptions);
    const ranked = plan(decision);
    let i = ranked.findIndex((c) => c.route.model === decision.model);
    if (i < 0) i = 0;
    for (;;) {
      const { route: chosen } = ranked[i];
      let started = false;
      try {
        for await (const chunk of streamFrom(chosen.llm, query, docs, rest)) {
          started = true;
          yield chunk;
        }
        return;
      } catch (error) {
        const next = ranked[i + 1];
        if (started || !fallback || !next || isAbortError(error)) throw error;
        fellBack(decision, chosen, next);
        i += 1;
      }
    }
  }

  /**
   * Cache identity: every route's model and llm key, plus the classifier.
   * None (cache off) when a route's llm has no key, or `classify` is custom
   * and no `cacheKey` was given.
   */
  function getCacheKey(role) {
    const classifier =
      classify === classifyQuery
        ? 'default'
        : cacheKey
          ? `custom:${cacheKey}`
          : null;
    if (!classifier) return null;
    const parts = [];
    for (const r of routes) {
      const key = routeCacheKey(r.llm, role);
      if (!key) return null;
      parts.push(
        `${r.model}:${(r.handles || ['*']).join(',')}:${r.pricing.input}/${r.pricing.output}/${r.pricing.unit}:${key}`,
      );
    }
    return `router(${classifier};${expectedOutputTokens};${fallback};${parts.join('|')})`;
  }

  return {
    name: 'model-router',
    route,
    generate,
    generateStream,
    getCacheKey,
    /** The routes with their resolved prices (read-only copies). */
    get routes() {
      return routes.map((r) => ({
        model: r.model,
        handles: r.handles ? [...r.handles] : null,
        pricing: { ...r.pricing },
      }));
    },
  };
}

module.exports = { createModelRouter, classifyQuery };
