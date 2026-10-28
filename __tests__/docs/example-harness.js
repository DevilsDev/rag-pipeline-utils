/**
 * Shared harness for running documentation examples against the current
 * source (README.md and docs-site pages). Network connectors are replaced
 * by an offline stand-in with the same methods; everything else is real.
 *
 * Comment convention: `console.log(x); // "value"` (or a number, null, or
 * an array/object literal) asserts the logged value.
 */

const path = require("path");
const util = require("util");

const ROOT = path.resolve(__dirname, "../..");
const PKG = "@devilsdev/rag-pipeline-utils";

/** Deterministic offline stand-in for OpenAIConnector / Anthropic / Ollama. */
class OfflineConnector {
  constructor(options = {}) {
    this.options = options;
  }

  async embed(text) {
    // Hashed bag of words: stable, offline, good enough to rank the examples.
    const vector = new Array(256).fill(0);
    for (const word of String(text)
      .toLowerCase()
      .match(/[a-z0-9]+/g) || []) {
      let hash = 0;
      for (const ch of word) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
      vector[hash % 256] += 1;
    }
    return vector;
  }

  async embedQuery(text) {
    return this.embed(text);
  }

  async generate(query, docs = []) {
    return docs.length ? docs[0].content : "No information found.";
  }
}

function loadLibrary(specifier) {
  if (specifier === `${PKG}/experimental`) {
    return require(path.join(ROOT, "src/experimental.js"));
  }
  return {
    ...require(path.join(ROOT, "src/index.js")),
    OpenAIConnector: OfflineConnector,
    AnthropicConnector: OfflineConnector,
    OllamaConnector: OfflineConnector,
  };
}

/**
 * Fenced code blocks of the given languages, with the nearest heading and
 * the info string after the language (e.g. `js test title="x.js"`).
 */
function extractBlocks(markdown, languages) {
  const blocks = [];
  const fence = new RegExp(
    "```(" + languages.join("|") + ")(?=[ \\t\\n])([^\\n]*)\\n([\\s\\S]*?)```",
    "g",
  );
  let match;
  while ((match = fence.exec(markdown))) {
    const before = markdown.slice(0, match.index);
    const heading = (before.match(/^#{2,3} .*$/gm) || []).pop() || "";
    blocks.push({
      language: match[1],
      meta: match[2].trim(),
      code: match[3],
      line: before.split("\n").length,
      heading: heading.replace(/^#+ /, ""),
    });
  }
  return blocks;
}

/** Turn ESM imports and requires of the package into __load() calls. */
function toRunnable(code) {
  return code
    .replace(
      /import\s*\{([\s\S]*?)\}\s*from\s*["'](@devilsdev\/rag-pipeline-utils[^"']*)["'];?/g,
      (_m, names, specifier) =>
        `const {${names.replace(/\s+as\s+/g, ": ")}} = __load(${JSON.stringify(specifier)});`,
    )
    .replace(
      /require\(\s*["'](@devilsdev\/rag-pipeline-utils[^"']*)["']\s*\)/g,
      (_m, specifier) => `__load(${JSON.stringify(specifier)})`,
    );
}

/** Expected values from `console.log(...); // <literal>` comments, in order. */
function expectedLogs(code) {
  const lines = code.split("\n");
  const expectations = [];
  for (const line of lines) {
    if (!/^\s*console\.log\(/.test(line)) continue;
    const m = line.match(
      // A literal followed by end, ":" or "," (so "0..1, share..." is prose)
      /^\s*console\.log\(.*\);\s*\/\/\s*("[^"]*"|-?\d+(?:\.\d+)?|null|\[[^\]]*\])(?=$|[:,]|\s)/,
    );
    expectations.push(m ? m[1] : undefined);
  }
  return expectations;
}

const AsyncFunction = Object.getPrototypeOf(async () => {}).constructor;

/**
 * Runs an example and checks its `// literal` comments. Throws on failure.
 * @returns {Promise<unknown[]>} the logged values
 */
async function runExample(code) {
  const logged = [];
  const fakeConsole = {
    // `console.log("Label:", value); // literal` asserts the value.
    log: (...args) => logged.push(args[args.length - 1]),
    error: () => {},
    warn: () => {},
    info: () => {},
  };
  const previousExitCode = process.exitCode;
  try {
    const run = new AsyncFunction(
      "__load",
      "require",
      "console",
      "process",
      toRunnable(code),
    );
    await run(loadLibrary, require, fakeConsole, {
      env: { OPENAI_API_KEY: "test-key" },
      set exitCode(value) {
        throw new Error(`example set process.exitCode = ${value}`);
      },
    });
  } finally {
    process.exitCode = previousExitCode;
  }

  expectedLogs(code).forEach((literal, i) => {
    if (literal === undefined) return;
    // Literals in documentation comments are trusted, simple JS values.
    const expected = new Function(`return (${literal});`)();
    if (!util.isDeepStrictEqual(logged[i], expected)) {
      throw new Error(
        `console.log #${i + 1}: expected ${literal}, got ${util.inspect(logged[i])}`,
      );
    }
  });
  return logged;
}

/**
 * Run the examples in a temporary directory: some write files to the current
 * directory (a FileVectorStore index, a dashboard HTML file). Call from
 * beforeAll / afterAll.
 */
function useTempWorkingDirectory() {
  const fs = require("fs");
  const os = require("os");
  const previous = process.cwd();
  let dir;
  return {
    enter() {
      dir = fs.mkdtempSync(path.join(os.tmpdir(), "rag-docs-examples-"));
      process.chdir(dir);
    },
    leave() {
      process.chdir(previous);
      fs.rmSync(dir, { recursive: true, force: true });
    },
  };
}

module.exports = {
  ROOT,
  useTempWorkingDirectory,
  PKG,
  OfflineConnector,
  loadLibrary,
  extractBlocks,
  toRunnable,
  expectedLogs,
  runExample,
};
