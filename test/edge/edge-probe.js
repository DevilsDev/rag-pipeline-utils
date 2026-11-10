/**
 * @devilsdev/rag-pipeline-utils/edge in a Worker without nodejs_compat, so
 * no Node.js API exists: the shared checks (except the optional peers, which
 * /edge cannot require), and the parts that replace Node's crypto.
 */
import * as lib from "@devilsdev/rag-pipeline-utils/edge";
import { makeChecks, worker } from "./checks.js";

const {
  AnthropicConnector,
  CostCalculator,
  GuardrailsPipeline,
  LocalEmbedder,
  MemoryRetriever,
  QdrantRetriever,
  createRagPipeline,
} = lib;

const checks = makeChecks(lib, {
  omit: [
    "OpenAIConnector (optional peer, bundled)",
    "telemetry (optional peer, bundled)",
  ],
});

checks["no Node.js APIs in this Worker"] = () => {
  const present = ["process", "Buffer", "require"].filter(
    (name) => typeof globalThis[name] !== "undefined",
  );
  if (present.length) throw new Error(`found ${present.join(", ")}`);
  return "none";
};

// run.mjs passes the Node build's values for the same inputs (env), and
// uses the same prompt.
const SYSTEM_PROMPT = "Answer from the documents only. ".repeat(4);

checks["cache keys (sha256) match the Node build"] = async (env) => {
  const embedder = new LocalEmbedder();
  embedder.train([{ id: "v", content: "twenty vacation days" }]);
  const retriever = new MemoryRetriever();
  await retriever.store([
    {
      id: "v",
      content: "twenty vacation days",
      vector: await embedder.embed("twenty vacation days"),
    },
  ]);
  const llm = new AnthropicConnector({
    apiKey: "k",
    baseURL: "https://upstream.test",
    systemPrompt: SYSTEM_PROMPT,
  });
  // A long system prompt is hashed into the key; it must match Node's.
  const key = llm.getCacheKey("llm");
  if (key !== env.NODE_CACHE_KEY) {
    throw new Error(`${key} != ${env.NODE_CACHE_KEY}`);
  }
  const p = createRagPipeline({ embedder, retriever, llm, cache: true });
  await p.run({ query: "vacation days" });
  const r = await p.run({ query: "vacation days" });
  // Anthropic answers are not cached (temperature 1); the retrieval layer's
  // key is a sha256 of the query and settings.
  if (r.cache.retrieval !== "hit") throw new Error(JSON.stringify(r.cache));
  return { key, cache: r.cache };
};

// Warnings: Node's process.emitWarning doesn't exist here, so the library
// warns through console.warn instead. Captures what it writes.
async function warningsDuring(fn) {
  const original = console.warn;
  const warnings = [];
  console.warn = (...args) => warnings.push(args.map(String).join(" "));
  try {
    return { value: await fn(), warnings };
  } finally {
    console.warn = original;
  }
}

checks["cached pipeline with a component that has no cache key"] = async () => {
  // An embedder with no cacheKey or getCacheKey(): the embeddings layer is
  // skipped, with a one-time warning.
  const embedder = {
    async embed(text) {
      return [text.length, 1];
    },
  };
  const retriever = new MemoryRetriever();
  await retriever.store([
    { id: "v", content: "twenty vacation days", vector: [20, 1] },
  ]);
  const { value: r, warnings } = await warningsDuring(() =>
    createRagPipeline({ embedder, retriever, cache: true }).run({
      query: "vacation days",
    }),
  );
  if (!r.success) throw new Error(r.error);
  if (r.cache.embeddings !== "skip") throw new Error(JSON.stringify(r.cache));
  if (!warnings.some((w) => w.includes("RagCacheWarning"))) {
    throw new Error(`no cache warning: ${JSON.stringify(warnings)}`);
  }
  return { cache: r.cache, warning: warnings[0] };
};

