'use strict';

/**
 * OpenTelemetry spans for pipeline runs, for createRagPipeline({ telemetry }).
 *
 * A run is a `rag.pipeline.run` span; each stage call made in it is a child
 * span, named and attributed after the OpenTelemetry GenAI semantic
 * conventions (still at Development status): `embeddings <model>`,
 * `retrieval <data source>`, `chat <model>`, plus `rerank`. Stage calls run
 * inside their span's context, so HTTP spans from auto-instrumentation nest
 * under them.
 *
 * Nothing the user typed or retrieved is recorded unless `recordContent` is
 * set: by default spans carry counts, durations, models, cache outcomes and
 * packing, never query text, document content or answers.
 *
 * With `evaluate` or `citations` in a run, each score is emitted as a
 * `gen_ai.evaluation.result` event (an OpenTelemetry log record), parented to
 * the span of what it judges: the retrieval for contextPrecision and
 * contextRecall, the chat call for the rest, the run when that stage had no
 * span. Events use the logs API of `@opentelemetry/api` 1.10 or later, or
 * `telemetry: { logs }` (@opentelemetry/api-logs, for SDKs before sdk-logs
 * 3) or `{ logger }`; without a LoggerProvider they are no-ops, and with
 * an older api and neither option they are skipped. The run result carries its trace and span ids in
 * `result.telemetry`.
 *
 * `@opentelemetry/api` is an optional peer dependency, loaded only when
 * telemetry is configured.
 */

const { evaluationScores } = require('./scores');

const { version: LIBRARY_VERSION } = require('../../package.json');
const { loadOptionalPeer } = require('../utils/optional-peer');

const TRACER_NAME = '@devilsdev/rag-pipeline-utils';

/** Providers named by gen_ai.provider.name's well-known values (or custom). */
const PROVIDERS = new Set(['openai', 'anthropic', 'cohere', 'ollama']);

function loadOtelApi() {
  return loadOptionalPeer(
    '@opentelemetry/api',
    () => require('@opentelemetry/api'), // eslint-disable-line global-require
    'telemetry needs the "@opentelemetry/api" package, an optional peer dependency: npm install @opentelemetry/api (with @devilsdev/rag-pipeline-utils/edge, pass it: telemetry: { api })',
  );
}

/**
 * Normalise the `telemetry` option of createRagPipeline. `api` is the
 * @opentelemetry/api module, for builds that cannot require() it (/edge);
 * `logs` is @opentelemetry/api-logs, for evaluation events with an SDK that
 * registers its LoggerProvider there, and `logger` a Logger to emit them with.
 * @param {boolean|{tracer?: object, api?: object, logs?: object, logger?: object, recordContent?: boolean}} option
 * @returns {null|{api: object, tracer: object, logger: object|null, runKey: symbol, recordContent: boolean}}
 */
function createTelemetry(option) {
  if (!option) return null;
  const opts = option === true ? {} : option;
  if (typeof opts !== 'object') {
    throw new TypeError(
      'telemetry must be true or { tracer?, api?, logs?, logger?, recordContent? }',
    );
  }
  const api = opts.api || loadOtelApi();
  if (!api.trace || !api.context || !api.SpanStatusCode) {
    throw new TypeError(
      'telemetry.api must be the @opentelemetry/api module (import * as api from "@opentelemetry/api")',
    );
  }
  const tracer =
    opts.tracer || api.trace.getTracer(TRACER_NAME, LIBRARY_VERSION);
  if (!tracer || typeof tracer.startActiveSpan !== 'function') {
    throw new TypeError('telemetry.tracer must be an OpenTelemetry Tracer');
  }
  let logger = opts.logger || null;
  if (logger && typeof logger.emit !== 'function') {
    throw new TypeError('telemetry.logger must be an OpenTelemetry Logger');
  }
  if (!logger) {
    if (
      opts.logs &&
      !(opts.logs.logs && typeof opts.logs.logs.getLogger === 'function')
    ) {
      throw new TypeError(
        'telemetry.logs must be the @opentelemetry/api-logs module (import * as logs from "@opentelemetry/api-logs")',
      );
    }
    // @opentelemetry/api has the logs API from 1.10. It is not loaded from
    // @opentelemetry/api-logs unless passed: that package registers its
    // LoggerProvider under a different global (SDKs before sdk-logs 3), and
    // a peer dependency on it would conflict with older OTel installs.
    const source = [opts.logs, api].find(
      (m) => m && m.logs && typeof m.logs.getLogger === 'function',
    );
    if (source) logger = source.logs.getLogger(TRACER_NAME, LIBRARY_VERSION);
  }
  return {
    api,
    tracer,
    logger,
    // Holds the spans of one run, so its scores find them under concurrency
    runKey: api.createContextKey('rag.pipeline.run'),
    recordContent: Boolean(opts.recordContent),
  };
}

