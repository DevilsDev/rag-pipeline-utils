/**
 * The signing key when none is configured: a key stored in
 * <logDir>/integrity/signing.key (created once, reused after a restart), and
 * a random per-process key only when that file can't be used. The warning
 * goes out through process.emitWarning with the code RAG_AUDIT_NO_SIGNING_KEY.
 */

const fs = require("fs");
const os = require("os");
const path = require("path");

const auditLoggingPath = path.resolve(
  __dirname,
  "../../../src/enterprise/audit-logging.js",
);
const CODE = "RAG_AUDIT_NO_SIGNING_KEY";

let dirs;
let emit;
let savedEnv;

beforeAll(() => jest.useRealTimers());

beforeEach(() => {
  // The once-per-process guard lives in the module, so start each test fresh.
  jest.resetModules();
  dirs = [];
  savedEnv = process.env.RAG_AUDIT_SIGNING_KEY;
  delete process.env.RAG_AUDIT_SIGNING_KEY;
  emit = jest.spyOn(process, "emitWarning").mockImplementation(() => {});
});

afterEach(() => {
  if (savedEnv === undefined) delete process.env.RAG_AUDIT_SIGNING_KEY;
  else process.env.RAG_AUDIT_SIGNING_KEY = savedEnv;
  for (const dir of dirs) fs.rmSync(dir, { recursive: true, force: true });
  jest.restoreAllMocks();
});

const tmpDir = () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "audit-key-"));
  dirs.push(dir);
  return dir;
};
const warnings = () =>
  emit.mock.calls.filter((c) => c[1] && c[1].code === CODE);
const keyFile = (dir) => path.join(dir, "integrity", "signing.key");

async function makeLogger(logDir, options = {}) {
  const { AuditLogger } = require(auditLoggingPath);
  const logger = new AuditLogger({
    logDir,
    realtimeEnabled: false,
    encryptionKey: "k".repeat(32),
    ...options,
  });
  await new Promise((resolve) =>
    logger.once("audit_system_initialized", resolve),
  );
  return logger;
}

let counter = 0;
async function writeRecords(logger, count) {
  for (let i = 0; i < count; i++) {
    counter += 1;
    await logger.logAuthentication({
      _action: "login",
      _tenantId: "tenant-a",
      _userId: `user-${counter}`,
      result: "success",
    });
  }
  await logger._flushLogs();
}

describe("a stored signing key", () => {
  test("is created once, reused by a new logger, and the log verifies", async () => {
    const dir = tmpDir();
    const first = await makeLogger(dir);
    await writeRecords(first, 2);
    const second = await makeLogger(dir);
    await writeRecords(second, 2);

    expect(second._keyId()).toBe(first._keyId());
    const result = await second.verifyIntegrity();
    expect(result).toMatchObject({ verified: true, totalLogs: 4 });
    expect(result.otherKey.count).toBe(0);
  });

  test("lives under integrity/, not with the log files, as 128 hex digits", async () => {
    const dir = tmpDir();
    const logger = await makeLogger(dir);
    await writeRecords(logger, 1);

    expect(fs.readFileSync(keyFile(dir), "utf8")).toMatch(/^[0-9a-f]{128}\n$/);
    expect(fs.readdirSync(path.join(dir, "daily"))).toEqual([
      expect.stringMatching(/^audit-\d{4}-\d{2}-\d{2}\.jsonl$/),
    ]);
    expect(fs.readdirSync(path.join(dir, "integrity")).sort()).toEqual([
      "chain.json",
      "signing.key",
    ]);
    expect((await logger.verifyIntegrity()).totalLogs).toBe(1);
  });

  test("is readable by its owner only", async () => {
    if (process.platform === "win32") return; // Windows ignores POSIX modes
    const dir = tmpDir();
    await makeLogger(dir);
    expect(fs.statSync(keyFile(dir)).mode & 0o777).toBe(0o600);
  });

  test("two loggers created together on an empty directory share one key", async () => {
    const dir = tmpDir();
    const [a, b] = await Promise.all([makeLogger(dir), makeLogger(dir)]);
    expect(a._keyId()).toBe(b._keyId());
    await writeRecords(a, 1);
    await writeRecords(b, 1);
    expect(fs.readdirSync(path.join(dir, "integrity"))).toContain(
      "signing.key",
    );
  });

  test("warns once per process, saying a stored key only detects casual changes", async () => {
    const dir = tmpDir();
    await makeLogger(dir);
    await makeLogger(dir);

    expect(warnings()).toHaveLength(1);
    const [message, options] = warnings()[0];
    expect(options.code).toBe(CODE);
    expect(message).toMatch(/accidental damage and casual edits/);
    expect(message).toMatch(/someone who can read the log folder/);
    expect(message).toMatch(/RAG_AUDIT_SIGNING_KEY/);
  });
});

