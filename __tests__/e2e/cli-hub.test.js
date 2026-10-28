/**
 * `rag-pipeline hub` against a local registry: commands need an explicit
 * registry, report network failures with exit 1, and print real results.
 */

const http = require("http");
const path = require("path");
const { spawn } = require("child_process");

const CLI = path.resolve(__dirname, "../../bin/cli.js");

function cli(...args) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [CLI, ...args], {
      env: { ...process.env, NODE_ENV: "test", RAG_PLUGIN_REGISTRY: "" },
    });
    let out = "";
    let err = "";
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (err += d));
    child.on("close", (code) => resolve({ code, out, err }));
  });
}

describe("rag-pipeline hub", () => {
  let server;
  let registry;
  const requests = [];

  beforeAll(async () => {
    jest.useRealTimers();
    server = http.createServer((req, res) => {
      requests.push(req.url);
      res.setHeader("content-type", "application/json");
      if (req.url.startsWith("/plugins/search")) {
        res.end(
          JSON.stringify({
            results: [
              {
                id: "md",
                name: "markdown-pro",
                version: "1.2.0",
                author: "ann",
                rating: 4,
                reviewCount: 3,
                downloadCount: 1200,
                description: "Better markdown loading",
              },
            ],
            total: 1,
            hasMore: false,
          }),
        );
      } else {
        res.statusCode = 404;
        res.end("{}");
      }
    });
    await new Promise((r) => server.listen(0, "127.0.0.1", r));
    registry = `http://127.0.0.1:${server.address().port}`;
  });

  afterAll(() => new Promise((r) => server.close(r)));

  test("search prints results from the configured registry", async () => {
    const result = await cli("hub", "--registry", registry, "search", "md");

    expect(result.code).toBe(0);
    expect(result.out).toContain("markdown-pro");
    expect(requests.some((url) => url.startsWith("/plugins/search"))).toBe(
      true,
    );
  });

  test("an unreachable registry fails with exit 1", async () => {
    const result = await cli(
      "hub",
      "--registry",
      "http://127.0.0.1:9",
      "search",
      "md",
    );

    expect(result.code).toBe(1);
    expect(result.err).toMatch(/Search failed: Plugin search failed/);
  });

  test("certification requirements work without a registry", async () => {
    const result = await cli("hub", "certify", "requirements");

    expect(result.code).toBe(0);
    expect(result.out).toContain("BASIC Certification Requirements");
  });
});
