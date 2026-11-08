/**
 * The install scan covers the package entry file and the files it loads,
 * whatever their extension, and the contract probe runs with a minimal
 * environment.
 */

const fs = require("fs");
const os = require("os");
const path = require("path");

const FIXTURE = path.join(
  __dirname,
  "..",
  "..",
  "fixtures",
  "plugin-entry-scan",
  "pkg",
);

describe("plugin entry scanning", () => {
  let dir;
  let configPath;

  beforeAll(() => jest.useRealTimers());

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "plugin-entry-scan-"));
    configPath = path.join(dir, ".ragrc.json");
    fs.writeFileSync(configPath, JSON.stringify({ pipeline: [] }));
  });

  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

  test("scanPlugin scans an entry file with a non-source extension", () => {
    const { scanPlugin } = require("../../../src/ecosystem/plugin-scanner");

    const { findings, filesScanned } = scanPlugin(FIXTURE, {
      entry: path.join(FIXTURE, "lib.dat"),
    });

    expect(filesScanned).toBe(1);
    expect(findings.map((f) => f.rule)).toContain("child-process");
    expect(findings.find((f) => f.rule === "child-process").file).toBe(
      "lib.dat",
    );
  });

  test("scanPlugin follows relative requires to files with other extensions", () => {
    const { scanPlugin } = require("../../../src/ecosystem/plugin-scanner");
    const pkg = path.join(dir, "pkg");
    fs.mkdirSync(pkg);
    fs.writeFileSync(
      path.join(pkg, "index.js"),
      "module.exports = require('./impl.txt');\n",
    );
    fs.writeFileSync(path.join(pkg, "impl.txt"), "eval('1');\n");
    fs.writeFileSync(path.join(pkg, "notes.txt"), "eval('not loaded');\n");

    const { findings } = scanPlugin(pkg, { entry: path.join(pkg, "index.js") });

    expect(findings.map((f) => `${f.rule}:${f.file}`)).toEqual([
      "eval:impl.txt",
    ]);
  });

  test("a risky entry with an unusual extension blocks the install", async () => {
    const {
      installPlugin,
    } = require("../../../src/ecosystem/plugin-installer");

    await expect(
      installPlugin({ source: FIXTURE, configPath }),
    ).rejects.toThrow(/high-risk/);
    expect(fs.existsSync(path.join(dir, ".rag/plugins/llm-datentry"))).toBe(
      false,
    );

    const result = await installPlugin({
      source: FIXTURE,
      configPath,
      allowRisky: true,
    });
    expect(result.scan.counts.high).toBe(1);
    expect(result.entry).toBe("./.rag/plugins/llm-datentry/lib.dat");
  });

  test("hub certify scans an entry file with a non-source extension", async () => {
    const { runPluginChecks } = require("../../../src/ecosystem/plugin-checks");

    const report = await runPluginChecks(FIXTURE);
    const security = report.checks.find((c) => c.id === "security");

    expect(security.score).toBeLessThan(100);
    expect(security.details).toEqual([
      expect.stringContaining("child_process) (lib.dat:1)"),
    ]);
    expect(report.level).toBeNull();
  });

  test("a plain plugin still installs", async () => {
    const {
      installPlugin,
    } = require("../../../src/ecosystem/plugin-installer");
    const pkg = path.join(dir, "plain");
    fs.mkdirSync(pkg);
    fs.writeFileSync(
      path.join(pkg, "package.json"),
      JSON.stringify({
        name: "rag-llm-plain",
        version: "1.0.0",
        ragPipeline: { stage: "llm", name: "plain" },
      }),
    );
    fs.writeFileSync(
      path.join(pkg, "index.js"),
      "module.exports = class { async generate(q) { return q; } };\n",
    );

    const result = await installPlugin({ source: pkg, configPath });

    expect(result.methods).toEqual(["generate"]);
    expect(result.scan.counts).toEqual({ high: 0, medium: 0, low: 0 });
  });
});

describe("plugin contract probe environment", () => {
  let dir;

  beforeAll(() => jest.useRealTimers());
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "plugin-probe-env-"));
  });
  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

  test("the probe process does not see parent environment variables", () => {
    const file = path.join(dir, "index.js");
    fs.writeFileSync(
      file,
      [
        "class P { async generate() {} }",
        "if (process.env.RAG_TEST_SECRET) P.prototype.sawSecret = function () {};",
        "if (process.env.PATH) P.prototype.sawPath = function () {};",
        "module.exports = P;",
      ].join("\n"),
    );
    // Jest gives tests a copy of process.env, so run the probe from a real
    // process that has the variable set.
    const probeModule = path.resolve(
      __dirname,
      "../../../src/ecosystem/plugin-probe",
    );
    const runner = `require(process.argv[1]).probeContract(process.argv[2], 'llm').then((r) => process.stdout.write(JSON.stringify(r)))`;
    const out = require("child_process").execFileSync(
      process.execPath,
      ["-e", runner, probeModule, file],
      { env: { ...process.env, RAG_TEST_SECRET: "value-from-parent" } },
    );
    const result = JSON.parse(out.toString());

    expect(result.ok).toBe(true);
    expect(result.methods).toContain("generate");
    expect(result.methods).not.toContain("sawSecret");
    expect(result.methods).toContain("sawPath");
  });

  test("probeEnvironment keeps only PATH on POSIX", () => {
    const { probeEnvironment } = require("../../../src/ecosystem/plugin-probe");
    const source = {
      PATH: "/bin",
      HOME: "/home/x",
      NODE_OPTIONS: "--require x",
      NODE_PATH: "/n",
      SystemRoot: "/x",
      TEMP: "/tmp",
      SECRET: "s",
    };

    expect(probeEnvironment("linux", source)).toEqual({ PATH: "/bin" });
  });

  test("probeEnvironment keeps PATH, SystemRoot and TEMP on Windows", () => {
    const { probeEnvironment } = require("../../../src/ecosystem/plugin-probe");
    const source = {
      PATH: "/x",
      SystemRoot: "/x",
      TEMP: "/x",
      TMP: "/x",
      HOME: "/x",
      USERPROFILE: "/x",
      NODE_OPTIONS: "--require x",
      NODE_PATH: "/x",
      SECRET: "s",
    };

    expect(probeEnvironment("win32", source)).toEqual({
      PATH: "/x",
      SystemRoot: "/x",
      TEMP: "/x",
    });
  });
});
