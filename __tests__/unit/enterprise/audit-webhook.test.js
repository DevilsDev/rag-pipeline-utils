/**
 * AuditLogger webhook: events written to the log are also POSTed to
 * webhookUrl (HTTPS, or http for localhost), with a timeout, optional
 * headers, retries on later flushes, and a `webhook_failed` event. A failing
 * webhook never blocks the log file or the chain, and the events are never
 * written to the log output.
 */

const fs = require("fs");
const http = require("http");
const os = require("os");
const path = require("path");
const { AuditLogger } = require("../../../src/enterprise/audit-logging");
const { logger: log } = require("../../../src/utils/logger");

// The test starts its own local server; the suite blocks other requests
beforeAll(() => {
  jest.useRealTimers();
  globalThis.__ALLOW_LOOPBACK_HTTP__ = true;
});
afterAll(() => {
  delete globalThis.__ALLOW_LOOPBACK_HTTP__;
});

let dir;
let server;
let received;
let mode;

beforeEach(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "audit-hook-"));
  received = [];
  mode = { status: 200, hang: false, failFirst: 0, redirect: false };
  server = http.createServer((req, res) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      received.push({
        headers: req.headers,
        url: req.url,
        body: body ? JSON.parse(body) : null,
        status: null,
      });
      const entry = received[received.length - 1];
      if (mode.hang) return;
      if (mode.redirect) {
        entry.status = 302;
        res.writeHead(302, { Location: "http://127.0.0.1:1/elsewhere" });
        return res.end();
      }
      if (mode.failFirst > 0) {
        mode.failFirst -= 1;
        entry.status = 500;
        res.writeHead(500);
        return res.end();
      }
      entry.status = mode.status;
      res.writeHead(mode.status);
      res.end("ok");
    });
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  server.url = `http://127.0.0.1:${server.address().port}/audit`;
});

afterEach(async () => {
  jest.restoreAllMocks();
  server.closeAllConnections();
  await new Promise((r) => server.close(r));
  fs.rmSync(dir, { recursive: true, force: true });
});

function logger(extra = {}) {
  const l = new AuditLogger({
    logDir: dir,
    encryption: false,
    signingKey: "k".repeat(64),
    webhookUrl: server.url,
    ...extra,
  });
  l.on("webhook_failed", () => {});
  return l;
}

const event = (n) => ({
  _userId: `user-${n}`,
  _tenantId: "t1",
  method: "password",
  result: "success",
});

const accepted = () => received.filter((r) => r.status === 200);
const sequences = (list) =>
  list.flatMap((r) => r.body.events.map((e) => e.sequence));

async function until(fn, ms = 3000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (await fn()) return;
    await new Promise((r) => setTimeout(r, 10));
  }
  throw new Error("timed out waiting");
}

describe("webhookUrl", () => {
  test("posts the written events as JSON, in order", async () => {
    const l = logger();
    for (let i = 1; i <= 3; i++) await l.logAuthentication(event(i));
    await l.close();
    expect(received.length).toBeGreaterThan(0);
    expect(received[0].headers["content-type"]).toMatch(/application\/json/);
    expect(received[0].url).toBe("/audit");
    expect(sequences(accepted())).toEqual([1, 2, 3]);
    expect(received[0].body.events[0]).toMatchObject({
      userId: "user-1",
      tenantId: "t1",
      integrityVersion: 3,
    });
  });

  test("sends the configured headers but cannot replace the content type", async () => {
    const l = logger({
      webhookHeaders: {
        Authorization: "Bearer abc",
        "Content-Type": "text/plain",
      },
    });
    await l.logAuthentication(event(1));
    await l.close();
    expect(received[0].headers.authorization).toBe("Bearer abc");
    expect(received[0].headers["content-type"]).toMatch(/application\/json/);
  });

  test("the log file and the chain are written whether or not the webhook works", async () => {
    mode.status = 500;
    const l = logger();
    await l.logAuthentication(event(1));
    await l.logAuthentication(event(2));
    await l.close();
    const v = await l.verifyIntegrity();
    expect(v).toMatchObject({ verified: true, totalLogs: 2 });
  });

  test("requires https, but allows http for localhost", () => {
    const make = (webhookUrl) =>
      new AuditLogger({
        logDir: dir,
        encryption: false,
        realtimeEnabled: false,
        webhookUrl,
      });
    expect(() => make("http://example.com/audit")).toThrow(/https/);
    expect(() => make("ftp://example.com/audit")).toThrow(/https/);
    expect(() => make("not a url")).toThrow(/webhookUrl/);
    expect(() => make("https://example.com/audit")).not.toThrow();
    expect(() => make("http://localhost:9/audit")).not.toThrow();
    expect(() => make("http://127.0.0.1:9/audit")).not.toThrow();
    expect(() => make("http://[::1]:9/audit")).not.toThrow();
  });

  test("a bad header value is a configuration error", () => {
    expect(
      () =>
        new AuditLogger({
          logDir: dir,
          realtimeEnabled: false,
          webhookUrl: server.url,
          webhookHeaders: { "X-Key": 5 },
        }),
    ).toThrow(/webhookHeaders/);
  });
});

