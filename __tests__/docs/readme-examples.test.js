/**
 * Runs every JavaScript example in both READMEs against the current source,
 * so they cannot drift from the code: .github/README.md is the one GitHub
 * shows, README.md the short one npm shows. See example-harness.js for the
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

const READMES = { GitHub: ".github/README.md", npm: "README.md" };

describe.each(Object.entries(READMES))("%s README examples", (_name, file) => {
  const readme = fs.readFileSync(path.join(ROOT, file), "utf8");
  const examples = extractBlocks(readme, ["js"]).filter((b) =>
    b.code.includes(PKG),
  );

  const workdir = useTempWorkingDirectory();
  beforeAll(() => {
    jest.useRealTimers();
    workdir.enter();
  });
  afterAll(() => workdir.leave());

  test("README has runnable examples", () => {
    expect(examples.length).toBeGreaterThanOrEqual(
      file === "README.md" ? 2 : 8,
    );
  });

  test.each(examples.map((e, i) => [`${i + 1}. ${e.heading || "README"}`, e]))(
    "%s",
    async (_name, example) => {
      await runExample(example.code);
    },
  );
});
