/**
 * Configuration, plugin and environment checkers against real config files.
 */

const fs = require("fs");
const os = require("os");
const path = require("path");
const {
  checkConfiguration,
} = require("../../../src/cli/diagnostics/config-checker");
const { checkPlugins } = require("../../../src/cli/diagnostics/plugin-checker");
const {
  checkEnvironment,
} = require("../../../src/cli/diagnostics/environment-checker");

const codes = (issues) => issues.map((i) => i.code);

describe("diagnostic checkers", () => {
  let dir;
  let configPath;
  const write = (config) =>
    fs.writeFileSync(
      configPath,
      typeof config === "string" ? config : JSON.stringify(config),
    );

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "doctor-"));
    configPath = path.join(dir, ".ragrc.json");
  });

  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

  const LOCAL = {
    pipeline: [
      { stage: "embedder", name: "local" },
      { stage: "retriever", name: "file-store" },
    ],
  };

  describe("checkConfiguration", () => {
    test("missing file", async () => {
      expect(codes(await checkConfiguration({ configPath }))).toEqual([
        "CONFIG_MISSING",
      ]);
    });

    test("invalid JSON", async () => {
      write("{ nope");
      expect(codes(await checkConfiguration({ configPath }))).toEqual([
        "CONFIG_INVALID_JSON",
      ]);
    });

    test("valid local pipeline only notes the missing llm", async () => {
      write(LOCAL);
      expect(codes(await checkConfiguration({ configPath }))).toEqual([
        "CONFIG_NO_LLM",
      ]);
    });

    test("missing stages and unknown components are errors", async () => {
      write({ pipeline: [{ stage: "embedder", name: "made-up" }] });
      const issues = await checkConfiguration({ configPath });

      expect(codes(issues)).toEqual(
        expect.arrayContaining([
          "CONFIG_STAGE_MISSING",
          "CONFIG_COMPONENT_UNKNOWN",
        ]),
      );
      expect(
        issues.find((i) => i.code === "CONFIG_COMPONENT_UNKNOWN").message,
      ).toMatch(/Unknown embedder "made-up"/);
    });
  });

  describe("checkPlugins", () => {
    test("reports missing and broken plugin modules", async () => {
      fs.writeFileSync(path.join(dir, "broken.js"), "throw new Error('boom');");
      write({
        ...LOCAL,
        plugins: { llm: { gone: "./gone.js", broken: "./broken.js" } },
      });

      const issues = await checkPlugins({ configPath });

      expect(codes(issues)).toEqual(["PLUGIN_MISSING", "PLUGIN_LOAD_FAILED"]);
      expect(issues[1].message).toMatch(/boom/);
    });
  });

  describe("checkEnvironment", () => {
    const saved = process.env.OPENAI_API_KEY;
    afterEach(() => {
      if (saved === undefined) delete process.env.OPENAI_API_KEY;
      else process.env.OPENAI_API_KEY = saved;
    });

    test("requires the API key of the configured provider once", async () => {
      delete process.env.OPENAI_API_KEY;
      write({
        pipeline: [
          { stage: "embedder", name: "openai" },
          { stage: "llm", name: "openai" },
        ],
      });

      const issues = await checkEnvironment({ configPath });

      expect(codes(issues)).toEqual(["ENV_VAR_MISSING"]);
      expect(issues[0].message).toMatch(/OPENAI_API_KEY/);
    });

    test("notes a file-store index that has not been built yet", async () => {
      write(LOCAL);
      expect(codes(await checkEnvironment({ configPath }))).toEqual([
        "INDEX_MISSING",
      ]);
    });
  });
});
