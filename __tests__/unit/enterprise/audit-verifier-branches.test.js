/**
 * verifyIntegrity() branch coverage: the signed flag inside the integrity
 * hash, a second writer at the end of the log, tenant scoping, a damaged or
 * foreign chain file, and records that are malformed in ways the other
 * suites do not reach.
 */

const fs = require("fs");
const os = require("os");
const path = require("path");

const auditLoggingPath = path.resolve(
  __dirname,
  "../../../src/enterprise/audit-logging.js",
);

const SIGNING_KEY = "signing key for the verifier tests";
const ENCRYPTION_KEY = "k".repeat(32);
const DAY = 24 * 60 * 60 * 1000;

let dirs;

beforeAll(() => jest.useRealTimers());

beforeEach(() => {
  dirs = [];
  delete process.env.RAG_AUDIT_SIGNING_KEY;
});

afterEach(() => {
  for (const dir of dirs) fs.rmSync(dir, { recursive: true, force: true });
  jest.restoreAllMocks();
});

function tmpDir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "audit-verifier-"));
  dirs.push(dir);
  return dir;
}

async function makeLogger(logDir, options = {}) {
  const { AuditLogger } = require(auditLoggingPath);
  const logger = new AuditLogger({
    logDir,
    realtimeEnabled: false,
    encryptionKey: ENCRYPTION_KEY,
    signingKey: SIGNING_KEY,
    ...options,
  });
  await new Promise((resolve) =>
    logger.once("audit_system_initialized", resolve),
  );
  return logger;
}

let counter = 0;
async function writeRecords(logger, count, tenantId = "tenant-a") {
  for (let i = 0; i < count; i++) {
    counter += 1;
    await logger.logAuthentication({
      _action: "login",
      _tenantId: tenantId,
      _userId: `user-${counter}`,
      result: "success",
    });
  }
  await logger._flushLogs();
}

const dailyDir = (dir) => path.join(dir, "daily");
function dailyFile(dir) {
  const names = fs.readdirSync(dailyDir(dir)).sort();
  return path.join(dailyDir(dir), names[names.length - 1]);
}
const readLines = (file) =>
  fs.readFileSync(file, "utf8").split("\n").filter(Boolean);
const writeLines = (file, lines) =>
  fs.writeFileSync(file, lines.join("\n") + "\n");
const chainPath = (dir) => path.join(dir, "integrity", "chain.json");
const readChain = (dir) => JSON.parse(fs.readFileSync(chainPath(dir), "utf8"));
const writeChain = (dir, chain) =>
  fs.writeFileSync(chainPath(dir), JSON.stringify(chain, null, 2));
const reasons = (result) => result.integrityBreaks.map((b) => b.reason);
const tamperReasons = (result) => result.tamperedLogs.flatMap((t) => t.reasons);

function rewrite(dir, index, change) {
  const file = dailyFile(dir);
  const lines = readLines(file);
  const record = JSON.parse(lines[index]);
  change(record);
  lines[index] = JSON.stringify(record);
  writeLines(file, lines);
}

// Change a record and give it a valid hash and signature again, as someone
// holding the key could.
async function reseal(logger, record) {
  const signed = Object.prototype.hasOwnProperty.call(record, "signature");
  delete record.signature;
  record.integrity = await logger._calculateIntegrityHash(record);
  if (signed) record.signature = await logger._signAuditEvent(record);
  return record;
}

