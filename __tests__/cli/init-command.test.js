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

  /** Run handleInit as if at a terminal, answering from a script. */
  async function interactiveInit(options, script) {
    const isTTY = process.stdin.isTTY;
    process.stdin.isTTY = true;
    const asked = [];
    const prompt = async ([question]) => {
      asked.push(question.name);
      const value =
        question.name in script ? script[question.name] : question.default;
      return { [question.name]: value };
    };
    try {
      await handleInit(
        {},
        { output, ...options },
        { prompt, env: {}, log: () => {} },
      );
    } finally {
      process.stdin.isTTY = isTTY;
    }
    return asked;
  }

  test("runs the setup wizard in interactive mode", async () => {
    const asked = await interactiveInit(
      { template: "local" },
      { embedder: "openai", llm: "anthropic", indexPath: "i.json" },
    );

    expect(asked).toEqual(
      expect.arrayContaining(["embedder", "llm", "retriever", "confirmWrite"]),
    );
    const config = JSON.parse(fs.readFileSync(output, "utf8"));
    expect(config.pipeline.map((p) => p.name)).toEqual([
      "auto",
      "openai",
      "file-store",
      "anthropic",
    ]);
    expect(config.pipeline[2].config).toEqual({ path: "i.json" });
    expect(() => buildComponents(config, { configDir: dir })).not.toThrow();
  });

  test("--template sets the wizard defaults", async () => {
    await interactiveInit({ template: "ollama" }, {});

    const names = loadRagConfig(output).pipeline.map((p) => p.name);
    expect(names).toEqual(["auto", "ollama", "file-store", "ollama"]);
  });

  test("declining the preview writes nothing", async () => {
    await interactiveInit({}, { confirmWrite: false });

    expect(process.exitCode).toBeUndefined();
    expect(fs.existsSync(output)).toBe(false);
  });

  test("asks before replacing an existing file and keeps it on no", async () => {
    fs.writeFileSync(output, "{}");

    const asked = await interactiveInit({}, { overwrite: false });

    expect(asked).toEqual(["overwrite"]);
    expect(fs.readFileSync(output, "utf8")).toBe("{}");
    expect(process.exitCode).toBeUndefined();
  });

  test("replaces an existing file when the user agrees", async () => {
    fs.writeFileSync(output, "{}");

    const asked = await interactiveInit({}, { overwrite: true });

    expect(asked[0]).toBe("overwrite");
    expect(loadRagConfig(output).pipeline).toHaveLength(3);
  });

  test("--force skips the overwrite question", async () => {
    fs.writeFileSync(output, "{}");

    const asked = await interactiveInit({ force: true }, {});

    expect(asked).not.toContain("overwrite");
    expect(loadRagConfig(output).pipeline).toHaveLength(3);
  });

  test("refuses to overwrite without --force when not interactive", async () => {
    fs.writeFileSync(output, "{}");

    await handleInit({}, { output, interactive: false });

    expect(process.exitCode).toBe(1);
    expect(fs.readFileSync(output, "utf8")).toBe("{}");
  });

  test("rejects an unknown template", async () => {
    await handleInit({}, { output, interactive: false, template: "nope" });

    expect(process.exitCode).toBe(1);
    expect(fs.existsSync(output)).toBe(false);
  });
});
