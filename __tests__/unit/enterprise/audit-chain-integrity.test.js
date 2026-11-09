/**
 * Audit log integrity: every record carries a sequence, a link to the
 * previous record and a keyed hash over the whole record, and
 * verifyIntegrity() reports deleted, reordered, inserted and edited records,
 * sequence gaps, and a chain file that is gone, was restarted or was rewritten.
 */

const crypto = require("crypto");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");

const auditLoggingPath = path.resolve(
  __dirname,
  "../../../src/enterprise/audit-logging.js",
);

const SIGNING_KEY = "signing key for the chain tests";
const ENCRYPTION_KEY = "k".repeat(32);

let dirs;
let savedEnv;

beforeAll(() => jest.useRealTimers());

beforeEach(() => {
  dirs = [];
  savedEnv = process.env.RAG_AUDIT_SIGNING_KEY;
  delete process.env.RAG_AUDIT_SIGNING_KEY;
});

afterEach(() => {
  if (savedEnv === undefined) delete process.env.RAG_AUDIT_SIGNING_KEY;
  else process.env.RAG_AUDIT_SIGNING_KEY = savedEnv;
  for (const dir of dirs) fs.rmSync(dir, { recursive: true, force: true });
  jest.restoreAllMocks();
});

function tmpDir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "audit-chain-"));
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
async function logMany(logger, count, tenantId = "tenant-a") {
  for (let i = 0; i < count; i++) {
    counter += 1;
    await logger.logAuthentication({
      _action: "login",
      _tenantId: tenantId,
      _userId: `user-${counter}`,
      result: "success",
      ipAddress: `10.0.0.${counter % 250}`,
    });
  }
}

