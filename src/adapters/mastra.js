'use strict';

/**
 * Mastra adapters: this library's deterministic grounding metrics as Mastra
 * scorers, and its guardrails as a Mastra processor.
 *
 * Mastra is not a dependency. Pass `createScorer` from "@mastra/core/evals";
 * the processor is a plain object that Mastra calls.
 *
 * The scorers make no model calls, so they cost nothing and give the same
 * score every run: useful as a first pass next to Mastra's LLM-judge
 * scorers, or on every production run with a sampling rate of 1.
 */

const { checkAnswer, normalizeSources } = require('../grounding/check-answer');
const { computeFaithfulness } = require('../evaluate/faithfulness');
const {
  computeContextPrecision,
  computeContextRecall,
} = require('../evaluate/context-metrics');
const { PreRetrievalGuard } = require('../guardrails/pre-retrieval-guard');
const { PostGenerationGuard } = require('../guardrails/post-generation-guard');

/** Text of a Mastra message (format 2 parts, a content string, or a plain string). */
function messageText(message) {
  if (message == null) return '';
  if (typeof message === 'string') return message;
  const content = message.content;
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .filter((p) => p && p.type === 'text')
      .map((p) => p.text)
      .join('\n');
  }
  if (content && Array.isArray(content.parts)) {
    const text = content.parts
      .filter((p) => p && p.type === 'text')
      .map((p) => p.text)
      .join('\n');
    if (text) return text;
  }
  if (content && typeof content.content === 'string') return content.content;
  if (typeof message.text === 'string') return message.text;
  return '';
}

const lastText = (messages, role) => {
  if (!Array.isArray(messages)) return messageText(messages);
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m && (m.role === role || (role === 'assistant' && m.role == null))) {
      const text = messageText(m);
      if (text) return text;
    }
  }
  return '';
};

/** The user's question in a scorer run. */
function runQuery(run) {
  const input = run && run.input;
  if (typeof input === 'string') return input;
  return lastText(
    (input && (input.inputMessages || input.messages)) || input,
    'user',
  );
}

/** The agent's answer in a scorer run. */
function runAnswer(run) {
  const output = run && run.output;
  if (typeof output === 'string') return output;
  if (output && !Array.isArray(output) && typeof output.text === 'string') {
    return output.text;
  }
  return lastText(output, 'assistant');
}

/** Passages a tool returned: an array, `relevantContext`, `results`, or the value. */
function toolResultSources(result) {
  if (result == null) return [];
  if (typeof result === 'string') return [result];
  if (Array.isArray(result)) return result;
  for (const key of ['relevantContext', 'results', 'sources', 'documents']) {
    if (Array.isArray(result[key])) return result[key];
  }
  return [JSON.stringify(result)];
}

/**
 * Retrieved passages in a scorer run: the results of the agent's tool calls
 * (such as Mastra's vector query tool), in either message format.
 */
function runToolContext(run) {
  const output = run && run.output;
  if (!Array.isArray(output)) return [];
  const sources = [];
  for (const message of output) {
    const content = message && message.content;
    const invocations =
      (content && content.toolInvocations) ||
      (content && Array.isArray(content.parts)
        ? content.parts
            .filter((p) => p && p.type === 'tool-invocation')
            .map((p) => p.toolInvocation)
        : []);
    for (const call of invocations || []) {
      if (call && call.state === 'result') {
        sources.push(...toolResultSources(call.result));
      }
    }
  }
  return sources;
}

const METRICS = {
  groundedness: {
    description:
      'Share of answer sentences supported by the retrieved context (words, numbers and negation), with no model calls.',
    async score({ query, answer, sources }) {
      if (!answer.trim()) return { score: 0, reason: 'The answer is empty.' };
      const check = await checkAnswer({ question: query, answer, sources });
      return {
        score: check.groundedness,
        reason: check.grounded
          ? `All ${check.citations.length} sentence(s) are supported by the context.`
          : `${check.unsupported.length} sentence(s) are not supported by the context: ${check.unsupported
              .map((s) => `"${s}"`)
              .join(' ')}`,
      };
    },
  },
  faithfulness: {
    description:
      'Share of answer sentences whose content words appear in the retrieved context, with no model calls.',
    async score({ answer, sources }) {
      const result = computeFaithfulness(answer, sources);
      return {
        score: result.score,
        reason: `${result.faithfulSentences} of ${result.totalSentences} sentence(s) are supported by the context.`,
      };
    },
  },
  contextPrecision: {
    description:
      'Share of retrieved passages that are relevant to the question, with no model calls.',
    async score({ query, sources }) {
      const result = computeContextPrecision(query, sources);
      return {
        score: result.score,
        reason: `${result.relevantDocs} of ${result.totalDocs} passage(s) are relevant to the question.`,
      };
    },
  },
  contextRecall: {
    description:
      'Share of the reference answer (groundTruth) supported by the retrieved context, with no model calls.',
    needsReference: true,
    async score({ sources, reference }) {
      const result = computeContextRecall(reference, sources);
      return {
        score: result.score,
        reason: `${result.supportedClaims} of ${result.totalClaims} reference claim(s) are supported by the context.`,
      };
    },
  },
};

