'use strict';

/**
 * Generates an evaluation dataset from a corpus: an LLM writes question and
 * answer pairs about one document at a time, and each case records that
 * document as its source. The output is a dataset validateDataset,
 * runEvaluation and `rag-pipeline eval` read.
 *
 * Generated cases are a starting point, not ground truth. Each one is
 * marked `reviewed: false` and tagged "synthetic"; read them, fix or delete
 * the bad ones, and set `reviewed: true`.
 */

const { computeFaithfulness } = require('./faithfulness');

const DEFAULT_PROMPT = [
  'Write {count} question(s) that the reference document answers, each with',
  'its answer. Each question must make sense on its own, as a user of a',
  'search system would ask it, without mentioning "the document" or "the',
  'text". Each answer must be one or two sentences using only facts stated',
  'in the document. Reply with a JSON array and nothing else, in this form:',
  '[{"question": "...", "answer": "..."}]',
].join(' ');

const MIN_DOCUMENT_LENGTH = 80;

const textOf = (doc) =>
  typeof doc === 'string'
    ? doc
    : String((doc && (doc.content || doc.text)) || '');

/** The id a case's sourceIds should hold: what retrieval results carry. */
function sourceIdOf(doc, index) {
  if (doc && typeof doc === 'object') {
    if (doc.metadata && doc.metadata.source !== undefined) {
      return String(doc.metadata.source);
    }
    if (doc.id !== undefined && doc.id !== null) return String(doc.id);
  }
  return `doc-${index + 1}`;
}

/**
 * Pulls the JSON array of pairs out of a model reply. Accepts a bare array,
 * one inside a ```json fence, or one surrounded by prose; returns null when
 * there is none.
 */
function parsePairs(reply) {
  if (typeof reply !== 'string') return null;
  const candidates = [];
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(reply);
  if (fenced) candidates.push(fenced[1]);
  candidates.push(reply);
  const start = reply.indexOf('[');
  const end = reply.lastIndexOf(']');
  if (start >= 0 && end > start) candidates.push(reply.slice(start, end + 1));
  for (const text of candidates) {
    try {
      const parsed = JSON.parse(text.trim());
      if (Array.isArray(parsed)) return parsed;
      if (parsed && Array.isArray(parsed.questions)) return parsed.questions;
    } catch {
      // try the next candidate
    }
  }
  return null;
}

