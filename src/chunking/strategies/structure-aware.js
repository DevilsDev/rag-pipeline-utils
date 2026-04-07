'use strict';

const { recursiveChunk } = require('./recursive');

/**
 * Detect document format from content.
 *
 * @param {string} text - The text to sniff.
 * @returns {'markdown'|'html'|'plain'} Detected format.
 * @private
 */
function _detectFormat(text) {
  // Check for Markdown headers
  if (/^#{1,6}\s/m.test(text)) {
    return 'markdown';
  }
  // Check for HTML heading or section tags
  if (/<h[1-6][^>]*>/i.test(text) || /<section[^>]*>/i.test(text)) {
    return 'html';
  }
  return 'plain';
}

/**
 * Split Markdown text into sections by header boundaries.
 * Keeps headers as chunk prefixes and preserves code blocks as atomic units.
 *
 * @param {string} text - Markdown text.
 * @returns {string[]} Array of sections with their header prefixes.
 * @private
 */
function _splitMarkdown(text) {
  // Protect code blocks by replacing them with placeholders
  const codeBlocks = [];
  const withPlaceholders = text.replace(/```[\s\S]*?```/g, (match) => {
    const index = codeBlocks.length;
    codeBlocks.push(match);
    return `__CODE_BLOCK_${index}__`;
  });

  // Split on header lines
  const sections = [];
  const lines = withPlaceholders.split('\n');
  let currentSection = '';

  for (const line of lines) {
    if (/^#{1,6}\s/.test(line) && currentSection.trim()) {
      sections.push(currentSection.trim());
      currentSection = line + '\n';
    } else {
      currentSection += line + '\n';
    }
  }

  if (currentSection.trim()) {
    sections.push(currentSection.trim());
  }

  // Restore code blocks
  return sections.map((section) =>
    section.replace(
      /__CODE_BLOCK_(\d+)__/g,
      (_, idx) => codeBlocks[Number(idx)],
    ),
  );
}

/**
 * Split HTML text into sections by heading and section tag boundaries.
 *
 * @param {string} text - HTML text.
 * @returns {string[]} Array of sections.
 * @private
 */
function _splitHtml(text) {
  // Split on heading tags or section tags
  const parts = text.split(/(?=<(?:h[1-6]|section)[^>]*>)/i);
  return parts.map((p) => p.trim()).filter((p) => p.length > 0);
}

/**
 * Structure-aware chunking strategy.
 * Detects document format (Markdown, HTML, or plain) and respects
 * structural boundaries. For Markdown, splits on headers and preserves
 * code blocks. For HTML, splits on heading/section tags. Oversized
 * sections are further split via the recursive strategy.
 *
 * @param {string} text - The input text to chunk.
 * @param {object} [options={}] - Chunking options.
 * @param {number} [options.chunkSize=512] - Maximum chunk size in characters.
 * @param {number} [options.chunkOverlap=50] - Number of overlapping characters between chunks.
 * @param {string} [options.format] - Document format: 'markdown', 'html', 'plain', or auto-detect.
 * @returns {string[]} Array of text chunks.
 */
function structureAwareChunk(text, options = {}) {
  const { chunkSize = 512, chunkOverlap = 50, format } = options;

  if (!text || typeof text !== 'string') {
    return [];
  }

  const detectedFormat = format || _detectFormat(text);

  let sections;

  switch (detectedFormat) {
    case 'markdown':
      sections = _splitMarkdown(text);
      break;
    case 'html':
      sections = _splitHtml(text);
      break;
    case 'plain':
    default:
      sections = [text];
      break;
  }

  // Apply chunkSize limit: oversized sections get further split via recursive strategy
  const chunks = [];

  for (const section of sections) {
    const trimmed = section.trim();
    if (!trimmed) {
      continue;
    }
    if (trimmed.length <= chunkSize) {
      chunks.push(trimmed);
    } else {
      const subChunks = recursiveChunk(trimmed, { chunkSize, chunkOverlap });
      chunks.push(...subChunks);
    }
  }

  return chunks.filter((c) => c.length > 0);
}

module.exports = { structureAwareChunk };