/**
 * Create a Mastra scorer from one of this library's metrics.
 *
 * @example
 * import { createScorer } from "@mastra/core/evals";
 * import { createMastraScorer } from "@devilsdev/rag-pipeline-utils";
 *
 * const groundedness = createMastraScorer({ createScorer, metric: "groundedness" });
 * const agent = new Agent({ ..., scorers: { groundedness: { scorer: groundedness } } });
 *
 * @param {Object} options
 * @param {Function} options.createScorer - `createScorer` from "@mastra/core/evals"
 * @param {'groundedness'|'faithfulness'|'contextPrecision'|'contextRecall'} [options.metric='groundedness']
 * @param {Array} [options.context] - Fixed passages to score against (strings, { id, content }, LangChain Documents, LlamaIndex nodes)
 * @param {Function} [options.getContext] - `(run) => passages`; defaults to the results of the agent's tool calls
 * @param {string} [options.id] - Scorer id (default `rag-<metric>`)
 * @returns {Object} A Mastra scorer
 */
function createMastraScorer(options = {}) {
  const {
    createScorer,
    metric = 'groundedness',
    context,
    getContext,
  } = options;
  if (typeof createScorer !== 'function') {
    throw new TypeError(
      'createMastraScorer: pass createScorer, e.g. import { createScorer } from "@mastra/core/evals"',
    );
  }
  const def = METRICS[metric];
  if (!def) {
    throw new TypeError(
      `createMastraScorer: unknown metric "${metric}". Use one of: ${Object.keys(METRICS).join(', ')}`,
    );
  }

  const id = options.id || `rag-${metric}`;
  return createScorer({
    id,
    name: `RAG ${metric} (rag-pipeline-utils)`,
    description: def.description,
    type: 'agent',
  })
    .preprocess(async ({ run }) => {
      const raw =
        context || (getContext ? await getContext(run) : runToolContext(run));
      const reference =
        typeof run.groundTruth === 'string'
          ? run.groundTruth
          : run.groundTruth && typeof run.groundTruth.answer === 'string'
            ? run.groundTruth.answer
            : undefined;
      return {
        query: runQuery(run),
        answer: runAnswer(run),
        sources: normalizeSources(Array.isArray(raw) ? raw : []),
        reference,
      };
    })
    .analyze(async ({ results }) => {
      const input = results.preprocessStepResult;
      if (input.sources.length === 0) {
        return { score: 0, reason: 'No retrieved context to score against.' };
      }
      if (def.needsReference && !input.reference) {
        return {
          score: 0,
          reason:
            'contextRecall needs a reference answer: pass groundTruth to runEvals.',
        };
      }
      return def.score(input);
    })
    .generateScore(({ results }) => results.analyzeStepResult.score)
    .generateReason(({ results }) => results.analyzeStepResult.reason);
}

/**
 * Create a Mastra processor with this library's guardrails: prompt-injection
 * detection on the user's message (input) and PII redaction of the answer
 * (output). A flagged message calls Mastra's `abort()`, which stops the run
 * with a tripwire.
 *
 * @example
 * const agent = new Agent({
 *   ...,
 *   inputProcessors: [guardrails],
 *   outputProcessors: [guardrails],
 * });
 * const guardrails = createMastraGuardrails({ injection: true, pii: "redact" });
 *
 * @param {Object} [options]
 * @param {boolean|Object} [options.injection=true] - Check the last user message; PreRetrievalGuard options
 * @param {'redact'|'block'|false} [options.pii='redact'] - Redact PII in the answer, or abort the run
 * @param {Object<string, RegExp>} [options.piiPatterns] - Extra PII patterns by name
 * @param {string} [options.id='rag-pipeline-guardrails']
 * @returns {Object} A Mastra processor
 */
function createMastraGuardrails(options = {}) {
  const { injection = true, pii = 'redact', piiPatterns } = options;
  const preGuard = injection
    ? new PreRetrievalGuard(injection === true ? {} : injection)
    : null;
  const postGuard = pii
    ? new PostGenerationGuard({
        enableGroundednessCheck: false,
        ...(piiPatterns && { piiPatterns }),
      })
    : null;

  const processor = {
    id: options.id || 'rag-pipeline-guardrails',
    name: 'RAG guardrails (rag-pipeline-utils)',
    description: 'Prompt-injection detection on input, PII redaction on output',
  };

  if (preGuard) {
    processor.processInput = ({ messages, abort }) => {
      const text = lastText(messages, 'user');
      if (text) {
        const result = preGuard.check(text);
        if (!result.safe) {
          abort(`Blocked by guardrails: ${result.issues.join('; ')}`, {
            metadata: { issues: result.issues },
          });
        }
      }
      return messages;
    };
  }

  if (postGuard) {
    const redact = (text) => {
      const result = postGuard.check(text, []);
      return {
        safe: result.safe,
        issues: result.issues,
        text: result.sanitizedOutput,
      };
    };
    processor.processOutputResult = ({ messages, abort }) =>
      messages.map((message) => {
        if (!message || message.role !== 'assistant') return message;
        const content = message.content;
        const issues = [];
        const clean = (text) => {
          const r = redact(text);
          if (!r.safe) issues.push(...r.issues);
          return r.text;
        };
        let next = content;
        if (typeof content === 'string') next = clean(content);
        else if (content && typeof content === 'object') {
          next = { ...content };
          if (Array.isArray(content.parts)) {
            next.parts = content.parts.map((p) =>
              p && p.type === 'text' ? { ...p, text: clean(p.text) } : p,
            );
          }
          if (typeof content.content === 'string') {
            next.content = clean(content.content);
          }
        }
        if (issues.length > 0 && pii === 'block') {
          abort(`Blocked by guardrails: ${[...new Set(issues)].join('; ')}`, {
            metadata: { issues },
          });
        }
        return { ...message, content: next };
      });
  }

  return processor;
}

module.exports = {
  createMastraScorer,
  createMastraGuardrails,
  MASTRA_METRICS: Object.keys(METRICS),
};