describe("a stored signing key that cannot be used", () => {
  test.each([
    ["has the wrong length", "abcd\n"],
    ["is empty", ""],
    ["is not hex", "z".repeat(128) + "\n"],
    ["is upper case hex", "A".repeat(128) + "\n"],
  ])(
    "a key file that %s is left alone and a random key is used",
    async (_label, text) => {
      const dir = tmpDir();
      fs.mkdirSync(path.join(dir, "integrity"), { recursive: true });
      fs.writeFileSync(keyFile(dir), text);

      const logger = await makeLogger(dir);
      await writeRecords(logger, 2);

      expect(fs.readFileSync(keyFile(dir), "utf8")).toBe(text);
      expect((await logger.verifyIntegrity()).verified).toBe(true);
      expect(warnings()).toHaveLength(1);
      expect(warnings()[0][0]).toMatch(/couldn't be used/);
      expect(warnings()[0][0]).toMatch(/RAG_AUDIT_SIGNING_KEY/);
    },
  );

  test("a key file that cannot be read is not replaced", async () => {
    const dir = tmpDir();
    fs.mkdirSync(keyFile(dir), { recursive: true });

    const logger = await makeLogger(dir);
    await writeRecords(logger, 1);

    expect(fs.statSync(keyFile(dir)).isDirectory()).toBe(true);
    expect(warnings()).toHaveLength(1);
    expect(warnings()[0][0]).toMatch(/couldn't be used/);
  });

  test("a key file that cannot be created is reported, not thrown", async () => {
    const dir = tmpDir();
    const real = fs.writeFileSync;
    jest.spyOn(fs, "writeFileSync").mockImplementation((file, ...rest) => {
      if (String(file).endsWith("signing.key")) {
        throw Object.assign(new Error("EACCES: permission denied"), {
          code: "EACCES",
        });
      }
      return real(file, ...rest);
    });

    const logger = await makeLogger(dir);
    await writeRecords(logger, 1);

    expect(fs.existsSync(keyFile(dir))).toBe(false);
    expect(warnings()).toHaveLength(1);
    expect(warnings()[0][0]).toMatch(/EACCES/);
    expect((await logger.verifyIntegrity()).verified).toBe(true);
  });

  test("each logger gets its own random key, so a restart can't verify", async () => {
    const dir = tmpDir();
    fs.mkdirSync(path.join(dir, "integrity"), { recursive: true });
    fs.writeFileSync(keyFile(dir), "short\n");
    const a = await makeLogger(dir);
    const b = await makeLogger(dir);
    expect(a._keyId()).not.toBe(b._keyId());
    expect(warnings()).toHaveLength(1);
  });
});

describe("a configured signing key", () => {
  test("the signingKey option creates no key file and does not warn", async () => {
    const dir = tmpDir();
    const logger = await makeLogger(dir, { signingKey: "from the option" });
    await writeRecords(logger, 1);
    expect(fs.existsSync(keyFile(dir))).toBe(false);
    expect(warnings()).toHaveLength(0);
  });

  test("RAG_AUDIT_SIGNING_KEY creates no key file and does not warn", async () => {
    process.env.RAG_AUDIT_SIGNING_KEY = "from the environment";
    const dir = tmpDir();
    const logger = await makeLogger(dir);
    await writeRecords(logger, 1);
    expect(fs.existsSync(keyFile(dir))).toBe(false);
    expect(warnings()).toHaveLength(0);
  });

  test("a configured key wins over a stored one", async () => {
    const dir = tmpDir();
    const keyless = await makeLogger(dir);
    const configured = await makeLogger(dir, { signingKey: "from the option" });
    expect(configured._keyId()).not.toBe(keyless._keyId());
  });
});
