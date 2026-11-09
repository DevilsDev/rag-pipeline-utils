/**
 * A signing.key left empty by a crash between creating and writing it is
 * replaced once it is a few seconds old, instead of leaving every later run
 * on a per-process random key. A recent empty file is another process still
 * writing it, and anything with content is never overwritten.
 */

const fs = require("fs");
const os = require("os");
const path = require("path");
const { AuditLogger } = require("../../../src/enterprise/audit-logging");

let dir;
let savedEnv;
beforeEach(() => {
  jest.useRealTimers();
  savedEnv = process.env.RAG_AUDIT_SIGNING_KEY;
  delete process.env.RAG_AUDIT_SIGNING_KEY;
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "audit-stale-key-"));
  fs.mkdirSync(path.join(dir, "integrity"), { recursive: true });
});
afterEach(() => {
  if (savedEnv === undefined) delete process.env.RAG_AUDIT_SIGNING_KEY;
  else process.env.RAG_AUDIT_SIGNING_KEY = savedEnv;
  jest.restoreAllMocks();
  fs.rmSync(dir, { recursive: true, force: true });
});

const keyFile = () => path.join(dir, "integrity", "signing.key");
const make = () =>
  new AuditLogger({ logDir: dir, encryption: false, realtimeEnabled: false });
const age = (seconds) => {
  const t = new Date(Date.now() - seconds * 1000);
  fs.utimesSync(keyFile(), t, t);
};

describe("an empty signing.key", () => {
  test("older than a few seconds is replaced with a real key", () => {
    fs.writeFileSync(keyFile(), "");
    age(60);
    const key = make().signingKey;
    const text = fs.readFileSync(keyFile(), "utf8").trim();
    expect(text).toMatch(/^[0-9a-f]{128}$/);
    expect(Buffer.isBuffer(key) && key.toString("hex")).toBe(text);
    // and the next run uses the same key
    expect(make().signingKey.toString("hex")).toBe(text);
    // no stale copy is left behind
    expect(fs.readdirSync(path.join(dir, "integrity"))).toEqual([
      "signing.key",
    ]);
  });

  test("that is recent is left alone (another process may be writing it)", () => {
    fs.writeFileSync(keyFile(), "");
    jest
      .spyOn(require("../../../src/utils/logger").logger, "warn")
      .mockImplementation(() => {});
    make().signingKey;
    expect(fs.readFileSync(keyFile(), "utf8")).toBe("");
  });

  test("a file with other content is never replaced", () => {
    fs.writeFileSync(keyFile(), "not a key\n");
    age(60);
    jest
      .spyOn(require("../../../src/utils/logger").logger, "warn")
      .mockImplementation(() => {});
    make().signingKey;
    expect(fs.readFileSync(keyFile(), "utf8")).toBe("not a key\n");
  });
});
