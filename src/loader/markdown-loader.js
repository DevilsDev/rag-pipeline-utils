/**
 * Version: 0.1.0
 * Path: /src/loader/markdown-loader.js
 * Description: Loader for Markdown (.md) documents
 * Author: Ali Kahwaji
 */

const fs = require('fs/promises');
const path = require('path');
const { marked  } = require('marked');

/**
 * MarkdownLoader reads and parses .md files into plain text chunks.
 * Implements the Loader interface.
 */
class MarkdownLoader {
  /**
   * Load and parse Markdown file
   * @param {string} filePath - Path to .md file
   * @returns {Promise<Array<{ chunk(): string[] }>>}
   */
  async load(filePath) {
    const absPath = path.resolve(filePath);
    const raw = await fs.readFile(absPath, 'utf-8');
    const html = marked(raw);
    const text = html.replace(/<[^>]+>/g, ''); // strip tags

    return [
      {
        chunk: () => this._chunkText(text)
      }
    ];
  }

  /**
   * Simple sentence-based chunking strategy
   * @param {string} input
   * @param {number} maxLen
   * @returns {string[]}
   */
  _chunkText(input, maxLen = 500) {
    const sentences = input.split(/(?<=[.!?])\s+/);
    const chunks = [];
    let buffer = '';

    for (const sentence of sentences) {
      if ((buffer + sentence).length <= maxLen) {
        buffer += sentence + ' ';
      } else {
        chunks.push(buffer.trim());
        buffer = sentence + ' ';
      }
    }
    if (buffer.trim()) chunks.push(buffer.trim());
    return chunks;
  }
}



// Default export
module.exports = {};


module.exports = {
  MarkdownLoader
};