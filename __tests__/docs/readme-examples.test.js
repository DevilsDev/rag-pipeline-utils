/**
 * Runs every JavaScript example in README.md against the current source, so
 * the README cannot drift from the code. See example-harness.js for the
 * offline connector and the `// literal` comment convention.
 */

const fs = require("fs");
const path = require("path");
const {
  ROOT,
  PKG,
  extractBlocks,
  runExample,
  useTempWorkingDirectory,
} = require("./example-harness");

const readme = fs.readFileSync(path.join(ROOT, "README.md"), "utf8");
const examples = extractBlocks(readme, ["js"]).filter((b) =>
  b.code.includes(PKG),
);

describe("README examples", () => {
  const workdir = useTempWorkingDirectory();
  beforeAll(() => {
    jest.useRealTimers();
    workdir.enter();
  });
  afterAll(() => workdir.leave());

  test("README has runnable examples", () => {
    expect(examples.length).toBeGreaterThanOrEqual(8);
  });

  test.each(examples.map((e, i) => [`${i + 1}. ${e.heading || "README"}`, e]))(
    "%s",
    async (_name, example) => {
      await runExample(example.code);
    },
  );
});
