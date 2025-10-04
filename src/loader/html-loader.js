/**
 * Loader for HTML (.html) documents
 */

const fs = require("fs/promises");
const path = require("path");
const { JSDOM } = require("jsdom");

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
    const raw = await fs.readFile(absPath, "utf-8");
    const dom = new JSDOM(raw);
    let text = dom.window.document.body.textContent || "";

    const MAX_LEN = 1_000_000;
    text = String(text).replace(/\s+/g, " ").trim();
    if (text.length > MAX_LEN) text = text.slice(0, MAX_LEN);

    return [
      {
        chunk: () => this._chunkText(text),
      },
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
}

module.exports = {
  HTMLLoader,
};
