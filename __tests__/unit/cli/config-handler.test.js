/**
 * `rag-pipeline config set`: values are merged into the config file without
 * touching Object.prototype.
 */

const fs = require("fs");
const os = require("os");
const path = require("path");
const { handleConfigSet } = require("../../../src/cli/handlers/config-handler");

describe("handleConfigSet", () => {
  let dir;
  let config;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "config-set-"));
    config = path.join(dir, ".ragrc.json");
    fs.writeFileSync(config, JSON.stringify({ pipeline: { llm: "a" } }));
    jest.spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
    jest.restoreAllMocks();
  });

  const read = () => JSON.parse(fs.readFileSync(config, "utf8"));

  test("merges a nested JSON value", async () => {
    await handleConfigSet({ config }, "pipeline.retriever", '{"topK":5}');
    expect(read()).toEqual({ pipeline: { llm: "a", retriever: { topK: 5 } } });
  });

  // Regression (CodeQL js/prototype-pollution-utility): the key path was
  // checked, but a "__proto__" key inside the JSON value was merged into
  // Object.prototype.
  test('ignores a "__proto__" key inside the value', async () => {
    await handleConfigSet(
      { config },
      "pipeline",
      '{"__proto__":{"polluted":true},"retriever":"b"}',
    );
    expect({}.polluted).toBeUndefined();
    expect(read()).toEqual({ pipeline: { llm: "a", retriever: "b" } });
  });
});
