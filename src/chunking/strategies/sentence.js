"use strict";

/**
 * Sentence-based chunking strategy.
 * Extracted from MarkdownLoader._chunkText for backward compatibility.
 * Splits text on sentence boundaries and merges into chunks up to maxLen.
 *
 * @param {string} text - The input text to chunk.
 * @param {object} [options={}] - Chunking options.
 * @param {number} [options.maxLen=500] - Maximum character length per chunk.
 * @returns {string[]} Array of text chunks.
 */
function sentenceChunk(text, options = {}) {
  const { maxLen = 500 } = options;

  const sentences = text.split(/(?<=[.!?])\s+/);
  const chunks = [];
  let buffer = "";

  for (const sentence of sentences) {
    if ((buffer + sentence).length <= maxLen) {
      buffer += sentence + " ";
    } else {
      chunks.push(buffer.trim());
      buffer = sentence + " ";
    }
  }
  if (buffer.trim()) chunks.push(buffer.trim());
  return chunks;
}

module.exports = { sentenceChunk };
