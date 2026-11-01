/**
 * Cost-aware routing from .ragrc.json: the "router" llm, its schema, and
 * how `rag-pipeline query` reports the routing decision.
 */
const { spawnSync } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");
const Ajv = require("ajv");

const { buildComponents } = require("../../../src/config/component-factory");
const { handleQuery } = require("../../../src/cli/handlers/query-handler");

const ROOT = path.resolve(__dirname, "../../..");
const CLI = path.join(ROOT, "bin/cli.js");
const schema = require(path.join(ROOT, ".ragrc.schema.json"));

// Two llm plugins that answer with their own name, so a test sees which ran.
const PLUGIN = (name, { fail = false, stream = true } = {}) =>
  "module.exports = class {\n" +
  "  constructor(config) { this.config = config; }\n" +
  `  async generate() { ${fail ? "throw new Error('down');" : `return '${name} answer';`} }\n` +
  (stream
    ? "  async *generateStream() {\n" +
      `    ${fail ? "throw new Error('down');" : `yield { token: '${name} ', done: false };`}\n` +
      "    yield { token: 'answer', done: false };\n" +
      "    yield { token: '', done: true };\n" +
      "  }\n"
    : "") +
  "};\n";

const PRICES = {
  small: { input: 0.001, output: 0.005 },
  large: { input: 0.003, output: 0.015 },
};

function routerEntry(config) {
  return { stage: "llm", name: "router", config };
}

function twoRoutes(extra = {}) {
  return {
    routes: [
      { name: "large", pricing: PRICES.large, model: "large-model" },
      {
        name: "small",
        pricing: PRICES.small,
        model: "small-model",
        handles: ["simple"],
      },
    ],
    ...extra,
  };
}

let pluginDir;
beforeAll(() => {
  pluginDir = fs.mkdtempSync(path.join(os.tmpdir(), "router-cfg-"));
  fs.writeFileSync(path.join(pluginDir, "small.js"), PLUGIN("small"));
  fs.writeFileSync(path.join(pluginDir, "large.js"), PLUGIN("large"));
  fs.writeFileSync(
    path.join(pluginDir, "broken.js"),
    PLUGIN("broken", { fail: true }),
  );
});
afterAll(() => fs.rmSync(pluginDir, { recursive: true, force: true }));

const plugins = {
  llm: { small: "./small.js", large: "./large.js", broken: "./broken.js" },
};

function build(routerConfig) {
  return buildComponents(
    { pipeline: [routerEntry(routerConfig)], plugins },
    { configDir: pluginDir },
  ).llm;
}

