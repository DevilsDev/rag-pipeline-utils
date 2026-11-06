/**
 * Every package we publish has its package.json in the form npm publishes,
 * so `npm publish` has nothing to auto-correct (3.6.0 warned about the root's
 * `./bin/cli.js` and the plain https repository URL). The scoped packages'
 * package.json come from scripts/build-packages.js, which copies the root's
 * repository field.
 */
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");

const ROOT = path.resolve(__dirname, "../../..");
const PACKAGES = [
  ".",
  "packages/rag-core",
  "packages/rag-connectors",
  "packages/rag-eval",
  "packages/rag-guardrails",
  "packages/rag-mcp-server",
  "packages/create-rag-pipeline",
];
const REPOSITORY_URL =
  "git+https://github.com/DevilsDev/rag-pipeline-utils.git";

const read = (dir) =>
  fs.readFileSync(path.join(ROOT, dir, "package.json"), "utf8");

describe.each(PACKAGES)("%s/package.json", (dir) => {
  const pkg = JSON.parse(read(dir));

  test("bin paths have no leading ./ and point at files", () => {
    for (const file of Object.values(pkg.bin || {})) {
      expect(file).not.toMatch(/^\.\//);
      expect(fs.existsSync(path.join(ROOT, dir, file))).toBe(true);
    }
  });

  test("repository is the git+https URL npm normalizes to", () => {
    expect(pkg.repository).toMatchObject({ type: "git", url: REPOSITORY_URL });
  });

  test("npm pkg fix changes nothing", () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "pkg-form-"));
    try {
      fs.writeFileSync(path.join(tmp, "package.json"), read(dir));
      // The bin files have to exist or npm drops the bin entries
      for (const file of Object.values(pkg.bin || {})) {
        fs.mkdirSync(path.dirname(path.join(tmp, file)), { recursive: true });
        fs.writeFileSync(path.join(tmp, file), "");
      }
      const r = spawnSync(
        process.platform === "win32" ? "npm.cmd" : "npm",
        ["pkg", "fix"],
        { cwd: tmp, encoding: "utf8", shell: process.platform === "win32" },
      );
      expect(r.status).toBe(0);
      const fixed = JSON.parse(
        fs.readFileSync(path.join(tmp, "package.json"), "utf8"),
      );
      expect(fixed).toEqual(pkg);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  }, 30000);
});
