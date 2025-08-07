/**
 * Version: 0.1.0
 * Path: /src/loader/csv-loader.js
 * Description: CSV document loader with row-wise chunking
 * Author: Ali Kahwaji
 */

const fs = require('fs/promises');
const path = require('path');
const { parse  } = require('csv-parse/sync');

class CSVLoader {
  /**
   * Load and parse a CSV file into chunks
   * @param {string} filePath
   * @returns {Promise<Array<{ chunk(): string[] }>>}
   */
  async load(filePath) {
    const absPath = path.resolve(filePath);
    const raw = await fs.readFile(absPath, 'utf-8');
    const records = parse(raw, { columns: true });

    return [
      {
        chunk: () => records.map(r => Object.values(r).join(' '))
      }
    ];
  }
}



// Default export
module.exports = {};


module.exports = {
  CSVLoader
};