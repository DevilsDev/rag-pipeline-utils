/**
 * The "Testing RAG in TypeScript" guide is built from examples/testing-typescript.
 * This keeps them the same and runs the example's tests here: every code
 * block titled with a file path matches that file, the example's Vitest
 * tests run under Jest against the current source (with `vitest` mapped to
 * Jest's globals), and its configuration and test set are valid.
 *
 * Real Vitest and TypeScript run the example against the packed package in
 * consumer journey K (npm run test:consumer -- --only K), before releases.
 */

const fs = require("fs");
const os = require("os");
const path = require("path");
const ts = require("typescript");
const { execFileSync } = require("child_process");

const ROOT = path.resolve(__dirname, "../..");
const EXAMPLE = path.join(ROOT, "examples/testing-typescript");
const GUIDE = fs.readFileSync(
  path.join(ROOT, "docs-site/docs/Testing-RAG-TypeScript.md"),
  "utf8",
);

/** Fenced blocks whose title is a file of the example. */
const titled = [...GUIDE.matchAll(/```\w+ title="([^"]+)"\n([\s\S]*?)\n```/g)]
  .map((m) => ({ file: m[1], code: m[2] }))
  .filter((b) => fs.existsSync(path.join(EXAMPLE, b.file)));

describe("Testing RAG in TypeScript guide", () => {
  test("shows every file of the example that a reader writes", () => {
    expect(titled.map((b) => b.file).sort()).toEqual(
      [
        ".ragrc.json",
        "eval/tests.json",
        "package.json",
        "rag-matchers.d.ts",
        "tests/answers.test.ts",
        "tsconfig.json",
        "vitest.config.ts",
        "vitest.setup.ts",
      ].sort(),
    );
  });

  test.each(titled.map((b) => [b.file, b]))(
    "%s matches the example",
    (_f, b) => {
      expect(b.code).toBe(
        fs.readFileSync(path.join(EXAMPLE, b.file), "utf8").trimEnd(),
      );
    },
  );

  test("the configuration and the test set are valid", () => {
    const { validateRagrc, validateDataset } = require("../../src/index.js");
    const ragrc = JSON.parse(
      fs.readFileSync(path.join(EXAMPLE, ".ragrc.json"), "utf8"),
    );
    expect(validateRagrc(ragrc).valid).toBe(true);
    const cases = JSON.parse(
      fs.readFileSync(path.join(EXAMPLE, "eval/tests.json"), "utf8"),
    );
    expect(validateDataset(cases)).toMatchObject({ valid: true, errors: [] });
  });

  test("ingest and eval pass on the example's documents", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ts-guide-"));
    try {
      for (const f of [
        ".ragrc.json",
        "eval/tests.json",
        "docs/vacation.md",
        "docs/remote-work.md",
      ]) {
        fs.mkdirSync(path.dirname(path.join(dir, f)), { recursive: true });
        fs.copyFileSync(path.join(EXAMPLE, f), path.join(dir, f));
      }
      const cli = (args) =>
        execFileSync(
          process.execPath,
          [path.join(ROOT, "bin/cli.js"), ...args],
          {
            cwd: dir,
            encoding: "utf8",
            env: { ...process.env, NO_COLOR: "1" },
          },
        );
      cli(["ingest", "docs"]);
      const out = cli(["eval", "eval/tests.json", "--min", "sourceRecall=1"]);
      expect(out).toMatch(/sourceRecall\s+1\.000/);
      expect(out).toMatch(/Evaluation passed/);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }, 60000);
});

/** Loads a TypeScript file of the example as CommonJS, with mapped imports. */
function load(file) {
  const source = fs.readFileSync(path.join(EXAMPLE, file), "utf8");
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  });
  const modules = {
    vitest: { describe, test, expect },
    "@devilsdev/rag-pipeline-utils": require("../../src/index.js"),
    "@devilsdev/rag-pipeline-utils/testing": require("../../src/testing.js"),
  };
  const mod = { exports: {} };
  const req = (id) => {
    if (!(id in modules)) throw new Error(`unexpected import ${id} in ${file}`);
    return modules[id];
  };
  new Function("require", "module", "exports", outputText)(
    req,
    mod,
    mod.exports,
  );
}

describe("examples/testing-typescript, run under Jest", () => {
  load("vitest.setup.ts");
  load("tests/answers.test.ts");
});
