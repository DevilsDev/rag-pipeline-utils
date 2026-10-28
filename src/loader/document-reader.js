'use strict';

const fs = require('fs');
const path = require('path');
const fg = require('fast-glob');
const { MarkdownLoader } = require('./markdown-loader.js');
const { HTMLLoader } = require('./html-loader.js');
const { CSVLoader } = require('./csv-loader.js');

const textLoader = {
  async load(filePath) {
    const text = await fs.promises.readFile(filePath, 'utf8');
    return [
      {
        chunk: () => {
          const { ChunkingEngine } = require('../chunking/chunking-engine');
          return new ChunkingEngine({
            strategy: 'sentence',
            maxLen: 500,
          }).chunk(text);
        },
      },
    ];
  },
};

const LOADERS_BY_EXTENSION = {
  '.md': new MarkdownLoader(),
  '.markdown': new MarkdownLoader(),
  '.html': new HTMLLoader(),
  '.htm': new HTMLLoader(),
  '.csv': new CSVLoader(),
  '.txt': textLoader,
};

const SUPPORTED_EXTENSIONS = Object.keys(LOADERS_BY_EXTENSION);

/**
 * Read a file or every supported file under a directory and return its
 * chunks together with the file they came from. Unlike DirectoryLoader this
 * keeps the source path, which ingestion needs for stable chunk ids,
 * re-ingestion and citations.
 *
 * @param {string} inputPath - File or directory
 * @param {object} [options]
 * @param {string} [options.baseDir=process.cwd()] - Sources are reported relative to this
 * @returns {Promise<Array<{source: string, chunks: string[]}>>}
 */
async function readDocuments(inputPath, options = {}) {
  const baseDir = path.resolve(options.baseDir || process.cwd());
  const absolute = path.resolve(inputPath);
  if (!fs.existsSync(absolute)) {
    throw new Error(`Path not found: ${inputPath}`);
  }

  let files;
  if (fs.statSync(absolute).isDirectory()) {
    const pattern = `**/*{${SUPPORTED_EXTENSIONS.join(',')}}`;
    files = (
      await fg(pattern, {
        cwd: absolute,
        absolute: true,
        caseSensitiveMatch: false,
        ignore: ['**/node_modules/**', '**/.git/**'],
      })
    ).sort();
  } else {
    const ext = path.extname(absolute).toLowerCase();
    if (!LOADERS_BY_EXTENSION[ext]) {
      throw new Error(
        `Unsupported file type "${ext}". Supported: ${SUPPORTED_EXTENSIONS.join(', ')}`,
      );
    }
    files = [absolute];
  }

  const documents = [];
  for (const file of files) {
    const loader = LOADERS_BY_EXTENSION[path.extname(file).toLowerCase()];
    const loaded = await loader.load(file);
    const chunks = loaded
      .flatMap((doc) => doc.chunk())
      .map((chunk) => String(chunk).trim())
      .filter(Boolean);
    const source = path.relative(baseDir, file).split(path.sep).join('/');
    documents.push({ source, chunks });
  }
  return documents;
}

module.exports = { readDocuments, SUPPORTED_EXTENSIONS };
