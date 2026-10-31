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
 * `@opentelemetry/api` is an optional peer dependency, loaded only when
 * telemetry is configured.
 */

const { version: LIBRARY_VERSION } = require('../../package.json');

const TRACER_NAME = '@devilsdev/rag-pipeline-utils';

/** Providers named by gen_ai.provider.name's well-known values (or custom). */
const PROVIDERS = new Set(['openai', 'anthropic', 'cohere', 'ollama']);

function loadOtelApi() {
  try {
    require.resolve('@opentelemetry/api');
  } catch {
    const err = new Error(
      'telemetry needs the "@opentelemetry/api" package, an optional peer dependency: npm install @opentelemetry/api',
    );
    err.code = 'MISSING_DEPENDENCY';
    throw err;
  }
  return require('@opentelemetry/api'); // eslint-disable-line global-require
}

/**
 * Normalise the `telemetry` option of createRagPipeline.
 * @param {boolean|{tracer?: object, recordContent?: boolean}} option
 * @returns {null|{api: object, tracer: object, recordContent: boolean}}
 */
function createTelemetry(option) {
  if (!option) return null;
  const opts = option === true ? {} : option;
  if (typeof opts !== 'object') {
    throw new TypeError(
      'telemetry must be true or { tracer?, recordContent? }',
    );
  }
  const api = loadOtelApi();
  const tracer =
    opts.tracer || api.trace.getTracer(TRACER_NAME, LIBRARY_VERSION);
  if (!tracer || typeof tracer.startActiveSpan !== 'function') {
    throw new TypeError('telemetry.tracer must be an OpenTelemetry Tracer');
  }
  return { api, tracer, recordContent: Boolean(opts.recordContent) };
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
      return {
        name: source ? `retrieval ${source}` : 'retrieval',
        kind: SpanKind.CLIENT,
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
      const model = options.model || config.model;
      return {
        name: model ? `chat ${model}` : 'chat',
        kind: SpanKind.CLIENT,
        attributes: clean({
          'gen_ai.operation.name': 'chat',
          'gen_ai.provider.name': provider,
          'gen_ai.request.model': model,
          'gen_ai.request.stream': method === 'generateStream',
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
        if (prop === 'generateStream') {
          // The span outlives this call: it ends with the stream.
          return tel.tracer.startActiveSpan(spec.name, options, (span) => {
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
        let result;
        try {
          result = await run(params);
        } catch (error) {
          markError(tel, span, error);
          span.end();
          throw error;
        }
        if (result && typeof result[Symbol.asyncIterator] === 'function') {
          return (async function* tracedStream() {
            try {
              for await (const chunk of result) {
                if (chunk && chunk.done) {
                  span.setAttributes(runAttributes(tel, chunk));
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
        span.setAttributes(runAttributes(tel, result));
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

function errorType(message) {
  if (message === 'Execution timeout') return 'timeout';
  if (message === 'Execution aborted') return 'aborted';
  return 'error';
}

module.exports = { createTelemetry, instrument, traceRun, TRACER_NAME };
