/**
 * Tests for the init command's generated configuration.
 */

const fs = require("fs");
const os = require("os");
const path = require("path");
const { validateRagrc } = require("../../src/config/enhanced-ragrc-schema.js");
const { loadRagConfig } = require("../../src/config/load-config.js");
const { buildComponents } = require("../../src/config/component-factory.js");
const {
  buildInitConfig,
  handleInit,
  TEMPLATES,
} = require("../../src/cli/handlers/init-handler.js");

describe("init configuration", () => {
  test.each(Object.entries(TEMPLATES))(
    "template %s validates and names only built-in components",
    (_name, template) => {
      const config = buildInitConfig(template);

      expect(validateRagrc(config).valid).toBe(true);
      expect(() => buildComponents(config)).not.toThrow();
    },
  );

  test("local template needs no API keys and has no llm stage", () => {
    const config = buildInitConfig(TEMPLATES.local);

    expect(config.pipeline.map((p) => p.name)).toEqual([
      "auto",
      "local",
      "file-store",
    ]);
  });

  test("uses the chosen index path", () => {
    const config = buildInitConfig({
      embedder: "local",
      llm: null,
      indexPath: "data/idx.json",
    });

    expect(config.pipeline[2].config).toEqual({ path: "data/idx.json" });
  });
});

describe("handleInit", () => {
  let dir;
  let output;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "init-"));
    output = path.join(dir, ".ragrc.json");
    process.exitCode = undefined;
    jest.spyOn(console, "log").mockImplementation(() => {});
    jest.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    process.exitCode = undefined;
    jest.restoreAllMocks();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  test("writes a config that loadRagConfig accepts", async () => {
    await handleInit({}, { output, interactive: false });

    expect(process.exitCode).toBeUndefined();
    expect(loadRagConfig(output).pipeline).toHaveLength(3);
  });

  test("uses prompt answers in interactive mode", async () => {
    const isTTY = process.stdin.isTTY;
    process.stdin.isTTY = true;
    const prompt = jest.fn(async () => ({
      embedder: "openai",
      llm: "anthropic",
      indexPath: "i.json",
    }));

    try {
      await handleInit({}, { output, template: "local" }, { prompt });
    } finally {
      process.stdin.isTTY = isTTY;
    }

    expect(prompt).toHaveBeenCalledWith(TEMPLATES.local);
    const names = JSON.parse(fs.readFileSync(output, "utf8")).pipeline.map(
      (p) => p.name,
    );
    expect(names).toEqual(["auto", "openai", "file-store", "anthropic"]);
  });

  test("rejects an unknown template", async () => {
    await handleInit({}, { output, interactive: false, template: "nope" });

    expect(process.exitCode).toBe(1);
    expect(fs.existsSync(output)).toBe(false);
  });
});
