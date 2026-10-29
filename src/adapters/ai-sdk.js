'use strict';

/**
 * Adapter for the Vercel AI SDK (`ai` package): use an AI SDK embedding
 * model and language model as this library's `embedder` and `llm`.
 *
 * The AI SDK is not a dependency. You pass in the functions you already
 * import from it, so any AI SDK version from 5 on works, from ESM or
 * CommonJS, and this package keeps supporting Node 18 (AI SDK 7 needs Node
 * 22 and is ESM-only).
 */

const { buildRagPrompt } = require('../connectors/rag-prompt');
const { componentCacheKey } = require('../cache/component-keys');

/** Identity of an AI SDK model object (provider and model id). */
const modelId = (model) =>
  `${model.provider || 'unknown'}:${model.modelId || model.modelName || 'unknown'}`;

/**
 * @typedef {Object} AiSdkFunctions
 * @property {Function} [embed] - `embed` from 'ai' (needed for an embedder)
 * @property {Function} [embedMany] - `embedMany` from 'ai' (batch embedding)
 * @property {Function} [generateText] - `generateText` from 'ai' (needed for an llm)
 * @property {Function} [streamText] - `streamText` from 'ai' (streaming)
 */

function requireFunction(ai, name, purpose) {
  if (typeof ai[name] !== 'function') {
    throw new Error(
      `createAiSdkAdapter: ${purpose} needs ai.${name}. Pass the AI SDK functions, e.g. import { ${name} } from "ai".`,
    );
  }
}

/**
 * Options for every generateText / streamText call. The RAG system prompt
 * (retrieved text is untrusted reference data, not instructions) is passed
 * as both `instructions` (AI SDK 7) and `system` (AI SDK 5 and 6; 7 reads
 * `instructions ?? system`), so it reaches the model on every version.
 */
function textCallOptions(model, query, docs, settings, signal, systemPrompt) {
  const { system, user } = buildRagPrompt(query, docs, { systemPrompt });
  return {
    ...settings,
    model,
    ...(system && { system, instructions: system }),
    prompt: user,
    ...(signal && { abortSignal: signal }),
  };
}

/** Per-call settings the pipeline may pass through to the model. */
const CALL_SETTINGS = [
  'temperature',
  'maxOutputTokens',
  'topP',
  'topK',
  'presencePenalty',
  'frequencyPenalty',
  'seed',
  'stopSequences',
  'maxRetries',
];

function pickSettings(options) {
  const out = {};
  for (const key of CALL_SETTINGS) {
    if (options[key] !== undefined) out[key] = options[key];
  }
  return out;
}

/**
 * Wrap AI SDK models as an embedder and an llm for createRagPipeline().
 *
 * @example
 * import { embed, embedMany, generateText, streamText } from "ai";
 * import { openai } from "@ai-sdk/openai";
 * import { createAiSdkAdapter, createRagPipeline } from "@devilsdev/rag-pipeline-utils";
 *
 * const { embedder, llm } = createAiSdkAdapter({
 *   ai: { embed, embedMany, generateText, streamText },
 *   embeddingModel: openai.embedding("text-embedding-3-small"),
 *   languageModel: openai("gpt-4o-mini"),
 * });
 * const pipeline = createRagPipeline({ embedder, retriever, llm });
 *
 * @param {Object} options
 * @param {AiSdkFunctions} options.ai - Functions imported from 'ai'
 * @param {Object} [options.embeddingModel] - AI SDK embedding model
 * @param {Object} [options.languageModel] - AI SDK language model
 * @param {Object} [options.settings] - Defaults for every text call, e.g.
 *   `{ temperature: 0, maxOutputTokens: 512 }`
 * @param {string} [options.systemPrompt] - Replaces the built-in RAG system
 *   prompt
 * @returns {{ embedder: Object|null, llm: Object|null }}
 */
function createAiSdkAdapter(options = {}) {
  const {
    ai,
    embeddingModel,
    languageModel,
    settings = {},
    systemPrompt,
  } = options;
  if (!ai || typeof ai !== 'object') {
    throw new Error(
      'createAiSdkAdapter: pass `ai`, the AI SDK functions, e.g. { embed, embedMany, generateText, streamText } from "ai".',
    );
  }
  if (!embeddingModel && !languageModel) {
    throw new Error(
      'createAiSdkAdapter: pass an embeddingModel, a languageModel, or both.',
    );
  }

  let embedder = null;
  if (embeddingModel) {
    requireFunction(ai, 'embed', 'an embeddingModel');
    const embedOne = async (text, { signal } = {}) => {
      const { embedding } = await ai.embed({
        model: embeddingModel,
        value: String(text),
        ...(signal && { abortSignal: signal }),
      });
      return embedding;
    };
    embedder = {
      metadata: { name: 'ai-sdk-embedder', version: '1.0.0', type: 'embedder' },
      getCacheKey: (role) =>
        role === 'embedder'
          ? componentCacheKey('ai-sdk-embed', {
              model: modelId(embeddingModel),
            })
          : null,
      embed: embedOne,
      embedQuery: embedOne,
      /** One vector per text; uses embedMany when it was passed in. */
      async embedBatch(texts, { signal } = {}) {
        if (typeof ai.embedMany !== 'function') {
          const vectors = [];
          for (const text of texts)
            vectors.push(await embedOne(text, { signal }));
          return vectors;
        }
        const { embeddings } = await ai.embedMany({
          model: embeddingModel,
          values: texts.map(String),
          ...(signal && { abortSignal: signal }),
        });
        return embeddings;
      },
    };
  }

  let llm = null;
  if (languageModel) {
    requireFunction(ai, 'generateText', 'a languageModel');
    llm = {
      metadata: { name: 'ai-sdk-llm', version: '1.0.0', type: 'llm' },
      // The AI SDK leaves an unset temperature to the provider, whose default
      // is usually 1, so unset counts as non-deterministic: generation
      // caching needs `settings.temperature: 0`.
      config: { temperature: settings.temperature ?? 1 },
      getCacheKey: (role) =>
        role === 'llm'
          ? componentCacheKey('ai-sdk', {
              model: modelId(languageModel),
              settings: JSON.stringify(settings),
              systemPrompt,
            })
          : null,
      async generate(query, docs = [], callOptions = {}) {
        const { text } = await ai.generateText(
          textCallOptions(
            languageModel,
            query,
            docs,
            { ...settings, ...pickSettings(callOptions) },
            callOptions.signal,
            systemPrompt,
          ),
        );
        return text;
      },
    };
    if (typeof ai.streamText === 'function') {
      llm.generateStream = async function* generateStream(
        query,
        docs = [],
        callOptions = {},
      ) {
        const result = ai.streamText(
          textCallOptions(
            languageModel,
            query,
            docs,
            { ...settings, ...pickSettings(callOptions) },
            callOptions.signal,
            systemPrompt,
          ),
        );
        for await (const token of result.textStream) {
          yield { token, done: false };
        }
        yield { token: '', done: true };
      };
    }
  }

  return { embedder, llm };
}

module.exports = { createAiSdkAdapter };