describe('the "router" llm in .ragrc.json', () => {
  test("routes each query class to the cheapest route that handles it", async () => {
    const llm = build(twoRoutes());

    const simple = await llm.route("How many vacation days?", []);
    expect(simple).toMatchObject({ class: "simple", model: "small-model" });
    expect(await llm.generate("How many vacation days?", [])).toBe(
      "small answer",
    );

    const complex = await llm.route("Why do contractors get fewer days?", []);
    expect(complex).toMatchObject({ class: "complex", model: "large-model" });
    expect(await llm.generate("Why do contractors get fewer days?", [])).toBe(
      "large answer",
    );
  });

  test("passes each route's config to its llm", () => {
    const llm = build({
      routes: [
        {
          name: "small",
          config: { model: "small-model" },
          pricing: PRICES.small,
        },
      ],
    });
    expect(llm.routes).toEqual([
      {
        model: "small-model",
        handles: null,
        pricing: { ...PRICES.small, unit: 1000 },
      },
    ]);
  });

  test("prices a route by config.model, then by the connector's default model", () => {
    const saved = process.env.ANTHROPIC_API_KEY;
    process.env.ANTHROPIC_API_KEY = "test-key";
    try {
      const llm = build({
        routes: [
          { name: "anthropic", config: { model: "claude-haiku-4-5" } },
          { name: "anthropic" },
        ],
      });
      const [haiku, byDefault] = llm.routes;
      expect(haiku.model).toBe("claude-haiku-4-5");
      expect(haiku.pricing).toMatchObject({ input: 0.001, output: 0.005 });
      // AnthropicConnector's default model, Claude Sonnet 5.5.
      expect(byDefault.model).toBe("claude-sonnet-5-5");
      expect(byDefault.pricing.input).toBeGreaterThan(haiku.pricing.input);
    } finally {
      if (saved === undefined) delete process.env.ANTHROPIC_API_KEY;
      else process.env.ANTHROPIC_API_KEY = saved;
    }
  });

  test("passes fallback and expectedOutputTokens to the router", async () => {
    const routes = [
      { name: "broken", pricing: PRICES.small, model: "broken-model" },
      { name: "large", pricing: PRICES.large, model: "large-model" },
    ];
    await expect(build({ routes }).generate("Hi?", [])).rejects.toThrow("down");
    expect(await build({ routes, fallback: true }).generate("Hi?", [])).toBe(
      "large answer",
    );

    const short = await build({
      ...twoRoutes(),
      expectedOutputTokens: 10,
    }).route("Hi?", []);
    const long = await build({
      ...twoRoutes(),
      expectedOutputTokens: 1000,
    }).route("Hi?", []);
    expect(long.estimatedCost - short.estimatedCost).toBeCloseTo(
      (990 * PRICES.small.output) / 1000,
      10,
    );
  });

  test.each([
    [{}, /needs "routes"/],
    [{ routes: [] }, /needs "routes"/],
    [{ routes: [{ config: {} }] }, /routes\[0\] needs a "name"/],
    [{ routes: [{ name: "router" }] }, /cannot be another router/],
    [{ routes: [{ name: "small" }] }, /routes\[0\] \(small\) needs a "model"/],
    [{ routes: [{ name: "nope", model: "m" }] }, /Unknown llm "nope"/],
    [
      { routes: [{ name: "small", model: "not-a-priced-model" }] },
      /no price for "not-a-priced-model"/,
    ],
  ])("rejects %j", (config, message) => {
    expect(() => build(config)).toThrow(message);
  });
});

describe(".ragrc.schema.json", () => {
  const validate = new Ajv({ allErrors: true, strict: false }).compile(schema);
  const config = (routerConfig) => ({
    pipeline: [
      { stage: "embedder", name: "local" },
      { stage: "retriever", name: "memory" },
      routerConfig === undefined
        ? { stage: "llm", name: "router" }
        : routerEntry(routerConfig),
    ],
  });

  test("accepts a router configuration", () => {
    const ok = validate(
      config({
        routes: [
          {
            name: "anthropic",
            config: { model: "claude-haiku-4-5" },
            handles: ["simple"],
          },
          { name: "anthropic", config: { model: "claude-sonnet-5-5" } },
          {
            name: "ollama",
            model: "llama3",
            pricing: { input: 0, output: 0 },
          },
        ],
        fallback: true,
        expectedOutputTokens: 400,
      }),
    );
    expect(ok ? [] : validate.errors).toEqual([]);
  });

  test.each([
    ["no config", undefined],
    ["no routes", {}],
    ["empty routes", { routes: [] }],
    ["a route without a name", { routes: [{ model: "m" }] }],
    ["a nested router", { routes: [{ name: "router" }] }],
    [
      "pricing without output",
      { routes: [{ name: "x", pricing: { input: 1 } }] },
    ],
    [
      "handles that is not a list",
      { routes: [{ name: "x", handles: "simple" }] },
    ],
  ])("rejects %s", (_label, routerConfig) => {
    expect(validate(config(routerConfig))).toBe(false);
  });

  test("other llm entries need no routes", () => {
    const ok = validate({ pipeline: [{ stage: "llm", name: "openai" }] });
    expect(ok ? [] : validate.errors).toEqual([]);
  });
});

