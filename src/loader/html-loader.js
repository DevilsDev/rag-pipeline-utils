/**
 * Version: 0.1.0
 * Path: /src/loader/html-loader.js
 * Description: Loader for HTML (.html) documents
 * Author: Ali Kahwaji
 */

const fs = require('fs/promises');
const path = require('path');
const { JSDOM  } = require('jsdom');

/**
 * HTMLLoader reads HTML files and extracts visible text.
 * Implements the Loader interface.
 */
class HTMLLoader {
  /**
   * Load and extract text from an HTML file
   * @param {string} filePath - Path to .html file
   * @returns {Promise<Array<{ chunk(): string[] }>>}
   */
  async load(filePath) {
    const absPath = path.resolve(filePath);
    const raw = await fs.readFile(absPath, 'utf-8');
    const dom = new JSDOM(raw);
    const text = dom.window.document.body.textContent || '';

    return [
      {
        chunk: () => this._chunkText(text)
      }
    ];
  }

  /**
   * Chunk HTML text content by sentence
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
  HTMLLoader
};