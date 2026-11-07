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
const { runJudge } = require('./llm-judge');

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
 * @property {JudgeReport} [judge] - Only when the `judge` option is given
 */

/**
 * Any LLM for the `judge` option: this library's LLM plugin contract.
 * `generate` may return the text, or an object with `text` or `content`
 * (and optionally `usage`).
 *
 * @typedef {Object} JudgeLLM
 * @property {(prompt: string, context: Array<any>, options?: Object) => (string|{text?: string, content?: string, usage?: Object}|Promise<string|{text?: string, content?: string, usage?: Object}>)} generate
 */

/**
 * The verdict on one sentence when a judge is used.
 *
 * @typedef {Object} JudgeVerdict
 * @property {string} sentence
 * @property {'supported'|'unsupported'} verdict - The combined verdict
 * @property {string|null} sourceId - Id of the supporting source, when supported
 * @property {string} reason - Why, in words (the judge's reason when it decided)
 * @property {'supported'|'low_overlap'|'number_mismatch'|'polarity_mismatch'|'condition_mismatch'|'no_sources'} lexicalReason
 *   - What the lexical check found. Only `low_overlap` sentences go to the judge
 * @property {'lexical'|'judge'} decidedBy
 */

/**
 * What the judge did.
 *
 * @typedef {Object} JudgeReport
 * @property {JudgeVerdict[]} verdicts - One per sentence, in order
 * @property {number} calls - Calls made to `judge.generate` (0 or 1)
 * @property {{inputTokens: number, outputTokens: number, totalTokens: number}} [usage]
 *   - Token usage summed over the calls, when the LLM result carries `usage`
 * @property {string} [error] - Why the judge's reply could not be parsed
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
 * @param {boolean} [params.conditionCheck=true] - false: a sentence that
 *   leaves out a restricting condition of its source (an approval,
 *   exception or eligibility rule) is no longer unsupported for that
 *   reason, as on 3.8 and earlier; for comparisons with saved baselines
 * @param {JudgeLLM} [params.judge] - Opt-in LLM judge for sentences the
 *   lexical check failed for lack of word overlap (correct paraphrases).
 *   It never overturns a sentence that failed the number or negation check,
 *   and a "supported" verdict must name a source whose numbers and negation
 *   match the sentence. Unparseable output keeps a sentence unsupported.
 *   With a judge, `grounded`, `groundedness` and `unsupported` combine both
 *   checks and `judge` reports the verdicts; `citations` and `evaluation`
 *   stay lexical. Errors thrown by `judge.generate` are not caught.
 * @returns {Promise<AnswerCheck>}
 */
async function checkAnswer({
  answer,
  sources,
  question,
  referenceAnswer,
  embedder,
  evaluate = true,
  judge,
  conditionCheck = true,
} = {}) {
  if (typeof answer !== 'string') {
    throw new TypeError('answer must be a string');
  }
  if (judge != null && typeof judge.generate !== 'function') {
    throw new TypeError('judge must have a generate() method');
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
      ...(judge != null && { judge: { verdicts: [], calls: 0 } }),
    };
  }

  const tracked = new CitationTracker({ conditionCheck }).track(answer, docs);
  const sentences =
    (tracked.hallucinationReport && tracked.hallucinationReport.sentences) ||
    [];
  let unsupported = sentences
    .filter((s) => s.classification !== 'grounded')
    .map((s) => s.text);
  let groundedness = tracked.groundednessScore;

  let judged;
  if (judge != null) {
    judged = await runJudge({ judge, sentences, docs, conditionCheck });
    unsupported = judged.verdicts
      .filter((v) => v.verdict !== 'supported')
      .map((v) => v.sentence);
    groundedness =
      sentences.length > 0
        ? (sentences.length - unsupported.length) / sentences.length
        : 0;
  }

  let evaluation;
  if (evaluate) {
    evaluation = await new PipelineEvaluator({ conditionCheck }).evaluate(
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
    groundedness,
    unsupported,
    citations: tracked.citations,
    evaluation,
    sources: docs,
    ...(judged && { judge: judged }),
  };
}

module.exports = { checkAnswer, normalizeSources };
