'use strict';

/**
 * The scores in a run result or an answer check, as a flat list, for
 * exporting to observability tools: OpenTelemetry `gen_ai.evaluation.result`
 * events (with `telemetry`) and Langfuse scores (`toLangfuseScores`).
 *
 * Names match the metrics of `rag-pipeline eval` and runEvaluation():
 * - `evaluation.scores`: faithfulness, relevance, contextPrecision,
 *   contextRecall, groundedness (and bleu, rouge, semanticSimilarity when
 *   computed), under their own names.
 * - `citations.groundednessScore` of a run: `citationCoverage`, the share of
 *   answer sentences a retrieved document supports.
 * - checkAnswer()'s `groundedness`: `groundedSentences`, labelled `grounded`
 *   or `ungrounded` from its `grounded` verdict; its explanation lists the
 *   unsupported sentences.
 *
 * Skipped and non-numeric scores (context recall without a reference
 * answer) are left out. Each score names what it judges: `retrieval` for
 * contextPrecision and contextRecall, `generation` for the rest.
 */

const RETRIEVAL_METRICS = new Set(['contextPrecision', 'contextRecall']);

const isScore = (v) => typeof v === 'number' && Number.isFinite(v);

/**
 * @param {object} result - A pipeline run result (or a stream's done
 *   chunk) with `evaluation` and/or `citations`, or a checkAnswer() result
 * @param {object} [options]
 * @param {boolean} [options.explanations=false] - Include explanations,
 *   which quote the answer
 * @returns {Array<{name: string, value: number, target: 'retrieval'|'generation', label?: string, explanation?: string}>}
 */
function evaluationScores(result, { explanations = false } = {}) {
  if (!result || typeof result !== 'object') return [];
  const out = [];
  const scores =
    result.evaluation && result.evaluation.scores
      ? result.evaluation.scores
      : {};
  for (const [name, value] of Object.entries(scores)) {
    if (!isScore(value)) continue;
    out.push({
      name,
      value,
      target: RETRIEVAL_METRICS.has(name) ? 'retrieval' : 'generation',
    });
  }

  // A run's citations: CitationTracker output
  if (result.citations && isScore(result.citations.groundednessScore)) {
    out.push({
      name: 'citationCoverage',
      value: result.citations.groundednessScore,
      target: 'generation',
    });
  }

  // checkAnswer(): a verdict on every sentence
  if (typeof result.grounded === 'boolean' && isScore(result.groundedness)) {
    const unsupported = Array.isArray(result.unsupported)
      ? result.unsupported
      : [];
    out.push({
      name: 'groundedSentences',
      value: result.groundedness,
      target: 'generation',
      label: result.grounded ? 'grounded' : 'ungrounded',
      ...(explanations &&
        unsupported.length > 0 && {
          explanation: `Unsupported: ${unsupported.map((s) => JSON.stringify(s)).join(' ')}`,
        }),
    });
  }
  return out;
}

/**
 * The scores of a run result or answer check as Langfuse scores: the
 * objects `langfuse.score.create()` takes (from `@langfuse/client`), and,
 * without a trace id, the evaluations a Langfuse experiment evaluator
 * returns. Langfuse is not a dependency.
 *
 * With `telemetry` on, a run result carries its OpenTelemetry trace and span
 * ids in `result.telemetry`; Langfuse uses the same ids when it receives the
 * spans (LangfuseSpanProcessor), so each score is attached to the trace and
 * to the span it judges: the retrieval for contextPrecision and
 * contextRecall, the generation for the rest. A score whose stage had no
 * span (a cache hit) gets the trace only: Langfuse's default span filter
 * keeps the stage spans (they have gen_ai.* attributes) but not the run
 * span, so an observation id for it could point at nothing.
 *
 * @param {object} result - A pipeline run result, a stream's done chunk, or a checkAnswer() result
 * @param {object} [options]
 * @param {string} [options.traceId] - Overrides `result.telemetry.traceId`
 * @param {string} [options.observationId] - Attach every score to this observation
 * @param {string} [options.sessionId]
 * @param {boolean} [options.comments=false] - Add explanations as comments; they quote the answer
 * @returns {Array<{name: string, value: number, dataType: 'NUMERIC', traceId?: string, observationId?: string, sessionId?: string, comment?: string, metadata?: {label: string}}>}
 */
function toLangfuseScores(result, options = {}) {
  const { observationId, sessionId, comments = false } = options;
  const tel = (result && result.telemetry) || {};
  const traceId = options.traceId || tel.traceId;
  const fromSameTrace = !options.traceId || options.traceId === tel.traceId;
  return evaluationScores(result, { explanations: comments }).map((s) => {
    const observation =
      observationId ||
      (fromSameTrace && tel.spans ? tel.spans[s.target] : undefined);
    return {
      name: s.name,
      value: s.value,
      dataType: 'NUMERIC',
      ...(traceId && { traceId }),
      ...(observation && { observationId: observation }),
      ...(sessionId && { sessionId }),
      ...(s.explanation && { comment: s.explanation }),
      ...(s.label && { metadata: { label: s.label } }),
    };
  });
}

module.exports = { evaluationScores, toLangfuseScores };
