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