async function writeRecords(logger, count, tenantId) {
  await logMany(logger, count, tenantId);
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
const reasons = (result) => result.integrityBreaks.map((b) => b.reason);

async function verifyWith(dir, options = {}, verifyOptions) {
  const logger = await makeLogger(dir, options);
  return logger.verifyIntegrity(verifyOptions);
}

function rewrite(dir, index, change) {
  const file = dailyFile(dir);
  const lines = readLines(file);
  const record = JSON.parse(lines[index]);
  change(record);
  lines[index] = JSON.stringify(record);
  writeLines(file, lines);
}

describe("AuditLogger record format", () => {
  test("numbers records at flush time with a sequence, link, key id and keyed hash", async () => {
    const dir = tmpDir();
    const logger = await makeLogger(dir);
    await logMany(logger, 3);
    expect(logger.logBuffer.every((e) => e.sequence === undefined)).toBe(true);
    await logger._flushLogs();

    const records = readLines(dailyFile(dir)).map((l) => JSON.parse(l));
    expect(records.map((r) => r.sequence)).toEqual([1, 2, 3]);
    expect(records.every((r) => r.integrityVersion === 3)).toBe(true);
    expect(new Set(records.map((r) => r.keyId)).size).toBe(1);
    expect(records[0].keyId).toMatch(/^[0-9a-f]{16}$/);
    for (const r of records) {
      expect(r.chainPrev).toMatch(/^[0-9a-f]{64}$/);
      expect(r.integrity).toMatch(/^[0-9a-f]{64}$/);
    }
    expect(new Set(records.map((r) => r.chainPrev)).size).toBe(3);

    const chain = readChain(dir);
    expect(chain.version).toBe(3);
    expect(chain.sequence).toBe(3);
    expect(chain.stateTag).toMatch(/^[0-9a-f]{64}$/);
    expect(chain.chainId).toEqual(expect.any(String));
  });

  test("an untouched log verifies", async () => {
    const dir = tmpDir();
    const logger = await makeLogger(dir);
    await writeRecords(logger, 5);
    const result = await logger.verifyIntegrity();
    expect(result).toMatchObject({
      verified: true,
      totalLogs: 5,
      verifiedLogs: 5,
      tamperedLogs: [],
      missingLogs: [],
      integrityBreaks: [],
    });
    expect(result.secondWriter).toEqual([]);
    expect(result.otherKey.count).toBe(0);
    expect(result.unchained.count).toBe(0);
  });
});

describe("AuditLogger.verifyIntegrity() detects changes to the files", () => {
  test("reports a deleted record as a chain break and a sequence gap", async () => {
    const dir = tmpDir();
    const logger = await makeLogger(dir);
    await writeRecords(logger, 5);
    const file = dailyFile(dir);
    const lines = readLines(file);
    lines.splice(2, 1);
    writeLines(file, lines);

    const result = await logger.verifyIntegrity();
    expect(result.verified).toBe(false);
    expect(result.integrityBreaks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ reason: "chain", sequence: 4 }),
      ]),
    );
    expect(result.missingLogs).toEqual([{ after: 2, before: 4, count: 1 }]);
    expect(result.secondWriter).toEqual([]);
  });

  test("reports a deleted last record as a tail mismatch", async () => {
    const dir = tmpDir();
    const logger = await makeLogger(dir);
    await writeRecords(logger, 4);
    const file = dailyFile(dir);
    writeLines(file, readLines(file).slice(0, 3));

    const result = await logger.verifyIntegrity();
    expect(result.verified).toBe(false);
    expect(reasons(result)).toContain("tail");
  });

  test("reports two swapped records as an order or chain break", async () => {
    const dir = tmpDir();
    const logger = await makeLogger(dir);
    await writeRecords(logger, 5);
    const file = dailyFile(dir);
    const lines = readLines(file);
    [lines[1], lines[2]] = [lines[2], lines[1]];
    writeLines(file, lines);

    const result = await logger.verifyIntegrity();
    expect(result.verified).toBe(false);
    const swapped = result.integrityBreaks.filter(
      (b) => (b.sequence === 2 || b.sequence === 3) && b.reason !== "tail",
    );
    expect(swapped.length).toBeGreaterThan(0);
    expect(
      swapped.every((b) => b.reason === "order" || b.reason === "chain"),
    ).toBe(true);
    expect(result.secondWriter).toEqual([]);
  });

  test.each([
    ["the action", (r) => (r.action = "logout")],
    ["the user", (r) => (r.userId = "someone-else")],
    [
      "an encrypted detail field",
      (r) => {
        const data = r.details.data;
        r.details.data = (data[0] === "a" ? "b" : "a") + data.slice(1);
      },
    ],
  ])("reports an edit to %s as edited", async (_label, change) => {
    const dir = tmpDir();
    const logger = await makeLogger(dir);
    await writeRecords(logger, 4);
    rewrite(dir, 1, change);

    const result = await logger.verifyIntegrity();
    expect(result.verified).toBe(false);
    expect(result.integrityBreaks).toEqual([
      expect.objectContaining({ reason: "edited", sequence: 2 }),
    ]);
    expect(result.tamperedLogs).toEqual(
      expect.arrayContaining([expect.objectContaining({ sequence: 2 })]),
    );
    expect(result.secondWriter).toEqual([]);
  });

  test("counts an edited record whose signature field was removed as tampered", async () => {
    const dir = tmpDir();
    const logger = await makeLogger(dir);
    await writeRecords(logger, 3);
    rewrite(dir, 1, (r) => {
      r.userId = "someone-else";
      delete r.signature;
    });

    const result = await logger.verifyIntegrity();
    expect(result.verified).toBe(false);
    expect(result.tamperedLogs.length).toBeGreaterThan(0);
  });

  test("flags a record with no signature field while digital signing is enabled", async () => {
    const dir = tmpDir();
    const logger = await makeLogger(dir);
    await writeRecords(logger, 3);
    rewrite(dir, 2, (r) => delete r.signature);

    const result = await logger.verifyIntegrity();
    expect(result.verified).toBe(false);
    expect(result.tamperedLogs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ reason: "missing_signature" }),
      ]),
    );
  });

  test("reports a chain file rebuilt without the key as forged", async () => {
    const dir = tmpDir();
    const logger = await makeLogger(dir);
    await writeRecords(logger, 4);
    const file = dailyFile(dir);
    const lines = readLines(file);
    const last = JSON.parse(lines[3]);
    writeLines(file, lines.slice(0, 3));
    const chain = readChain(dir);
    chain.sequence = 3;
    chain.lastHash = last.chainPrev;
    fs.writeFileSync(chainPath(dir), JSON.stringify(chain, null, 2));

    const result = await logger.verifyIntegrity();
    expect(result.verified).toBe(false);
    expect(reasons(result)).toContain("chain file forged");
  });

  test("reports a deleted chain file, and a reset once logging resumes", async () => {
    const dir = tmpDir();
    const logger = await makeLogger(dir);
    await writeRecords(logger, 4);
    const firstChainId = readChain(dir).chainId;
    const file = dailyFile(dir);
    writeLines(file, readLines(file).slice(0, 2));
    fs.rmSync(chainPath(dir));

    const missing = await verifyWith(dir);
    expect(missing.verified).toBe(false);
    expect(reasons(missing)).toContain("chain file missing");
    expect(fs.existsSync(chainPath(dir))).toBe(false);

    const resumed = await makeLogger(dir);
    await writeRecords(resumed, 2);
    const chain = readChain(dir);
    expect(chain.resets).toHaveLength(1);
    expect(chain.chainId).not.toBe(firstChainId);
    const sequences = readLines(file).map((l) => JSON.parse(l).sequence);
    expect(sequences).toEqual([1, 2, 3, 4]);

    const after = await verifyWith(dir);
    expect(after.verified).toBe(false);
    expect(reasons(after)).toContain("chain file reset");
  });

  test("a record inserted without the key is not attributed to a second writer", async () => {
    const dir = tmpDir();
    const logger = await makeLogger(dir);
    await writeRecords(logger, 6);
    const file = dailyFile(dir);
    const lines = readLines(file);
    const copy = JSON.parse(lines[1]);
    copy.action = "logout";
    // delete two records and put a changed copy of an earlier one in their place
    lines.splice(2, 2, JSON.stringify(copy));
    writeLines(file, lines);

    const result = await logger.verifyIntegrity();
    expect(result.verified).toBe(false);
    expect(result.secondWriter).toEqual([]);
    expect(result.tamperedLogs.length).toBeGreaterThan(0);
    expect(result.integrityBreaks.length).toBeGreaterThan(0);
    expect(result.missingLogs.length).toBeGreaterThan(0);
  });
});