describe("the signed flag", () => {
  test("a signed record whose signature was removed is tampered", async () => {
    const dir = tmpDir();
    const logger = await makeLogger(dir);
    await writeRecords(logger, 3);
    rewrite(dir, 1, (r) => {
      expect(r.signed).toBe(true);
      delete r.signature;
    });

    const result = await logger.verifyIntegrity();
    expect(result.verified).toBe(false);
    expect(result.tamperedLogs).toEqual([
      expect.objectContaining({ sequence: 2, reason: "missing_signature" }),
    ]);
    expect(result.verifiedLogs).toBe(2);
  });

  test("a signed record whose signature was removed is tampered even when signing is now off", async () => {
    const dir = tmpDir();
    const writer = await makeLogger(dir);
    await writeRecords(writer, 3);
    rewrite(dir, 1, (r) => delete r.signature);

    const result = await (
      await makeLogger(dir, { digitalSigning: false })
    ).verifyIntegrity();
    expect(result.verified).toBe(false);
    expect(tamperReasons(result)).toEqual(["missing_signature"]);
  });

  test("an unsigned record is not flagged when signing is on later", async () => {
    const dir = tmpDir();
    const unsigned = await makeLogger(dir, { digitalSigning: false });
    await writeRecords(unsigned, 3);
    const records = readLines(dailyFile(dir)).map((l) => JSON.parse(l));
    expect(records.every((r) => r.signed === false)).toBe(true);
    expect(records.some((r) => "signature" in r)).toBe(false);

    const signing = await makeLogger(dir);
    const result = await signing.verifyIntegrity();
    expect(result).toMatchObject({
      verified: true,
      totalLogs: 3,
      verifiedLogs: 3,
      tamperedLogs: [],
      integrityBreaks: [],
    });

    // New signed records continue the same chain.
    await writeRecords(signing, 2);
    const mixed = await signing.verifyIntegrity();
    expect(mixed.verified).toBe(true);
    expect(mixed.verifiedLogs).toBe(5);
  });

  test("flipping the flag to false on a signed record is detected", async () => {
    const dir = tmpDir();
    const logger = await makeLogger(dir);
    await writeRecords(logger, 3);
    rewrite(dir, 1, (r) => {
      r.signed = false;
      delete r.signature;
    });

    const result = await logger.verifyIntegrity();
    expect(result.verified).toBe(false);
    expect(reasons(result)).toContain("edited");
    expect(tamperReasons(result)).toContain("edited");
  });

  test("flipping the flag to true on an unsigned record is detected", async () => {
    const dir = tmpDir();
    const logger = await makeLogger(dir, { digitalSigning: false });
    await writeRecords(logger, 2);
    rewrite(dir, 0, (r) => (r.signed = true));

    const result = await logger.verifyIntegrity();
    expect(result.verified).toBe(false);
    expect(tamperReasons(result)).toEqual(
      expect.arrayContaining(["edited", "missing_signature"]),
    );
  });

  test("records from before the flag still need a signature when signing is on", async () => {
    const dir = tmpDir();
    const logger = await makeLogger(dir);
    fs.mkdirSync(dailyDir(dir), { recursive: true });
    const old = {
      _category: "authentication",
      action: "login",
      tenantId: "tenant-a",
      userId: "old",
      result: "success",
      metadata: { timestamp: new Date().toISOString(), correlationId: "old" },
      sequence: 1,
      integrityVersion: 2,
    };
    old.integrity = await logger._calculateIntegrityHash(old);
    const day = new Date().toISOString().slice(0, 10);
    writeLines(path.join(dailyDir(dir), `audit-${day}.jsonl`), [
      JSON.stringify(old),
    ]);

    const on = await logger.verifyIntegrity();
    expect(tamperReasons(on)).toEqual(["missing_signature"]);
    expect(on.unchained.count).toBe(1);

    const off = await (
      await makeLogger(dir, { digitalSigning: false })
    ).verifyIntegrity();
    expect(off.tamperedLogs).toEqual([]);
    expect(off.verified).toBe(true);
  });

  test("a signature that is not a string, or has the wrong length, is invalid", async () => {
    const dir = tmpDir();
    const logger = await makeLogger(dir);
    await writeRecords(logger, 3);
    rewrite(dir, 0, (r) => (r.signature = 12345));
    rewrite(dir, 1, (r) => (r.signature = "abc"));

    const result = await logger.verifyIntegrity();
    expect(result.verified).toBe(false);
    expect(tamperReasons(result)).toEqual([
      "invalid_signature",
      "invalid_signature",
    ]);
    expect(result.verifiedLogs).toBe(1);
  });
});

