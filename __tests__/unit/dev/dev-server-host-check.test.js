/**
 * DevServer Host check for requests that arrive from a loopback address,
 * whatever address the server is bound to.
 */

const { DevServer } = require("../../../src/dev/dev-server");
const { httpRequest } = require("../../utils/http-request");

describe("DevServer bound to all interfaces", () => {
  let server;

  beforeAll(async () => {
    jest.useRealTimers();
    globalThis.__ALLOW_LOOPBACK_HTTP__ = true; // talks to its own server
    server = new DevServer({
      host: "0.0.0.0",
      port: 0,
      query: async ({ question }) => ({ answer: `echo: ${question}` }),
      verbose: false,
      autoReload: false,
    });
    await server.start();
  });

  afterAll(async () => {
    globalThis.__ALLOW_LOOPBACK_HTTP__ = false;
    await server.stop();
  });

  const get = (headers) =>
    httpRequest(`http://127.0.0.1:${server.port}/health`, {
      method: "GET",
      headers,
    });

  test("refuses a request from 127.0.0.1 for another host name", async () => {
    const res = await get({ host: "other.example" });
    expect(res.status).toBe(403);
  });

  test("refuses a request from 127.0.0.1 for another host name and port", async () => {
    const res = await get({ host: `other.example:${server.port}` });
    expect(res.status).toBe(403);
  });

  test("answers a request from 127.0.0.1 for a loopback name", async () => {
    expect((await get({ host: `127.0.0.1:${server.port}` })).status).toBe(200);
    expect((await get({ host: `localhost:${server.port}` })).status).toBe(200);
    expect((await get({})).status).toBe(200);
  });

  test("refuses a query for another host name too", async () => {
    const res = await httpRequest(`http://127.0.0.1:${server.port}/query`, {
      method: "POST",
      headers: { host: "other.example", "content-type": "application/json" },
      body: JSON.stringify({ question: "q" }),
    });
    expect(res.status).toBe(403);
  });
});

describe("DevServer Host check by the address of the request", () => {
  const handle = async (host, remoteAddress, hostHeader) => {
    const s = new DevServer({ host, verbose: false, autoReload: false });
    s._send = (_res, code) => code;
    return s._handleRequest(
      {
        method: "GET",
        url: "/health",
        headers: { host: hostHeader },
        socket: { remoteAddress },
      },
      {},
    );
  };

  test.each(["127.0.0.1", "127.8.9.10", "::1", "::ffff:127.0.0.1"])(
    "a request from %s for another host name is refused on any bind host",
    async (remote) => {
      for (const bind of ["0.0.0.0", "::", "192.0.2.10"]) {
        expect(await handle(bind, remote, "other.example")).toBe(403);
        expect(await handle(bind, remote, "localhost:3000")).toBe(200);
      }
    },
  );

  test.each(["192.0.2.55", "2001:db8::1", "::ffff:192.0.2.55", undefined])(
    "a request from %s to a server bound to all interfaces keeps the old behaviour",
    async (remote) => {
      expect(await handle("0.0.0.0", remote, "other.example")).toBe(200);
    },
  );

  test("a server bound to loopback still checks every request", async () => {
    expect(await handle("127.0.0.1", "192.0.2.55", "other.example")).toBe(403);
    expect(await handle("127.0.0.1", undefined, "other.example")).toBe(403);
  });
});
