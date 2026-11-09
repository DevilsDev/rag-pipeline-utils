/**
 * `rag-pipeline config get <key>`: a key that is not set is an error (message
 * on stderr, exit code 1) and prints nothing on stdout, so a script can tell.
 */
const fs = require("fs");
const os = require("os");
const path = require("path");
const { handleConfigGet } = require("../../../src/cli/handlers/config-handler");

describe("handleConfigGet", () => {
  let dir;
  let config;
  let logSpy;
  let errorSpy;
  let savedExitCode;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "config-get-"));
    config = path.join(dir, ".ragrc.json");
    fs.writeFileSync(config, JSON.stringify({ pipeline: { llm: "a" } }));
    logSpy = jest.spyOn(console, "log").mockImplementation(() => {});
    errorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
    savedExitCode = process.exitCode;
    process.exitCode = undefined;
  });

  afterEach(() => {
    process.exitCode = savedExitCode;
    fs.rmSync(dir, { recursive: true, force: true });
    jest.restoreAllMocks();
  });

  test("prints a set key to stdout and exits 0", async () => {
    await handleConfigGet({ config }, "pipeline.llm");
    expect(logSpy).toHaveBeenCalledWith(JSON.stringify("a", null, 2));
    expect(process.exitCode).toBeUndefined();
  });

  test("a missing key goes to stderr with exit code 1, nothing on stdout", async () => {
    await handleConfigGet({ config }, "pipeline.nope");
    expect(logSpy).not.toHaveBeenCalled();
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining("Key not found"),
    );
    expect(process.exitCode).toBe(1);
  });

  test("a path through a value that is not an object is also not found", async () => {
    await handleConfigGet({ config }, "pipeline.llm.deeper");
    expect(logSpy).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(1);
  });
});