describe("a second writer at the end of the log", () => {
  // `a` writes 1-3, `b` then writes its own 4 (the chain file now ends at b's
  // record), and `a` carries on from 3.
  async function fork(dir) {
    const a = await makeLogger(dir);
    await writeRecords(a, 3);
    const b = await makeLogger(dir);
    await writeRecords(b, 1);
    return { a, b, chainAtB: readChain(dir) };
  }

  test("a chain file that ends at the other writer's record is a second writer", async () => {
    const dir = tmpDir();
    const { a, chainAtB } = await fork(dir);
    await writeRecords(a, 2);
    writeChain(dir, chainAtB);

    const result = await a.verifyIntegrity();
    expect(result.verified).toBe(false);
    expect(reasons(result)).not.toContain("tail");
    expect(result.integrityBreaks).toEqual([]);
    expect(result.tamperedLogs).toEqual([]);
    expect(result.secondWriter).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ sequence: 5, reason: "interleaved" }),
      ]),
    );
  });

  test("the last record already reported as a second writer is not reported twice", async () => {
    const dir = tmpDir();
    const { a, chainAtB } = await fork(dir);
    await writeRecords(a, 1);
    writeChain(dir, chainAtB);

    const result = await a.verifyIntegrity();
    expect(reasons(result)).not.toContain("tail");
    const atLast = result.secondWriter.filter(
      (s) => s.line === readLines(dailyFile(dir)).length,
    );
    expect(atLast).toHaveLength(1);
  });

  test("with an edited record in the runs it is a tail break, not a second writer", async () => {
    const dir = tmpDir();
    const { a, chainAtB } = await fork(dir);
    await writeRecords(a, 2);
    writeChain(dir, chainAtB);
    rewrite(dir, 1, (r) => (r.userId = "someone-else"));

    const result = await a.verifyIntegrity();
    expect(result.verified).toBe(false);
    expect(result.secondWriter).toEqual([]);
    expect(reasons(result)).toEqual(expect.arrayContaining(["edited", "tail"]));
  });

  test("with a signature removed from a record it is a tail break", async () => {
    const dir = tmpDir();
    const { a, chainAtB } = await fork(dir);
    await writeRecords(a, 2);
    writeChain(dir, chainAtB);
    rewrite(dir, 0, (r) => delete r.signature);

    const result = await a.verifyIntegrity();
    expect(result.secondWriter).toEqual([]);
    expect(reasons(result)).toContain("tail");
    expect(tamperReasons(result)).toContain("missing_signature");
  });

  test("a chain file that ends at a record that is not in the log is a tail break", async () => {
    const dir = tmpDir();
    const { a } = await fork(dir);
    await writeRecords(a, 1);
    const file = dailyFile(dir);
    // The last record is deleted; the chain file still ends at it.
    writeLines(file, readLines(file).slice(0, -1));

    const result = await a.verifyIntegrity();
    expect(result.verified).toBe(false);
    expect(reasons(result)).toContain("tail");
    expect(
      result.secondWriter.filter((s) => s.reason === "interleaved"),
    ).toEqual([]);
  });

  test("a chain file whose sequence does not match the record it ends at is a tail break", async () => {
    const dir = tmpDir();
    const { a, chainAtB } = await fork(dir);
    await writeRecords(a, 2);
    const chain = { ...chainAtB, sequence: 99 };
    chain.stateTag = a._stateTag(chain.chainId, 99, chain.lastHash);
    writeChain(dir, chain);

    const result = await a.verifyIntegrity();
    expect(reasons(result)).toContain("tail");
  });

  test("a run whose sequences jump is not attributed to a second writer", async () => {
    const dir = tmpDir();
    const a = await makeLogger(dir);
    await writeRecords(a, 3);
    const b = await makeLogger(dir);
    await writeRecords(b, 1);
    b._chainState.sequence += 3;
    await writeRecords(b, 1);
    await writeRecords(a, 1);

    const result = await a.verifyIntegrity();
    expect(result.verified).toBe(false);
    expect(result.secondWriter).toEqual([]);
    expect(result.missingLogs.length).toBeGreaterThan(0);
  });

  test("a fork that does not continue from its parent's sequence is not a second writer", async () => {
    const dir = tmpDir();
    const a = await makeLogger(dir);
    await writeRecords(a, 3);
    const b = await makeLogger(dir);
    await writeRecords(b, 1);
    a._chainState.sequence += 2;
    await writeRecords(a, 1);

    const result = await a.verifyIntegrity();
    expect(result.verified).toBe(false);
    expect(result.secondWriter).toEqual([]);
    expect(reasons(result)).toContain("chain");
    expect(result.missingLogs.length).toBeGreaterThan(0);
  });
});