describe("AuditLogger lines that cannot be parsed", () => {
  test("verifyIntegrity() reports a half-written last line", async () => {
    const dir = tmpDir();
    const logger = await makeLogger(dir);
    await writeRecords(logger, 3);
    fs.appendFileSync(dailyFile(dir), '{"_category":"authenticat');

    const result = await logger.verifyIntegrity();
    expect(result.verified).toBe(false);
    expect(result.integrityBreaks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ reason: "unparseable" }),
      ]),
    );
    expect(result.verifiedLogs).toBe(3);
  });

  test("a bad line in the middle does not stop the rest being checked", async () => {
    const dir = tmpDir();
    const logger = await makeLogger(dir);
    await writeRecords(logger, 4);
    const file = dailyFile(dir);
    const lines = readLines(file);
    lines.splice(2, 0, "not json at all");
    writeLines(file, lines);

    const result = await logger.verifyIntegrity();
    const bad = result.integrityBreaks.filter(
      (b) => b.reason === "unparseable",
    );
    expect(bad).toEqual([expect.objectContaining({ line: 3 })]);
    expect(result.verifiedLogs).toBe(4);
  });

  test("queryLogs() skips them and returns the other records", async () => {
    const dir = tmpDir();
    const logger = await makeLogger(dir);
    await writeRecords(logger, 3);
    const file = dailyFile(dir);
    fs.appendFileSync(file, '{"truncated":');
    fs.appendFileSync(file, "\nplain text\n");

    const { results, total } = await logger.queryLogs({});
    expect(total).toBe(3);
    expect(results).toHaveLength(3);
  });
});

