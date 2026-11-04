/**
 * Runs every script in examples/use-cases (the README use cases that open on
 * StackBlitz) against the current source, and checks that the scripts marked
 * as the README's code still match the README block under that heading and
 * that the README links to each script. See example-harness.js for the
 * `// literal` comment convention.
 */

const fs = require("fs");
const path = require("path");
const {
  ROOT,
  extractBlocks,
  runExample,
  useTempWorkingDirectory,
} = require("./example-harness");

const DIR = path.join(ROOT, "examples/use-cases");
const STACKBLITZ =
  "https://stackblitz.com/github/DevilsDev/rag-pipeline-utils/tree/main/examples/use-cases";

const pkg = JSON.parse(fs.readFileSync(path.join(DIR, "package.json"), "utf8"));
const scripts = fs
  .readdirSync(DIR)
  .filter((f) => f.endsWith(".js"))
  .map((file) => ({
    file,
    code: fs.readFileSync(path.join(DIR, file), "utf8"),
  }));
const readme = fs.readFileSync(path.join(ROOT, "README.md"), "utf8");
const readmeBlocks = extractBlocks(readme, ["js"]);

/** The harness rewrites this package's imports; other packages are required. */
function withRequires(code) {
  return code.replace(
    /import\s*\{([\s\S]*?)\}\s*from\s*["']((?!@devilsdev\/)[^"']+)["'];?/g,
    (_m, names, specifier) =>
      `const {${names.replace(/\s+as\s+/g, ": ")}} = require(${JSON.stringify(specifier)});`,
  );
}

/** The script without its leading comment, for comparing with the README. */
function body(code) {
  return code.replace(/^(\/\/.*\n)+\n/, "").trim();
}

describe("README use cases on StackBlitz (examples/use-cases)", () => {
  const workdir = useTempWorkingDirectory();
  beforeAll(() => {
    jest.useRealTimers();
    workdir.enter();
  });
  afterAll(() => workdir.leave());

  test.each(scripts.map((s) => [s.file, s]))("%s runs", async (_name, s) => {
    await runExample(withRequires(s.code));
  });

  test.each(
    scripts
      .filter((s) =>
        /^\/\/ README use case: ".*"\.\n\/\/ The same code as the README/.test(
          s.code,
        ),
      )
      .map((s) => [s.file, s]),
  )("%s is the README's code", (_name, s) => {
    const heading = s.code.match(/^\/\/ README use case: "(.*)"\./)[1];
    const block = readmeBlocks.find((b) => b.heading === heading);
    expect(block).toBeDefined();
    expect(body(s.code)).toBe(block.code.trim());
  });

  test.each(scripts.map((s) => [s.file, s]))(
    "%s has an npm script and a README link",
    (_name, s) => {
      const name = s.file.replace(/\.js$/, "");
      const script = name === "check-your-answer" ? "start" : name;
      expect(pkg.scripts[script]).toBe(`node ${s.file}`);
      const query =
        script === "start"
          ? `?file=${s.file}`
          : `?file=${s.file}&startScript=${script}`;
      expect(readme).toContain(`${STACKBLITZ}${query}`);
    },
  );
});
