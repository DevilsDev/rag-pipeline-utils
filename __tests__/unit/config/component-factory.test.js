const fs = require("fs");
const os = require("os");
const path = require("path");
const { buildComponents } = require("../../../src/config/component-factory");

describe("buildComponents", () => {
  test("builds built-in components and resolves the index path", () => {
    const components = buildComponents(
      {
        pipeline: [
          { stage: "embedder", name: "local" },
          {
            stage: "retriever",
            name: "file-store",
            config: { path: "x.json" },
          },
        ],
      },
      { configDir: "/project" },
    );

    expect(components.embedder.constructor.name).toBe("LocalEmbedder");
    expect(components.retriever.path).toBe(path.resolve("/project", "x.json"));
    expect(components.names).toEqual({
      embedder: "local",
      retriever: "file-store",
    });
  });

  test("loads a custom plugin module relative to the config", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "factory-"));
    fs.writeFileSync(
      path.join(dir, "llm.js"),
      "module.exports = class { constructor(c) { this.c = c; } generate() {} };",
    );

    const { llm } = buildComponents(
      {
        pipeline: [{ stage: "llm", name: "mine", config: { temp: 1 } }],
        plugins: { llm: { mine: "./llm.js" } },
      },
      { configDir: dir },
    );

    expect(llm.c).toEqual({ temp: 1 });
    fs.rmSync(dir, { recursive: true, force: true });
  });

  test("explains unknown component names", () => {
    expect(() =>
      buildComponents({ pipeline: [{ stage: "embedder", name: "nope" }] }),
    ).toThrow(/Unknown embedder "nope"\. Built-in embedders: local, openai/);
  });

  test("rejects unknown stages", () => {
    expect(() =>
      buildComponents({ pipeline: [{ stage: "magic", name: "x" }] }),
    ).toThrow(/Unknown pipeline stage "magic"/);
  });
});
