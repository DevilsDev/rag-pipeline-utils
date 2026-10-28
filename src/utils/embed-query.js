'use strict';

/**
 * Embed a single query string with any supported embedder shape.
 *
 * Prefers embedQuery(); falls back to embed(). Accepts the common return
 * shapes: a vector, a list of vectors, or [{ values | vector | embedding }].
 *
 * @param {object} embedder - Object with embedQuery() or embed()
 * @param {string} query - Text to embed
 * @param {object} [options] - Passed through as the second argument (e.g.
 *   `{ signal }` to cancel the call); omitted when not given
 * @returns {Promise<number[]|undefined>} The query vector
 */
async function embedQuery(embedder, query, options) {
  const args = options === undefined ? [query] : [query, options];
  const raw = embedder.embedQuery
    ? await embedder.embedQuery(...args)
    : await embedder.embed(...args);
  const first = Array.isArray(raw) && typeof raw[0] !== 'number' ? raw[0] : raw;
  if (Array.isArray(first)) return first;
  return first?.values || first?.vector || first?.embedding;
}

/**
 * @param {object} [embedder]
 * @returns {boolean} Whether embedQuery() can use this embedder
 */
function canEmbed(embedder) {
  return Boolean(embedder && (embedder.embedQuery || embedder.embed));
}

module.exports = { embedQuery, canEmbed };
