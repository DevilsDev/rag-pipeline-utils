/**
 * Bug hunt (3.9 follow-up): AuditLogger has no close() or shutdown, so
 * events still in its buffer, and events waiting for the integrity chain or
 * the webhook, are lost when the process exits. This test fails until that
 * is fixed; it is excluded from `npm test` and runs with
 * `npm run test:bug-hunt`. See benchmarks/fixtures/bug-hunt-findings.md.
 */

const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");

const ROOT = path.join(__dirname, "..", "..");

describe("bug hunt: AuditLogger shutdown", () => {
  // BH-16: an event logged just before exit sits in the buffer until the
  // next timer flush (5 s by default, unref'd), so it never reaches the
  // file; there is no close() to flush the buffer and the pending stages
  test("BH-16: close() writes buffered events before the process exits", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "bh-audit-close-"));
    try {
      const run = spawnSync(
        process.execPath,
        [
          "-e",
          `const { AuditLogger } = require(${JSON.stringify(path.join(ROOT, "src", "enterprise", "audit-logging.js"))});
          (async () => {
            const logger = new AuditLogger({ logDir: "logs", encryption: false });
            await logger.logAuthentication({ _userId: "u1", method: "password", success: true });
            await logger.close();
          })().catch((e) => { console.error(e.message); process.exitCode = 1; });`,
        ],
        { cwd: dir, encoding: "utf8", timeout: 20000 },
      );
      const daily = path.join(dir, "logs", "daily");
      const lines = fs.existsSync(daily)
        ? fs
            .readdirSync(daily)
            .flatMap((f) =>
              fs
                .readFileSync(path.join(daily, f), "utf8")
                .trim()
                .split("\n")
                .filter(Boolean),
            )
        : [];
      expect({ status: run.status, events: lines.length }).toEqual({
        status: 0,
        events: 1,
      });
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
