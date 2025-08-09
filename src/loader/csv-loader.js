/**
const fs = require('fs');
 * Version: 0.1.0
 * Path: /src/loader/csv-loader.js
 * Description: CSV document loader with row-wise chunking
 * Author: Ali Kahwaji
 */

const fs = require('fs/promises'); // eslint-disable-line global-require
const path = require('path'); // eslint-disable-line global-require
const { parse  } = require('csv-parse/sync'); // eslint-disable-line global-require

class CSVLoader {
  /**
   * Load and parse a CSV file into chunks
   * @param {string} _filePath
   * @returns {Promise<Array<{ chunk(): string[] }>>}
   */
  async load(_filePath) {
    const absPath = path.resolve(_filePath);
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



module.exports = {
  CSVLoader
};