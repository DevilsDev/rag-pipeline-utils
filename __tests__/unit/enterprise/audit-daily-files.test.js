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
describe("queryLogs totals", () => {
  async function filled(n) {
    const l = logger();
    for (let i = 0; i < n; i++) {
      await l._writeAuditLog(event(new Date().toISOString()));
    }
    await l._flushLogs();
    return l;
  }

  test("total counts every match and hasMore is true when more remain", async () => {
    const l = await filled(8);
    const q = await l.queryLogs({ tenantId: "t1", limit: 2 });
    expect(q.results).toHaveLength(2);
    expect(q.total).toBe(8);
    expect(q.hasMore).toBe(true);
  });

  test("offset pages through the matches and the last page has no more", async () => {
    const l = await filled(5);
    const page = await l.queryLogs({ tenantId: "t1", limit: 2, offset: 4 });
    expect(page.results).toHaveLength(1);
    expect(page.total).toBe(5);
    expect(page.hasMore).toBe(false);
  });
});

describe("compliance report", () => {
  test("every category is counted, with no NaN", async () => {
    const l = logger();
    const now = new Date().toISOString();
    for (const _category of [
      "authentication",
      "authorization",
      "dataAccess",
      "dataModification",
      "systemChanges",
      "apiAccess",
      "complianceEvents",
    ]) {
      await l._writeAuditLog(event(now, { _category }));
    }
    await l._flushLogs();
    const report = await l.generateComplianceReport({
      standard: "SOC2",
      tenantId: "t1",
      includeEvidence: true,
    });
    for (const value of Object.values(report.summary)) {
      expect(Number.isNaN(value)).toBe(false);
    }
    expect(report.summary).toMatchObject({
      authenticationEvents: 1,
      authorizationEvents: 1,
      dataAccessEvents: 1,
      dataModificationEvents: 1,
      systemChangeEvents: 1,
      apiAccessEvents: 1,
      complianceEvents: 1,
    });
  });

  test("evidence entries carry the event's correlation id", async () => {
    const l = logger();
    const e = event(new Date().toISOString(), { _category: "authentication" });
    await l._writeAuditLog(e);
    await l._flushLogs();
    const report = await l.generateComplianceReport({
      standard: "SOC2",
      tenantId: "t1",
      includeEvidence: true,
    });
    expect(report.evidence).toHaveLength(1);
    expect(report.evidence[0].logId).toBe(e.metadata.correlationId);
    expect(report.evidence[0].evidence).toBe(e.metadata.correlationId);
  });
});
