/**
 * `rag-pipeline hub` against a local registry: commands need an explicit
 * registry, report network failures with exit 1, and print real results.
 */

const http = require("http");
const path = require("path");
const { spawn } = require("child_process");

const CLI = path.resolve(__dirname, "../../bin/cli.js");

const fs = require("fs");
const os = require("os");
const crypto = require("crypto");
const { makeTgz } = require("../utils/make-tgz");

const ECHO_PLUGIN = makeTgz({
  "package/package.json": JSON.stringify({
    name: "rag-llm-echo",
    version: "2.0.0",
    description: "Echo LLM",
    license: "MIT",
    ragPipeline: { stage: "llm", name: "echo" },
  }),
  "package/index.js":
    "module.exports = class { async generate(q, docs) { return 'echo: ' + q; } };",
  "package/README.md": "# Echo",
});
const ECHO_SHA = crypto.createHash("sha256").update(ECHO_PLUGIN).digest("hex");

function cli(...args) {
  return cliIn(undefined, ...args);
}

function cliIn(cwd, ...args) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [CLI, ...args], {
      cwd,
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
      const tampered = req.url.startsWith("/plugins/tampered");
      if (/^\/plugins\/(echo|tampered)(\?|$)/.test(req.url)) {
        res.end(
          JSON.stringify({
            id: tampered ? "tampered" : "echo",
            checksums: { sha256: tampered ? "0".repeat(64) : ECHO_SHA },
          }),
        );
      } else if (/^\/plugins\/(echo|tampered)\/download/.test(req.url)) {
        res.end(JSON.stringify({ downloadUrl: `${registry}/files/echo.tgz` }));
      } else if (req.url === "/files/echo.tgz") {
        res.setHeader("content-type", "application/gzip");
        res.end(ECHO_PLUGIN);
      } else if (req.url.startsWith("/plugins/search")) {
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

  describe("install, list and certify in a project", () => {
    let dir;

    beforeEach(async () => {
      dir = fs.mkdtempSync(path.join(os.tmpdir(), "rag-hub-"));
      expect((await cliIn(dir, "init", "--no-interactive")).code).toBe(0);
    });

    afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

    test("installs a local .tgz and lists it", async () => {
      fs.writeFileSync(path.join(dir, "echo.tgz"), ECHO_PLUGIN);

      const install = await cliIn(dir, "hub", "install", "echo.tgz");
      const list = await cliIn(dir, "hub", "list");

      expect(install.code).toBe(0);
      expect(install.out).toContain('Installed llm plugin "echo" 2.0.0');
      expect(list.out).toMatch(
        /llm\/echo .*installed 2\.0\.0, not in pipeline/,
      );
    });

    test("installs from the registry after verifying the checksum", async () => {
      const result = await cliIn(
        dir,
        "hub",
        "--registry",
        registry,
        "install",
        "echo",
      );

      expect(result.code).toBe(0);
      expect(result.out).toContain("(registry)");
      const config = JSON.parse(
        fs.readFileSync(path.join(dir, ".ragrc.json"), "utf8"),
      );
      expect(config.plugins.llm.echo).toBe("./.rag/plugins/llm-echo/index.js");
    });

    test("refuses a registry download with a mismatched checksum", async () => {
      const result = await cliIn(
        dir,
        "hub",
        "--registry",
        registry,
        "install",
        "tampered",
      );

      expect(result.code).toBe(1);
      expect(result.err).toMatch(/integrity verification failed/);
      expect(fs.existsSync(path.join(dir, ".rag", "plugins", "llm-echo"))).toBe(
        false,
      );
    });

    test("the installed plugin answers queries once added to the pipeline", async () => {
      fs.writeFileSync(path.join(dir, "echo.tgz"), ECHO_PLUGIN);
      await cliIn(dir, "hub", "install", "echo.tgz");
      const configPath = path.join(dir, ".ragrc.json");
      const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
      config.pipeline.push({ stage: "llm", name: "echo" });
      fs.writeFileSync(configPath, JSON.stringify(config));
      fs.mkdirSync(path.join(dir, "docs"));
      fs.writeFileSync(
        path.join(dir, "docs", "a.txt"),
        "Vacation is twenty days.",
      );

      await cliIn(dir, "ingest", "docs");
      const query = await cliIn(dir, "query", "vacation");

      expect(query.code).toBe(0);
      expect(query.out).toContain("echo: vacation");
    });

    test("certify check scores a local plugin", async () => {
      fs.writeFileSync(path.join(dir, "echo.tgz"), ECHO_PLUGIN);
      await cliIn(dir, "hub", "install", "echo.tgz");

      const result = await cliIn(
        dir,
        "hub",
        "certify",
        "check",
        ".rag/plugins/llm-echo",
        "--json",
      );
      const report = JSON.parse(result.out);

      expect(result.code).toBe(0);
      expect(report.checks.map((c) => c.id)).toEqual([
        "contract",
        "security",
        "tests",
        "documentation",
      ]);
      // contract 100*35 + security 100*30 + tests 0*15 + docs 80*20 => 81
      expect(report.score).toBe(81);
      expect(report.level).toBe("VERIFIED");
      expect(report.pendingReview).toBe("manual review");
    });
  });
});
