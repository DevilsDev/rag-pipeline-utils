/**
 * AuditLogger.close() (BH-16): flushes the buffer, writes the pending chain
 * state, stops the timer, and reports what is still pending.
 */

const fs = require("fs");
const os = require("os");
const path = require("path");
const { AuditLogger } = require("../../../src/enterprise/audit-logging");

const login = { _userId: "u1", method: "password", success: true };
let dir;
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "audit-close-"));
});
afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

function logger(extra = {}) {
  return new AuditLogger({
    logDir: dir,
    encryption: false,
    signingKey: "k".repeat(64),
    ...extra,
  });
}

function lines() {
  const daily = path.join(dir, "daily");
  return fs.existsSync(daily)
    ? fs
        .readdirSync(daily)
        .flatMap((f) =>
          fs
            .readFileSync(path.join(daily, f), "utf8")
            .trim()
            .split("\n")
            .filter(Boolean),
        )
    : [];
}

describe("AuditLogger.close()", () => {
  test("writes buffered events and the chain state", async () => {
    const l = logger();
    await l.logAuthentication(login);
    expect(lines()).toHaveLength(0);
    const result = await l.close();
    expect(lines()).toHaveLength(1);
    const chain = JSON.parse(
      fs.readFileSync(path.join(dir, "integrity", "chain.json"), "utf8"),
    );
    expect(JSON.stringify(chain)).toContain('"sequence":1');
    expect(result.pending).toEqual({ events: 0, chain: false });
    expect(l.flushTimer).toBeFalsy();
  });

  test("retries a chain write that failed once and reports success", async () => {
    const l = logger();
    await l.logAuthentication(login);
    const real = l._persistChainState.bind(l);
    let calls = 0;
    l._persistChainState = async () => {
      if (calls++ === 0) throw new Error("disk busy");
      return real();
    };
    l.on("chain_failed", () => {});
    const result = await l.close();
    expect(calls).toBe(2);
    expect(result.pending.chain).toBe(false);
    expect(fs.existsSync(path.join(dir, "integrity", "chain.json"))).toBe(true);
  });

  test("reports what is still pending when writes keep failing", async () => {
    const blocker = path.join(dir, "afile");
    fs.writeFileSync(blocker, "x");
    const l = logger({ logDir: path.join(blocker, "logs") });
    l.on("flush_failed", () => {});
    await l.logAuthentication(login);
    const result = await l.close();
    expect(result.pending.events).toBe(1);
  });

  test("waits for a log call that has not finished and is idempotent", async () => {
    const l = logger();
    const p = l.logAuthentication(login);
    const first = l.close();
    await p;
    const r1 = await first;
    const r2 = await l.close();
    expect(lines()).toHaveLength(1);
    expect(r1.pending.events).toBe(0);
    expect(r2.pending.events).toBe(0);
  });

  test("verifyIntegrity still passes after close", async () => {
    const l = logger();
    await l.logAuthentication(login);
    await l.logAuthentication(login);
    await l.close();
    const v = await l.verifyIntegrity();
    expect(v.integrityBreaks).toEqual([]);
  });
});
