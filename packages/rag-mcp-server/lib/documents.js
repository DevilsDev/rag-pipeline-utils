"use strict";

/**
 * Reads a folder into passages. The file types and their handling follow
 * the rag-pipeline-utils loaders that `rag-pipeline ingest` uses: Markdown
 * through marked with the tags stripped, HTML as its visible text, CSV one
 * passage per row, plain text as is; prose is split into sentence chunks of
 * up to 500 characters with the library's ChunkingEngine. Other files are
 * skipped.
 */

const fs = require("fs");
const path = require("path");
const { ChunkingEngine } = require("./library");

const SUPPORTED_EXTENSIONS = [
  ".md",
  ".markdown",
  ".html",
  ".htm",
  ".csv",
  ".txt",
];
const SKIPPED_DIRECTORIES = new Set(["node_modules", ".git"]);
const MAX_TEXT_LENGTH = 1_000_000;

const chunker = new ChunkingEngine({ strategy: "sentence", maxLen: 500 });
const chunk = (text) => chunker.chunk(text);

const ENTITIES = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
};
function decodeEntities(text) {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, code) => {
    if (code[0] === "#") {
      const n =
        code[1].toLowerCase() === "x"
          ? parseInt(code.slice(2), 16)
          : parseInt(code.slice(1), 10);
      return Number.isFinite(n) && n <= 0x10ffff
        ? String.fromCodePoint(n)
        : match;
    }
    return ENTITIES[code.toLowerCase()] ?? match;
  });
}

/**
 * Plain text of HTML: tags removed and entities decoded, so "don&#39;t"
 * reads as "don't" for the negation check. Passages are text for search,
 * so a `<` or `>` left by a nested or broken tag (such as `<<b>script>`) or
 * produced by decoding is dropped too.
 */
function plainText(html) {
  return decodeEntities(stripTags(html)).replace(/[<>]/g, " ");
}

// The scans below find each closer with indexOf or a one-pass search
// instead of a lazy regex, so they take time linear in the length of the
// text even when openers have no closer.

/** Each `<...>` replaced by a space; a `<` with no `>` after it is kept. */
function stripTags(html) {
  let out = "";
  let pos = 0;
  for (;;) {
    const open = html.indexOf("<", pos);
    if (open === -1) break;
    const close = html.indexOf(">", open + 1);
    if (close === -1) break;
    out += html.slice(pos, open) + " ";
    pos = close + 1;
  }
  return out + html.slice(pos);
}

/** Each `<!-- ... -->` replaced by a space. */
function stripComments(html) {
  let out = "";
  let pos = 0;
  for (;;) {
    const open = html.indexOf("<!--", pos);
    if (open === -1) break;
    const close = html.indexOf("-->", open + 4);
    if (close === -1) break;
    out += html.slice(pos, open) + " ";
    pos = close + 3;
  }
  return out + html.slice(pos);
}

const HIDDEN_CLOSERS = {
  script: /<\/script\s*>/gi,
  style: /<\/style\s*>/gi,
  noscript: /<\/noscript\s*>/gi,
  template: /<\/template\s*>/gi,
};

/** Each script, style, noscript or template element replaced by a space. */
function stripHidden(html) {
  const opener = /<(script|style|noscript|template)\b/gi;
  const unclosed = new Set();
  let out = "";
  let pos = 0;
  let open;
  while ((open = opener.exec(html)) !== null) {
    const name = open[1].toLowerCase();
    if (unclosed.has(name)) continue;
    const closer = HIDDEN_CLOSERS[name];
    closer.lastIndex = opener.lastIndex;
    const close = closer.exec(html);
    if (close === null) {
      // No closer after this opener, so none after a later one either.
      unclosed.add(name);
      continue;
    }
    out += html.slice(pos, open.index) + " ";
    pos = closer.lastIndex;
    opener.lastIndex = pos;
  }
  return out + html.slice(pos);
}

/** The text between the first `<body ...>` and the last `</body>`, or null. */
function bodyOf(html) {
  const open = /<body/i.exec(html);
  if (open === null) return null;
  const start = html.indexOf(">", open.index + 5);
  if (start === -1) return null;
  const closer = /<\/body>/gi;
  closer.lastIndex = start + 1;
  let end = -1;
  let close;
  while ((close = closer.exec(html)) !== null) end = close.index;
  return end === -1 ? null : html.slice(start + 1, end);
}

/** Visible text of an HTML document: no head, scripts, styles or tags. */
function htmlText(html) {
  const body = bodyOf(html);
  const text = stripHidden(stripComments(body ?? html));
  return plainText(text).replace(/\s+/g, " ").trim();
}

const READERS = {
  ".md": (raw) => chunk(plainText(require("marked").marked(raw))),
  ".html": (raw) => chunk(htmlText(raw)),
  ".csv": (raw) => {
    const { parse } = require("csv-parse/sync");
    const records = parse(raw.replace(/^﻿/, "").replace(/\r\n|\r/g, "\n"), {
      columns: true,
      skip_empty_lines: true,
    });
    return records.map((record) => Object.values(record).join(" "));
  },
  ".txt": (raw) => chunk(raw),
};
READERS[".markdown"] = READERS[".md"];
READERS[".htm"] = READERS[".html"];

/** Supported files under `dir`, sorted, skipping node_modules and .git. */
function listFiles(dir) {
  const files = [];
  const walk = (current) => {
    const entries = fs.readdirSync(current, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        if (!SKIPPED_DIRECTORIES.has(entry.name)) walk(full);
      } else if (
        entry.isFile() &&
        SUPPORTED_EXTENSIONS.includes(path.extname(entry.name).toLowerCase())
      ) {
        files.push(full);
      }
    }
  };
  walk(dir);
  return files.sort();
}

/**
 * @param {string} folder - Folder (or one supported file) to read
 * @param {{onWarning?: (message: string) => void}} [options]
 * @returns {Array<{id: string, source: string, text: string}>} Passages;
 *   `source` is the file relative to the folder, `id` is `source#n`
 */
function readPassages(folder, { onWarning = () => {} } = {}) {
  const root = path.resolve(folder);
  if (!fs.existsSync(root)) throw new Error(`Not found: ${folder}`);
  const isDir = fs.statSync(root).isDirectory();
  const files = isDir ? listFiles(root) : [root];
  const base = isDir ? root : path.dirname(root);

  const passages = [];
  for (const file of files) {
    const source = path.relative(base, file).split(path.sep).join("/");
    const reader = READERS[path.extname(file).toLowerCase()];
    if (!reader) {
      onWarning(`skipped ${source}: unsupported file type`);
      continue;
    }
    let chunks;
    try {
      const raw = fs.readFileSync(file, "utf8").slice(0, MAX_TEXT_LENGTH);
      chunks = reader(raw);
    } catch (error) {
      onWarning(`skipped ${source}: ${error.message}`);
      continue;
    }
    chunks
      .map((text) => String(text).trim())
      .filter(Boolean)
      .forEach((text, n) =>
        passages.push({ id: `${source}#${n}`, source, text }),
      );
  }
  return passages;
}

module.exports = { readPassages, htmlText, SUPPORTED_EXTENSIONS };
