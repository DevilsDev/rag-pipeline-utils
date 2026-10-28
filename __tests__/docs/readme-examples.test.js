/**
 * Runs every JavaScript example in README.md against the current source, so
 * the README cannot drift from the code. Network connectors are replaced by
 * an offline stand-in with the same methods; everything else is real.
 *
 * Comment conventions checked here: `console.log(x); // "value"` (or a
 * number, null, or an array/object literal) asserts the logged value.
 */

const fs = require("fs");
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

function extractExamples(markdown) {
  const examples = [];
  const fence = /```js\n([\s\S]*?)```/g;
  let match;
  while ((match = fence.exec(markdown))) {
    if (!match[1].includes(PKG)) continue;
    const before = markdown.slice(0, match.index);
    const heading = (before.match(/^#{2,3} .*$/gm) || []).pop() || "README";
    examples.push({ heading: heading.replace(/^#+ /, ""), code: match[1] });
  }
  return examples;
}

/** Turn ESM imports from the package into calls to loadLibrary(). */
function toRunnable(code) {
  return code.replace(
    /import\s*\{([\s\S]*?)\}\s*from\s*"(@devilsdev\/rag-pipeline-utils[^"]*)";/g,
    (_m, names, specifier) =>
      `const {${names}} = __load(${JSON.stringify(specifier)});`,
  );
}

/** Expected values from `console.log(...); // <literal>` comments, in order. */
function expectedLogs(code) {
  const expectations = [];
  for (const line of code.split("\n")) {
    const m = line.match(
      // A literal followed by end, ":" or "," (so "0..1, share..." is prose)
      /^\s*console\.log\(.*\);\s*\/\/\s*("[^"]*"|-?\d+(?:\.\d+)?|null|\[[^\]]*\])(?=$|[:,]|\s)/,
    );
    expectations.push(m ? m[1] : undefined);
  }
  return expectations.filter((_, i) =>
    /^\s*console\.log\(/.test(code.split("\n")[i]),
  );
}

const AsyncFunction = Object.getPrototypeOf(async () => {}).constructor;
const readme = fs.readFileSync(path.join(ROOT, "README.md"), "utf8");
const examples = extractExamples(readme);

describe("README examples", () => {
  beforeAll(() => jest.useRealTimers());

  test("README has runnable examples", () => {
    expect(examples.length).toBeGreaterThanOrEqual(8);
  });

  test.each(examples.map((e, i) => [`${i + 1}. ${e.heading}`, e]))(
    "%s",
    async (_name, example) => {
      const logged = [];
      const fakeConsole = {
        log: (value) => logged.push(value),
        error: () => {},
        warn: () => {},
      };
      const previousExitCode = process.exitCode;
      try {
        const run = new AsyncFunction(
          "__load",
          "console",
          "process",
          toRunnable(example.code),
        );
        await run(loadLibrary, fakeConsole, {
          env: { OPENAI_API_KEY: "test-key" },
          set exitCode(code) {
            throw new Error(`example set process.exitCode = ${code}`);
          },
        });
      } finally {
        process.exitCode = previousExitCode;
      }

      expectedLogs(example.code).forEach((literal, i) => {
        if (literal === undefined) return;
        // Literals in README comments are trusted, simple JS values.
        const expected = new Function(`return (${literal});`)();
        expect(util.isDeepStrictEqual(logged[i], expected)).toBe(true);
      });
    },
  );
});