describe("tenant scope and date range", () => {
  async function twoTenants(dir) {
    const logger = await makeLogger(dir);
    await writeRecords(logger, 2, "tenant-a");
    await writeRecords(logger, 2, "tenant-b");
    return logger;
  }

  test("counts only the named tenant", async () => {
    const dir = tmpDir();
    const logger = await twoTenants(dir);
    const result = await logger.verifyIntegrity({ tenantId: "tenant-b" });
    expect(result).toMatchObject({
      verified: true,
      totalLogs: 2,
      verifiedLogs: 2,
    });
    expect((await logger.verifyIntegrity()).totalLogs).toBe(4);
  });

  test("does not list tampering with another tenant's record, but the break stays", async () => {
    const dir = tmpDir();
    const logger = await twoTenants(dir);
    rewrite(dir, 3, (r) => (r.userId = "someone-else"));

    const result = await logger.verifyIntegrity({ tenantId: "tenant-a" });
    expect(result.tamperedLogs).toEqual([]);
    expect(result.totalLogs).toBe(2);
    expect(result.verified).toBe(false);
    expect(reasons(result)).toContain("edited");
  });

  test("reads the underscore form when tenantId is absent", async () => {
    const dir = tmpDir();
    const logger = await twoTenants(dir);
    const result = await logger.verifyIntegrity({ _tenantId: "tenant-a" });
    expect(result.totalLogs).toBe(2);
  });

  test("an empty string names a tenant that has no records", async () => {
    const dir = tmpDir();
    const logger = await twoTenants(dir);
    expect((await logger.verifyIntegrity({ tenantId: "" })).totalLogs).toBe(0);
  });

  test("a range that contains the logs checks them", async () => {
    const dir = tmpDir();
    const logger = await twoTenants(dir);
    const result = await logger.verifyIntegrity({
      startDate: new Date(Date.now() - DAY).toISOString(),
      endDate: new Date(Date.now() + DAY).toISOString(),
    });
    expect(result.totalLogs).toBe(4);
    expect(result.verified).toBe(true);
  });

  test("a range after the logs checks nothing and skips the tail check", async () => {
    const dir = tmpDir();
    const logger = await twoTenants(dir);
    const result = await logger.verifyIntegrity({
      startDate: new Date(Date.now() + 2 * DAY).toISOString(),
    });
    expect(result).toMatchObject({ verified: true, totalLogs: 0 });
  });

  test("a range before the logs checks nothing", async () => {
    const dir = tmpDir();
    const logger = await twoTenants(dir);
    const result = await logger.verifyIntegrity({
      endDate: new Date(Date.now() - 2 * DAY).toISOString(),
    });
    expect(result).toMatchObject({ verified: true, totalLogs: 0 });
  });

  test("a reset outside the checked range is not reported", async () => {
    const dir = tmpDir();
    const logger = await makeLogger(dir);
    await writeRecords(logger, 2);
    fs.rmSync(chainPath(dir));
    const resumed = await makeLogger(dir);
    await writeRecords(resumed, 1);

    expect(reasons(await resumed.verifyIntegrity())).toContain(
      "chain file reset",
    );
    const later = await resumed.verifyIntegrity({
      startDate: new Date(Date.now() + 2 * DAY).toISOString(),
    });
    expect(later.verified).toBe(true);
  });
});

