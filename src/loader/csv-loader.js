/**
 * Version: 0.1.0
 * Path: /src/loader/csv-loader.js
 * Description: CSV document loader with row-wise chunking
 * Author: Ali Kahwaji
 */

import fs from 'fs/promises';
import path from 'path';
import { parse } from 'csv-parse/sync';

export class CSVLoader {
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

