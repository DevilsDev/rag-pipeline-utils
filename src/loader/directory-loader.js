/**
 * Version: 0.1.0
 * Path: /src/loader/directory-loader.js
 * Description: Recursive directory loader with file type routing
 * Author: Ali Kahwaji
 */

import fg from 'fast-glob';
import { MarkdownLoader } from './markdown-loader.js';
import { HTMLLoader } from './html-loader.js';
import { CSVLoader } from './csv-loader.js';

const loaders = {
  '.md': new MarkdownLoader(),
  '.html': new HTMLLoader(),
  '.csv': new CSVLoader()
};

export class DirectoryLoader {
  /**
   * Load and route supported files from a directory
   * @param {string} dirPath
   * @returns {Promise<Array<{ chunk(): string[] }>>}
   */
  async load(dirPath) {
    const matches = await fg([`${dirPath}/**/*.{md,html,csv}`]);
    const all = [];
    for (const file of matches) {
      const ext = file.slice(file.lastIndexOf('.'));
      const loader = loaders[ext];
      if (loader) {
        const docs = await loader.load(file);
        all.push(...docs);
      }
    }
    return all;
  }
}