/** Remember a stage's span in the current run, for its evaluation events. */
function recordStage(tel, stage, span) {
  const run = tel.api.context.active().getValue(tel.runKey);
  if (run) run[stage] = span.spanContext();
}

/** gen_ai.provider.name for the built-in connectors; undefined otherwise. */
function providerOf(component) {
  const name = component && component.name;
  const isConnector =
    component &&
    component.constructor &&
    /Connector$/.test(component.constructor.name);
  return isConnector && PROVIDERS.has(name) ? name : undefined;
}

function configOf(component) {
  return (component && component.config) || {};
}

/** Drop undefined values: span attributes must be primitives or arrays. */
function clean(attributes) {
  const out = {};
  for (const [key, value] of Object.entries(attributes)) {
    if (value !== undefined && value !== null) out[key] = value;
  }
  return out;
}

/**
 * Run `fn` inside a span. Errors set ERROR status, `error.type` and an
 * exception event, then propagate; the span always ends.
 */
async function inSpan(tel, name, options, fn) {
  return tel.tracer.startActiveSpan(name, options, async (span) => {
    try {
      return await fn(span);
    } catch (error) {
      markError(tel, span, error);
      throw error;
    } finally {
      span.end();
    }
  });
}

function markError(tel, span, error) {
  const message = (error && error.message) || String(error);
  span.recordException(error instanceof Error ? error : new Error(message));
  span.setAttribute('error.type', (error && error.name) || 'Error');
  span.setStatus({ code: tel.api.SpanStatusCode.ERROR, message });
}

/**
 * A stream whose span ends when the stream finishes, fails or is stopped
 * early (return()). The first chunk sets `gen_ai.response.time_to_first_chunk`
 * (seconds since the call was made).
 */
function streamInSpan(tel, span, source, startedAt) {
  return (async function* traced() {
    let first = true;
    try {
      for await (const chunk of await source) {
        if (first) {
          first = false;
          span.setAttribute(
            'gen_ai.response.time_to_first_chunk',
            (performance.now() - startedAt) / 1000,
          );
        }
        yield chunk;
      }
    } catch (error) {
      markError(tel, span, error);
      throw error;
    } finally {
      span.end();
    }
  })();
}

