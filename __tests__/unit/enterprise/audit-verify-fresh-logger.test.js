/**
 * verifyIntegrity() on a logger that was never written to resolves the
 * signing key, which creates it as 0600 inside an 0700 integrity folder.
 */

const fs = require("fs");
const os = require("os");
const path = require("path");
const { AuditLogger } = require("../../../src/enterprise/audit-logging");

let dir;
let savedEnv;
beforeEach(() => {
  savedEnv = process.env.RAG_AUDIT_SIGNING_KEY;
  delete process.env.RAG_AUDIT_SIGNING_KEY;
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "audit-fresh-"));
});
afterEach(() => {
  if (savedEnv === undefined) delete process.env.RAG_AUDIT_SIGNING_KEY;
  else process.env.RAG_AUDIT_SIGNING_KEY = savedEnv;
  fs.rmSync(dir, { recursive: true, force: true });
});

describe("a logger that was never written to", () => {
  test("verifyIntegrity() creates signing.key as 0600 inside a 0700 integrity folder", async () => {
    const fresh = path.join(dir, "fresh");
    const l = new AuditLogger({
      logDir: fresh,
      encryption: false,
      realtimeEnabled: false,
    });
    expect(fs.existsSync(fresh)).toBe(false);
    await l.verifyIntegrity();
    const file = path.join(fresh, "integrity", "signing.key");
    expect(fs.readFileSync(file, "utf8").trim()).toMatch(/^[0-9a-f]{128}$/);
    if (process.platform !== "win32") {
      expect(fs.statSync(file).mode & 0o777).toBe(0o600);
      expect(fs.statSync(path.join(fresh, "integrity")).mode & 0o777).toBe(
        0o700,
      );
    }
  });
});