describe("AuditLogger across restarts and writers", () => {
  test("sequences continue after a restart and the log verifies", async () => {
    const dir = tmpDir();
    const first = await makeLogger(dir);
    await writeRecords(first, 3);
    const second = await makeLogger(dir);
    await writeRecords(second, 2);

    const sequences = readLines(dailyFile(dir)).map(
      (l) => JSON.parse(l).sequence,
    );
    expect(sequences).toEqual([1, 2, 3, 4, 5]);
    const result = await verifyWith(dir);
    expect(result.verified).toBe(true);
    expect(result.integrityBreaks).toEqual([]);
    expect(result.missingLogs).toEqual([]);
  });

  test("separate processes with the same key and directory continue the sequence", async () => {
    const dir = tmpDir();
    const script = `
      const { AuditLogger } = require(${JSON.stringify(auditLoggingPath)});
      const logger = new AuditLogger({ logDir: ${JSON.stringify(dir)}, realtimeEnabled: false,
        encryptionKey: ${JSON.stringify(ENCRYPTION_KEY)}, signingKey: ${JSON.stringify(SIGNING_KEY)} });
      logger.once("audit_system_initialized", async () => {
        await logger.logAuthentication({ _action: "login", _tenantId: "t", _userId: "u", result: "success" });
        await logger.logAuthentication({ _action: "logout", _tenantId: "t", _userId: "u", result: "success" });
        await logger._flushLogs();
        process.exit(0);
      });`;
    for (let i = 0; i < 2; i++) {
      const run = spawnSync(process.execPath, ["-e", script], {
        encoding: "utf8",
      });
      expect(run.status).toBe(0);
    }
    const sequences = readLines(dailyFile(dir)).map(
      (l) => JSON.parse(l).sequence,
    );
    expect(sequences).toEqual([1, 2, 3, 4]);
    const result = await verifyWith(dir);
    expect(result.verified).toBe(true);
  });

  test("records appended after the chain file was last written are recovered", async () => {
    const dir = tmpDir();
    const first = await makeLogger(dir);
    await writeRecords(first, 3);
    const saved = fs.readFileSync(chainPath(dir), "utf8");
    await writeRecords(first, 2);
    // the process stopped after appending but before writing the chain file
    fs.writeFileSync(chainPath(dir), saved);

    const second = await makeLogger(dir);
    await writeRecords(second, 1);

    expect(readChain(dir).sequence).toBe(6);
    expect(readChain(dir).resets || []).toEqual([]);
    const result = await verifyWith(dir);
    expect(result.verified).toBe(true);
    expect(result.integrityBreaks).toEqual([]);
  });

  test("a write that fails is numbered again from the same state", async () => {
    const dir = tmpDir();
    const logger = await makeLogger(dir);
    await writeRecords(logger, 2);
    await logMany(logger, 2);
    const realAppend = fs.promises.appendFile;
    const append = jest
      .spyOn(fs.promises, "appendFile")
      .mockRejectedValueOnce(new Error("disk full"));
    // A failed write is reported, not thrown (3.9, BH-14)
    const failed = [];
    logger.on("flush_failed", (e) => failed.push(e));
    await logger._flushLogs();
    expect(failed).toEqual([{ error: "disk full", count: 2 }]);
    append.mockImplementation(realAppend);
    await logger._flushLogs();

    const records = readLines(dailyFile(dir)).map((l) => JSON.parse(l));
    expect(records.map((r) => r.sequence)).toEqual([1, 2, 3, 4]);
    expect(records.every((r) => typeof r.chainPrev === "string")).toBe(true);
    expect(records[3].chainPrev).not.toBe(records[2].chainPrev);
    expect((await logger.verifyIntegrity()).verified).toBe(true);
  });

  test("a record written after a half-written line starts on its own line", async () => {
    const dir = tmpDir();
    const logger = await makeLogger(dir);
    await writeRecords(logger, 2);
    fs.appendFileSync(dailyFile(dir), '{"_category":"authenticat');
    await writeRecords(logger, 2);

    const result = await logger.verifyIntegrity();
    expect(reasons(result)).toEqual(["unparseable"]);
    expect(result.missingLogs).toEqual([]);
    expect(result.verifiedLogs).toBe(4);
    expect((await logger.queryLogs({})).total).toBe(4);
  });

  test("records written before chain links existed are counted and do not fail verification", async () => {
    const dir = tmpDir();
    const legacy = await makeLogger(dir);
    const today = new Date().toISOString().slice(0, 10);
    const legacyLines = [];
    for (let seq = 1; seq <= 2; seq++) {
      const event = {
        _category: "authentication",
        action: "login",
        tenantId: "tenant-a",
        userId: `old-${seq}`,
        result: "success",
        metadata: {
          timestamp: new Date().toISOString(),
          correlationId: `old-${seq}`,
          _severity: "LOW",
        },
        sequence: seq,
        integrityVersion: 2,
      };
      event.integrity = crypto
        .createHash("sha256")
        .update(
          JSON.stringify({
            sequence: seq,
            category: event._category,
            action: event.action,
            tenantId: event.tenantId,
            timestamp: event.metadata.timestamp,
          }),
        )
        .digest("hex");
      event.signature = await legacy._signAuditEvent(event);
      legacyLines.push(JSON.stringify(event));
    }
    fs.mkdirSync(dailyDir(dir), { recursive: true });
    fs.mkdirSync(path.dirname(chainPath(dir)), { recursive: true });
    writeLines(path.join(dailyDir(dir), `audit-${today}.jsonl`), legacyLines);
    fs.writeFileSync(
      chainPath(dir),
      JSON.stringify({
        created: new Date().toISOString(),
        lastHash: "a".repeat(64),
        sequence: 2,
      }),
    );

    const writer = await makeLogger(dir);
    await writeRecords(writer, 2);

    const chain = readChain(dir);
    expect(chain.version).toBe(3);
    expect(chain.legacy).toEqual({ lastHash: "a".repeat(64), sequence: 2 });
    const result = await verifyWith(dir);
    expect(result.unchained.count).toBe(2);
    expect(result.integrityBreaks).toEqual([]);
    expect(result.tamperedLogs).toEqual([]);
    expect(result.verified).toBe(true);
  });
});

