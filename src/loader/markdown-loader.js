/**
const fs = require('fs');
 * Version: 0.1.0
 * Path: /src/loader/markdown-loader.js
 * Description: Loader for Markdown (.md) documents
 * Author: Ali Kahwaji
 */

const fs = require('fs/promises');
// eslint-disable-line global-require
const path = require('path');
// eslint-disable-line global-require
// marked loads when a Markdown file is read, not on import.
const loadMarked = () => require('marked'); // eslint-disable-line global-require
// eslint-disable-line global-require

const NAMED_ENTITIES = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: '\'',
  nbsp: ' ',
};

/**
 * Turn the entities the Markdown renderer writes (&amp; &lt; &#39; ...)
 * back into characters. One pass, so "&amp;lt;" becomes "&lt;", not "<".
 * @param {string} text
 * @returns {string}
 */
function decodeEntities(text) {
  return text.replace(
    /&(?:#(\d+)|#[xX]([0-9a-fA-F]+)|([a-zA-Z]+));/g,
    (match, dec, hex, name) => {
      if (name) return NAMED_ENTITIES[name] ?? match;
      const code = dec ? Number(dec) : parseInt(hex, 16);
      try {
        return String.fromCodePoint(code);
      } catch {
        return match;
      }
    },
  );
}

/**
 * MarkdownLoader reads and parses .md files into plain text chunks.
 * Implements the Loader interface.
 */
class MarkdownLoader {
  /**
   * Load and parse Markdown file
   * @param {string} _filePath - Path to .md file
   * @returns {Promise<Array<{ chunk(): string[] }>>}
   */
  async load(_filePath) {
    const absPath = path.resolve(_filePath);
    const raw = await fs.readFile(absPath, 'utf-8');
    const html = loadMarked().marked(raw);
    const text = decodeEntities(html.replace(/<[^>]+>/g, '')); // strip tags

    return [
      {
        chunk: () => this._chunkText(text),
      },
    ];
  }

  /**
   * Chunk text using the ChunkingEngine
   * @param {string} input
   * @param {number} maxLen
   * @returns {string[]}
   */
  _chunkText(input, maxLen = 500) {
    if (!input || !String(input).trim()) return [];
    const { ChunkingEngine } = require('../chunking/chunking-engine');
    const engine = new ChunkingEngine({ strategy: 'sentence', maxLen });
    return engine.chunk(input);
  }
}

// Default export

module.exports = {
  MarkdownLoader,
};
