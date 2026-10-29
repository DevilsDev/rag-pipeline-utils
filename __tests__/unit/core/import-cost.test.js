"use strict";

/**
 * Importing the package must not load dependencies that only some features
 * use: they load on first use instead. Checked in a separate Node process,
 * because Jest's module registry does not reflect what Node loads.
 */

const { spawnSync } = require("child_process");
const path = require("path");

const ROOT = path.resolve(__dirname, "../../..");

/** npm packages present in require.cache after requiring `entry`. */
function packagesLoadedBy(entry, after = "") {
  const script = `
    require(${JSON.stringify(entry)});
    ${after}
    const pkgs = new Set();
    for (const f of Object.keys(require.cache)) {
      const m = f.split("\\\\").join("/").match(/node_modules\\/((?:@[^/]+\\/)?[^/]+)/);
      if (m) pkgs.add(m[1]);
    }
    process.stdout.write(JSON.stringify([...pkgs]));
  `;
  const run = spawnSync(process.execPath, ["-e", script], {
    cwd: ROOT,
    encoding: "utf8",
    env: { ...process.env, NODE_ENV: "test" },
  });
  if (run.status !== 0) throw new Error(run.stderr);
  return JSON.parse(run.stdout);
}

// Each is loaded only by the feature that needs it.
const LAZY = ["axios", "jsonwebtoken", "ajv", "ajv-formats", "chokidar"];
// CLI-only dependencies.
const CLI_ONLY = ["inquirer", "ora", "cli-table3", "jsdom", "commander"];

describe("import cost", () => {
  const entry = path.join(ROOT, "src/index.js");

  test("importing the package loads none of the feature dependencies", () => {
    const loaded = packagesLoadedBy(entry);
    expect(
      loaded.filter((p) => LAZY.includes(p) || CLI_ONLY.includes(p)),
    ).toEqual([]);
  });

  test("each dependency loads when its feature is used", () => {
    const loaded = packagesLoadedBy(
      entry,
      `
      const lib = require(${JSON.stringify(entry)});
      new lib.AnthropicConnector({ apiKey: "k" });
      new lib.JWTValidator({ secret: "x".repeat(32), issuer: "i", audience: "a" }).sign({ sub: "u" });
      lib.validatePlugin("llm", { generate() {} }, { registry: true });
      `,
    );
    expect(loaded).toEqual(
      expect.arrayContaining(["axios", "jsonwebtoken", "ajv"]),
    );
  });
});
