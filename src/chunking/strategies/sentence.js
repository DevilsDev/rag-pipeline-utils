'use strict';

const { sliceOnCodePoints } = require('./code-points');

/**
 * Break a piece that is longer than `limit` into pieces that fit: first at
 * line breaks, then between words, and as a last resort anywhere (never
 * inside a surrogate pair).
 *
 * @param {string} piece - Text longer than limit.
 * @param {number} limit - Maximum length of each result.
 * @returns {string[]}
 * @private
 */
function _breakDown(piece, limit) {
  if (piece.length <= limit) return [piece];
  const lines = piece.split(/\n+/).map((l) => l.trim()).filter(Boolean);
  if (lines.length > 1) return lines.flatMap((l) => _breakDown(l, limit));

  const out = [];
  let buffer = '';
  for (const word of piece.split(/\s+/).filter(Boolean)) {
    if (word.length > limit) {
      if (buffer) out.push(buffer);
      buffer = '';
      out.push(...sliceOnCodePoints(word, limit));
    } else if (!buffer) {
      buffer = word;
    } else if (buffer.length + 1 + word.length <= limit) {
      buffer += ` ${word}`;
    } else {
      out.push(buffer);
      buffer = word;
    }
  }
  if (buffer) out.push(buffer);
  return out;
}

/**
 * Sentence-based chunking strategy.
 * Splits text on sentence boundaries and merges into chunks up to the size
 * limit. A sentence longer than the limit is split at line breaks, then
 * between words, then anywhere, so no chunk exceeds it.
 *
 * @param {string} text - The input text to chunk.
 * @param {object} [options={}] - Chunking options.
 * @param {number} [options.maxLen] - Maximum character length per chunk (takes precedence over chunkSize).
 * @param {number} [options.chunkSize=500] - Maximum character length per chunk.
 * @returns {string[]} Array of text chunks.
 */
function sentenceChunk(text, options = {}) {
  const limit = Math.max(1, options.maxLen || options.chunkSize || 500);

  const sentences = text
    .split(/(?<=[.!?])\s+/)
    .flatMap((sentence) => _breakDown(sentence.trim(), limit))
    .filter(Boolean);
  const chunks = [];
  let buffer = '';

  for (const sentence of sentences) {
    if (!buffer) {
      buffer = sentence;
    } else if (buffer.length + 1 + sentence.length <= limit) {
      buffer += ` ${sentence}`;
    } else {
      chunks.push(buffer);
      buffer = sentence;
    }
  }
  if (buffer) chunks.push(buffer);
  return chunks;
}

module.exports = { sentenceChunk };
