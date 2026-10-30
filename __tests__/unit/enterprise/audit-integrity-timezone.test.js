"use strict";

/**
 * Daily audit files are named by their UTC date. Finding the files in a date
 * range used to walk day by day in local time, which skipped days in
 * timezones ahead of UTC once daylight saving began, so verifyIntegrity()
 * checked no logs and still reported verified: true. These run in a child
 * process so the timezone can be set; CI runs in UTC, where the bug never
 * showed.
 */

const { spawnSync } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");

const auditLoggingPath = path.resolve(
  __dirname,
  "../../../src/enterprise/audit-logging.js",
);

let tmpDir;
beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "audit-tz-"));
});
afterEach(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

function runInTimezone(timeZone, script) {
  const result = spawnSync(process.execPath, ["-e", script], {
    encoding: "utf8",
    env: { ...process.env, TZ: timeZone },
  });
  const line = result.stdout.trim().split("\n").pop();
  if (result.status !== 0 || !line) {
    throw new Error(`child failed: ${result.stderr}`);
  }
  return JSON.parse(line);
}

const setup = (logDir) => `
const { AuditLogger } = require(${JSON.stringify(auditLoggingPath)});
const logger = new AuditLogger({ logDir: ${JSON.stringify(logDir)}, encryptionKey: "k".repeat(64) });
const ready = new Promise((resolve) => logger.once("audit_system_initialized", resolve));
`;

describe("AuditLogger log files by UTC date, in a timezone ahead of UTC", () => {
  test("a range across the start of daylight saving includes its last day", () => {
    const daily = path.join(tmpDir, "daily");
    fs.mkdirSync(daily, { recursive: true });
    for (const day of ["2026-07-01", "2026-10-30", "2026-11-05"]) {
      fs.writeFileSync(path.join(daily, `audit-${day}.jsonl`), "");
    }
    // New Zealand switches to daylight saving on 27 September 2026.
    const files = runInTimezone(
      "Pacific/Auckland",
      setup(tmpDir) +
        `logger._getLogFilesInRange(new Date("2026-07-01T00:00:00Z"), new Date("2026-10-30T12:00:00Z"))
          .then((f) => { console.log(JSON.stringify(f.map((p) => require("path").basename(p)))); process.exit(0); });`,
    );
    expect(files).toEqual(["audit-2026-07-01.jsonl", "audit-2026-10-30.jsonl"]);
  });

  test("verifyIntegrity() and queryLogs() see the logs just written", () => {
    const result = runInTimezone(
      "Pacific/Auckland",
      setup(tmpDir) +
        `(async () => {
          await ready;
          await logger.logAuthentication({ userId: "u1", method: "password", success: true });
          await logger.logAuthentication({ userId: "u2", method: "password", success: false });
          await logger._flushLogs();
          const v = await logger.verifyIntegrity();
          const q = await logger.queryLogs({});
          console.log(JSON.stringify({ totalLogs: v.totalLogs, verified: v.verified, found: q.total }));
          process.exit(0);
        })();`,
    );
    expect(result).toEqual({ totalLogs: 2, verified: true, found: 2 });
  });

  test("a log directory without daily files is an empty range", async () => {
    const { AuditLogger } = require(auditLoggingPath);
    const logger = new AuditLogger({
      logDir: path.join(tmpDir, "missing"),
      encryptionKey: "k".repeat(64),
    });
    await expect(
      logger._getLogFilesInRange(new Date(0), new Date()),
    ).resolves.toEqual([]);
  });
});
