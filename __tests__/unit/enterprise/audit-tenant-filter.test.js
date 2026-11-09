/**
 * Tenant filtering in AuditLogger.queryLogs() and generateComplianceReport():
 * a tenantId that is present but null, undefined or not a string is an error
 * (it used to match every tenant), and the underscore form is only read when
 * `tenantId` itself is absent.
 */

const fs = require("fs");
const os = require("os");
const path = require("path");

const auditLoggingPath = path.resolve(
  __dirname,
  "../../../src/enterprise/audit-logging.js",
);

const WARNING_CODE = "RAG_DEP_AUDIT_REPORT_NO_TENANT";

let dir;
let logger;

beforeAll(() => jest.useRealTimers());

beforeEach(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "audit-tenant-"));
  const { AuditLogger } = require(auditLoggingPath);
  logger = new AuditLogger({
    logDir: dir,
    realtimeEnabled: false,
    encryptionKey: "k".repeat(32),
    signingKey: "tenant filter test key",
  });
  await new Promise((r) => logger.once("audit_system_initialized", r));
  for (const [tenant, user] of [
    ["tenant-a", "alice"],
    ["tenant-a", "amy"],
    ["tenant-b", "bob"],
  ]) {
    await logger.logAuthentication({
      _action: "login",
      _tenantId: tenant,
      _userId: user,
      result: "success",
    });
  }
  await logger._flushLogs();
});

afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
  jest.restoreAllMocks();
});

const warningsFor = (spy) =>
  spy.mock.calls.filter(
    (c) => c[1] && typeof c[1] === "object" && c[1].code === WARNING_CODE,
  );

describe("queryLogs() tenant filter", () => {
  test.each([
    ["null", null],
    ["undefined", undefined],
    ["a number", 42],
    ["an object", { $ne: "x" }],
    ["an array", ["tenant-a"]],
  ])("rejects tenantId that is %s", async (_label, value) => {
    await expect(logger.queryLogs({ tenantId: value })).rejects.toThrow(
      TypeError,
    );
    await expect(logger.queryLogs({ tenantId: value })).rejects.toThrow(
      /tenantId/,
    );
  });

  test.each([
    ["null", null],
    ["undefined", undefined],
    ["a number", 42],
  ])("rejects _tenantId that is %s", async (_label, value) => {
    await expect(logger.queryLogs({ _tenantId: value })).rejects.toThrow(
      TypeError,
    );
  });

  test("does not read _tenantId when tenantId is present", async () => {
    await expect(
      logger.queryLogs({ tenantId: undefined, _tenantId: "tenant-b" }),
    ).rejects.toThrow(TypeError);
    const { results } = await logger.queryLogs({
      tenantId: "tenant-a",
      _tenantId: "tenant-b",
    });
    expect(results.map((r) => r.tenantId)).toEqual(["tenant-a", "tenant-a"]);
  });

  test("still filters by a string tenantId or _tenantId, and allows no tenant key", async () => {
    expect((await logger.queryLogs({ tenantId: "tenant-b" })).total).toBe(1);
    expect((await logger.queryLogs({ _tenantId: "tenant-a" })).total).toBe(2);
    expect((await logger.queryLogs({ tenantId: "nobody" })).total).toBe(0);
    expect((await logger.queryLogs({})).total).toBe(3);
  });

  test("_matchesQuery() applies the same rules", () => {
    const log = {
      tenantId: "tenant-a",
      metadata: { timestamp: new Date().toISOString() },
    };
    expect(() => logger._matchesQuery(log, { tenantId: null })).toThrow(
      TypeError,
    );
    expect(() =>
      logger._matchesQuery(log, { tenantId: undefined, _tenantId: "tenant-a" }),
    ).toThrow(TypeError);
    expect(logger._matchesQuery(log, { tenantId: "tenant-b" })).toBe(false);
    expect(logger._matchesQuery(log, { _tenantId: "tenant-a" })).toBe(true);
  });
});