describe("AuditLogger signing key", () => {
  test("records written with another key are reported as another key, not as edited", async () => {
    const dir = tmpDir();
    const writer = await makeLogger(dir);
    await writeRecords(writer, 3);

    const result = await verifyWith(dir, { signingKey: "a different key" });
    expect(result.verified).toBe(false);
    expect(result.otherKey.count).toBe(3);
    expect(result.tamperedLogs).toEqual([]);
    expect(reasons(result)).not.toContain("edited");
  });

  test("does not warn when a signing key is configured", async () => {
    const emit = jest
      .spyOn(process, "emitWarning")
      .mockImplementation(() => {});
    const logger = await makeLogger(tmpDir());
    await writeRecords(logger, 1);
    expect(
      emit.mock.calls.filter((c) => c[1]?.code === "RAG_AUDIT_NO_SIGNING_KEY"),
    ).toHaveLength(0);
  });

  test("reads RAG_AUDIT_SIGNING_KEY when the option is not given", async () => {
    process.env.RAG_AUDIT_SIGNING_KEY = "key from the environment";
    const dir = tmpDir();
    const writer = await makeLogger(dir, { signingKey: undefined });
    await writeRecords(writer, 2);
    delete process.env.RAG_AUDIT_SIGNING_KEY;

    const result = await verifyWith(dir, {
      signingKey: "key from the environment",
    });
    expect(result.verified).toBe(true);
    expect(result.otherKey.count).toBe(0);
  });

  test("the signingKey option wins over RAG_AUDIT_SIGNING_KEY", async () => {
    process.env.RAG_AUDIT_SIGNING_KEY = "key from the environment";
    const dir = tmpDir();
    const writer = await makeLogger(dir, { signingKey: "key from the option" });
    await writeRecords(writer, 2);

    const withOption = await verifyWith(dir, {
      signingKey: "key from the option",
    });
    expect(withOption.verified).toBe(true);
    const withEnv = await verifyWith(dir, { signingKey: undefined });
    expect(withEnv.otherKey.count).toBe(2);
  });
});

