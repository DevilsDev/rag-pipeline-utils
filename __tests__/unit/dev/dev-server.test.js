/**
 * DevServer HTTP API: real server on a free port, injected query handler.
 */

const { DevServer } = require("../../../src/dev/dev-server");

const { httpRequest } = require("../../utils/http-request");

function request(server, method, path, { body, type } = {}) {
  return httpRequest(`${server.url}${path}`, {
    method,
    headers: type ? { "content-type": type } : {},
    body,
  });
}

describe("DevServer HTTP API", () => {
  let server;
  // Plain function: jest config resets jest.fn implementations between tests
  let failNext = null;
  const query = async ({ question, topK }) => {
    if (failNext) {
      const error = failNext;
      failNext = null;
      throw error;
    }
    return { answer: `echo: ${question}`, topK };
  };

  beforeAll(async () => {
    jest.useRealTimers();
    globalThis.__ALLOW_LOOPBACK_HTTP__ = true; // talks to its own server
    server = new DevServer({
      port: 0,
      query,
      verbose: false,
      autoReload: false,
    });
    await server.start();
  });

  afterAll(async () => {
    globalThis.__ALLOW_LOOPBACK_HTTP__ = false;
    await server.stop();
  });

  test("binds to 127.0.0.1 on a real port", () => {
    expect(server.url).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);
    expect(server.getStatus().url).toBe(server.url);
  });

  test("GET /health", async () => {
    const res = await request(server, "GET", "/health");
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("ok");
  });

  test("POST /query passes question and topK to the handler", async () => {
    const res = await request(server, "POST", "/query", {
      type: "application/json",
      body: JSON.stringify({ question: "hi", topK: 2 }),
    });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ answer: "echo: hi", topK: 2 });
  });

  test.each([
    ["missing question", JSON.stringify({}), "application/json", 400],
    [
      "bad topK",
      JSON.stringify({ question: "q", topK: 0 }),
      "application/json",
      400,
    ],
    ["invalid JSON", "{nope", "application/json", 400],
    ["non-JSON content type", "question=q", "text/plain", 415],
    [
      "oversized body",
      JSON.stringify({ question: "x".repeat(70000) }),
      "application/json",
      413,
    ],
  ])("rejects %s", async (_label, body, type, status) => {
    const res = await request(server, "POST", "/query", { body, type });
    expect(res.status).toBe(status);
    expect(res.body.error).toBeTruthy();
  });

  test("wrong method and unknown routes", async () => {
    expect((await request(server, "GET", "/query")).status).toBe(405);
    expect((await request(server, "POST", "/health")).status).toBe(405);
    expect((await request(server, "GET", "/etc/passwd")).status).toBe(404);
  });

  test("handler errors become 500 with a message", async () => {
    failNext = new Error("index is empty");
    const res = await request(server, "POST", "/query", {
      type: "application/json",
      body: JSON.stringify({ question: "q" }),
    });
    expect(res.status).toBe(500);
    expect(res.body.error).toBe("index is empty");
  });

  test("sends no CORS headers", async () => {
    const res = await request(server, "GET", "/health");
    expect(res.headers["access-control-allow-origin"]).toBeUndefined();
  });

  test("rejects a foreign Host header (DNS rebinding)", async () => {
    const res = await httpRequest(`${server.url}/health`, {
      headers: { host: "attacker.example:80" },
    });
    expect(res.status).toBe(403);
  });

  test("accepts localhost as the Host header", async () => {
    const res = await httpRequest(`${server.url}/health`, {
      headers: { host: `localhost:${server.port}` },
    });
    expect(res.status).toBe(200);
  });
});

describe("DevServer request and option handling", () => {
  let server;
  let calls = 0;

  beforeAll(async () => {
    jest.useRealTimers();
    globalThis.__ALLOW_LOOPBACK_HTTP__ = true;
    server = new DevServer({
      port: 0,
      query: async ({ question }) => {
        calls++;
        return { answer: question };
      },
      verbose: false,
      autoReload: false,
    });
    await server.start();
  });

  afterAll(async () => {
    globalThis.__ALLOW_LOOPBACK_HTTP__ = false;
    await server.stop();
  });

  test.each([
    "text/plain; x=application/json",
    "text/plain;application/json",
    "application/jsonp",
    "multipart/form-data; boundary=application/json",
  ])("POST /query rejects the media type %s", async (type) => {
    calls = 0;
    const res = await request(server, "POST", "/query", {
      type,
      body: JSON.stringify({ question: "hi" }),
    });
    expect(res.status).toBe(415);
    expect(calls).toBe(0);
  });

  test.each(["application/json; charset=utf-8", "Application/JSON"])(
    "POST /query accepts the media type %s",
    async (type) => {
      const res = await request(server, "POST", "/query", {
        type,
        body: JSON.stringify({ question: "hi" }),
      });
      expect(res.status).toBe(200);
    },
  );

  test("host and port passed as undefined get their defaults", () => {
    const s = new DevServer({
      host: undefined,
      port: undefined,
      verbose: false,
      autoReload: false,
    });
    expect(s.options.host).toBe("127.0.0.1");
    expect(s.options.port).toBe(3000);
  });
});

describe("DevServer Host check on every loopback name", () => {
  const { httpRequest: raw } = require("../../utils/http-request");

  beforeAll(() => {
    jest.useRealTimers();
    globalThis.__ALLOW_LOOPBACK_HTTP__ = true;
  });
  afterAll(() => {
    globalThis.__ALLOW_LOOPBACK_HTTP__ = false;
  });

  test.each(["LOCALHOST"])(
    "bound to %s, a request for another host name is refused",
    async (host) => {
      const s = new DevServer({
        host,
        port: 0,
        query: async () => ({ answer: "a" }),
        verbose: false,
        autoReload: false,
      });
      await s.start();
      try {
        const url = `http://${host.toLowerCase()}:${s.port}/health`;
        const ok = await raw(url, { method: "GET" });
        expect(ok.status).toBe(200);
        const other = await raw(url, {
          method: "GET",
          headers: { host: "attacker.example" },
        });
        expect(other.status).toBe(403);
      } finally {
        await s.stop();
      }
    },
  );

  test.each(["127.0.0.2", "::ffff:127.0.0.1", "[::1]", "0:0:0:0:0:0:0:1"])(
    "bound to %s, the Host check applies",
    async (host) => {
      const s = new DevServer({ host, verbose: false, autoReload: false });
      const status = (headers) =>
        s._handleRequest({ method: "GET", url: "/health", headers }, {});
      s._send = (_res, code) => code;
      expect(await status({ host: "attacker.example" })).toBe(403);
      expect(await status({ host: "127.0.0.2:3000" })).toBe(200);
      expect(await status({ host: "[::1]:3000" })).toBe(200);
    },
  );
});
