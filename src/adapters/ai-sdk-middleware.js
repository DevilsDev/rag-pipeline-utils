'use strict';

/**
 * Grounding middleware for the Vercel AI SDK: `wrapLanguageModel({ model,
 * middleware: groundingMiddleware({ retriever }) })` turns any AI SDK model
 * into one that answers from your documents and checks its answer against
 * them.
 *
 * Before each call it retrieves passages for the last user message (with
 * this library's pipeline: embedder, retriever, reranker, token budget and
 * the retrieval guard), and adds them to that message as untrusted reference
 * data. After the call it runs checkAnswer on the answer and attaches the
 * report as `providerMetadata.ragPipeline`; the passages are also returned
 * as source parts, so `result.sources` lists them.
 *
 * Like createAiSdkAdapter, it does not import the AI SDK: a middleware is a
 * plain object, so AI SDK 5, 6 and 7 can all use it, from ESM or CommonJS.
 */

const { createRagPipeline } = require('../core/create-pipeline');
const { checkAnswer } = require('../grounding/check-answer');
const { PreRetrievalGuard } = require('../guardrails/pre-retrieval-guard');
const { RetrievalGuard } = require('../guardrails/retrieval-guard');
const { PostGenerationGuard } = require('../guardrails/post-generation-guard');
const {
  RAG_SYSTEM_PROMPT,
  formatContext,
} = require('../connectors/rag-prompt');

/** Key of this middleware in providerOptions (input) and providerMetadata (output). */
const METADATA_KEY = 'ragPipeline';

/**
 * @typedef {Object} GroundingMiddlewareOptions
 * @property {Object} [retriever] - Any retriever plugin (`retrieve()`); needed unless `pipeline` is given
 * @property {Object} [embedder] - Embeds the query for vector retrievers
 * @property {Object} [reranker] - Optional reranker plugin
 * @property {Object} [pipeline] - A createRagPipeline() result to retrieve with, instead of retriever/embedder/reranker; its llm is not called
 * @property {number} [topK=3] - Passages per call
 * @property {number} [maxContextTokens] - Token budget for the passages (see packContext)
 * @property {Function} [countTokens] - Token counter for maxContextTokens
 * @property {string} [systemPrompt] - Replaces the default RAG system prompt
 * @property {boolean} [check=true] - Run checkAnswer on the answer
 * @property {boolean} [sources=true] - Return the passages as source parts
 * @property {Object|boolean} [preRetrieval] - PreRetrievalGuard options (true for defaults): injection detection on the query
 * @property {Object|boolean} [retrieval] - RetrievalGuard options (true for defaults): ACL, minimum score, injection in documents
 * @property {Object|boolean} [postGeneration] - PostGenerationGuard options (true for defaults): PII redaction. Streams are buffered when it is on
 * @property {boolean} [strict=false] - Throw when a guard flags the query or the answer, instead of continuing
 * @property {Function} [getQuery] - `(params) => string`: the retrieval query; defaults to the text of the last user message
 * @property {Function} [onResult] - Called with each grounding report
 * @property {string} [specificationVersion='v3'] - Middleware version for TypeScript: 'v2' for AI SDK 5, 'v3' for 6, 'v4' for 7 (the AI SDK ignores it at runtime)
 */

/**
 * @typedef {Object} GroundingReport
 * @property {string} query - The query passages were retrieved for
 * @property {Array<{id: string, score?: number}>} sources - The passages given to the model
 * @property {boolean} [grounded] - Every sentence of the answer is supported by a passage
 * @property {number} [groundedness] - Share of supported sentences, 0..1
 * @property {string[]} [unsupported] - Sentences no passage supports
 * @property {Array<Object>} [citations] - Per-sentence citations
 * @property {Object} guardrails - What each enabled guard found
 */

class GroundingBlockedError extends Error {
  constructor(message, report) {
    super(message);
    this.name = 'GroundingBlockedError';
    this.code = 'GROUNDING_BLOCKED';
    this.report = report;
  }
}

const guardOptions = (value) => (value === true ? {} : value);

/** Text of a message's text parts (user and assistant content are part arrays). */
function messageText(message) {
  if (!message) return '';
  if (typeof message.content === 'string') return message.content;
  if (!Array.isArray(message.content)) return '';
  return message.content
    .filter((part) => part && part.type === 'text')
    .map((part) => part.text)
    .join('\n');
}

function lastUserIndex(prompt) {
  for (let i = prompt.length - 1; i >= 0; i--) {
    if (prompt[i] && prompt[i].role === 'user') return i;
  }
  return -1;
}

/** Plain JSON for providerMetadata (which must be JSON values). */
const toJson = (value) => JSON.parse(JSON.stringify(value));

function sourceId(doc, i) {
  return doc && doc.id != null ? String(doc.id) : `source-${i + 1}`;
}

