/**
 * Keeps the code on the docs site honest:
 *
 * 1. Every JavaScript example parses.
 * 2. Every name imported from the package (ESM import or CommonJS require)
 *    is exported by that entry point.
 * 3. Every example that uses the package runs offline against the current
 *    source and its `// literal` comments hold (see example-harness.js),
 *    unless its fence says `no-run`: it continues earlier code or needs
 *    credentials, files or services.
 * 4. Every .ragrc.json example (a ```json block with "pipeline") is valid
 *    JSON and matches .ragrc.schema.json. Use ```jsonc for examples with
 *    comments or deliberately invalid configs.
 */

const fs = require("fs");
const path = require("path");
const espree = require("espree");
const Ajv = require("ajv");
const {
  ROOT,
  PKG,
  extractBlocks,
  runExample,
  useTempWorkingDirectory,
} = require("./example-harness");

const DOCS = path.join(ROOT, "docs-site/docs");
// Generated from CHANGELOG.md; not documentation code.
const SKIP_FILES = new Set(["Changelog.md"]);

const ENTRY_EXPORTS = {
  [PKG]: Object.keys(require(path.join(ROOT, "src/index.js"))),
  [`${PKG}/experimental`]: Object.keys(
    require(path.join(ROOT, "src/experimental.js")),
  ),
  [`${PKG}/testing`]: Object.keys(require(path.join(ROOT, "src/testing.js"))),
  [`${PKG}/edge`]: Object.keys(require(path.join(ROOT, "src/edge.js"))),
};

const pages = fs
  .readdirSync(DOCS)
  .filter((f) => /\.mdx?$/.test(f) && !SKIP_FILES.has(f))
  .map((f) => ({
    file: f,
    markdown: fs.readFileSync(path.join(DOCS, f), "utf8"),
  }));

function blocks(languages) {
  return pages.flatMap(({ file, markdown }) =>
    extractBlocks(markdown, languages).map((b) => ({
      ...b,
      id: `${file}:${b.line}`,
    })),
  );
}

const jsBlocks = blocks(["js", "javascript", "jsx", "mjs", "cjs"]);
const codeBlocks = [...jsBlocks, ...blocks(["ts", "typescript"])];

/** Names imported from the package in a block, with their entry point. */
function packageImports(code) {
  const found = [];
  const patterns = [
    /import\s*\{([^}]*)\}\s*from\s*["'](@devilsdev\/rag-pipeline-utils[^"']*)["']/g,
    /(?:const|let|var)\s*\{([^}]*)\}\s*=\s*require\(\s*["'](@devilsdev\/rag-pipeline-utils[^"']*)["']\s*\)/g,
  ];
  for (const pattern of patterns) {
    let m;
    while ((m = pattern.exec(code))) {
      for (const part of m[1].split(",")) {
        // "a as b", "a: b", "type A" (TypeScript)
        const name = part
          .trim()
          .replace(/^type\s+/, "")
          .split(/\s+as\s+|\s*:\s*/)[0]
          .trim();
        if (name) found.push({ name, entry: m[2] });
      }
    }
  }
  return found;
}

describe("docs-site code examples", () => {
  const workdir = useTempWorkingDirectory();
  beforeAll(() => {
    jest.useRealTimers();
    workdir.enter();
  });
  afterAll(() => workdir.leave());

  test("found the examples", () => {
    expect(jsBlocks.length).toBeGreaterThan(100);
  });

  test.each(jsBlocks.map((b) => [b.id, b]))("%s parses", (_id, b) => {
    expect(() =>
      espree.parse(b.code, {
        ecmaVersion: "latest",
        sourceType: "module",
        ecmaFeatures: { jsx: b.language === "jsx" },
      }),
    ).not.toThrow();
  });

  test("every import from the package exists", () => {
    const missing = [];
    for (const b of codeBlocks) {
      for (const { name, entry } of packageImports(b.code)) {
        const exported = ENTRY_EXPORTS[entry];
        if (!exported) missing.push(`${b.id}: unknown entry point ${entry}`);
        else if (!exported.includes(name)) {
          missing.push(`${b.id}: ${name} is not exported by ${entry}`);
        }
      }
    }
    expect(missing).toEqual([]);
  });

  const runnable = jsBlocks.filter(
    (b) => b.code.includes(PKG) && !/\bno-run\b/.test(b.meta),
  );

  test("runs a meaningful share of the examples", () => {
    expect(runnable.length).toBeGreaterThanOrEqual(30);
  });

  test.each(runnable.map((b) => [b.id, b]))(
    "%s runs offline",
    async (_id, b) => {
      await runExample(b.code);
    },
  );

  const ragrcExamples = blocks(["json"]).filter((b) =>
    /"pipeline"\s*:/.test(b.code),
  );
  const validate = new Ajv({ allErrors: true, strict: false }).compile(
    require(path.join(ROOT, ".ragrc.schema.json")),
  );

  test.each(ragrcExamples.map((b) => [b.id, b]))(
    "%s is a valid .ragrc.json",
    (_id, b) => {
      const config = JSON.parse(b.code);
      const ok = validate(config);
      expect(ok ? [] : validate.errors).toEqual([]);
    },
  );
});