describe("a chain file that is damaged or foreign", () => {
  async function written(options) {
    const dir = tmpDir();
    const logger = await makeLogger(dir, options);
    await writeRecords(logger, 3);
    return { dir, logger };
  }

  test.each([
    ["is not JSON", "{ not json"],
    ["is JSON null", "null"],
    ["is a version-2 file", JSON.stringify({ lastHash: "a", sequence: 3 })],
    ["has the wrong shape", JSON.stringify({ version: 3, sequence: "3" })],
  ])("a chain file that %s is reported as forged", async (_label, text) => {
    const { dir, logger } = await written();
    fs.writeFileSync(chainPath(dir), text);
    const result = await logger.verifyIntegrity();
    expect(result.verified).toBe(false);
    expect(reasons(result)).toContain("chain file forged");
  });

  test("a chain file with a wrong state tag is reported as forged", async () => {
    const { dir, logger } = await written();
    writeChain(dir, { ...readChain(dir), stateTag: "0".repeat(64) });
    expect(reasons(await logger.verifyIntegrity())).toContain(
      "chain file forged",
    );
  });

  test("a chain file written with another key is forged when this key has records", async () => {
    const { dir } = await written();
    const other = await written({ signingKey: "another key" });
    writeChain(other.dir, readChain(dir));
    // Same ids, other key: the state tag does not verify under the other key.
    const result = await other.logger.verifyIntegrity();
    expect(result.verified).toBe(false);
    expect(reasons(result)).toContain("chain file forged");
  });

  test("a chain file written with another key is not a break when no record is ours", async () => {
    const { dir } = await written();
    const result = await (
      await makeLogger(dir, { signingKey: "another key" })
    ).verifyIntegrity();
    expect(result.otherKey.count).toBe(3);
    expect(reasons(result)).toEqual([]);
  });

  test("a chain file that cannot be read at all is an error, not a verdict", async () => {
    const { dir, logger } = await written();
    fs.rmSync(chainPath(dir));
    fs.mkdirSync(chainPath(dir));
    await expect(logger.verifyIntegrity()).rejects.toMatchObject({
      code: "EISDIR",
    });
  });

  test("a missing resets list is the same as none", async () => {
    const { dir, logger } = await written();
    const chain = readChain(dir);
    delete chain.resets;
    writeChain(dir, chain);
    expect((await logger.verifyIntegrity()).verified).toBe(true);
  });

  test("reset entries that are malformed are skipped or reported without crashing", async () => {
    const { dir, logger } = await written();
    writeChain(dir, {
      ...readChain(dir),
      resets: [null, "text", { at: "not a date" }],
    });
    const result = await logger.verifyIntegrity();
    expect(result.verified).toBe(false);
    expect(result.integrityBreaks).toEqual([
      expect.objectContaining({ reason: "chain file reset", sequence: null }),
    ]);
  });

  test("a log directory that cannot be listed is an error", async () => {
    const { dir, logger } = await written();
    fs.rmSync(dailyDir(dir), { recursive: true });
    fs.writeFileSync(dailyDir(dir), "not a directory");
    await expect(logger.verifyIntegrity()).rejects.toThrow();
  });
});