function sourcePart(doc, i) {
  const meta = (doc && doc.metadata) || {};
  return {
    type: 'source',
    sourceType: 'document',
    id: sourceId(doc, i),
    mediaType: 'text/plain',
    title: String(meta.title || meta.source || sourceId(doc, i)),
    ...(meta.source && { filename: String(meta.source) }),
  };
}

/**
 * Create AI SDK language model middleware that retrieves context for each
 * call and checks the answer against it.
 *
 * @example
 * import { generateText, wrapLanguageModel } from "ai";
 * import { openai } from "@ai-sdk/openai";
 * import { groundingMiddleware } from "@devilsdev/rag-pipeline-utils";
 *
 * const model = wrapLanguageModel({
 *   model: openai("gpt-4o-mini"),
 *   middleware: groundingMiddleware({ retriever, embedder }),
 * });
 * const { text, sources, providerMetadata } = await generateText({
 *   model,
 *   prompt: "How many vacation days do I get?",
 * });
 * providerMetadata.ragPipeline.grounded; // true when every sentence is supported
 *
 * @param {GroundingMiddlewareOptions} options
 * @returns {Object} An AI SDK LanguageModelMiddleware
 */
function groundingMiddleware(options = {}) {
  const {
    pipeline,
    retriever,
    embedder,
    reranker,
    topK = 3,
    maxContextTokens,
    countTokens,
    systemPrompt,
    check = true,
    sources = true,
    strict = false,
    getQuery,
    onResult,
    specificationVersion = 'v3',
  } = options;

  if (!pipeline && (!retriever || typeof retriever.retrieve !== 'function')) {
    throw new TypeError(
      'groundingMiddleware: pass a retriever (an object with retrieve()) or a pipeline',
    );
  }
  if (pipeline && typeof pipeline.run !== 'function') {
    throw new TypeError(
      'groundingMiddleware: pipeline must be a createRagPipeline() result',
    );
  }

  const retrievalPipeline =
    pipeline || createRagPipeline({ embedder, retriever, reranker });
  const preGuard = options.preRetrieval
    ? new PreRetrievalGuard(guardOptions(options.preRetrieval))
    : null;
  const retrievalGuard = options.retrieval
    ? new RetrievalGuard(guardOptions(options.retrieval))
    : null;
  const postGuard = options.postGeneration
    ? new PostGenerationGuard({
        // checkAnswer reports groundedness; the guard only redacts and checks safety.
        enableGroundednessCheck: false,
        ...guardOptions(options.postGeneration),
      })
    : null;

  // transformParams hands its result to wrapGenerate / wrapStream as `params`,
  // so the retrieval state is keyed by that object.
  const calls = new WeakMap();

  async function retrieve(params) {
    const prompt = Array.isArray(params.prompt) ? params.prompt : [];
    const callOptions =
      (params.providerOptions && params.providerOptions[METADATA_KEY]) || {};
    const userIndex = lastUserIndex(prompt);
    let query =
      typeof callOptions.query === 'string'
        ? callOptions.query
        : getQuery
          ? getQuery(params)
          : messageText(prompt[userIndex]);
    if (!query || !String(query).trim() || userIndex === -1) return null;

    const guardrails = {};
    if (preGuard) {
      const pre = preGuard.check(query);
      guardrails.preRetrieval = { safe: pre.safe, issues: pre.issues };
      if (!pre.safe && strict) {
        throw new GroundingBlockedError(
          `groundingMiddleware: the query was blocked (${pre.issues.join('; ')})`,
          { query, sources: [], guardrails },
        );
      }
      query = pre.sanitizedQuery || query;
    }

    let filtered = null;
    const result = await retrievalPipeline.run({
      query,
      options: {
        topK: callOptions.topK ?? topK,
        ...(maxContextTokens != null && { maxContextTokens }),
        ...(countTokens && { countTokens }),
        ...(params.abortSignal && { signal: params.abortSignal }),
        ...(retrievalGuard && {
          filterResults: (docs) => {
            filtered = retrievalGuard.filter(docs, callOptions.context || {});
            return filtered.results;
          },
        }),
      },
    });
    if (!result || result.success === false) {
      throw new Error(
        `groundingMiddleware: retrieval failed: ${(result && result.error) || 'no result'}`,
      );
    }
    if (filtered) {
      guardrails.retrieval = {
        removed: filtered.removed.map((doc) => ({ id: doc && doc.id })),
        reasons: (filtered.metadata && filtered.metadata.reasons) || {},
      };
    }
    return {
      query,
      docs: Array.isArray(result.results) ? result.results : [],
      guardrails,
      userIndex,
    };
  }

  function withContext(params, state) {
    const prompt = params.prompt.slice();
    if (state.docs.length > 0) {
      const user = prompt[state.userIndex];
      prompt[state.userIndex] = {
        ...user,
        content: [
          { type: 'text', text: formatContext(state.docs) },
          ...(Array.isArray(user.content)
            ? user.content
            : [{ type: 'text', text: String(user.content) }]),
        ],
      };
      prompt.unshift({
        role: 'system',
        content: systemPrompt || RAG_SYSTEM_PROMPT,
      });
    }
    let providerOptions = params.providerOptions;
    if (providerOptions && providerOptions[METADATA_KEY]) {
      providerOptions = { ...providerOptions };
      delete providerOptions[METADATA_KEY];
    }
    return { ...params, prompt, providerOptions };
  }

  /** Check (and redact) an answer; returns the text to show and the report. */
  async function finish(text, state) {
    const report = {
      query: state.query,
      sources: state.docs.map((doc, i) => ({
        id: sourceId(doc, i),
        ...(typeof doc.score === 'number' && { score: doc.score }),
      })),
      guardrails: state.guardrails,
    };
    if (check && text.trim()) {
      const checked = await checkAnswer({
        question: state.query,
        answer: text,
        sources: state.docs,
      });
      report.grounded = checked.grounded;
      report.groundedness = checked.groundedness;
      report.unsupported = checked.unsupported;
      report.citations = checked.citations;
    }
    let output = text;
    if (postGuard) {
      const post = postGuard.check(text, state.docs);
      report.guardrails.postGeneration = {
        safe: post.safe,
        issues: post.issues,
      };
      if (!post.safe && strict) {
        throw new GroundingBlockedError(
          `groundingMiddleware: the answer was blocked (${post.issues.join('; ')})`,
          toJson(report),
        );
      }
      output = post.sanitizedOutput;
      if (report.unsupported) {
        report.unsupported = report.unsupported.map((s) => postGuard.redact(s));
      }
      if (report.citations) {
        report.citations = report.citations.map((c) => ({
          ...c,
          sentence: postGuard.redact(c.sentence || ''),
        }));
      }
    }
    const json = toJson(report);
    if (onResult) await onResult(json);
    return { output, report: json };
  }

  const metadata = (providerMetadata, report) => ({
    ...(providerMetadata || {}),
    [METADATA_KEY]: report,
  });

  return {
    specificationVersion,

    async transformParams({ params }) {
      const state = await retrieve(params);
      if (!state) return params;
      const next = withContext(params, state);
      calls.set(next, state);
      return next;
    },

    async wrapGenerate({ doGenerate, params }) {
      const result = await doGenerate();
      const state = calls.get(params);
      if (!state) return result;

      const content = Array.isArray(result.content) ? result.content : [];
      const text = content
        .filter((part) => part.type === 'text')
        .map((part) => part.text)
        .join('');
      const { output, report } = await finish(text, state);

      let replaced = false;
      const nextContent = [];
      for (const part of content) {
        if (part.type !== 'text') nextContent.push(part);
        else if (!replaced) {
          nextContent.push({ ...part, text: output });
          replaced = true;
        }
      }
      if (sources) nextContent.push(...state.docs.map(sourcePart));

      return {
        ...result,
        content: nextContent,
        providerMetadata: metadata(result.providerMetadata, report),
      };
    },

    async wrapStream({ doStream, params }) {
      const result = await doStream();
      const state = calls.get(params);
      if (!state) return result;

      // Redaction needs the whole answer, so with the post-generation guard
      // the text is held back and sent, redacted, when the model finishes.
      const buffer = Boolean(postGuard);
      let text = '';
      let textId = null;

      const stream = result.stream.pipeThrough(
        new TransformStream({
          async transform(part, controller) {
            if (part.type === 'text-delta') {
              text += part.delta ?? part.textDelta ?? '';
              textId = textId ?? part.id;
              if (!buffer) controller.enqueue(part);
              return;
            }
            if (
              buffer &&
              (part.type === 'text-start' || part.type === 'text-end')
            ) {
              textId = textId ?? part.id;
              return;
            }
            if (part.type === 'finish') {
              const { output, report } = await finish(text, state);
              if (buffer && output) {
                const id = textId ?? 'text-0';
                controller.enqueue({ type: 'text-start', id });
                controller.enqueue({ type: 'text-delta', id, delta: output });
                controller.enqueue({ type: 'text-end', id });
              }
              if (sources)
                state.docs.forEach((doc, i) =>
                  controller.enqueue(sourcePart(doc, i)),
                );
              controller.enqueue({
                ...part,
                providerMetadata: metadata(part.providerMetadata, report),
              });
              return;
            }
            controller.enqueue(part);
          },
        }),
      );
      return { ...result, stream };
    },
  };
}

module.exports = { groundingMiddleware, GroundingBlockedError, METADATA_KEY };
