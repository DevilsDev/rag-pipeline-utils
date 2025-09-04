/**
 * CSV document loader with row-wise chunking
 */

const fs = require("fs/promises");
const path = require("path");
const { parse } = require("csv-parse/sync");

class CSVLoader {
  /**
   * Load and parse a CSV file into chunks
   * @param {string} filePath
   * @returns {Promise<Array<{ chunk(): string[] }>>}
   */
  async load(filePath) {
    const absPath = path.resolve(filePath);

    try {
      const raw = await fs.readFile(absPath, "utf8");
      const src = raw.replace(/^\uFEFF/, ""); // Remove BOM
      const normalizedSrc = src.replace(/\r\n|\r/g, "\n"); // Normalize line endings

      const records = parse(normalizedSrc, { columns: true });

      return [
        {
          chunk: () => records.map((r) => Object.values(r).join(" ")),
        },
      ];
    } catch (error) {
      throw new Error(`CSV parsing failed for ${filePath}: ${error.message}`);
    }
  }
}

module.exports = {
  CSVLoader,
};