describe("AuditLogger two writers on one directory", () => {
  async function interleave(dir) {
    const a = await makeLogger(dir);
    await writeRecords(a, 3);
    const b = await makeLogger(dir);
    await writeRecords(b, 1);
    await writeRecords(a, 1);
    await writeRecords(b, 1);
    await writeRecords(a, 1);
    return { a, b };
  }

  test("duplicate and interleaved sequences are reported as a second writer", async () => {
    const dir = tmpDir();
    const { a } = await interleave(dir);

    const result = await a.verifyIntegrity();
    expect(result.verified).toBe(false);
    expect(result.secondWriter.length).toBeGreaterThan(0);
    expect(
      result.secondWriter.every(
        (s) => s.reason === "duplicate" || s.reason === "interleaved",
      ),
    ).toBe(true);
    expect(result.tamperedLogs).toEqual([]);
    expect(result.integrityBreaks).toEqual([]);
    expect(result.missingLogs).toEqual([]);
  });

  test("a duplicated record is reported as a second writer, not as edited", async () => {
    const dir = tmpDir();
    const logger = await makeLogger(dir);
    await writeRecords(logger, 4);
    const file = dailyFile(dir);
    const lines = readLines(file);
    lines.splice(2, 0, lines[1]);
    writeLines(file, lines);

    const result = await logger.verifyIntegrity();
    expect(result.verified).toBe(false);
    expect(result.secondWriter).toEqual([
      expect.objectContaining({ sequence: 2, reason: "duplicate" }),
    ]);
    expect(result.tamperedLogs).toEqual([]);
  });

  test("an edited record in one of the runs is reported as tampering", async () => {
    const dir = tmpDir();
    const { a } = await interleave(dir);
    rewrite(dir, 5, (r) => (r.userId = "someone-else"));

    const result = await a.verifyIntegrity();
    expect(result.verified).toBe(false);
    expect(result.secondWriter).toEqual([]);
    expect(result.tamperedLogs.length).toBeGreaterThan(0);
    expect(reasons(result)).toContain("edited");
  });
});

describe("AuditLogger webhookUrl", () => {
  test("warns once that the webhook is not implemented and sends nothing", async () => {
    const { logger: log } = require("../../../src/utils/logger");
    const warn = jest.spyOn(log, "warn").mockImplementation(() => {});
    const http = require("http");
    const https = require("https");
    const httpRequest = jest.spyOn(http, "request");
    const httpsRequest = jest.spyOn(https, "request");
    const fetchMock = jest.fn();
    const realFetch = global.fetch;
    global.fetch = fetchMock;
    try {
      const logger = await makeLogger(tmpDir(), {
        webhookUrl: "https://example.invalid/audit",
      });
      await writeRecords(logger, 2);
      await writeRecords(logger, 2);

      const warnings = warn.mock.calls.filter((c) =>
        /webhook/i.test(String(c[0])),
      );
      expect(warnings).toHaveLength(1);
      expect(String(warnings[0][0])).toMatch(/isn't implemented/);
      expect(httpRequest).not.toHaveBeenCalled();
      expect(httpsRequest).not.toHaveBeenCalled();
      expect(fetchMock).not.toHaveBeenCalled();
    } finally {
      global.fetch = realFetch;
    }
  });

  test("does not warn when no webhookUrl is set", async () => {
    const { logger: log } = require("../../../src/utils/logger");
    const warn = jest.spyOn(log, "warn").mockImplementation(() => {});
    const logger = await makeLogger(tmpDir());
    await writeRecords(logger, 1);
    expect(
      warn.mock.calls.filter((c) => /webhook/i.test(String(c[0]))),
    ).toHaveLength(0);
  });
});
