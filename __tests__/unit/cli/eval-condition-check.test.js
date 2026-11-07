/**
 * rag-pipeline eval --no-condition-check: the run's citations are scored
 * without the 3.9 condition check, for baselines saved on 3.8 or earlier.
 */

jest.mock("../../../src/evaluate/compare.js", () => {
  const actual = jest.requireActual("../../../src/evaluate/compare.js");
  return { ...actual, runEvaluation: jest.fn() };
});
jest.mock("../../../src/cli/services/rag-service.js", () => ({
  createPipeline: () => ({ pipeline: {}, captured: {} }),
}));
jest.mock("../../../src/cli/shared/config-context.js", () => ({
  loadCliConfig: () => ({ config: {}, configDir: "." }),
}));

const fs = require("fs");
const os = require("os");
const path = require("path");
const compare = require("../../../src/evaluate/compare.js");
const { handleEval } = require("../../../src/cli/handlers/eval-handler");

describe("eval --no-condition-check", () => {
  let dir;
  let dataset;
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "eval-cc-"));
    dataset = path.join(dir, "cases.json");
    fs.writeFileSync(dataset, JSON.stringify([{ id: "a", prompt: "q" }]));
    compare.runEvaluation.mockImplementation(async () => {
      throw new Error("stop after capturing the options");
    });
    jest.spyOn(console, "error").mockImplementation(() => {});
    jest.spyOn(console, "log").mockImplementation(() => {});
  });
  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
    process.exitCode = undefined;
    jest.restoreAllMocks();
  });

  const runOptionsFor = async (options) => {
    await handleEval({ quiet: true }, dataset, options);
    return compare.runEvaluation.mock.calls.at(-1)[2].runOptions;
  };

  test("passes conditionCheck: false to the citations", async () => {
    expect(await runOptionsFor({ conditionCheck: false })).toMatchObject({
      citationOptions: { conditionCheck: false },
    });
  });

  test("leaves the check on by default", async () => {
    expect(await runOptionsFor({ conditionCheck: true })).not.toHaveProperty(
      "citationOptions",
    );
  });
});
