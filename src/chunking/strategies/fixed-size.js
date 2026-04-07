"use strict";

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

  if (!text || typeof text !== "string") {
    return [];
  }

  const step = chunkSize - chunkOverlap;
  if (step <= 0) {
    throw new Error("chunkSize must be greater than chunkOverlap");
  }

  const chunks = [];
  let pos = 0;

  while (pos < text.length) {
    let end = Math.min(pos + chunkSize, text.length);

    // Try to break at a word boundary by looking back up to 20 chars
    if (end < text.length) {
      const lookbackStart = Math.max(end - 20, pos);
      const segment = text.slice(lookbackStart, end);
      const lastSpace = segment.lastIndexOf(" ");
      if (lastSpace !== -1) {
        end = lookbackStart + lastSpace;
      }
    }

    const chunk = text.slice(pos, end).trim();
    if (chunk.length >= minChunkSize) {
      chunks.push(chunk);
    }

    pos += step;
  }

  return chunks;
}

module.exports = { fixedSizeChunk };