/** Wrap a component so its stage methods run in spans. */
function instrument(tel, kind, component) {
  if (!component) return component;
  const { SpanKind } = tel.api;
  const config = configOf(component);
  const provider = providerOf(component);

  const spanFor = {
    embedder(method, args) {
      const model = config.embeddingModel || config.model;
      return {
        name: model ? `embeddings ${model}` : 'embeddings',
        kind: SpanKind.CLIENT,
        attributes: clean({
          'gen_ai.operation.name': 'embeddings',
          'gen_ai.provider.name': provider,
          'gen_ai.request.model': model,
        }),
        after(span, out) {
          if (Array.isArray(out)) {
            span.setAttribute('gen_ai.embeddings.dimension.count', out.length);
          }
        },
      };
    },
    retriever(method, [params = {}]) {
      const source =
        component.collection ||
        (typeof component.table === 'string'
          ? component.table.replace(/"/g, '')
          : undefined);
      // The GenAI conventions name the span after the operation alone
      return {
        name: 'retrieval',
        kind: SpanKind.INTERNAL,
        attributes: clean({
          'gen_ai.operation.name': 'retrieval',
          'gen_ai.data_source.id': source,
          'gen_ai.retrieval.top_k': params.topK,
          'gen_ai.retrieval.query.text': tel.recordContent
            ? params.query
            : undefined,
        }),
        after(span, out) {
          if (!Array.isArray(out)) return;
          span.setAttribute('rag.retrieval.result_count', out.length);
          if (tel.recordContent) {
            span.setAttribute(
              'gen_ai.retrieval.documents',
              JSON.stringify(
                out.map((d) => ({ id: d && d.id, score: d && d.score })),
              ),
            );
          }
        },
      };
    },
    reranker(method, [, docs, options = {}]) {
      return {
        name: 'rerank',
        kind: SpanKind.INTERNAL,
        attributes: clean({
          'gen_ai.operation.name': 'rerank',
          'rag.rerank.input_count': Array.isArray(docs)
            ? docs.length
            : undefined,
          'rag.rerank.top_k': options.topK,
        }),
        after(span, out) {
          if (Array.isArray(out)) {
            span.setAttribute('rag.rerank.output_count', out.length);
          }
        },
      };
    },
    llm(method, [, docs, options = {}]) {
      // A router's per-run decision names the model it chose.
      const route = options.route || {};
      const model = route.model || options.model || config.model;
      return {
        name: model ? `chat ${model}` : 'chat',
        kind: SpanKind.CLIENT,
        attributes: clean({
          'gen_ai.operation.name': 'chat',
          'gen_ai.provider.name': provider,
          'gen_ai.request.model': model,
          'gen_ai.request.stream': method === 'generateStream',
          'rag.route.class': route.class,
          'gen_ai.request.temperature':
            options.temperature ?? config.temperature,
          'gen_ai.request.max_tokens': options.maxTokens ?? config.maxTokens,
          'rag.context.document_count': Array.isArray(docs)
            ? docs.length
            : undefined,
        }),
        after() {},
      };
    },
  };

  const STAGES = { retriever: 'retrieval', llm: 'generation' };
  const METHODS = {
    embedder: ['embed', 'embedQuery'],
    retriever: ['retrieve'],
    reranker: ['rerank'],
    llm: ['generate', 'generateStream'],
  }[kind];

  return new Proxy(component, {
    get(target, prop, receiver) {
      const value = Reflect.get(target, prop, receiver);
      if (typeof value !== 'function' || !METHODS.includes(prop)) return value;
      return (...args) => {
        const spec = spanFor[kind](prop, args);
        const options = { kind: spec.kind, attributes: spec.attributes };
        const stage = STAGES[kind];
        if (prop === 'generateStream') {
          // The span outlives this call: it ends with the stream.
          return tel.tracer.startActiveSpan(spec.name, options, (span) => {
            if (stage) recordStage(tel, stage, span);
            const startedAt = performance.now();
            let source;
            try {
              source = value.apply(target, args);
            } catch (error) {
              markError(tel, span, error);
              span.end();
              throw error;
            }
            return streamInSpan(tel, span, source, startedAt);
          });
        }
        return inSpan(tel, spec.name, options, async (span) => {
          if (stage) recordStage(tel, stage, span);
          const out = await value.apply(target, args);
          spec.after(span, out);
          return out;
        });
      };
    },
  });
}

/** Attributes describing a finished run (never content unless asked). */
function runAttributes(tel, result) {
  if (!result || typeof result !== 'object') return {};
  const attributes = {
    'rag.success': result.success === true,
    'rag.result_count': Array.isArray(result.results)
      ? result.results.length
      : undefined,
    'rag.answered': typeof result.answer === 'string',
    'rag.groundedness':
      result.citations && typeof result.citations.groundednessScore === 'number'
        ? result.citations.groundednessScore
        : undefined,
  };
  if (result.cache) {
    for (const [layer, outcome] of Object.entries(result.cache)) {
      attributes[`rag.cache.${layer}`] = outcome;
    }
  }
  if (result.route) {
    attributes['rag.route.class'] = result.route.class;
    attributes['rag.route.model'] = result.route.model;
    attributes['rag.route.estimated_cost'] = result.route.estimatedCost;
    if (result.route.fallbackFrom) {
      attributes['rag.route.fallback_from'] = result.route.fallbackFrom;
    }
  }
  if (result.timing) {
    attributes['rag.time_to_first_token_ms'] = result.timing.firstTokenMs;
  }
  if (result.packing) {
    attributes['rag.packing.tokens'] = result.packing.tokens;
    attributes['rag.packing.max_tokens'] = result.packing.maxTokens;
    attributes['rag.packing.dropped_count'] = result.packing.dropped.length;
    attributes['rag.packing.truncated_count'] = result.packing.truncated.length;
  }
  return clean(attributes);
}

/**
 * Wrap a pipeline's run() in a `rag.pipeline.run` span. run() never rejects,
 * so a `{ success: false }` result sets ERROR status; a stream's span ends
 * when the stream does.
 */
function traceRun(tel, run) {
  const { SpanKind, SpanStatusCode } = tel.api;
  return function tracedRun(params = {}) {
    const opts = (params && params.options) || {};
    const attributes = clean({
      'rag.top_k': opts.topK ?? 3,
      'rag.stream': Boolean(opts.stream),
      'rag.max_context_tokens': opts.maxContextTokens,
      'rag.query.text': tel.recordContent ? params.query : undefined,
    });
    return tel.tracer.startActiveSpan(
      'rag.pipeline.run',
      { kind: SpanKind.INTERNAL, attributes },
      async (span) => {
        const stages = {};
        const runContext = tel.api.context
          .active()
          .setValue(tel.runKey, stages);
        let result;
        try {
          result = await tel.api.context.with(runContext, () => run(params));
        } catch (error) {
          markError(tel, span, error);
          span.end();
          throw error;
        }
        if (result && typeof result[Symbol.asyncIterator] === 'function') {
          // A stream's stages run as it is read, so each step resumes in
          // the run's context: their spans nest under the run and are
          // recorded for its evaluation events.
          const iterator = result[Symbol.asyncIterator]();
          return (async function* tracedStream() {
            let finished = false;
            try {
              for (;;) {
                const step = await tel.api.context.with(runContext, () =>
                  iterator.next(),
                );
                if (step.done) break;
                const chunk = step.value;
                if (chunk && chunk.done) {
                  span.setAttributes(runAttributes(tel, chunk));
                  finishRun(tel, span, stages, chunk);
                }
                yield chunk;
              }
              finished = true;
            } catch (error) {
              finished = true;
              markError(tel, span, error);
              throw error;
            } finally {
              // Stopped early: let the source clean up
              if (!finished && typeof iterator.return === 'function') {
                await iterator.return();
              }
              span.end();
            }
          })();
        }
        span.setAttributes(runAttributes(tel, result));
        finishRun(tel, span, stages, result);
        if (!result || result.success === false) {
          const message = (result && result.error) || 'run failed';
          span.setAttribute('error.type', errorType(message));
          span.setStatus({ code: SpanStatusCode.ERROR, message });
        }
        span.end();
        return result;
      },
    );
  };
}

/**
 * Put the run's ids on its result, and emit one gen_ai.evaluation.result
 * event per score, parented to the span of the stage it judges.
 */
function finishRun(tel, span, stages, result) {
  if (!result || typeof result !== 'object') return;
  const own = span.spanContext();
  result.telemetry = {
    traceId: own.traceId,
    spanId: own.spanId,
    spans: Object.fromEntries(
      Object.entries(stages).map(([stage, ctx]) => [stage, ctx.spanId]),
    ),
  };
  if (!tel.logger) return;
  for (const score of evaluationScores(result, {
    explanations: tel.recordContent,
  })) {
    const parent = stages[score.target] || own;
    tel.logger.emit({
      eventName: 'gen_ai.evaluation.result',
      context: tel.api.trace.setSpanContext(tel.api.context.active(), parent),
      attributes: clean({
        'gen_ai.evaluation.name': score.name,
        'gen_ai.evaluation.score.value': score.value,
        'gen_ai.evaluation.score.label': score.label,
        'gen_ai.evaluation.explanation': score.explanation,
      }),
    });
  }
}

function errorType(message) {
  if (message === 'Execution timeout') return 'timeout';
  if (message === 'Execution aborted') return 'aborted';
  return 'error';
}

module.exports = { createTelemetry, instrument, traceRun, TRACER_NAME };
