'use strict';

/**
 * Check an answer that any framework produced (LangChain, LlamaIndex, Mastra,
 * the AI SDK, your own code) against the sources it was given: citations
 * per sentence, groundedness, unsupported sentences and evaluation scores,
 * without using createRagPipeline().
 */

const { CitationTracker } = require('../citation/citation-tracker');
const { PipelineEvaluator } = require('../evaluate/pipeline-evaluator');
const {
  computeSemanticSimilarity,
} = require('../evaluate/semantic-similarity');

/**
 * Text of one source in the shapes common frameworks use.
 * @private
 */
function sourceText(source) {
  if (source == null) return '';
  if (typeof source === 'string') return source;
  if (typeof source.content === 'string') return source.content; // this library
  if (typeof source.pageContent === 'string') return source.pageContent; // LangChain Document
  if (typeof source.text === 'string') return source.text; // LlamaIndex node, plain
  if (source.node) return sourceText(source.node); // LlamaIndex NodeWithScore
  if (typeof source.getContent === 'function')
    return String(source.getContent());
  return '';
}

/**
 * An id for a source: its own id when it has one, otherwise its position.
 * @private
 */
function sourceId(source, index) {
  const candidates = [
    source && source.id,
    source && source.id_,
    source && source.node && (source.node.id_ || source.node.id),
    source && source.metadata && (source.metadata.id || source.metadata.source),
  ];
  const id = candidates.find(
    (c) => typeof c === 'string' || typeof c === 'number',
  );
  return id !== undefined ? String(id) : String(index + 1);
}

/**
 * Normalize sources to `{ id, content, metadata }`.
 *
 * Accepts strings, `{ id, content }` (this library), LangChain Documents
 * (`{ pageContent, metadata }`), LlamaIndex nodes (`{ text }`) and
 * `NodeWithScore` (`{ node, score }`).
 *
 * @param {Array<string|Object>} sources
 * @returns {Array<{id: string, content: string, metadata: Object}>}
 */
function normalizeSources(sources) {
  if (!Array.isArray(sources)) {
    throw new TypeError('sources must be an array');
  }
  return sources
    .map((source, index) => ({
      id: sourceId(source, index),
      content: sourceText(source),
      metadata:
        (source &&
          (source.metadata || (source.node && source.node.metadata))) ||
        {},
    }))
    .filter((s) => s.content.trim() !== '');
}

/**
 * @typedef {Object} AnswerCheck
 * @property {boolean} grounded - Every sentence is supported by a source
 * @property {number} groundedness - Share of supported sentences, 0..1
 * @property {string[]} unsupported - Sentences no source supports (this
 *   includes a sentence whose numbers do not match its source)
 * @property {Array<{sentence: string, sources: Array}>} citations - Sources
 *   supporting each sentence
 * @property {{scores: Object, details: Object, metadata: Object}|undefined} evaluation
 *   - Faithfulness, relevance, context precision (and context recall when a
 *   referenceAnswer is given); only when `evaluate` is not false
 * @property {Array<{id: string, content: string, metadata: Object}>} sources
 *   - The sources as they were checked
 */

/**
 * Check an answer against the sources it was generated from.
 *
 * @example
 * // A LangChain chain's output
 * const check = await checkAnswer({
 *   question: input,
 *   answer: result.answer,
 *   sources: result.context, // LangChain Documents
 * });
 * if (!check.grounded) console.warn(check.unsupported);
 *
 * @param {Object} params
 * @param {string} params.answer - The generated answer
 * @param {Array<string|Object>} params.sources - Documents the answer was
 *   generated from (see normalizeSources for accepted shapes)
 * @param {string} [params.question] - The question; needed for relevance
 * @param {string} [params.referenceAnswer] - Ground truth, for context recall
 *   (and semantic similarity when an embedder is given)
 * @param {Object} [params.embedder] - With a referenceAnswer, adds
 *   `evaluation.scores.semanticSimilarity` (computeSemanticSimilarity)
 * @param {boolean} [params.evaluate=true] - Also compute evaluation scores
 * @returns {Promise<AnswerCheck>}
 */
async function checkAnswer({
  answer,
  sources,
  question,
  referenceAnswer,
  embedder,
  evaluate = true,
} = {}) {
  if (typeof answer !== 'string') {
    throw new TypeError('answer must be a string');
  }
  const docs = normalizeSources(sources);

  // Models sometimes return nothing; that is an ungrounded answer, not an
  // error. (CitationTracker rejects empty text.)
  if (answer.trim() === '') {
    return {
      grounded: false,
      groundedness: 0,
      unsupported: [],
      citations: [],
      evaluation: undefined,
      sources: docs,
    };
  }

  const tracked = new CitationTracker().track(answer, docs);
  const sentences =
    (tracked.hallucinationReport && tracked.hallucinationReport.sentences) ||
    [];
  const unsupported = sentences
    .filter((s) => s.classification !== 'grounded')
    .map((s) => s.text);

  let evaluation;
  if (evaluate) {
    evaluation = await new PipelineEvaluator().evaluate(
      { query: question || '', answer, results: docs },
      referenceAnswer ? { referenceAnswer } : {},
    );
    if (referenceAnswer && embedder) {
      evaluation.scores.semanticSimilarity = await computeSemanticSimilarity(
        answer,
        referenceAnswer,
        { embedder },
      );
    }
  }

  return {
    grounded: sentences.length > 0 && unsupported.length === 0,
    groundedness: tracked.groundednessScore,
    unsupported,
    citations: tracked.citations,
    evaluation,
    sources: docs,
  };
}

module.exports = { checkAnswer, normalizeSources };