checks["CostCalculator.estimate() for a model with no price"] = async () => {
  const { value: cost, warnings } = await warningsDuring(() =>
    new CostCalculator().estimate("no-such-model", 1000, 500),
  );
  if (cost.totalCost !== 0) throw new Error(JSON.stringify(cost));
  if (!warnings.some((w) => w.includes("RAG_UNKNOWN_MODEL_PRICING"))) {
    throw new Error(`no pricing warning: ${JSON.stringify(warnings)}`);
  }
  return { totalCost: cost.totalCost, warning: warnings[0] };
};

checks["AnthropicConnector drops a temperature the model rejects"] =
  async () => {
    const llm = new AnthropicConnector({
      apiKey: "k",
      baseURL: "https://upstream.test",
      model: "claude-default-temperature-only",
      temperature: 0.2,
      maxRetries: 0,
    });
    const { value: answer, warnings } = await warningsDuring(() =>
      llm.generate("How many vacation days?"),
    );
    if (!/twenty days/i.test(answer)) throw new Error(String(answer));
    if (!warnings.some((w) => w.includes("RAG_ANTHROPIC_TEMPERATURE"))) {
      throw new Error(`no temperature warning: ${JSON.stringify(warnings)}`);
    }
    return { answer, warning: warnings[0] };
  };

checks["GuardrailsPipeline warns when the retrieval guard was skipped"] =
  async () => {
    // A wrapped pipeline that answers without returning results or calling
    // options.filterResults, so the configured retrieval guard sees nothing.
    const inner = {
      async run() {
        return { success: true, answer: "Employees get twenty days." };
      },
    };
    const guarded = new GuardrailsPipeline(inner, {
      preRetrieval: false,
      retrieval: { enforceACL: false, minRelevanceScore: 0.5 },
      postGeneration: false,
    });
    const { value: r, warnings } = await warningsDuring(() =>
      guarded.run({ query: "vacation days" }),
    );
    if (!r.success) throw new Error(r.error);
    if (!warnings.some((w) => w.includes("RAG_GUARDRAILS_RETRIEVAL_SKIPPED"))) {
      throw new Error(`no skipped warning: ${JSON.stringify(warnings)}`);
    }
    return { skipped: r.guardrails.retrieval.skipped, warning: warnings[0] };
  };

checks["QdrantRetriever.store point ids (sha256)"] = async () => {
  const q = new QdrantRetriever({
    url: "https://upstream.test",
    collection: "docs",
  });
  await q.store([{ id: "vacation", content: "twenty days", vector: [1, 0] }]);
  return "stored";
};

checks["createAiSdkAdapter and checkAnswer"] = async () => {
  // Stand-ins for the AI SDK's functions (they take a model object).
  const ai = {
    async embed({ value }) {
      return { embedding: [value.length, 1] };
    },
    async embedMany({ values }) {
      return { embeddings: values.map((v) => [v.length, 1]) };
    },
    async generateText() {
      return { text: "Employees get twenty vacation days per year." };
    },
    streamText() {
      return {
        textStream: (async function* () {
          yield "Twenty ";
          yield "days.";
        })(),
      };
    },
  };
  const { embedder, llm } = lib.createAiSdkAdapter({
    ai,
    embeddingModel: { provider: "fake", modelId: "e" },
    languageModel: { provider: "fake", modelId: "l" },
  });
  const retriever = new MemoryRetriever();
  await retriever.store([
    {
      id: "vacation",
      content: "Employees get twenty vacation days per year.",
      vector: await embedder.embed("x"),
    },
  ]);
  const r = await createRagPipeline({ embedder, retriever, llm }).run({
    query: "How many vacation days?",
  });
  if (!r.success) throw new Error(r.error);
  const check = await lib.checkAnswer({
    answer: r.answer,
    sources: r.results,
    question: "How many vacation days?",
  });
  if (!check.grounded) throw new Error(JSON.stringify(check.unsupported));
  return { answer: r.answer, groundedness: check.groundedness };
};

export default worker(checks);
