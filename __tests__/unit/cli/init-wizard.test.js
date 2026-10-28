/**
 * Tests for the `rag-pipeline init` setup wizard, driven with scripted
 * answers instead of a TTY.
 */

const fs = require("fs");
const os = require("os");
const path = require("path");
const {
  runInitWizard,
  inspectPlugin,
  checkEnvironment,
  testConnections,
} = require("../../../src/cli/wizard/init-wizard.js");
const {
  validateRagrc,
} = require("../../../src/config/enhanced-ragrc-schema.js");
const { buildComponents } = require("../../../src/config/component-factory.js");
const {
  DEFAULT_CONFIG: OPENAI_DEFAULTS,
} = require("../../../src/connectors/openai-connector.js");
const {
  DEFAULT_CONFIG: OLLAMA_DEFAULTS,
} = require("../../../src/connectors/ollama-connector.js");
const {
  DEFAULT_CONFIG: COHERE_DEFAULTS,
} = require("../../../src/connectors/cohere-connector.js");
const {
  DEFAULT_CONFIG: ANTHROPIC_DEFAULTS,
} = require("../../../src/connectors/anthropic-connector.js");

/**
 * inquirer-style prompt fed from a script: { questionName: answer | [answers] }.
 * A question without a scripted answer gets its default; one without a
 * default fails the test.
 */
function scriptedPrompt(script) {
  const queues = {};
  for (const [name, value] of Object.entries(script)) {
    queues[name] = Array.isArray(value) ? [...value] : [value];
  }
  const asked = [];
  const prompt = async (questions) => {
    expect(questions).toHaveLength(1);
    const question = questions[0];
    asked.push(question);
    const queue = queues[question.name];
    if (queue && queue.length > 0) return { [question.name]: queue.shift() };
    if ("default" in question) return { [question.name]: question.default };
    throw new Error(`No scripted answer for "${question.name}"`);
  };
  prompt.asked = asked;
  prompt.names = () => asked.map((q) => q.name);
  return prompt;
}

function writeFile(file, content) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
  return file;
}

