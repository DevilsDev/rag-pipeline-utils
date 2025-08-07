/**
 * Version: 0.1.0
 * Path: /src/loader/directory-loader.js
 * Description: Recursive directory loader with file type routing
 * Author: Ali Kahwaji
 */

const fg = require('fast-glob');
const { MarkdownLoader  } = require('./markdown-loader.js');
const { HTMLLoader  } = require('./html-loader.js');
const { CSVLoader  } = require('./csv-loader.js');

const loaders = {
  '.md': new MarkdownLoader(),
  '.html': new HTMLLoader(),
  '.csv': new CSVLoader()
};

class DirectoryLoader {
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

// Default export
module.exports = {};


module.exports = {
  DirectoryLoader
};