describe("webhook failures", () => {
  test("a failed delivery emits webhook_failed, is retried on a later flush and arrives once", async () => {
    mode.failFirst = 1;
    const l = logger({ webhookRetryMs: 20 });
    const failures = [];
    l.on("webhook_failed", (e) => failures.push(e));
    await l.logAuthentication(event(1));
    await l.logAuthentication(event(2));
    await l._flushLogs();
    await until(() => failures.length === 1);
    expect(failures[0]).toMatchObject({ count: 2 });
    expect(failures[0].error).toMatch(/500/);
    await new Promise((r) => setTimeout(r, 40));
    await l.logAuthentication(event(3));
    await l._flushLogs();
    await until(() => sequences(accepted()).includes(3));
    expect(sequences(accepted())).toEqual([1, 2, 3]);
    expect(failures).toHaveLength(1);
  });

  test("a slow endpoint times out without blocking the log file", async () => {
    mode.hang = true;
    const l = logger({ webhookTimeoutMs: 100 });
    const failures = [];
    l.on("webhook_failed", (e) => failures.push(e));
    const started = Date.now();
    await l.logAuthentication(event(1));
    await l._flushLogs();
    expect(Date.now() - started).toBeLessThan(80);
    expect(fs.readdirSync(path.join(dir, "daily"))).toHaveLength(1);
    await until(() => failures.length === 1);
    expect(failures[0].error).toMatch(/timed out/);
  });

  test("a redirect is a failure, not followed", async () => {
    mode.redirect = true;
    const l = logger();
    const failures = [];
    l.on("webhook_failed", (e) => failures.push(e));
    await l.logAuthentication(event(1));
    await l._flushLogs();
    await until(() => failures.length === 1);
    expect(failures[0].error).toMatch(/302/);
  });

  test("close() reports the events the webhook has not taken", async () => {
    mode.status = 503;
    const l = logger();
    await l.logAuthentication(event(1));
    await l.logAuthentication(event(2));
    const result = await l.close();
    expect(result.pending.webhook).toBe(2);
    expect(result.pending.events).toBe(0);
  });

  test("the events and the URL are never written to the log output", async () => {
    mode.status = 500;
    const warn = jest.spyOn(log, "warn").mockImplementation(() => {});
    const info = jest.spyOn(log, "info").mockImplementation(() => {});
    const debug = jest.spyOn(log, "debug").mockImplementation(() => {});
    const error = jest.spyOn(log, "error").mockImplementation(() => {});
    const l = logger({
      webhookUrl: server.url + "?token=URL-SECRET",
      webhookHeaders: { Authorization: "Bearer HEADER-SECRET" },
    });
    await l.logAuthentication({ ...event(1), _userId: "PAYLOAD-SECRET" });
    await l.close();
    const output = JSON.stringify(
      [warn, info, debug, error].map((m) => m.mock.calls),
    );
    expect(output).not.toContain("PAYLOAD-SECRET");
    expect(output).not.toContain("URL-SECRET");
    expect(output).not.toContain("HEADER-SECRET");
    expect(warn.mock.calls.some((c) => /webhook/i.test(String(c[0])))).toBe(
      true,
    );
  });

  test("the webhook queue is bounded by memoryLimit", async () => {
    mode.hang = true;
    const l = logger({ memoryLimit: 3, webhookTimeoutMs: 5000 });
    const dropped = [];
    l.on("events_dropped", (d) => dropped.push(d));
    for (let i = 1; i <= 6; i++) {
      await l.logAuthentication(event(i));
      await l._flushLogs();
    }
    expect(l._webhookQueue.length).toBeLessThanOrEqual(3);
    expect(dropped.some((d) => d.stage === "webhook")).toBe(true);
  });
});