describe("generateComplianceReport() tenant scope", () => {
  test.each([
    ["null", null],
    ["undefined", undefined],
    ["a number", 7],
  ])("rejects tenantId that is %s", async (_label, value) => {
    await expect(
      logger.generateComplianceReport({ standard: "SOC2", tenantId: value }),
    ).rejects.toThrow(TypeError);
  });

  test("a report for one tenant covers only that tenant and does not warn", async () => {
    const emit = jest.spyOn(process, "emitWarning");
    const report = await logger.generateComplianceReport({
      standard: "SOC2",
      tenantId: "tenant-a",
    });
    expect(report.metadata.totalEvents).toBe(2);
    expect(warningsFor(emit)).toHaveLength(0);
  });

  test("a report that names no tenant still covers all tenants and warns once", async () => {
    const emit = jest
      .spyOn(process, "emitWarning")
      .mockImplementation(() => {});
    const first = await logger.generateComplianceReport({ standard: "SOC2" });
    const second = await logger.generateComplianceReport({ standard: "SOC2" });

    expect(first.metadata.totalEvents).toBe(3);
    expect(second.metadata.totalEvents).toBe(3);
    const warnings = warningsFor(emit);
    expect(warnings).toHaveLength(1);
    expect(warnings[0][1].type).toBe("DeprecationWarning");
    expect(String(warnings[0][0])).toMatch(/allTenants/);
  });

  test("allTenants: true covers all tenants without a warning", async () => {
    const emit = jest.spyOn(process, "emitWarning");
    const report = await logger.generateComplianceReport({
      standard: "SOC2",
      allTenants: true,
    });
    expect(report.metadata.totalEvents).toBe(3);
    expect(warningsFor(emit)).toHaveLength(0);
  });

  test("allTenants: true together with a tenantId is an error", async () => {
    await expect(
      logger.generateComplianceReport({
        standard: "SOC2",
        allTenants: true,
        tenantId: "tenant-a",
      }),
    ).rejects.toThrow(/allTenants/);
    await expect(
      logger.generateComplianceReport({
        standard: "SOC2",
        allTenants: true,
        _tenantId: "tenant-a",
      }),
    ).rejects.toThrow(/allTenants/);
  });

  test("the underscore tenant key is still accepted when tenantId is absent", async () => {
    const report = await logger.generateComplianceReport({
      standard: "SOC2",
      _tenantId: "tenant-b",
    });
    expect(report.metadata.totalEvents).toBe(1);
  });
});

describe("verifyIntegrity() tenant filter", () => {
  test.each([
    ["null", null],
    ["undefined", undefined],
    ["a number", 42],
    ["an object", { $ne: "x" }],
    ["an array", ["tenant-a"]],
  ])("rejects tenantId that is %s", async (_label, value) => {
    await expect(logger.verifyIntegrity({ tenantId: value })).rejects.toThrow(
      TypeError,
    );
    await expect(logger.verifyIntegrity({ tenantId: value })).rejects.toThrow(
      /tenantId must be a string/,
    );
  });

  test.each([
    ["null", null],
    ["undefined", undefined],
  ])("rejects _tenantId that is %s", async (_label, value) => {
    await expect(logger.verifyIntegrity({ _tenantId: value })).rejects.toThrow(
      /_tenantId must be a string/,
    );
  });

  test("does not read _tenantId when tenantId is present", async () => {
    await expect(
      logger.verifyIntegrity({ tenantId: undefined, _tenantId: "tenant-b" }),
    ).rejects.toThrow(TypeError);
    const result = await logger.verifyIntegrity({
      tenantId: "tenant-a",
      _tenantId: "tenant-b",
    });
    expect(result.totalLogs).toBe(2);
  });

  test("a string tenantId scopes the count and no tenant key covers all", async () => {
    expect(
      (await logger.verifyIntegrity({ tenantId: "tenant-b" })).totalLogs,
    ).toBe(1);
    expect((await logger.verifyIntegrity({})).totalLogs).toBe(3);
    expect((await logger.verifyIntegrity()).totalLogs).toBe(3);
  });
});