const normalise = (question) =>
  question
    .toLowerCase()
    .replace(/[^\p{L}\p{N} ]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();

/**
 * Generates question and answer pairs from documents with an LLM.
 *
 * Each document gets its own request, with that document as the only
 * context, so every case knows its source. Generated answers are checked
 * against the document with computeFaithfulness, and pairs whose answer the
 * document doesn't support, malformed pairs and repeated questions are
 * dropped and listed in `skipped`.
 *
 * @param {Array<{id?: string, content: string, metadata?: Object}|string>} documents - The corpus, e.g. the chunks you index
 * @param {Object} options
 * @param {{ generate: Function }} options.llm - Any llm stage: `generate(query, docs, options)` returning a string
 * @param {number} [options.count=20] - Cases to generate at most
 * @param {number} [options.perDocument=1] - Questions to ask per document
 * @param {number} [options.minFaithfulness=1] - Share of an answer's sentences the document must support
 * @param {number} [options.minLength=80] - Documents shorter than this many characters are skipped
 * @param {string} [options.prompt] - Replaces the instruction; `{count}` is replaced by perDocument
 * @param {number} [options.concurrency=1] - Documents processed at the same time
 * @param {Object} [options.generateOptions] - Extra options for every `llm.generate()` call, e.g. `{ temperature: 0.7 }`
 * @param {AbortSignal} [options.signal]
 * @param {(testCase: Object) => void} [options.onCase] - Called for each case kept
 * @returns {Promise<{
 *   cases: Array<{ id: string, prompt: string, expected: string, sourceIds: string[], tags: string[], reviewed: boolean }>,
 *   skipped: Array<{ sourceId: string, reason: string, question?: string }>
 * }>} A dataset (`{ cases }`) plus what was dropped and why
 */
async function generateSyntheticDataset(documents, options = {}) {
  const {
    llm,
    count = 20,
    perDocument = 1,
    minFaithfulness = 1,
    minLength = MIN_DOCUMENT_LENGTH,
    prompt = DEFAULT_PROMPT,
    concurrency = 1,
    generateOptions = {},
    signal,
    onCase,
  } = options;
  if (!Array.isArray(documents)) {
    throw new TypeError('documents must be an array');
  }
  if (!llm || typeof llm.generate !== 'function') {
    throw new TypeError(
      'generateSyntheticDataset needs an llm with generate()',
    );
  }
  for (const [name, value] of [
    ['count', count],
    ['perDocument', perDocument],
    ['concurrency', concurrency],
  ]) {
    if (!Number.isInteger(value) || value < 1) {
      throw new TypeError(`${name} must be a positive integer`);
    }
  }

  const cases = [];
  const skipped = [];
  const seen = new Set();
  const usedIds = new Set();

  const eligible = [];
  documents.forEach((doc, index) => {
    const sourceId = sourceIdOf(doc, index);
    if (textOf(doc).trim().length < minLength) {
      skipped.push({
        sourceId,
        reason: `shorter than ${minLength} characters`,
      });
    } else {
      eligible.push({ doc, sourceId });
    }
  });

  const instruction = prompt.replace(/\{count\}/g, String(perDocument));

  const addPair = (pair, { doc, sourceId }) => {
    if (cases.length >= count) return;
    const question =
      pair && typeof pair.question === 'string' ? pair.question.trim() : '';
    const answer =
      pair && typeof pair.answer === 'string' ? pair.answer.trim() : '';
    if (!question || !answer) {
      skipped.push({ sourceId, reason: 'a pair without a question or answer' });
      return;
    }
    const key = normalise(question);
    if (seen.has(key)) {
      skipped.push({
        sourceId,
        question,
        reason: 'repeats an earlier question',
      });
      return;
    }
    const support = computeFaithfulness(answer, [{ content: textOf(doc) }]);
    if (support.score < minFaithfulness) {
      skipped.push({
        sourceId,
        question,
        reason: `the document does not support the answer (faithfulness ${support.score.toFixed(2)})`,
      });
      return;
    }
    seen.add(key);
    let id = `synthetic-${sourceId}`;
    for (let n = 2; usedIds.has(id); n += 1) id = `synthetic-${sourceId}-${n}`;
    usedIds.add(id);
    const testCase = {
      id,
      prompt: question,
      expected: answer,
      sourceIds: [sourceId],
      tags: ['synthetic'],
      reviewed: false,
    };
    cases.push(testCase);
    if (onCase) onCase(testCase);
  };

  const ask = async (entry) => {
    let reply;
    try {
      reply = await llm.generate(instruction, [entry.doc], {
        ...generateOptions,
        ...(signal && { signal }),
      });
    } catch (err) {
      if (signal && signal.aborted) throw err;
      skipped.push({
        sourceId: entry.sourceId,
        reason: `the llm failed: ${err && err.message}`,
      });
      return;
    }
    const pairs = parsePairs(reply);
    if (!pairs) {
      skipped.push({
        sourceId: entry.sourceId,
        reason: 'the reply had no JSON array of pairs',
      });
      return;
    }
    for (const pair of pairs.slice(0, perDocument)) addPair(pair, entry);
  };

  let next = 0;
  const worker = async () => {
    while (next < eligible.length && cases.length < count) {
      if (signal && signal.aborted) return;
      const entry = eligible[next];
      next += 1;
      await ask(entry);
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(concurrency, eligible.length) }, worker),
  );
  if (signal && signal.aborted) {
    const err = new Error('Generation aborted');
    err.code = 'ABORT_ERR';
    throw err;
  }
  // Keep the corpus order, whatever order concurrent requests finished in.
  const order = new Map(eligible.map((e, i) => [e.sourceId, i]));
  cases.sort((a, b) => order.get(a.sourceIds[0]) - order.get(b.sourceIds[0]));
  return { cases, skipped };
}

module.exports = { generateSyntheticDataset, parsePairs };
