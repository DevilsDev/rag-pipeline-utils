"use strict";

/**
 * create-rag-pipeline: what the scaffolder writes. scripts/test-templates.js
 * installs, builds and runs the starters themselves.
 */

const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");

const PKG = path.join(__dirname, "../../../packages/create-rag-pipeline");
const { scaffold, TEMPLATES, packageName } = require(
  path.join(PKG, "lib/scaffold"),
);
const ROOT_VERSION = require("../../../package.json").version;
const BIN = path.join(PKG, "bin/create-rag-pipeline.js");

let tmp;
beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "create-rag-"));
});
afterEach(() => fs.rmSync(tmp, { recursive: true, force: true }));

const read = (...p) => fs.readFileSync(path.join(...p), "utf8");

describe.each(Object.keys(TEMPLATES))("the %s template", (template) => {
  test("names the project, pins the library to this version, renames .gitignore", () => {
    const dir = path.join(tmp, "My App");
    const result = scaffold({ template, dir });
    expect(result.name).toBe("my-app");

    const pkg = JSON.parse(read(dir, "package.json"));
    expect(pkg.name).toBe("my-app");
    expect(pkg.dependencies["@devilsdev/rag-pipeline-utils"]).toBe(
      `^${ROOT_VERSION}`,
    );
    expect(JSON.stringify(pkg)).not.toMatch(/LIBRARY_VERSION/);

    expect(fs.existsSync(path.join(dir, ".gitignore"))).toBe(true);
    expect(fs.existsSync(path.join(dir, "_gitignore"))).toBe(false);
    expect(fs.existsSync(path.join(dir, "README.md"))).toBe(true);
  });

  test("keeps API keys out of git and ships an example to copy", () => {
    // [example file, the file the starter reads the key from, its .gitignore line]
    const files = {
      next: [".env.example", ".env.local", ".env*.local"],
      mastra: [".env.example", ".env", ".env"],
      workers: [".dev.vars.example", ".dev.vars", ".dev.vars"],
    }[template];
    const dir = path.join(tmp, "app");
    scaffold({ template, dir });
    expect(read(dir, files[0])).toMatch(/^ANTHROPIC_API_KEY=$/m);
    expect(read(dir, ".gitignore").split(/\r?\n/)).toContain(files[2]);
  });
});

test("the version is the main package's (released together)", () => {
  expect(require(path.join(PKG, "package.json")).version).toBe(ROOT_VERSION);
});

test("the Worker's name follows the project", () => {
  const dir = path.join(tmp, "docs-bot");
  scaffold({ template: "workers", dir });
  expect(read(dir, "wrangler.toml")).toMatch(/^name = "docs-bot"$/m);
});

test("refuses a directory that isn't empty, and unknown templates", () => {
  fs.writeFileSync(path.join(tmp, "keep.txt"), "mine");
  expect(() => scaffold({ template: "next", dir: tmp })).toThrow(/not empty/);
  expect(read(tmp, "keep.txt")).toBe("mine");
  expect(() =>
    scaffold({ template: "rails", dir: path.join(tmp, "x") }),
  ).toThrow(/Unknown template "rails"/);
});

test("package names", () => {
  expect(packageName("/a/My Cool_App!")).toBe("my-cool_app");
  expect(packageName("/a/---")).toBe("rag-app");
});

test("the published files include every template and its dotfiles", () => {
  const files = require(path.join(PKG, "package.json")).files;
  expect(files).toEqual(expect.arrayContaining(["bin/", "lib/", "templates/"]));
  for (const template of Object.keys(TEMPLATES)) {
    expect(
      fs.existsSync(path.join(PKG, "templates", template, "_gitignore")),
    ).toBe(true);
  }
});

describe("the CLI", () => {
  const run = (...args) =>
    spawnSync(process.execPath, [BIN, ...args], { cwd: tmp, encoding: "utf8" });

  test("scaffolds with --template and prints the next steps", () => {
    const r = run("hello", "--template", "workers");
    expect(r.status).toBe(0);
    expect(r.stdout).toMatch(/Created hello from the workers starter/);
    expect(r.stdout).toMatch(/\.dev\.vars\.example to \.dev\.vars/);
    expect(fs.existsSync(path.join(tmp, "hello", "src", "worker.js"))).toBe(
      true,
    );
  });

  test("needs --template when not run in a terminal", () => {
    const r = run("hello");
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/Pass --template/);
  });

  test("--help lists the templates", () => {
    const r = run("--help");
    expect(r.status).toBe(0);
    for (const t of Object.keys(TEMPLATES)) expect(r.stdout).toContain(t);
  });
});
