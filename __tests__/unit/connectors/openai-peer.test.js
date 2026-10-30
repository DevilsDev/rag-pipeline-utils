"use strict";

/**
 * `openai` is an optional peer dependency since 3.0.0. These run the
 * connector in a child process whose module resolution is patched, since
 * the repo itself has openai installed.
 */

const { spawnSync } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");

const connectorPath = path.resolve(
  __dirname,
  "../../../src/connectors/openai-connector.js",
);

let tmpDir;
beforeAll(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "openai-peer-"));
  // A stand-in SDK whose own dependency is missing.
  fs.writeFileSync(
    path.join(tmpDir, "broken-openai.js"),
    "require('some-missing-inner-module');\n",
  );
});
afterAll(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

/** Run `script` with require('openai') resolving as `mode` says. */
function runWithOpenAI(mode, script) {
  const hook = path.join(tmpDir, `hook-${mode}.js`);
  const target =
    mode === "missing" ? null : path.join(tmpDir, "broken-openai.js");
  fs.writeFileSync(
    hook,
    [
      "const Module = require('module');",
      "const orig = Module._resolveFilename;",
      "Module._resolveFilename = function (request, ...rest) {",
      "  if (request === 'openai') {",
      target
        ? `    return ${JSON.stringify(target)};`
        : "    const e = new Error(\"Cannot find module 'openai'\"); e.code = 'MODULE_NOT_FOUND'; throw e;",
      "  }",
      "  return orig.call(this, request, ...rest);",
      "};",
    ].join("\n"),
  );
  const result = spawnSync(
    process.execPath,
    [
      "-r",
      hook,
      "-e",
      script.replace('"CONNECTOR"', JSON.stringify(connectorPath)),
    ],
    { encoding: "utf8" },
  );
  return JSON.parse(result.stdout.trim());
}

const SCRIPT = `
const { OpenAIConnector } = require(${JSON.stringify("CONNECTOR")});
const c = new OpenAIConnector({ apiKey: "k", maxRetries: 3, retryDelay: 1 });
Promise.allSettled([
  c.generate("q"),
  c.embed("q"),
  (async () => { for await (const _ of c.generateStream("q")); })(),
]).then((results) => {
  console.log(JSON.stringify(results.map((r) => ({
    code: r.reason && r.reason.code,
    message: r.reason && r.reason.message,
  }))));
});
`;

describe("OpenAIConnector without the openai package", () => {
  test("generate, embed and generateStream reject with an install hint", () => {
    const results = runWithOpenAI("missing", SCRIPT);
    expect(results).toHaveLength(3);
    for (const r of results) {
      expect(r.code).toBe("MISSING_DEPENDENCY");
      expect(r.message).toContain("npm install openai");
    }
  });

  test("a module missing inside the SDK is not reported as a missing openai", () => {
    const results = runWithOpenAI("broken", SCRIPT);
    for (const r of results) {
      expect(r.code).toBe("MODULE_NOT_FOUND");
      expect(r.message).toContain("some-missing-inner-module");
    }
  });
});
