/**
 * Bug hunt (3.9 follow-up): AuditLogger's constructor created its log
 * folders before anything is logged, and a folder that can't be created
 * ended the process. Fixed in 3.9; these tests are excluded from `npm test`
 * and run with `npm run test:bug-hunt`. See
 * benchmarks/fixtures/bug-hunt-findings.md.
 */

const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");

const ROOT = path.join(__dirname, "..", "..");

// Runs in a child process with its own working directory, so neither the
// repository nor the test runner is touched.
function runInTempDir(script) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "bh-audit-"));
  try {
    fs.writeFileSync(path.join(dir, "afile"), "x");
    const run = spawnSync(process.execPath, ["-e", script], {
      cwd: dir,
      env: { ...process.env, RAG_ROOT: ROOT },
      encoding: "utf8",
      timeout: 20000,
    });
    return { run, created: fs.existsSync(path.join(dir, ".rag-enterprise")) };
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

describe("bug hunt: AuditLogger", () => {
  // BH-13: `new AuditLogger()` writes `.rag-enterprise/audit-logs/` (with an
  // integrity chain file) into the working directory before any event is
  // logged.
  test("BH-13: creating an AuditLogger writes nothing to the working directory", () => {
    const { created } = runInTempDir(`
      const { AuditLogger } = require(require("path").join(process.env.RAG_ROOT, "src/index.js"));
      new AuditLogger();
      setTimeout(() => process.exit(0), 500);
    `);
    expect(created).toBe(false);
  });

  // BH-14: the constructor starts the folder setup without awaiting or
  // catching it, so a log folder that can't be created (a read-only working
  // directory, as on AWS Lambda, or a path under a file) is an unhandled
  // rejection that ends the process.
  test("BH-14: an AuditLogger whose log folder can't be created doesn't end the process", () => {
    const { run } = runInTempDir(`
      const { AuditLogger } = require(require("path").join(process.env.RAG_ROOT, "src/index.js"));
      new AuditLogger({ logDir: "afile/logs" });
      setTimeout(() => { console.log("alive"); process.exit(0); }, 500);
    `);
    expect(run.stdout).toContain("alive");
  });
});
