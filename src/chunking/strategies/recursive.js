'use strict';

const { sliceOnCodePoints } = require('./code-points');

const DEFAULT_SEPARATORS = ['\n\n', '\n', '. ', ' '];

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

  if (!text || typeof text !== 'string') {
    return [];
  }

  const results = _applyOverlap(
    _splitRecursive(text, separators, 0, chunkSize),
    chunkSize,
    chunkOverlap,
  );

  const nonEmpty = results.filter((chunk) => chunk.length > 0);
  const kept = nonEmpty.filter((chunk) => chunk.length >= minChunkSize);
  // A document whose chunks are all below minChunkSize is still kept.
  return kept.length > 0 ? kept : nonEmpty;
}

/**
 * Prefix each chunk (except the first) with the last whole words of the
 * chunk before it, joined by a space. The overlap is counted in chunkSize:
 * a chunk plus its overlap never exceeds it, and a chunk with no room
 * (or no word boundary to cut at) gets no overlap.
 *
 * @param {string[]} chunks - Chunks without overlap.
 * @param {number} chunkSize - Maximum chunk size.
 * @param {number} chunkOverlap - Maximum overlap size.
 * @returns {string[]}
 * @private
 */
function _applyOverlap(chunks, chunkSize, chunkOverlap) {
  if (!(chunkOverlap > 0) || chunks.length < 2) return chunks;
  const out = [chunks[0]];
  for (let i = 1; i < chunks.length; i++) {
    const room = Math.min(chunkOverlap, chunkSize - chunks[i].length - 1);
    const words = chunks[i - 1].split(/\s+/).filter(Boolean);
    const picked = [];
    let used = 0;
    for (let w = words.length - 1; w >= 0; w--) {
      const next = used + words[w].length + (picked.length ? 1 : 0);
      if (next > room) break;
      picked.unshift(words[w]);
      used = next;
    }
    out.push(picked.length ? `${picked.join(' ')} ${chunks[i]}` : chunks[i]);
  }
  return out;
}

/**
 * Internal recursive splitting function.
 *
 * @param {string} text - Text to split.
 * @param {string[]} separators - Separator hierarchy.
 * @param {number} sepIndex - Current separator index.
 * @param {number} chunkSize - Maximum chunk size.
 * @returns {string[]} Array of text chunks (without overlap).
 * @private
 */
function _splitRecursive(text, separators, sepIndex, chunkSize) {
  // Base case: no more separators or text fits in one chunk
  if (text.length <= chunkSize) {
    return [text.trim()];
  }

  if (sepIndex >= separators.length) {
    // No more separators; hard-cut the text into consecutive slices
    return sliceOnCodePoints(text, chunkSize)
      .map((slice) => slice.trim())
      .filter(Boolean);
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
    );
  }

  const chunks = [];
  let buffer = '';

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
        );
        chunks.push(...subChunks);
        buffer = '';
      } else {
        buffer = piece;
      }
    }
  }

  if (buffer.trim()) {
    chunks.push(buffer.trim());
  }

  return chunks;
}

module.exports = { recursiveChunk };
