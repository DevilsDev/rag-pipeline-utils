/**
 * The /edge entry's replacements for Node APIs (src/edge/) and its export
 * list. test/edge runs the built dist/edge.mjs in workerd without
 * nodejs_compat.
 */
const nodeCrypto = require("crypto");
const { trace } = require("@opentelemetry/api");
const otelApi = require("@opentelemetry/api");

const edgeCrypto = require("../../../src/edge/crypto");
const pino = require("../../../src/edge/pino");
const unavailable = require("../../../src/edge/unavailable");
const { loadOptionalPeer } = require("../../../src/utils/optional-peer");
const edge = require("../../../src/edge");
const main = require("../../../src/index");

const nodeSha = (data, enc) =>
  nodeCrypto.createHash("sha256").update(data).digest(enc);

describe("edge crypto: createHash('sha256')", () => {
  // Lengths around the 64-byte block and the 56-byte padding boundary.
  const lengths = [0, 1, 3, 55, 56, 57, 63, 64, 65, 119, 120, 128, 1000];

  test.each(lengths)("matches Node for %i bytes", (n) => {
    const text = "abcdefghij".repeat(101).slice(0, n);
    expect(edgeCrypto.createHash("sha256").update(text).digest("hex")).toBe(
      nodeSha(text, "hex"),
    );
  });

  test("matches Node for UTF-8 text, bytes and several updates", () => {
    const text = "Ünïcödé 日本語 🙂 vacation days";
    expect(edgeCrypto.createHash("sha256").update(text).digest("hex")).toBe(
      nodeSha(text, "hex"),
    );

    const bytes = new Uint8Array([0, 1, 2, 250, 255]);
    expect(edgeCrypto.createHash("sha256").update(bytes).digest("hex")).toBe(
      nodeSha(Buffer.from(bytes), "hex"),
    );

    const parts = edgeCrypto.createHash("sha256");
    parts.update("part one, ").update("part two");
    expect(parts.digest("hex")).toBe(nodeSha("part one, part two", "hex"));
  });

  test("matches Node for a large random input", () => {
    const data = nodeCrypto.randomBytes(200_003);
    expect(
      edgeCrypto
        .createHash("sha256")
        .update(new Uint8Array(data))
        .digest("hex"),
    ).toBe(nodeSha(data, "hex"));
  });

  test("digests to base64, base64url and Buffer-like bytes", () => {
    const h = () => edgeCrypto.createHash("sha256").update("id-1");
    expect(h().digest("base64")).toBe(nodeSha("id-1", "base64"));
    expect(h().digest("base64url")).toBe(nodeSha("id-1", "base64url"));

    // QdrantRetriever's pointId: index, mutate, subarray().toString("hex").
    const raw = h().digest();
    const expected = nodeSha("id-1");
    expect(raw[6]).toBe(expected[6]);
    expect(raw.subarray(0, 16).toString("hex")).toBe(
      expected.subarray(0, 16).toString("hex"),
    );
  });

  test("other algorithms and encodings fail clearly", () => {
    expect(() => edgeCrypto.createHash("md5")).toThrow(/sha256 only/);
    expect(() =>
      edgeCrypto.createHash("sha256").update("x").digest("latin1"),
    ).toThrow(/Unsupported encoding "latin1"/);
  });
});

describe("edge crypto: randomBytes and randomUUID", () => {
  test("randomBytes returns that many random bytes, printable as hex", () => {
    const a = edgeCrypto.randomBytes(8);
    const b = edgeCrypto.randomBytes(8);
    expect(a).toHaveLength(8);
    expect(a.toString("hex")).toMatch(/^[0-9a-f]{16}$/);
    expect(a.toString("hex")).not.toBe(b.toString("hex"));
  });

  test("randomUUID is a v4 UUID", () => {
    expect(edgeCrypto.randomUUID()).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
  });
});

describe("edge pino", () => {
  let spies;
  beforeEach(() => {
    spies = Object.fromEntries(
      ["debug", "info", "warn", "error"].map((m) => [
        m,
        jest.spyOn(console, m).mockImplementation(() => {}),
      ]),
    );
  });
  afterEach(() => jest.restoreAllMocks());

  test("logs JSON at and above its level, with child bindings", () => {
    const log = pino({ name: "rag", level: "info" });
    log.debug("hidden");
    log.info({ stage: "retrieve" }, "done");
    log.child({ correlationId: "c1" }).error("failed");

    expect(spies.debug).not.toHaveBeenCalled();
    const info = JSON.parse(spies.info.mock.calls[0][0]);
    expect(info).toMatchObject({
      level: "info",
      name: "rag",
      stage: "retrieve",
      msg: "done",
    });
    const error = JSON.parse(spies.error.mock.calls[0][0]);
    expect(error).toMatchObject({ correlationId: "c1", msg: "failed" });
  });

  test("silent logs nothing", () => {
    const log = pino({ level: "silent" });
    log.fatal("x");
    log.warn("x");
    expect(spies.error).not.toHaveBeenCalled();
    expect(spies.warn).not.toHaveBeenCalled();
  });
});

describe("edge stand-ins for Node built-ins", () => {
  test("loading works; any use fails with a clear message", () => {
    const { readFileSync, join } = unavailable;
    expect(() => readFileSync("x")).toThrow(
      /Node.js API "readFileSync" is not available in the edge build/,
    );
    expect(() => join("a", "b")).toThrow(/use the Node.js entry/);
  });

  test("@opentelemetry/api is a missing peer, with a hint to pass it", () => {
    let error;
    try {
      loadOptionalPeer(
        "@opentelemetry/api",
        () => require("../../../src/edge/no-otel-api"),
        "hint",
      );
    } catch (e) {
      error = e;
    }
    expect(error).toMatchObject({
      code: "MISSING_DEPENDENCY",
      message: "hint",
    });
  });
});

describe("the /edge entry", () => {
  test("exports a subset of the main entry, the same objects", () => {
    const names = Object.keys(edge);
    expect(names.length).toBeGreaterThan(50);
    for (const name of names) expect(edge[name]).toBe(main[name]);
  });

  test("leaves out what needs files, Node servers or Node-only packages", () => {
    for (const name of [
      "loadRagConfig",
      "FileVectorStore",
      "PgVectorRetriever",
      "OpenAIConnector",
      "PluginHub",
      "DevServer",
      "pluginRegistry",
    ]) {
      expect(edge).not.toHaveProperty(name);
    }
  });
});

describe("telemetry: { api }", () => {
  const retriever = {
    async retrieve() {
      return [{ id: "a", content: "twenty days" }];
    },
  };
  const embedder = {
    async embed() {
      return [1, 0];
    },
  };

  test("uses the given @opentelemetry/api module", async () => {
    const spans = [];
    const realTracer = trace.getTracer("t");
    const tracer = {
      startActiveSpan(name, ...rest) {
        spans.push(name);
        return realTracer.startActiveSpan(name, ...rest);
      },
    };
    const pipeline = main.createRagPipeline({
      embedder,
      retriever,
      telemetry: { api: otelApi, tracer },
    });
    const result = await pipeline.run({ query: "vacation" });
    expect(result.success).toBe(true);
    expect(spans).toContain("rag.pipeline.run");
  });

  test("rejects something that is not the API module", () => {
    expect(() =>
      main.createRagPipeline({ embedder, retriever, telemetry: { api: {} } }),
    ).toThrow(/telemetry.api must be the @opentelemetry\/api module/);
  });
});
