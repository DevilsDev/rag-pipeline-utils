/**
 * Tar extraction, security scan, certification checks and the installer,
 * against real files in temp directories.
 */

const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");
const { makeTgz } = require("../../utils/make-tgz");
const { extractTarGz } = require("../../../src/ecosystem/tar-extract");
const { scanPlugin } = require("../../../src/ecosystem/plugin-scanner");
const { runPluginChecks } = require("../../../src/ecosystem/plugin-checks");
const {
  installPlugin,
  listInstalledPlugins,
} = require("../../../src/ecosystem/plugin-installer");
const { PluginHub } = require("../../../src/ecosystem/plugin-hub");

const GOOD_LLM = {
  "package/package.json": JSON.stringify({
    name: "rag-llm-echo",
    version: "1.2.3",
    main: "lib/index.js",
    description: "Echo LLM",
    license: "MIT",
    ragPipeline: { stage: "llm", name: "echo" },
  }),
  "package/lib/index.js":
    "module.exports = class { async generate(q) { return 'echo ' + q; } };",
  "package/README.md": "# Echo\n",
};

describe("plugin installation", () => {
  let dir;
  let configPath;

  beforeAll(() => jest.useRealTimers());

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "plugin-install-"));
    configPath = path.join(dir, ".ragrc.json");
    fs.writeFileSync(
      configPath,
      JSON.stringify({
        pipeline: [{ stage: "embedder", name: "local" }],
      }),
    );
  });

  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

  describe("extractTarGz", () => {
    test("extracts files and strips the package/ prefix", () => {
      const out = path.join(dir, "out");
      const result = extractTarGz(makeTgz(GOOD_LLM), out, { strip: 1 });

      expect(result.files.sort()).toEqual([
        "README.md",
        "lib/index.js",
        "package.json",
      ]);
      expect(fs.readFileSync(path.join(out, "lib/index.js"), "utf8")).toMatch(
        /generate/,
      );
    });

    test("rejects entries that escape the destination", () => {
      const archive = makeTgz({ "package/../../evil.js": "x" });
      expect(() => extractTarGz(archive, path.join(dir, "out"))).toThrow(
        /escapes the destination/,
      );
      expect(fs.existsSync(path.join(dir, "evil.js"))).toBe(false);
    });

    test("skips symlinks", () => {
      const result = extractTarGz(
        makeTgz({
          "package/a.js": "1",
          "package/link": { type: "2", linkname: "/etc/passwd" },
        }),
        path.join(dir, "out"),
        { strip: 1 },
      );
      expect(result.files).toEqual(["a.js"]);
      expect(result.skipped).toEqual(["link"]);
    });
  });

  describe("scanPlugin", () => {
    test("reports risky capabilities with file and line", () => {
      const file = path.join(dir, "p.js");
      fs.writeFileSync(
        file,
        "const x = 1;\nconst cp = require('child_process');\nfetch('https://x');\nprocess.env.KEY;\n",
      );

      const { findings, counts } = scanPlugin(file);

      expect(counts).toEqual({ high: 1, medium: 1, low: 1 });
      expect(findings.find((f) => f.rule === "child-process").line).toBe(2);
    });
  });

  describe("installPlugin", () => {
    test("installs a .tgz, registers it and lists it", async () => {
      const tgz = path.join(dir, "echo.tgz");
      fs.writeFileSync(tgz, makeTgz(GOOD_LLM));

      const result = await installPlugin({ source: tgz, configPath });

      expect(result).toMatchObject({
        stage: "llm",
        name: "echo",
        version: "1.2.3",
        entry: "./.rag/plugins/llm-echo/lib/index.js",
        methods: ["generate"],
        inPipeline: false,
      });
      const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
      expect(config.plugins.llm.echo).toBe(result.entry);
      expect(listInstalledPlugins(configPath)).toEqual([
        expect.objectContaining({
          name: "echo",
          installed: true,
          exists: true,
        }),
      ]);
      // staging directories are cleaned up
      expect(fs.readdirSync(path.join(dir, ".rag", "plugins"))).toEqual([
        "llm-echo",
      ]);
    });

    test("blocks high-risk code unless allowed", async () => {
      const file = path.join(dir, "risky.js");
      fs.writeFileSync(
        file,
        "eval('1');\nmodule.exports = { generate() { return 'x'; } };",
      );
      const params = { source: file, configPath, stage: "llm", name: "risky" };

      await expect(installPlugin(params)).rejects.toThrow(/high-risk/);
      expect(fs.existsSync(path.join(dir, ".rag/plugins/llm-risky"))).toBe(
        false,
      );

      const result = await installPlugin({ ...params, allowRisky: true });
      expect(result.scan.counts.high).toBe(1);
    });

    test("rejects a module missing the stage's methods", async () => {
      const file = path.join(dir, "bad.js");
      fs.writeFileSync(file, "module.exports = { notGenerate() {} };");

      await expect(
        installPlugin({ source: file, configPath, stage: "llm", name: "bad" }),
      ).rejects.toThrow(/missing method\(s\): generate/);
    });

    test("requires --force to replace an installed plugin", async () => {
      const tgz = path.join(dir, "echo.tgz");
      fs.writeFileSync(tgz, makeTgz(GOOD_LLM));
      await installPlugin({ source: tgz, configPath });

      await expect(installPlugin({ source: tgz, configPath })).rejects.toThrow(
        /already installed/,
      );
      await expect(
        installPlugin({ source: tgz, configPath, force: true }),
      ).resolves.toMatchObject({ name: "echo" });
    });
  });

  describe("PluginHub.installPlugin from a registry", () => {
    function hubServing(archive, sha256) {
      const responses = {
        "/plugins/echo": { id: "echo", certified: true, checksums: { sha256 } },
        "/plugins/echo/download": { downloadUrl: "https://cdn.test/echo.tgz" },
      };
      const fetch = async (url) => {
        const { pathname } = new URL(url);
        if (pathname === "/echo.tgz") {
          return { ok: true, arrayBuffer: async () => archive };
        }
        return { ok: true, json: async () => responses[pathname] };
      };
      return new PluginHub({ registryUrl: "https://registry.test", fetch });
    }

    test("verifies the checksum and installs", async () => {
      const archive = makeTgz(GOOD_LLM);
      const sha256 = crypto.createHash("sha256").update(archive).digest("hex");

      const result = await hubServing(archive, sha256).installPlugin(
        "echo",
        "latest",
        { configPath },
      );

      expect(result.success).toBe(true);
      expect(result.version).toBe("1.2.3");
      expect(
        fs.existsSync(path.join(dir, ".rag/plugins/llm-echo/lib/index.js")),
      ).toBe(true);
    });

    test("refuses a download whose checksum does not match", async () => {
      const hub = hubServing(makeTgz(GOOD_LLM), "0".repeat(64));

      await expect(
        hub.installPlugin("echo", "latest", { configPath }),
      ).rejects.toThrow(/integrity verification failed/);
      expect(fs.existsSync(path.join(dir, ".rag/plugins/llm-echo"))).toBe(
        false,
      );
    });
  });

  describe("runPluginChecks", () => {
    test("scores contract, security, tests and docs from real files", async () => {
      const pluginDir = path.join(dir, "plugin");
      extractTarGz(makeTgz(GOOD_LLM), pluginDir, { strip: 1 });
      fs.mkdirSync(path.join(pluginDir, "test"));
      fs.writeFileSync(path.join(pluginDir, "test", "echo.test.js"), "");

      const report = await runPluginChecks(pluginDir);
      const scores = Object.fromEntries(
        report.checks.map((c) => [c.id, c.score]),
      );

      expect(scores).toEqual({
        contract: 100,
        security: 100,
        tests: 60, // test files but no test script
        documentation: 80, // README (short), description, license
      });
      expect(report.score).toBe(
        Math.round((100 * 35 + 100 * 30 + 60 * 15 + 80 * 20) / 100),
      );
      expect(report.level).toBe("VERIFIED");
      expect(report.pendingReview).toBe("manual review");
    });

    test("a failing contract never reaches a level", async () => {
      const file = path.join(dir, "bad.js");
      fs.writeFileSync(file, "module.exports = {};");

      const report = await runPluginChecks(file, { stage: "llm" });

      expect(report.checks[0].score).toBe(0);
      expect(report.level).toBeNull();
    });
  });
});