describe("the log and the chain file disagree about what exists", () => {
  test("an empty log directory verifies", async () => {
    const logger = await makeLogger(tmpDir());
    expect(await logger.verifyIntegrity()).toMatchObject({
      verified: true,
      totalLogs: 0,
    });
  });

  test("a log emptied while the chain file still has records is a tail break", async () => {
    const dir = tmpDir();
    const logger = await makeLogger(dir);
    await writeRecords(logger, 3);
    fs.writeFileSync(dailyFile(dir), "");

    const result = await logger.verifyIntegrity();
    expect(result.verified).toBe(false);
    expect(result.integrityBreaks).toEqual([
      expect.objectContaining({ reason: "tail", sequence: 3, line: null }),
    ]);
  });

  test("a chain file for an empty chain matches an empty log", async () => {
    const dir = tmpDir();
    const logger = await makeLogger(dir);
    await writeRecords(logger, 1);
    fs.writeFileSync(dailyFile(dir), "");
    const chain = readChain(dir);
    chain.sequence = 0;
    chain.lastHash = logger._genesisLink(chain.chainId);
    chain.stateTag = logger._stateTag(chain.chainId, 0, chain.lastHash);
    writeChain(dir, chain);

    expect((await logger.verifyIntegrity()).verified).toBe(true);
  });

  test("breaks in the files come before breaks about the chain file", async () => {
    const dir = tmpDir();
    const logger = await makeLogger(dir);
    await writeRecords(logger, 5);
    const file = dailyFile(dir);
    const lines = readLines(file);
    lines.splice(2, 1);
    writeLines(file, lines);
    fs.rmSync(chainPath(dir));

    const result = await logger.verifyIntegrity();
    expect(result.integrityBreaks.map((b) => b.reason)).toEqual([
      "chain",
      "chain file missing",
    ]);
  });
});

describe("records that are malformed", () => {
  test("a record without a sequence is edited, whether or not its hash was redone", async () => {
    const dir = tmpDir();
    const logger = await makeLogger(dir);
    await writeRecords(logger, 4);
    rewrite(dir, 1, (r) => delete r.sequence);
    const file = dailyFile(dir);
    const lines = readLines(file);
    const resealed = JSON.parse(lines[2]);
    delete resealed.sequence;
    lines[2] = JSON.stringify(await reseal(logger, resealed));
    writeLines(file, lines);

    const result = await logger.verifyIntegrity();
    expect(result.verified).toBe(false);
    const edited = result.integrityBreaks.filter((b) => b.reason === "edited");
    expect(edited.map((b) => b.line)).toEqual([2, 3]);
    expect(edited.every((b) => b.sequence === null)).toBe(true);
  });

  test("a record without its link or its hash does not crash the check", async () => {
    const dir = tmpDir();
    const logger = await makeLogger(dir);
    await writeRecords(logger, 4);
    rewrite(dir, 1, (r) => delete r.chainPrev);
    rewrite(dir, 2, (r) => delete r.integrity);

    const result = await logger.verifyIntegrity();
    expect(result.verified).toBe(false);
    expect(reasons(result)).toEqual(
      expect.arrayContaining(["edited", "chain"]),
    );
  });

  test("an unchained record after chained ones is out of place", async () => {
    const dir = tmpDir();
    const logger = await makeLogger(dir);
    await writeRecords(logger, 2);
    const old = {
      _category: "authentication",
      action: "login",
      tenantId: "tenant-a",
      userId: "old",
      result: "success",
      metadata: { timestamp: new Date().toISOString(), correlationId: "old" },
      sequence: 7,
      integrityVersion: 2,
    };
    old.integrity = await logger._calculateIntegrityHash(old);
    old.signature = await logger._signAuditEvent(old);
    fs.appendFileSync(dailyFile(dir), JSON.stringify(old) + "\n");

    const result = await logger.verifyIntegrity();
    expect(result.verified).toBe(false);
    expect(result.integrityBreaks).toEqual([
      expect.objectContaining({ reason: "chain", sequence: 7, line: 3 }),
    ]);
    expect(result.unchained.count).toBe(0);
  });

  test("records of another key are counted in ranges, ignoring odd sequences", async () => {
    const dir = tmpDir();
    const writer = await makeLogger(dir);
    await writeRecords(writer, 5);
    const file = dailyFile(dir);
    const [l1, l2, , l4, l5] = readLines(file);
    const odd = JSON.parse(l5);
    odd.sequence = "five";
    // 1, 1 again, 2, a gap, 4, 5 and one record whose sequence isn't a number
    writeLines(file, [l1, l1, l2, l4, l5, JSON.stringify(odd)]);

    const result = await (
      await makeLogger(dir, { signingKey: "another key" })
    ).verifyIntegrity();
    expect(result.otherKey.count).toBe(6);
    expect(result.otherKey.ranges).toEqual([
      { from: 1, to: 2 },
      { from: 4, to: 5 },
    ]);
    expect(result.verified).toBe(false);
  });

  test("tampering with a record of another tenant is not listed for this one", async () => {
    const dir = tmpDir();
    const logger = await makeLogger(dir);
    await writeRecords(logger, 2, "tenant-a");
    rewrite(dir, 0, (r) => delete r.signature);
    const result = await logger.verifyIntegrity({ tenantId: "tenant-b" });
    expect(result.tamperedLogs).toEqual([]);
    expect(result.totalLogs).toBe(0);
  });
});

