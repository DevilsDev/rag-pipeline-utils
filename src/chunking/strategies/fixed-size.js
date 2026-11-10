'use strict';

/**
 * Fixed-size chunking strategy.
 * Splits text by character count with configurable overlap.
 * Attempts to break at word boundaries by looking back up to 20 characters.
 *
 * @param {string} text - The input text to chunk.
 * @param {object} [options={}] - Chunking options.
 * @param {number} [options.chunkSize=512] - Target chunk size in characters.
 * @param {number} [options.chunkOverlap=50] - Number of overlapping characters between chunks.
 * @param {number} [options.minChunkSize=50] - Minimum chunk size; smaller chunks are filtered out.
 * @returns {string[]} Array of text chunks.
 */
function fixedSizeChunk(text, options = {}) {
  const { chunkSize = 512, chunkOverlap = 50, minChunkSize = 50 } = options;

  if (!text || typeof text !== 'string') {
    return [];
  }

  if (chunkOverlap < 0 || chunkOverlap > chunkSize / 2) {
    throw new Error(
      'chunkOverlap must be between 0 and half of chunkSize (chunkSize must be greater than chunkOverlap)',
    );
  }

  const isHigh = (i) => {
    const c = text.charCodeAt(i);
    return c >= 0xd800 && c <= 0xdbff;
  };
  const isLow = (i) => {
    const c = text.charCodeAt(i);
    return c >= 0xdc00 && c <= 0xdfff;
  };
  // Move a boundary so it never falls between the halves of a surrogate pair.
  const align = (i) => (i > 0 && i < text.length && isLow(i) && isHigh(i - 1) ? i - 1 : i);

  const all = [];
  let pos = 0;

  while (pos < text.length) {
    let end = Math.min(pos + chunkSize, text.length);

    // Try to break at a word boundary by looking back up to 20 chars
    if (end < text.length) {
      const lookbackStart = Math.max(end - 20, pos);
      const segment = text.slice(lookbackStart, end);
      const lastSpace = segment.lastIndexOf(' ');
      if (lastSpace !== -1 && lookbackStart + lastSpace > pos) {
        end = lookbackStart + lastSpace;
      }
    }
    end = align(end);
    if (end <= pos) end = Math.min(pos + 2, text.length);

    const chunk = text.slice(pos, end).trim();
    if (chunk.length > 0) all.push(chunk);

    if (end >= text.length) break;
    // Step back by the overlap but always make progress.
    let next = align(Math.max(end - chunkOverlap, pos + 1));
    if (next <= pos) next = pos + (isHigh(pos) ? 2 : 1);
    pos = next;
  }

  const kept = all.filter((chunk) => chunk.length >= minChunkSize);
  // A document whose chunks are all below minChunkSize is still kept.
  return kept.length > 0 ? kept : all;
}

module.exports = { fixedSizeChunk };
