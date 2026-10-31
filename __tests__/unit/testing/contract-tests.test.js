"use strict";

const {
  runContractTests,
  checkContract,
  HashEmbedder,
  EchoLLM,
} = require("../../../src/testing");
const {
  MemoryRetriever,
  ScoringReranker,
  HybridRetriever,
  pluginRegistry,
} = require("../../../src/index");

// The kit run the way a plugin author runs it: against built-in plugins
// that implement each contract.
runContractTests("embedder", () => new HashEmbedder());
runContractTests("retriever", () => new MemoryRetriever());
runContractTests("reranker", () => new ScoringReranker());
runContractTests("llm", () => new EchoLLM(), { registry: true });
runContractTests("loader", () => ({ async load() {} }));
runContractTests(
  "retriever",
  () => new HybridRetriever([{ retriever: new MemoryRetriever() }]),
  {
    name: "a retriever without store(), loaded through setup",
    setup: (hybrid, documents) =>
      hybrid.retrievers[0].retriever.store(documents),
  },
);

/** Messages of the failed checks. */
async function failures(type, factory, options) {
  const report = await checkContract(type, factory, options);
  return report.results.filter((r) => !r.passed).map((r) => r.error);
}

describe("checkContract reports broken plugins", () => {
  test("an LLM that returns an object instead of the answer text", async () => {
    const errors = await failures("llm", () => ({
      async generate() {
        return { text: "twenty days" };
      },
    }));
    expect(errors).toContain(
      "generate() resolved to object; the pipeline needs the answer text",
    );
  });

  test("a stream that never sends done: true", async () => {
    const errors = await failures("llm", () => ({
      async generate() {
        return "x";
      },
      async *generateStream() {
        yield { token: "x", done: false };
      },
    }));
    expect(errors).toContain("the last chunk must have done: true");
  });

  test("a retriever that ignores topK and doesn't sort by score", async () => {
    const errors = await failures("retriever", () => {
      const docs = [];
      return {
        async store(items) {
          docs.push(...items);
        },
        async retrieve() {
          return docs.map((d, i) => ({ ...d, score: i }));
        },
      };
    });
    expect(errors).toEqual(
      expect.arrayContaining([
        "results are not sorted by score, highest first",
        "topK 2 returned 3",
      ]),
    );
  });

  test("an embedder whose vector length depends on the text", async () => {
    const errors = await failures("embedder", () => ({
      async embed(text) {
        return text.split(" ").map(() => 1);
      },
    }));
    expect(errors[0]).toMatch(/vector lengths differ/);
  });

  test("a reranker that invents documents", async () => {
    const errors = await failures("reranker", () => ({
      async rerank() {
        return [{ id: "made-up", score: 1 }];
      },
    }));
    expect(errors).toContain("rerank() returned an unknown document made-up");
  });

  test("a plugin missing its contract method", async () => {
    const errors = await failures("embedder", () => ({ metadata: {} }));
    expect(errors[0]).toMatch(/embed/);
  });

  test("registry: true needs the metadata register() requires", async () => {
    const plugin = {
      async generate() {
        return "x";
      },
    };
    const errors = await failures("llm", () => plugin, { registry: true });
    expect(errors[0]).toMatch(/metadata/);
    // The same plugin passes the plain contract.
    await expect(checkContract("llm", () => plugin)).resolves.toMatchObject({
      passed: true,
    });
  });

  test("a passing plugin reports every check, skipped ones included", async () => {
    const report = await checkContract("llm", () => ({
      async generate() {
        return "x";
      },
    }));
    expect(report.passed).toBe(true);
    expect(report.results.find((r) => r.skipped).name).toMatch(
      /generateStream/,
    );
  });
});

describe("runContractTests", () => {
  test("registers one test per check with the describe/it it is given", () => {
    const registered = [];
    runContractTests("llm", () => new EchoLLM(), {
      describe: (name, body) => {
        registered.push(`group: ${name}`);
        body();
      },
      it: (name) => registered.push(name),
    });
    expect(registered[0]).toBe("group: llm contract");
    expect(registered).toContain("works in createRagPipeline");
  });

  test("rejects an unknown type and a factory that isn't a function", () => {
    expect(() => runContractTests("vectorstore", () => ({}))).toThrow(
      /Unknown plugin type "vectorstore"/,
    );
    expect(() => runContractTests("llm", new EchoLLM())).toThrow(/factory/);
  });

  test("the plugins it checks can be registered", async () => {
    const registry = new pluginRegistry.PluginRegistry();
    await registry.register("llm", "echo-llm", new EchoLLM());
    expect(registry.list("llm")).toContain("echo-llm");
  });
});
