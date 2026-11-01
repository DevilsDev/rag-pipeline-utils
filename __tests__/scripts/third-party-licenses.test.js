/**
 * scripts/lib/third-party-licenses.js: the notices shipped next to bundles
 * that include npm packages (dist/cli.cjs bundles the CLI's prompts).
 */
const fs = require("fs");
const os = require("os");
const path = require("path");
const {
  writeThirdPartyLicenses,
  bundledPackages,
} = require("../../scripts/lib/third-party-licenses");

let root;
function pkg(dir, json, license) {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "package.json"), JSON.stringify(json));
  if (license) fs.writeFileSync(path.join(dir, license[0]), license[1]);
}

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "licenses-"));
  pkg(
    path.join(root, "node_modules", "left-pad"),
    { name: "left-pad", version: "1.3.0", license: "WTFPL" },
    ["LICENSE", "Do what you want.\n"],
  );
  pkg(
    path.join(root, "node_modules", "@scope", "util"),
    { name: "@scope/util", version: "2.0.0", license: "MIT" },
    ["license.md", "MIT License\nCopyright (c) Someone\n"],
  );
  // A nested copy, bundled too.
  pkg(
    path.join(root, "node_modules", "@scope", "util", "node_modules", "dep"),
    { name: "dep", version: "0.1.0", license: "ISC" },
    ["LICENCE.txt", "ISC License\n"],
  );
});
afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

const metafile = (inputs) => ({
  inputs: Object.fromEntries(inputs.map((i) => [i, { imports: [] }])),
});

test("lists every bundled package once, with its license text", () => {
  const meta = metafile([
    "src/cli.js",
    "node_modules/left-pad/index.js",
    "node_modules/left-pad/lib/pad.js",
    "node_modules/@scope/util/index.js",
    "node_modules/@scope/util/node_modules/dep/index.js",
  ]);
  const bundle = path.join(root, "cli.cjs");

  const ids = writeThirdPartyLicenses(meta, bundle, root);

  expect(ids).toEqual(["@scope/util@2.0.0", "dep@0.1.0", "left-pad@1.3.0"]);
  const text = fs.readFileSync(`${bundle}.LICENSES.txt`, "utf8");
  expect(text).toMatch(/^Third-party packages bundled into cli\.cjs:/);
  expect(text).toContain("- @scope/util@2.0.0 (MIT)");
  expect(text).toContain("Copyright (c) Someone");
  expect(text).toContain("Do what you want.");
  expect(text).toContain("ISC License");
});

test("no bundled packages: no file, and a stale one is removed", () => {
  const bundle = path.join(root, "index.cjs");
  fs.writeFileSync(`${bundle}.LICENSES.txt`, "stale");
  expect(
    writeThirdPartyLicenses(metafile(["src/index.js"]), bundle, root),
  ).toEqual([]);
  expect(fs.existsSync(`${bundle}.LICENSES.txt`)).toBe(false);
});

test("a bundled package without a license file fails the build", () => {
  pkg(path.join(root, "node_modules", "mystery"), {
    name: "mystery",
    version: "1.0.0",
  });
  expect(() =>
    writeThirdPartyLicenses(
      metafile(["node_modules/mystery/index.js"]),
      path.join(root, "cli.cjs"),
      root,
    ),
  ).toThrow(/mystery@1.0.0 is bundled into cli.cjs but has no license file/);
});

test("handles Windows-style input paths", () => {
  expect(
    bundledPackages(metafile(["node_modules\\@scope\\util\\index.js"]), root),
  ).toEqual([path.join(root, "node_modules", "@scope", "util")]);
});
