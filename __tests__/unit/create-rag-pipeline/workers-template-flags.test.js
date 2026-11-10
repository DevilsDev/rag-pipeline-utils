/**
 * The Workers starter imports the library's /edge entry, which needs no Node.js
 * APIs, so its wrangler.toml does not enable nodejs_compat.
 */
const fs = require("fs");
const path = require("path");

const DIR = path.join(
  __dirname,
  "../../../packages/create-rag-pipeline/templates/workers",
);
const read = (f) => fs.readFileSync(path.join(DIR, f), "utf8");

test("the starter imports /edge and does not enable nodejs_compat", () => {
  expect(read("src/worker.js")).toContain(
    '"@devilsdev/rag-pipeline-utils/edge"',
  );
  const active = read("wrangler.toml")
    .split("\n")
    .filter((line) => !line.trim().startsWith("#"))
    .join("\n");
  expect(active).not.toContain("nodejs_compat");
  expect(read("src/worker.js")).not.toMatch(/Needs the nodejs_compat/);
});
