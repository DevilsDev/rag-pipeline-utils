"use strict";

/**
 * The `process` the /edge bundle sees (scripts/lib/edge-process-banner.js),
 * in the three runtimes it has to work in.
 */

const {
  EDGE_PROCESS_BANNER,
} = require("../../scripts/lib/edge-process-banner");

/** Runs the banner with `host` as globalThis.process; returns its `process`. */
function edgeProcess(host) {
  const globals = host === undefined ? {} : { process: host };
  // `globalThis` is a parameter, so the banner reads the stand-in global
  // and its `var process` stays local to this function.
  return new Function("globalThis", `${EDGE_PROCESS_BANNER}\nreturn process;`)(
    globals,
  );
}

describe("/edge process stand-in", () => {
  let warn;
  beforeEach(() => {
    warn = jest.spyOn(console, "warn").mockImplementation(() => {});
  });
  afterEach(() => warn.mockRestore());

  test("no process (Workers without nodejs_compat): empty env, emitWarning to console.warn", () => {
    const p = edgeProcess(undefined);
    expect(p.env).toEqual({});
    p.emitWarning("Cache skipped", { type: "RagCacheWarning", code: "X" });
    expect(warn).toHaveBeenCalledWith("[X] RagCacheWarning: Cache skipped");
  });

  test("a process without emitWarning (Vercel Edge): wrapped, not changed", () => {
    const host = { env: { API_KEY: "k" }, versions: {} };
    const p = edgeProcess(host);
    expect(p).not.toBe(host);
    expect(p.env.API_KEY).toBe("k");
    expect(p.versions).toBe(host.versions);
    expect("emitWarning" in host).toBe(false);

    // Node's other signatures: (warning, type, code) and an Error.
    p.emitWarning("Unknown price", "Warning", "RAG_UNKNOWN_MODEL_PRICING");
    expect(warn).toHaveBeenLastCalledWith(
      "[RAG_UNKNOWN_MODEL_PRICING] Warning: Unknown price",
    );
    p.emitWarning(new RangeError("Too long"));
    expect(warn).toHaveBeenLastCalledWith("RangeError: Too long");
  });

  test("a process without env gets an empty one", () => {
    expect(edgeProcess({}).env).toEqual({});
  });

  test("Node's process is used as it is", () => {
    const emitWarning = process.emitWarning;
    expect(edgeProcess(process)).toBe(process);
    expect(process.emitWarning).toBe(emitWarning);
    expect(warn).not.toHaveBeenCalled();
  });
});