describe("runInitWizard", () => {
  let dir;
  let lines;
  let log;

  beforeEach(() => {
    jest.useRealTimers();
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "init-wizard-"));
    lines = [];
    log = (...args) => lines.push(args.join(" "));
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  function run(script, extra = {}) {
    const prompt = scriptedPrompt(script);
    const promise = runInitWizard({
      prompt,
      outputPath: path.join(dir, ".ragrc.json"),
      cwd: dir,
      env: {},
      log,
      ...extra,
    });
    return promise.then((result) => ({ result, prompt }));
  }

  const output = () => lines.join("\n");
  const entry = (config, stage) =>
    config.pipeline.find((e) => e.stage === stage);

  test("defaults produce the offline local pipeline", async () => {
    const { result, prompt } = await run({});

    expect(result.config.pipeline).toEqual([
      { stage: "loader", name: "auto" },
      { stage: "embedder", name: "local" },
      {
        stage: "retriever",
        name: "file-store",
        config: { path: ".rag/index.json" },
      },
    ]);
    expect(prompt.names()).toEqual([
      "embedder",
      "llm",
      "retriever",
      "indexPath",
      "reranker",
      "testConnection",
      "confirmWrite",
    ]);
    expect(output()).toContain("No API keys needed");
  });

  test.each([
    ["openai", { embeddingModel: OPENAI_DEFAULTS.embeddingModel }],
    [
      "ollama",
      {
        baseURL: OLLAMA_DEFAULTS.baseURL,
        embeddingModel: OLLAMA_DEFAULTS.embeddingModel,
      },
    ],
    ["cohere", { embeddingModel: COHERE_DEFAULTS.embeddingModel }],
  ])(
    "embedder %s is pre-filled with the connector defaults",
    async (name, expected) => {
      const { result, prompt } = await run({ embedder: name });

      expect(entry(result.config, "embedder")).toEqual({
        stage: "embedder",
        name,
        config: expected,
      });
      for (const [key, value] of Object.entries(expected)) {
        const question = prompt.asked.find((q) => q.name === `embedder_${key}`);
        expect(question.default).toBe(value);
      }
      expect(validateRagrc(result.config).valid).toBe(true);
      expect(() =>
        buildComponents(result.config, { configDir: dir }),
      ).not.toThrow();
    },
  );

  test.each([
    ["openai", { model: OPENAI_DEFAULTS.model }],
    ["anthropic", { model: ANTHROPIC_DEFAULTS.model }],
    [
      "ollama",
      { baseURL: OLLAMA_DEFAULTS.baseURL, model: OLLAMA_DEFAULTS.model },
    ],
  ])("llm %s gets its model options", async (name, expected) => {
    const { result } = await run({ llm: name });

    expect(entry(result.config, "llm")).toEqual({
      stage: "llm",
      name,
      config: expected,
    });
    expect(() =>
      buildComponents(result.config, { configDir: dir }),
    ).not.toThrow();
  });

  test("custom answers replace defaults and Ollama URL is reused for the llm", async () => {
    const { result, prompt } = await run({
      embedder: "ollama",
      embedder_baseURL: "http://gpu-box:11434",
      embedder_embeddingModel: "mxbai-embed-large",
      llm: "ollama",
      llm_model: "mistral",
    });

    const llmUrl = prompt.asked.find((q) => q.name === "llm_baseURL");
    expect(llmUrl.default).toBe("http://gpu-box:11434");
    expect(entry(result.config, "embedder").config).toEqual({
      baseURL: "http://gpu-box:11434",
      embeddingModel: "mxbai-embed-large",
    });
    expect(entry(result.config, "llm").config).toEqual({
      baseURL: "http://gpu-box:11434",
      model: "mistral",
    });
  });

  test("template defaults pre-select the providers", async () => {
    const { result } = await run(
      {},
      { defaults: { embedder: "openai", llm: "anthropic" } },
    );

    expect(result.config.pipeline.map((e) => e.name)).toEqual([
      "auto",
      "openai",
      "file-store",
      "anthropic",
    ]);
  });

  test("file-store uses the chosen index path; scoring reranker is added", async () => {
    const { result } = await run({
      indexPath: "data/idx.json",
      reranker: "scoring",
    });

    expect(entry(result.config, "retriever").config).toEqual({
      path: "data/idx.json",
    });
    expect(result.config.pipeline.map((e) => e.stage)).toEqual([
      "loader",
      "embedder",
      "retriever",
      "reranker",
    ]);
    expect(() =>
      buildComponents(result.config, { configDir: dir }),
    ).not.toThrow();
  });

  test("memory retriever warns that it does not persist", async () => {
    const { result, prompt } = await run({ retriever: "memory" });

    expect(entry(result.config, "retriever")).toEqual({
      stage: "retriever",
      name: "memory",
    });
    expect(prompt.names()).not.toContain("indexPath");
    expect(output()).toMatch(/memory retriever does not persist/);
  });

  describe("custom plugins", () => {
    test("valid module is stored relative to the config file and builds", async () => {
      writeFile(
        path.join(dir, "plugins", "my-embedder.js"),
        `class MyEmbedder {
          constructor(cfg) { this.cfg = cfg; }
          embed(text) { return [text.length, 1]; }
        }
        module.exports = MyEmbedder;`,
      );
      const outputPath = path.join(dir, "conf", ".ragrc.json");
      fs.mkdirSync(path.dirname(outputPath));

      const { result } = await run(
        { embedder: "custom", embedderPlugin: "plugins/my-embedder.js" },
        { outputPath },
      );

      expect(entry(result.config, "embedder")).toEqual({
        stage: "embedder",
        name: "my-embedder",
      });
      expect(result.config.plugins).toEqual({
        embedder: { "my-embedder": "../plugins/my-embedder.js" },
      });
      expect(validateRagrc(result.config).valid).toBe(true);
      const components = buildComponents(result.config, {
        configDir: path.dirname(outputPath),
      });
      expect(components.embedder.embed("abc")).toEqual([3, 1]);
    });

    test("missing file and wrong shape re-prompt until a valid module is given", async () => {
      writeFile(
        path.join(dir, "not-an-llm.js"),
        "module.exports = { hello() {} };",
      );
      writeFile(
        path.join(dir, "broken.js"),
        "throw new Error('boom at load');",
      );
      writeFile(
        path.join(dir, "llm.js"),
        "module.exports = { generate: async () => 'OK' };",
      );

      const { result, prompt } = await run({
        llm: "custom",
        llmPlugin: ["missing.js", "not-an-llm.js", "broken.js", "./llm.js"],
      });

      expect(prompt.names().filter((n) => n === "llmPlugin")).toHaveLength(4);
      expect(output()).toMatch(/File not found: .*missing\.js/);
      expect(output()).toMatch(/not-an-llm\.js does not look like a llm/);
      expect(output()).toMatch(/Could not load .*broken\.js: boom at load/);
      expect(result.config.plugins).toEqual({ llm: { llm: "./llm.js" } });
      expect(entry(result.config, "llm").name).toBe("llm");
    });

    test("an empty path goes back to the provider choice", async () => {
      const { result, prompt } = await run({
        reranker: ["custom", "scoring"],
        rerankerPlugin: "",
      });

      expect(prompt.names().filter((n) => n === "reranker")).toHaveLength(2);
      expect(entry(result.config, "reranker").name).toBe("scoring");
    });

    test("a plugin named like a built-in is renamed so it is not shadowed", async () => {
      writeFile(
        path.join(dir, "local.js"),
        "module.exports = class { embed() { return [1]; } };",
      );

      const { result } = await run({
        embedder: "custom",
        embedderPlugin: "local.js",
      });

      expect(entry(result.config, "embedder").name).toBe("local-custom");
      const components = buildComponents(result.config, { configDir: dir });
      expect(components.embedder.embed()).toEqual([1]);
    });

    test("warns when an embedder lacks embed() or a retriever lacks store()", async () => {
      writeFile(
        path.join(dir, "q.js"),
        "module.exports = { embedQuery: async () => [1] };",
      );
      writeFile(
        path.join(dir, "r.js"),
        "module.exports = { retrieve: async () => [] };",
      );

      const { result } = await run({
        embedder: "custom",
        embedderPlugin: "q.js",
        retriever: "custom",
        retrieverPlugin: "r.js",
      });

      expect(output()).toMatch(/No embed\(\) method/);
      expect(output()).toMatch(/No store\(\) method/);
      expect(result.config.plugins).toEqual({
        embedder: { q: "./q.js" },
        retriever: { r: "./r.js" },
      });
    });
  });

  describe("environment check", () => {
    test("reports a missing API key once per provider and names the env var", async () => {
      const { result } = await run({ embedder: "openai", llm: "openai" });

      expect(result.environment).toEqual([
        {
          provider: "openai",
          stages: ["embedder", "llm"],
          envVar: "OPENAI_API_KEY",
          set: false,
        },
      ]);
      expect(output()).toMatch(/OPENAI_API_KEY is not set/);
      expect(output()).toMatch(/export OPENAI_API_KEY=/);
    });

    test("reports a set key without writing it into the config", async () => {
      const secret = "sk-test-should-never-be-written";
      const { result } = await run(
        { embedder: "cohere", llm: "anthropic" },
        { env: { COHERE_API_KEY: secret, ANTHROPIC_API_KEY: secret } },
      );

      expect(output()).toMatch(/COHERE_API_KEY is set/);
      expect(output()).toMatch(/ANTHROPIC_API_KEY is set/);
      expect(JSON.stringify(result.config)).not.toContain(secret);
      expect(JSON.stringify(result.config)).not.toContain("apiKey");
    });

    test("ollama needs no key but its server URL is reported", () => {
      const checks = checkEnvironment(
        {
          embedder: { name: "ollama", config: { baseURL: "http://x:1" } },
          llm: { name: "ollama", config: { baseURL: "http://x:1" } },
        },
        {},
      );

      expect(checks).toEqual([
        {
          provider: "ollama",
          stages: ["embedder", "llm"],
          baseURL: "http://x:1",
        },
      ]);
    });

    test("custom plugins are not checked for keys", () => {
      expect(
        checkEnvironment(
          { embedder: { name: "openai", module: "./o.js" } },
          {},
        ),
      ).toEqual([]);
    });
  });

  describe("connection test", () => {
    test("is skipped unless requested", async () => {
      const build = jest.fn();
      const { result } = await run(
        { embedder: "openai" },
        { buildComponents: build },
      );

      expect(build).not.toHaveBeenCalled();
      expect(result.connection).toBeNull();
    });

    test("reports success from the embedder and llm", async () => {
      const calls = [];
      const build = (config) => {
        const [e] = config.pipeline;
        calls.push(e.stage);
        return e.stage === "embedder"
          ? {
              embedder: {
                embedQuery: async (text) => {
                  calls.push(`embedQuery:${text}`);
                  return [0.1, 0.2, 0.3];
                },
              },
            }
          : {
              llm: {
                generate: async (q, ctx) => {
                  calls.push(`generate:${q}:${ctx.length}`);
                  return { text: "OK" };
                },
              },
            };
      };

      const { result } = await run(
        { embedder: "openai", llm: "openai", testConnection: true },
        { buildComponents: build },
      );

      expect(calls).toEqual([
        "embedder",
        "embedQuery:test",
        "llm",
        "generate:Say OK:0",
      ]);
      expect(result.connection).toEqual([
        {
          stage: "embedder",
          ok: true,
          message: "openai returned a 3-dimension vector",
        },
        { stage: "llm", ok: true, message: "openai replied: OK" },
      ]);
      expect(result.config).toBeDefined();
    });

    test("reports failures and timeouts but still lets the config be saved", async () => {
      const build = (config) => {
        const [e] = config.pipeline;
        if (e.stage === "embedder") {
          return {
            embedder: {
              embedQuery: async () => {
                throw new Error("401 invalid api key");
              },
            },
          };
        }
        return { llm: { generate: () => new Promise(() => {}) } };
      };

      const { result } = await run(
        { embedder: "cohere", llm: "ollama", testConnection: true },
        { buildComponents: build, timeoutMs: 20 },
      );

      expect(result.connection).toEqual([
        {
          stage: "embedder",
          ok: false,
          message: "cohere: 401 invalid api key",
        },
        {
          stage: "llm",
          ok: false,
          message: 'ollama: generate("Say OK") timed out after 20 ms',
        },
      ]);
      expect(output()).toMatch(/can still be saved/);
      expect(result.config.pipeline.map((e) => e.name)).toContain("ollama");
    });

    test("a component that fails to construct is reported", async () => {
      const results = await testConnections(
        {
          pipeline: [{ stage: "llm", name: "openai" }],
        },
        {
          buildComponents: () => {
            throw new Error("cannot construct");
          },
          configDir: dir,
          timeoutMs: 50,
        },
      );

      expect(results).toEqual([
        { stage: "llm", ok: false, message: "openai: cannot construct" },
      ]);
    });

    test("the offline local embedder is not called", async () => {
      const results = await testConnections(
        { pipeline: [{ stage: "embedder", name: "local" }] },
        { buildComponents: () => ({}), configDir: dir, timeoutMs: 50 },
      );

      expect(results).toEqual([
        {
          stage: "embedder",
          ok: true,
          skipped: true,
          message: "local embedder runs offline; nothing to test",
        },
      ]);
    });
  });

  test("declining the preview returns null", async () => {
    const { result } = await run({ llm: "anthropic", confirmWrite: false });

    expect(result).toBeNull();
    expect(output()).toContain('"name": "anthropic"');
  });
});

describe("inspectPlugin", () => {
  let dir;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "inspect-plugin-"));
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  test("accepts a factory function and a default export", () => {
    writeFile(
      path.join(dir, "factory.js"),
      "module.exports = (cfg) => ({ rerank: async (q, docs) => docs });",
    );
    writeFile(
      path.join(dir, "esm-like.js"),
      "module.exports = { default: class { retrieve() {} store() {} } };",
    );

    const opts = { cwd: dir, configDir: dir };
    const factory = inspectPlugin("reranker", "factory.js", opts);
    const esm = inspectPlugin("retriever", "esm-like.js", opts);

    expect(factory).toMatchObject({ ok: true, warnings: [] });
    expect(esm).toMatchObject({
      ok: true,
      selection: { name: "esm-like", module: "./esm-like.js" },
      warnings: [],
    });
  });

  test("rejects a directory", () => {
    fs.mkdirSync(path.join(dir, "sub"));

    expect(
      inspectPlugin("llm", "sub", { cwd: dir, configDir: dir }),
    ).toMatchObject({ ok: false, error: expect.stringMatching(/Not a file/) });
  });
});