describe("queryLogs() skippedLines", () => {
  test("counts the lines it could not read", async () => {
    const dir = tmpDir();
    const logger = await makeLogger(dir);
    await writeRecords(logger, 3);
    fs.appendFileSync(dailyFile(dir), '{"truncated":\nplain text\n[1,2]\n');

    const result = await logger.queryLogs({});
    expect(result.total).toBe(3);
    expect(result.skippedLines).toBe(3);
    expect(Object.keys(result)).toEqual([
      "results",
      "total",
      "hasMore",
      "skippedLines",
    ]);
  });

  test("is 0 when every line was read", async () => {
    const dir = tmpDir();
    const logger = await makeLogger(dir);
    await writeRecords(logger, 2);
    expect((await logger.queryLogs({})).skippedLines).toBe(0);
  });

  test("a report is built from the readable lines", async () => {
    const dir = tmpDir();
    const logger = await makeLogger(dir);
    await writeRecords(logger, 2);
    fs.appendFileSync(dailyFile(dir), "not json\n");
    const report = await logger.generateComplianceReport({
      standard: "SOC2",
      allTenants: true,
    });
    expect(report.metadata.totalEvents).toBe(2);
  });
});

describe("hashing and comparison edge cases", () => {
  test("a record with an array field verifies end to end", async () => {
    const dir = tmpDir();
    const logger = await makeLogger(dir);
    await writeRecords(logger, 1);
    const file = dailyFile(dir);
    const record = JSON.parse(readLines(file)[0]);
    record.tags = ["a", 1, null, { b: [2] }];
    await reseal(logger, record);
    writeLines(file, [JSON.stringify(record)]);
    const chain = readChain(dir);
    chain.lastHash = logger._chainLink(record.chainPrev, record.integrity);
    chain.stateTag = logger._stateTag(
      chain.chainId,
      chain.sequence,
      chain.lastHash,
    );
    writeChain(dir, chain);

    expect((await logger.verifyIntegrity()).verified).toBe(true);

    // Changing one element of the array is an edit.
    record.tags[0] = "z";
    writeLines(file, [JSON.stringify(record)]);
    const edited = await logger.verifyIntegrity();
    expect(edited.verified).toBe(false);
    expect(reasons(edited)).toContain("edited");
  });

  test.each([
    ["integrity", "abc"],
    ["integrity", "a".repeat(200)],
  ])(
    "a %s value of the wrong length is edited, not a crash",
    async (field, value) => {
      const dir = tmpDir();
      const logger = await makeLogger(dir);
      await writeRecords(logger, 3);
      rewrite(dir, 1, (r) => (r[field] = value));

      const result = await logger.verifyIntegrity();
      expect(result.verified).toBe(false);
      expect(tamperReasons(result)).toContain("edited");
    },
  );

  test("a chain file ending with a different length hash is a tail break", async () => {
    const dir = tmpDir();
    const logger = await makeLogger(dir);
    await writeRecords(logger, 2);
    const chain = readChain(dir);
    chain.lastHash = "short";
    chain.stateTag = logger._stateTag(chain.chainId, chain.sequence, "short");
    writeChain(dir, chain);

    expect(reasons(await logger.verifyIntegrity())).toContain("tail");
  });

  test("an unreadable chain file is not a break when there are no chained records", async () => {
    const dir = tmpDir();
    const logger = await makeLogger(dir);
    fs.mkdirSync(path.dirname(chainPath(dir)), { recursive: true });
    fs.writeFileSync(chainPath(dir), "{ not json");

    const result = await logger.verifyIntegrity();
    expect(result.integrityBreaks).toEqual([]);
    expect(result.verified).toBe(true);
  });

  test("two breaks about the chain file keep their order", async () => {
    const dir = tmpDir();
    const logger = await makeLogger(dir);
    await writeRecords(logger, 2);
    writeChain(dir, {
      ...readChain(dir),
      resets: [{ at: "bad date", afterSequence: 1 }, { at: "bad date" }],
    });

    const result = await logger.verifyIntegrity();
    expect(result.integrityBreaks.map((b) => [b.reason, b.sequence])).toEqual([
      ["chain file reset", 1],
      ["chain file reset", null],
    ]);
  });

  test("a record written before version 2 is hashed over _action and _tenantId", async () => {
    const dir = tmpDir();
    const logger = await makeLogger(dir);
    fs.mkdirSync(dailyDir(dir), { recursive: true });
    const old = {
      _category: "authentication",
      _action: "login",
      _tenantId: "tenant-a",
      tenantId: "tenant-a",
      result: "success",
      metadata: { timestamp: new Date().toISOString(), correlationId: "old" },
      sequence: 1,
    };
    old.integrity = await logger._calculateIntegrityHash(old);
    old.signature = await logger._signAuditEvent(old);
    const file = path.join(
      dailyDir(dir),
      `audit-${new Date().toISOString().slice(0, 10)}.jsonl`,
    );
    writeLines(file, [JSON.stringify(old)]);

    const ok = await logger.verifyIntegrity();
    expect(ok).toMatchObject({ verified: true, verifiedLogs: 1 });
    expect(ok.unchained.count).toBe(1);

    rewrite(dir, 0, (r) => (r._action = "logout"));
    const edited = await logger.verifyIntegrity();
    expect(edited.verified).toBe(false);
    expect(tamperReasons(edited)).toContain("edited");
  });
});

describe("tamperedLogs has one entry per record", () => {
  test("an edited signed record appears once, with every reason", async () => {
    const dir = tmpDir();
    const logger = await makeLogger(dir);
    await writeRecords(logger, 3);
    rewrite(dir, 1, (r) => (r.userId = "someone-else"));

    const result = await logger.verifyIntegrity();
    expect(result.tamperedLogs).toHaveLength(1);
    expect(result.tamperedLogs[0]).toMatchObject({
      sequence: 2,
      reason: "edited",
      reasons: ["edited", "invalid_signature"],
    });
  });

  test("a record with one problem has one reason", async () => {
    const dir = tmpDir();
    const logger = await makeLogger(dir);
    await writeRecords(logger, 3);
    rewrite(dir, 2, (r) => delete r.signature);

    const result = await logger.verifyIntegrity();
    expect(result.tamperedLogs).toHaveLength(1);
    expect(result.tamperedLogs[0].reasons).toEqual(["missing_signature"]);
    expect(result.tamperedLogs[0].reason).toBe("missing_signature");
  });
});
