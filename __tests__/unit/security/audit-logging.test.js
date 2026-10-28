/**
 * Regression tests for AuditLogger tenant filtering, per-record encryption
 * and integrity hashing.
 */

const crypto = require("crypto");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { AuditLogger } = require("../../../src/enterprise/audit-logging");
const { logger } = require("../../../src/utils/logger");

// AuditLogger no longer invents a random per-process key (records written
// with it could not be decrypted after a restart), so encryption tests must
// configure one explicitly.
const TEST_KEY = crypto.randomBytes(32);

async function createLogger(options = {}) {
  const logDir = fs.mkdtempSync(path.join(os.tmpdir(), "audit-test-"));
  const auditLogger = new AuditLogger({
    logDir,
    realtimeEnabled: false,
    encryptionKey: TEST_KEY,
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

describe("AuditLogger encryption key configuration", () => {
  const ENV = "RAG_AUDIT_ENCRYPTION_KEY";
  let savedEnv;
  let dirs;

  beforeAll(() => jest.useRealTimers());

  beforeEach(() => {
    savedEnv = process.env[ENV];
    delete process.env[ENV];
    dirs = [];
  });

  afterEach(() => {
    if (savedEnv === undefined) delete process.env[ENV];
    else process.env[ENV] = savedEnv;
    for (const dir of dirs) fs.rmSync(dir, { recursive: true, force: true });
    jest.restoreAllMocks();
  });

  async function make(options) {
    const created = await createLogger(options);
    dirs.push(created.logDir);
    return created;
  }

  test("takes the key from RAG_AUDIT_ENCRYPTION_KEY and survives a restart", async () => {
    process.env[ENV] = "env passphrase for audit logs";

    const first = await make({ encryptionKey: undefined });
    expect(first.auditLogger.encryptionKey).toBe(
      "env passphrase for audit logs",
    );
    await logLogin(first.auditLogger, "tenant-a", "alice", "10.0.0.5");
    await first.auditLogger._flushLogs();
    expect(readRecords(first.logDir)[0].details.encrypted).toBe(true);

    // A new instance ("after restart") reading the same directory with the
    // same env key can decrypt the record.
    const second = new AuditLogger({
      logDir: first.logDir,
      realtimeEnabled: false,
    });
    await new Promise((r) => second.once("audit_system_initialized", r));
    const { results } = await second.queryLogs({ tenantId: "tenant-a" });
    expect(results[0].details.ipAddress).toBe("10.0.0.5");
  });

  test("the encryptionKey option takes precedence over the env var", async () => {
    process.env[ENV] = "env key";
    const { auditLogger } = await make({ encryptionKey: "option key" });
    expect(auditLogger.encryptionKey).toBe("option key");
  });

  test("without a key, disables encryption loudly instead of inventing one", async () => {
    const warn = jest.spyOn(logger, "warn").mockImplementation(() => {});
    const disabled = jest.fn();

    const logDir = fs.mkdtempSync(path.join(os.tmpdir(), "audit-test-"));
    dirs.push(logDir);
    const auditLogger = new AuditLogger({ logDir, realtimeEnabled: false });
    auditLogger.on("encryption_disabled", disabled);
    await new Promise((r) => auditLogger.once("audit_system_initialized", r));

    expect(auditLogger.encryptionKey).toBeNull();
    expect(auditLogger._config.compliance.encryption).toBe(false);
    expect(disabled).toHaveBeenCalledWith({ reason: "no_encryption_key" });
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining("RAG_AUDIT_ENCRYPTION_KEY"),
    );
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("UNENCRYPTED"));

    await logLogin(auditLogger, "tenant-a", "alice", "10.0.0.6");
    await auditLogger._flushLogs();
    expect(readRecords(logDir)[0].details.ipAddress).toBe("10.0.0.6");
  });

  test("requireEncryption: true throws when no key is configured", () => {
    expect(
      () =>
        new AuditLogger({
          logDir: path.join(os.tmpdir(), "audit-never-created"),
          realtimeEnabled: false,
          requireEncryption: true,
        }),
    ).toThrow(/no key is configured.*RAG_AUDIT_ENCRYPTION_KEY/);
  });

  test("encryption: false needs no key and does not warn", async () => {
    const warn = jest.spyOn(logger, "warn").mockImplementation(() => {});
    const { auditLogger } = await make({
      encryptionKey: undefined,
      encryption: false,
    });
    expect(auditLogger.encryptionKey).toBeNull();
    expect(warn).not.toHaveBeenCalledWith(
      expect.stringContaining("no key is configured"),
    );
  });
});

describe("AuditLogger legacy (createCipher) records", () => {
  beforeAll(() => jest.useRealTimers());

  // Independent re-implementation of what crypto.createCipher did:
  // OpenSSL EVP_BytesToKey(MD5, 1 iteration, no salt), IV length 12 for GCM.
  function legacyEncrypt(passphrase, value) {
    const pass = Buffer.isBuffer(passphrase)
      ? passphrase
      : Buffer.from(passphrase, "utf8");
    let material = Buffer.alloc(0);
    let block = Buffer.alloc(0);
    while (material.length < 44) {
      block = crypto
        .createHash("md5")
        .update(Buffer.concat([block, pass]))
        .digest();
      material = Buffer.concat([material, block]);
    }
    const cipher = crypto.createCipheriv(
      "aes-256-gcm",
      material.subarray(0, 32),
      material.subarray(32, 44),
    );
    let data = cipher.update(JSON.stringify(value), "utf8", "hex");
    data += cipher.final("hex");
    // Shape written by the pre-2.4 implementation: no `v`, no `iv`
    return {
      encrypted: true,
      data,
      authTag: cipher.getAuthTag().toString("hex"),
    };
  }

  test.each([
    ["a string passphrase", "legacy passphrase"],
    ["a Buffer key", crypto.randomBytes(32)],
  ])("decrypts a legacy record written with %s", async (_label, key) => {
    const auditLogger = Object.create(AuditLogger.prototype);
    auditLogger.encryptionKey = key;

    const record = {
      details: legacyEncrypt(key, { ipAddress: "10.1.2.3", user: "alice" }),
    };
    const decrypted = await auditLogger._decryptAuditEvent(record);

    expect(decrypted.details).toEqual({ ipAddress: "10.1.2.3", user: "alice" });
  });

  test("a legacy record with the wrong key reports a decryption error", async () => {
    const auditLogger = Object.create(AuditLogger.prototype);
    auditLogger.encryptionKey = "right key";
    const record = { details: legacyEncrypt("wrong key", { a: 1 }) };

    const decrypted = await auditLogger._decryptAuditEvent(record);
    expect(decrypted.details.decryptionError).toEqual(expect.any(String));
  });
});

describe("AuditLogger signature verification", () => {
  function signer() {
    const auditLogger = Object.create(AuditLogger.prototype);
    auditLogger.signingKey = crypto.randomBytes(64);
    return auditLogger;
  }

  test("uses crypto.timingSafeEqual and accepts a valid signature", async () => {
    const auditLogger = signer();
    const event = { sequence: 1, action: "login" };
    const signature = await auditLogger._signAuditEvent(event);
    const spy = jest.spyOn(crypto, "timingSafeEqual");

    await expect(
      auditLogger._verifySignature({ ...event, signature }),
    ).resolves.toBe(true);
    expect(spy).toHaveBeenCalledTimes(1);
    spy.mockRestore();
  });

  test("rejects tampered, truncated and non-string signatures", async () => {
    const auditLogger = signer();
    const event = { sequence: 1, action: "login" };
    const signature = await auditLogger._signAuditEvent(event);
    const flipped = (signature[0] === "a" ? "b" : "a") + signature.slice(1);

    await expect(
      auditLogger._verifySignature({ ...event, signature: flipped }),
    ).resolves.toBe(false);
    await expect(
      auditLogger._verifySignature({ ...event, action: "logout", signature }),
    ).resolves.toBe(false);
    await expect(
      auditLogger._verifySignature({ ...event, signature: signature.slice(2) }),
    ).resolves.toBe(false);
    await expect(
      auditLogger._verifySignature({ ...event, signature: 12345 }),
    ).resolves.toBe(false);
  });
});
