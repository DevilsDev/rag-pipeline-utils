'use strict';

const { recursiveChunk } = require('./recursive');

/**
 * Tokenize text for Jaccard similarity computation.
 * Lowercases, splits on whitespace, filters tokens with length > 2.
 *
 * @param {string} text - Text to tokenize.
 * @returns {Set<string>} Set of tokens.
 * @private
 */
function _tokenize(text) {
  const tokens = text
    .toLowerCase()
    .split(/\s+/)
    .filter((t) => t.length > 2);
  return new Set(tokens);
}

/**
 * Compute Jaccard similarity between two token sets.
 *
 * @param {Set<string>} setA - First token set.
 * @param {Set<string>} setB - Second token set.
 * @returns {number} Jaccard similarity coefficient (0-1).
 * @private
 */
function _jaccardSimilarity(setA, setB) {
  if (setA.size === 0 && setB.size === 0) {
    return 1.0;
  }

  let intersection = 0;
  for (const token of setA) {
    if (setB.has(token)) {
      intersection++;
    }
  }

  const union = setA.size + setB.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

/**
 * Semantic chunking strategy using topic-boundary detection.
 * Splits text into sentences, computes Jaccard token overlap between
 * consecutive sentence pairs, and inserts chunk boundaries where
 * similarity drops below the threshold. Oversized segments fall back
 * to recursive splitting.
 *
 * @param {string} text - The input text to chunk.
 * @param {object} [options={}] - Chunking options.
 * @param {number} [options.chunkSize=512] - Maximum chunk size in characters.
 * @param {number} [options.similarityThreshold=0.3] - Minimum similarity to keep sentences in the same chunk.
 * @param {number} [options.minChunkSize=50] - Minimum chunk size; smaller chunks are filtered out.
 * @returns {string[]} Array of text chunks.
 */
function semanticChunk(text, options = {}) {
  const {
    chunkSize = 512,
    similarityThreshold = 0.3,
    minChunkSize = 50,
  } = options;

  if (!text || typeof text !== 'string') {
    return [];
  }

  const sentences = text
    .split(/(?<=[.!?])\s+/)
    .filter((s) => s.trim().length > 0);

  if (sentences.length === 0) {
    return [];
  }

  if (sentences.length === 1) {
    const trimmed = sentences[0].trim();
    if (trimmed.length > chunkSize) {
      return recursiveChunk(trimmed, { chunkSize, minChunkSize });
    }
    return trimmed.length >= minChunkSize ? [trimmed] : [];
  }

  // Compute token sets for each sentence
  const tokenSets = sentences.map(_tokenize);

  // Group sentences into segments based on similarity boundaries
  const segments = [];
  let currentSegment = [sentences[0]];

  for (let i = 1; i < sentences.length; i++) {
    const similarity = _jaccardSimilarity(tokenSets[i - 1], tokenSets[i]);

    if (similarity < similarityThreshold) {
      // Topic boundary detected; flush current segment
      segments.push(currentSegment.join(' '));
      currentSegment = [sentences[i]];
    } else {
      currentSegment.push(sentences[i]);
    }
  }

  // Flush the last segment
  if (currentSegment.length > 0) {
    segments.push(currentSegment.join(' '));
  }

  // Apply chunkSize limit: oversized segments fall back to recursive splitting
  const chunks = [];
  for (const segment of segments) {
    const trimmed = segment.trim();
    if (trimmed.length === 0) {
      continue;
    }
    if (trimmed.length > chunkSize) {
      const subChunks = recursiveChunk(trimmed, { chunkSize, minChunkSize });
      chunks.push(...subChunks);
    } else if (trimmed.length >= minChunkSize) {
      chunks.push(trimmed);
    }
  }

  return chunks;
}

module.exports = { semanticChunk };
