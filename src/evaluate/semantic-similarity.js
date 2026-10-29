'use strict';

/**
 * Semantic similarity between an answer and a reference answer, from the
 * cosine similarity of their embeddings. Unlike BLEU and ROUGE it does not
 * penalise a correct answer that is worded differently.
 *
 * Embeddings capture topic and meaning, not facts: "twenty days" and
 * "thirty days" score as very similar. Use it next to the grounding checks
 * (computeFaithfulness, checkAnswer), not instead of them.
 */

function cosine(a, b) {
  if (
    !Array.isArray(a) ||
    !Array.isArray(b) ||
    a.length !== b.length ||
    a.length === 0
  ) {
    throw new Error(
      `Embeddings must be non-empty arrays of the same length (got ${a && a.length} and ${b && b.length})`,
    );
  }
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i += 1) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

async function embedText(embedder, text, signal) {
  const options = signal ? { signal } : {};
  if (typeof embedder.embedQuery === 'function') {
    return embedder.embedQuery(text, options);
  }
  return embedder.embed(text, options);
}

/**
 * @param {string} answer - The generated answer
 * @param {string} reference - The reference (ground-truth) answer
 * @param {Object} options
 * @param {Object} options.embedder - Any embedder with embed() or embedQuery()
 *   (a built-in connector, LocalEmbedder fitted to your corpus, an AI SDK
 *   adapter, HashEmbedder from /testing)
 * @param {AbortSignal} [options.signal]
 * @returns {Promise<number>} Cosine similarity clamped to 0..1
 */
async function computeSemanticSimilarity(
  answer,
  reference,
  { embedder, signal } = {},
) {
  if (typeof answer !== 'string' || typeof reference !== 'string') {
    throw new TypeError('answer and reference must be strings');
  }
  if (
    !embedder ||
    (typeof embedder.embed !== 'function' &&
      typeof embedder.embedQuery !== 'function')
  ) {
    throw new TypeError(
      'computeSemanticSimilarity needs an embedder with embed() or embedQuery()',
    );
  }
  if (answer.trim() === '' || reference.trim() === '') return 0;
  const [a, b] = await Promise.all([
    embedText(embedder, answer, signal),
    embedText(embedder, reference, signal),
  ]);
  return Math.min(1, Math.max(0, cosine(a, b)));
}

module.exports = { computeSemanticSimilarity };
