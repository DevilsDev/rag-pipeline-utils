/**
 * The plugin contracts must be inside the bundle: @devilsdev/rag-core ships
 * dist/ only, so a registry that reads contracts/ from disk checks nothing
 * there. The registry is bundled alone into a directory with no contracts/
 * anywhere near it and must still reject a plugin that breaks its contract.
 */
const fs = require("fs");
const os = require("os");
const path = require("path");
const esbuild = require("esbuild");

describe("plugin contracts in a bundled registry", () => {
  let dir;
  let PluginRegistry;

  beforeAll(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "rpu-contracts-"));
    const outfile = path.join(dir, "dist", "registry.cjs");
    esbuild.buildSync({
      entryPoints: [
        path.join(__dirname, "../../../src/core/plugin-registry.js"),
      ],
      bundle: true,
      platform: "node",
      format: "cjs",
      outfile,
      logLevel: "silent",
      external: ["pino-pretty", "@opentelemetry/api"],
    });
    // eslint-disable-next-line global-require
    ({ PluginRegistry } = require(outfile));
  });

  afterAll(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("has no contracts directory beside the bundle", () => {
    expect(fs.existsSync(path.join(dir, "contracts"))).toBe(false);
    expect(fs.existsSync(path.join(dir, "dist", "contracts"))).toBe(false);
  });

  it("rejects an llm plugin that breaks the contract", async () => {
    const registry = new PluginRegistry({});
    await expect(
      registry.register("llm", "broken", {
        metadata: { name: "broken", version: "1.0.0", type: "llm" },
        notGenerate() {},
      }),
    ).rejects.toThrow(/generate/);
    expect(registry.list("llm")).toEqual([]);
  });

  it("accepts an llm plugin that follows the contract", async () => {
    const registry = new PluginRegistry({});
    await registry.register("llm", "ok", {
      metadata: { name: "ok", version: "1.0.0", type: "llm" },
      async generate() {
        return "x";
      },
    });
    expect(registry.list("llm")).toContain("ok");
  });
});

describe("bundled contracts", () => {
  it("equal the JSON files in contracts/", () => {
    const bundled = require("../../../src/core/bundled-contracts");
    const dirOf = path.join(__dirname, "../../../contracts");
    const read = (f) =>
      JSON.parse(fs.readFileSync(path.join(dirOf, f), "utf8"));
    expect(bundled.schema).toEqual(read("contract-schema.json"));
    for (const type of Object.keys(bundled.contracts)) {
      expect(bundled.contracts[type]).toEqual(read(`${type}-contract.json`));
    }
    expect(Object.keys(bundled.contracts).sort()).toEqual([
      "embedder",
      "llm",
      "loader",
      "reranker",
      "retriever",
    ]);
  });
});
