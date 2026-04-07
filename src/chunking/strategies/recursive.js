"use strict";

const DEFAULT_SEPARATORS = ["\n\n", "\n", ". ", " "];

/**
 * Recursive text chunking strategy.
 * Splits text using a hierarchy of separators, merging consecutive pieces
 * into chunks up to chunkSize. Pieces exceeding chunkSize are recursively
 * split with the next separator in the hierarchy.
 *
 * @param {string} text - The input text to chunk.
 * @param {object} [options={}] - Chunking options.
 * @param {number} [options.chunkSize=512] - Maximum chunk size in characters.
 * @param {number} [options.chunkOverlap=50] - Number of overlapping characters between chunks.
 * @param {string[]} [options.separators] - Separator hierarchy for splitting.
 * @param {number} [options.minChunkSize=50] - Minimum chunk size; smaller chunks are filtered out.
 * @returns {string[]} Array of text chunks.
 */
function recursiveChunk(text, options = {}) {
  const {
    chunkSize = 512,
    chunkOverlap = 50,
    separators = DEFAULT_SEPARATORS,
    minChunkSize = 50,
  } = options;

  if (!text || typeof text !== "string") {
    return [];
  }

  const results = _splitRecursive(text, separators, 0, chunkSize, chunkOverlap);

  return results.filter((chunk) => chunk.length >= minChunkSize);
}

/**
 * Internal recursive splitting function.
 *
 * @param {string} text - Text to split.
 * @param {string[]} separators - Separator hierarchy.
 * @param {number} sepIndex - Current separator index.
 * @param {number} chunkSize - Maximum chunk size.
 * @param {number} chunkOverlap - Overlap size.
 * @returns {string[]} Array of text chunks.
 * @private
 */
function _splitRecursive(text, separators, sepIndex, chunkSize, chunkOverlap) {
  // Base case: no more separators or text fits in one chunk
  if (text.length <= chunkSize) {
    return [text.trim()];
  }

  if (sepIndex >= separators.length) {
    // No more separators; hard-cut the text
    return [text.slice(0, chunkSize).trim()];
  }

  const separator = separators[sepIndex];
  const pieces = text.split(separator);

  // If splitting produced only one piece, try next separator
  if (pieces.length <= 1) {
    return _splitRecursive(
      text,
      separators,
      sepIndex + 1,
      chunkSize,
      chunkOverlap,
    );
  }

  const chunks = [];
  let buffer = "";

  for (const piece of pieces) {
    const candidate = buffer ? buffer + separator + piece : piece;

    if (candidate.length <= chunkSize) {
      buffer = candidate;
    } else {
      // Flush the current buffer
      if (buffer) {
        chunks.push(buffer.trim());
      }

      // If the piece itself exceeds chunkSize, recurse with next separator
      if (piece.length > chunkSize) {
        const subChunks = _splitRecursive(
          piece,
          separators,
          sepIndex + 1,
          chunkSize,
          chunkOverlap,
        );
        chunks.push(...subChunks);
        buffer = "";
      } else {
        buffer = piece;
      }
    }
  }

  if (buffer.trim()) {
    chunks.push(buffer.trim());
  }

  // Apply overlap: prefix each chunk (except the first) with trailing text from previous chunk
  if (chunkOverlap > 0 && chunks.length > 1) {
    const overlapped = [chunks[0]];
    for (let i = 1; i < chunks.length; i++) {
      const prev = chunks[i - 1];
      const overlapText = prev.slice(-chunkOverlap);
      const combined = overlapText + chunks[i];
      // Only add overlap if it doesn't push us way over chunkSize
      if (combined.length <= chunkSize + chunkOverlap) {
        overlapped.push(combined.trim());
      } else {
        overlapped.push(chunks[i]);
      }
    }
    return overlapped;
  }

  return chunks;
}

module.exports = { recursiveChunk };
