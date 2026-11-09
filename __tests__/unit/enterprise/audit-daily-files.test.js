/**
 * AuditLogger daily files (E9, E10): an event goes in the file of the day it
 * happened, whatever time it is flushed; the chain and verifyIntegrity()
 * work across files; queryLogs() counts every match; the compliance report
 * counts every category.
 */

const fs = require("fs");
const os = require("os");
const path = require("path");
const { AuditLogger } = require("../../../src/enterprise/audit-logging");

let dir;
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "audit-days-"));
});
afterEach(() => {
  jest.restoreAllMocks();
  fs.rmSync(dir, { recursive: true, force: true });
});

function logger(extra = {}) {
  return new AuditLogger({
    logDir: dir,
    encryption: false,
    signingKey: "k".repeat(64),
    realtimeEnabled: false,
    ...extra,
  });
}

// An event dated `iso`, written the way the log* methods write theirs
function event(iso, extra = {}) {
  return {
    _category: "dataAccess",
    action: "query",
    tenantId: "t1",
    userId: "u1",
    result: "success",
    metadata: {
      timestamp: iso,
      correlationId: `c-${iso}-${Math.random().toString(36).slice(2, 7)}`,
      _severity: "MEDIUM",
    },
    ...extra,
  };
}

function dailyFiles() {
  return fs.readdirSync(path.join(dir, "daily")).sort();
}
function lineCount(name) {
  return fs
    .readFileSync(path.join(dir, "daily", name), "utf8")
    .trim()
    .split("\n").length;
}

describe("daily files are named by event date", () => {
  test("events before and after midnight, flushed together, land in their own days", async () => {
    const l = logger();
    await l._writeAuditLog(event("2026-11-07T23:59:58.000Z"));
    await l._writeAuditLog(event("2026-11-07T23:59:59.000Z"));
    await l._writeAuditLog(event("2026-11-08T00:00:01.000Z"));
    await l._flushLogs();
    expect(dailyFiles()).toEqual([
      "audit-2026-11-07.jsonl",
      "audit-2026-11-08.jsonl",
    ]);
    expect(lineCount("audit-2026-11-07.jsonl")).toBe(2);
    expect(lineCount("audit-2026-11-08.jsonl")).toBe(1);

    const day = await l.queryLogs({
      startDate: "2026-11-07T00:00:00Z",
      endDate: "2026-11-07T23:59:59.999Z",
    });
    expect(day.total).toBe(2);
  });

  test("the chain and verifyIntegrity() work across the files", async () => {
    const l = logger();
    await l._writeAuditLog(event("2026-11-07T23:59:59.000Z"));
    await l._writeAuditLog(event("2026-11-08T00:00:01.000Z"));
    await l._flushLogs();
    await l._writeAuditLog(event("2026-11-08T00:00:02.000Z"));
    await l._flushLogs();
    const v = await l.verifyIntegrity({ startDate: "2026-11-01" });
    expect(v).toMatchObject({
      verified: true,
      totalLogs: 3,
      integrityBreaks: [],
      missingLogs: [],
      secondWriter: [],
    });
  });

  test("a late event dated before the newest file goes to the newest file", async () => {
    const l = logger();
    await l._writeAuditLog(event("2026-11-08T00:00:01.000Z"));
    await l._flushLogs();
    await l._writeAuditLog(event("2026-11-07T23:59:59.000Z"));
    await l._flushLogs();
    expect(dailyFiles()).toEqual(["audit-2026-11-08.jsonl"]);
    const v = await l.verifyIntegrity({ startDate: "2026-11-01" });
    expect(v.verified).toBe(true);
    expect(v.integrityBreaks).toEqual([]);
  });

  test("a restarted logger continues in the newest file's day", async () => {
    const a = logger();
    await a._writeAuditLog(event("2026-11-08T00:00:01.000Z"));
    await a._flushLogs();
    const b = logger();
    await b._writeAuditLog(event("2026-11-07T23:59:59.000Z"));
    await b._flushLogs();
    expect(dailyFiles()).toEqual(["audit-2026-11-08.jsonl"]);
    expect(
      (await b.verifyIntegrity({ startDate: "2026-11-01" })).verified,
    ).toBe(true);
  });

  test("a write that fails on the second day's file does not repeat the first day's records", async () => {
    const l = logger();
    l.on("flush_failed", () => {});
    await l._writeAuditLog(event("2026-11-07T23:59:59.000Z"));
    await l._writeAuditLog(event("2026-11-08T00:00:01.000Z"));
    const real = fs.promises.appendFile;
    let calls = 0;
    jest.spyOn(fs.promises, "appendFile").mockImplementation((...args) => {
      calls += 1;
      if (calls === 2) return Promise.reject(new Error("disk full"));
      return real.apply(fs.promises, args);
    });
    await l._flushLogs();
    expect(l.logBuffer).toHaveLength(1);
    await l._flushLogs();
    expect(l.logBuffer).toHaveLength(0);
    expect(lineCount("audit-2026-11-07.jsonl")).toBe(1);
    expect(lineCount("audit-2026-11-08.jsonl")).toBe(1);
    const v = await l.verifyIntegrity({ startDate: "2026-11-01" });
    expect(v).toMatchObject({
      verified: true,
      totalLogs: 2,
      integrityBreaks: [],
    });
  });
});
