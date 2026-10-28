/**
 * Runs the quick start shown on the docs-site homepage against the current
 * source, so the first code a visitor copies keeps working.
 */

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "../..");
const HOMEPAGE = path.join(ROOT, "docs-site/src/pages/index.js");

const AsyncFunction = Object.getPrototypeOf(async () => {}).constructor;

describe("docs-site homepage quick start", () => {
  beforeAll(() => jest.useRealTimers());

  test("runs and retrieves the expected document", async () => {
    const source = fs.readFileSync(HOMEPAGE, "utf8");
    const match = source.match(/const QUICK_START = `([\s\S]*?)`;/);
    expect(match).not.toBeNull();

    const code = match[1].replace(
      /import\s*\{([\s\S]*?)\}\s*from\s*"@devilsdev\/rag-pipeline-utils";/,
      "const {$1} = __load();",
    );
    expect(code).toContain("__load()");

    const logged = [];
    await new AsyncFunction("__load", "console", code)(
      () => require(path.join(ROOT, "src/index.js")),
      { log: (value) => logged.push(value) },
    );

    expect(logged).toEqual(["vacation"]);
  });
});