describe("rag-pipeline query with a router", () => {
  let dir;
  let configPath;

  function writeConfig(routerConfig) {
    const cfg = JSON.parse(fs.readFileSync(configPath, "utf8"));
    cfg.pipeline = cfg.pipeline.filter((s) => s.stage !== "llm");
    cfg.pipeline.push(routerEntry(routerConfig));
    cfg.plugins = plugins;
    fs.writeFileSync(configPath, JSON.stringify(cfg));
  }

  async function run(question, options) {
    const lines = [];
    const log = jest
      .spyOn(console, "log")
      .mockImplementation((...a) => lines.push(a.join(" ")));
    const write = jest
      .spyOn(process.stdout, "write")
      .mockImplementation((t) => lines.push(String(t)) || true);
    try {
      await handleQuery({ config: configPath }, question, options);
    } finally {
      log.mockRestore();
      write.mockRestore();
    }
    return lines.join("\n");
  }

  beforeAll(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "router-cli-"));
    fs.mkdirSync(path.join(dir, "docs"));
    fs.writeFileSync(
      path.join(dir, "docs", "vacation.md"),
      "# Vacation\n\nEmployees receive twenty days of paid vacation per year.\n",
    );
    for (const name of ["small", "large", "broken"]) {
      fs.copyFileSync(
        path.join(pluginDir, `${name}.js`),
        path.join(dir, `${name}.js`),
      );
    }
    for (const args of [
      ["init", "--no-interactive"],
      ["ingest", "docs"],
    ]) {
      const r = spawnSync(process.execPath, [CLI, ...args], {
        cwd: dir,
        encoding: "utf8",
        env: { ...process.env, NODE_ENV: "test" },
      });
      if (r.status !== 0) throw new Error(r.stderr || r.stdout);
    }
    configPath = path.join(dir, ".ragrc.json");
  });
  afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));
  beforeEach(() => jest.useRealTimers());
  afterEach(() => {
    process.exitCode = undefined;
  });

  test("--trace prints the chosen model, class and estimated cost", async () => {
    writeConfig(twoRoutes());
    const out = await run("How many vacation days?", { trace: true });
    expect(process.exitCode).toBeUndefined();
    expect(out).toContain("small answer");
    expect(out).toMatch(/route\s+small-model \(simple, est\. \$0\.\d{6}\)/);
    expect(out).not.toMatch(/fell back/);
  });

  test("--trace shows a fallback", async () => {
    writeConfig({
      routes: [
        { name: "broken", pricing: PRICES.small, model: "broken-model" },
        { name: "large", pricing: PRICES.large, model: "large-model" },
      ],
      fallback: true,
    });
    const out = await run("How many vacation days?", { trace: true });
    expect(out).toContain("large answer");
    expect(out).toMatch(/route\s+large-model \(simple/);
    expect(out).toMatch(/fell back\s+from broken-model/);
  });

  test("--streaming reports the route from the done chunk", async () => {
    writeConfig(twoRoutes());
    const out = await run("Why do contractors get fewer days?", {
      streaming: true,
      trace: true,
    });
    expect(out).toMatch(/large\s+answer/);
    expect(out).toMatch(/route\s+large-model \(complex/);
  });

  test("--json includes the route and --stats prices the chosen model", async () => {
    writeConfig({
      routes: [
        { name: "large", model: "claude-sonnet-5-5" },
        { name: "small", model: "claude-haiku-4-5", handles: ["simple"] },
      ],
    });
    const out = await run("How many vacation days?", {
      json: true,
      stats: true,
    });
    const json = JSON.parse(out);
    expect(json.answer).toBe("small answer");
    expect(json.route).toMatchObject({
      class: "simple",
      model: "claude-haiku-4-5",
    });
    expect(json.stats.model).toMatch(/haiku/);
    expect(json.stats.estimatedCostUsd).toBeGreaterThan(0);
  });
});
