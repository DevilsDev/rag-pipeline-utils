/**
 * Regression tests for AuditLogger tenant filtering, per-record encryption
 * and integrity hashing.
 */

const fs = require("fs");
const os = require("os");
const path = require("path");
const { AuditLogger } = require("../../../src/enterprise/audit-logging");

async function createLogger(options = {}) {
  const logDir = fs.mkdtempSync(path.join(os.tmpdir(), "audit-test-"));
  const auditLogger = new AuditLogger({
    logDir,
    realtimeEnabled: false,
    ...options,
  });
  await new Promise((resolve) =>
    auditLogger.once("audit_system_initialized", resolve),
  );
  return { auditLogger, logDir };
}

function readRecords(logDir) {
  const dailyDir = path.join(logDir, "daily");
  return fs
    .readdirSync(dailyDir)
    .flatMap((f) =>
      fs.readFileSync(path.join(dailyDir, f), "utf8").trim().split("\n"),
    )
    .map((line) => JSON.parse(line));
}

async function logLogin(auditLogger, tenantId, userId, ipAddress) {
  await auditLogger.logAuthentication({
    _action: "login",
    _tenantId: tenantId,
    _userId: userId,
    result: "success",
    ipAddress,
  });
}

describe("AuditLogger", () => {
  let auditLogger;
  let logDir;

  beforeAll(() => jest.useRealTimers());

  beforeEach(async () => {
    ({ auditLogger, logDir } = await createLogger());
    await logLogin(auditLogger, "tenant-a", "alice", "10.0.0.1");
    await logLogin(auditLogger, "tenant-b", "bob", "10.0.0.2");
    await auditLogger._flushLogs();
  });

  afterEach(() => {
    fs.rmSync(logDir, { recursive: true, force: true });
  });

  test.each([["tenantId"], ["_tenantId"]])(
    "queryLogs({ %s }) only returns that tenant's records",
    async (key) => {
      const { results } = await auditLogger.queryLogs({ [key]: "tenant-a" });

      expect(results).toHaveLength(1);
      expect(results[0].tenantId).toBe("tenant-a");
      expect(results[0].details.ipAddress).toBe("10.0.0.1");
    },
  );

  test("filters by user, action and category", async () => {
    expect((await auditLogger.queryLogs({ userId: "bob" })).total).toBe(1);
    expect((await auditLogger.queryLogs({ action: "login" })).total).toBe(2);
    expect((await auditLogger.queryLogs({ action: "logout" })).total).toBe(0);
    expect(
      (await auditLogger.queryLogs({ category: "authorization" })).total,
    ).toBe(0);
  });

  test("generateComplianceReport is scoped to the requested tenant", async () => {
    const report = await auditLogger.generateComplianceReport({
      tenantId: "tenant-b",
      standard: "SOC2",
    });

    expect(report.metadata.totalEvents).toBe(1);
  });

  test("encrypts each record with its own IV and decrypts it again", () => {
    const records = readRecords(logDir);

    expect(records).toHaveLength(2);
    for (const record of records) {
      expect(record.details.encrypted).toBe(true);
      expect(record.details.v).toBe(2);
      expect(record.details.data).not.toContain("10.0.0");
    }
    expect(records[0].details.iv).not.toBe(records[1].details.iv);
  });

  test("integrity hash covers action and tenant", async () => {
    const [record] = readRecords(logDir);
    const original = await auditLogger._calculateIntegrityHash(record);
    const tampered = await auditLogger._calculateIntegrityHash({
      ...record,
      tenantId: "tenant-z",
    });

    expect(record.integrity).toBe(original);
    expect(tampered).not.toBe(original);
  });

  test("accepts a passphrase string as the encryption key", async () => {
    const { auditLogger: keyed, logDir: keyedDir } = await createLogger({
      encryptionKey: "a passphrase that is not 32 bytes",
    });
    await logLogin(keyed, "tenant-a", "alice", "10.0.0.9");
    await keyed._flushLogs();

    const { results } = await keyed.queryLogs({ tenantId: "tenant-a" });

    expect(results[0].details.ipAddress).toBe("10.0.0.9");
    fs.rmSync(keyedDir, { recursive: true, force: true });
  });
});
