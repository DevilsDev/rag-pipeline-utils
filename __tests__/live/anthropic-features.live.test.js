"use strict";

/**
 * Every feature of the package that calls a model, against the real Claude
 * API: npm run test:live. Haiku with short outputs, a few cents a run;
 * skipped without a key (see live-env.js).
 */

const { liveAnthropic, MODEL } = require("./live-env");
const ai = require("ai");
const { createAnthropic } = require("@ai-sdk/anthropic");
const { execFileSync } = require("child_process");
const path = require("path");

const {
  AnthropicConnector,
} = require("../../src/connectors/anthropic-connector");
const { createRagPipeline } = require("../../src/core/create-pipeline");
const { MemoryRetriever } = require("../../src/connectors/memory-retriever");
const { BM25Search } = require("../../src/retrieval/bm25-search");
const { HashEmbedder, runContractTests } = require("../../src/testing");
const { createAiSdkAdapter } = require("../../src/adapters/ai-sdk");
const { groundingMiddleware } = require("../../src/adapters/ai-sdk-middleware");
const { AgenticPipeline } = require("../../src/agentic/agentic-pipeline");
const { QueryPlanner } = require("../../src/agentic/query-planner");
const { createModelRouter } = require("../../src/cost/model-router");
const { CostTracker } = require("../../src/cost/cost-tracker");
const { generateSyntheticDataset } = require("../../src/evaluate/synthetic");
const {
  fromAnthropicCitations,
  verifyCitations,
} = require("../../src/grounding/provider-citations");

const { apiKey, reason } = liveAnthropic();
const describeLive = apiKey ? describe : describe.skip;
if (!apiKey) {
  // eslint-disable-next-line no-console
  console.warn(`Skipping live Claude feature tests: ${reason}`);
}

jest.setTimeout(90000);

const DOCS = [
  {
    id: "vacation",
    content:
      "Full-time employees receive twenty days of paid vacation per year. Unused days can be carried over for up to twelve months.",
    metadata: { source: "handbook/vacation.md" },
  },
  {
    id: "remote",
    content:
      "Remote work is allowed two days per week with manager approval. Employees must be reachable from 10:00 to 15:00.",
    metadata: { source: "handbook/remote.md" },
  },
  {
    id: "parking",
    content:
      "Parking at the main office is free for all employees. Visitors park in the north lot.",
    metadata: { source: "handbook/parking.md" },
  },
];

const claude = (options = {}) =>
  new AnthropicConnector({ apiKey, model: MODEL, maxTokens: 300, ...options });

async function memoryRetriever() {
  const embedder = new HashEmbedder();
  const retriever = new MemoryRetriever();
  await retriever.store(
    await Promise.all(
      DOCS.map(async (d) => ({
        ...d,
        vector: await embedder.embed(d.content),
      })),
    ),
  );
  return { embedder, retriever };
}

function bm25() {
  const search = new BM25Search();
  search.index(DOCS);
  return {
    retrieve: ({ query, topK = 3 }) => search.search(query, { k: topK }),
  };
}

describeLive("the llm contract, live", () => {
  // The same checks a community LLM plugin must pass
  runContractTests("llm", () => claude());
});

describeLive("Claude through the package's features, live", () => {
  test("a streamed pipeline run ends with citations and evaluation", async () => {
    const { embedder, retriever } = await memoryRetriever();
    const pipeline = createRagPipeline({ embedder, retriever, llm: claude() });
    const stream = await pipeline.run({
      query: "How many vacation days do full-time employees get?",
      options: { stream: true, topK: 2, citations: true, evaluate: true },
    });
    let text = "";
    let done;
    for await (const chunk of stream) {
      text += chunk.token || "";
      if (chunk.done) done = chunk;
    }
    expect(text.toLowerCase()).toMatch(/twenty|20/);
    expect(done.citations.groundednessScore).toBeGreaterThan(0);
    expect(done.timing.firstTokenMs).toBeGreaterThan(0);
  });

  test("an abort stops a Claude call", async () => {
    const controller = new AbortController();
    const pending = claude({ maxTokens: 1000 }).generate(
      "Write a long essay about vacation policies.",
      [],
      { signal: controller.signal },
    );
    setTimeout(() => controller.abort(), 50);
    await expect(pending).rejects.toThrow();
  });

  test("createModelRouter sends simple and complex questions to different Claude models", async () => {
    const { embedder, retriever } = await memoryRetriever();
    const router = createModelRouter({
      routes: [
        { llm: claude(), model: MODEL, handles: ["simple"] },
        {
          llm: claude({ model: "claude-sonnet-5-5" }),
          model: "claude-sonnet-5-5",
          handles: ["complex"],
        },
      ],
    });
    const pipeline = createRagPipeline({ embedder, retriever, llm: router });
    const simple = await pipeline.run({ query: "How many vacation days?" });
    const complex = await pipeline.run({
      query:
        "Explain why the remote work rule and the vacation carry-over rule might interact, and compare the two.",
    });
    expect(simple.success && complex.success).toBe(true);
    expect(simple.route).toMatchObject({ class: "simple", model: MODEL });
    expect(complex.route).toMatchObject({
      class: "complex",
      model: "claude-sonnet-5-5",
    });
    expect(complex.route.estimatedCost).toBeGreaterThan(0);
  });

  test("CostTracker prices Claude runs", async () => {
    const { embedder, retriever } = await memoryRetriever();
    const tracker = new CostTracker({ model: MODEL });
    const pipeline = tracker.wrap(
      createRagPipeline({ embedder, retriever, llm: claude() }),
    );
    const result = await pipeline.run({ query: "How many vacation days?" });
    expect(result.cost.estimatedCost).toBeGreaterThan(0);
    expect(result.cost.inputTokens).toBeGreaterThan(0);
  });

  test("QueryPlanner splits a compound question with Claude", async () => {
    const planner = new QueryPlanner();
    const plan = await planner.plan(
      "How many vacation days do employees get, and how many remote days are allowed per week?",
      { llm: claude() },
    );
    const subQueries = plan.subQueries || plan.queries || plan;
    expect(Array.isArray(subQueries)).toBe(true);
    expect(subQueries.length).toBeGreaterThanOrEqual(2);
  });

  test("AgenticPipeline plans, retrieves, answers and critiques with Claude", async () => {
    const { embedder, retriever } = await memoryRetriever();
    const agent = new AgenticPipeline({
      enableLlmPlanning: true,
      enableCritique: true,
    });
    const result = await agent.run({
      query:
        "How many vacation days do employees get, and how many remote days are allowed?",
      retriever,
      embedder,
      llm: claude(),
    });
    expect(result.answer.toLowerCase()).toMatch(/twenty|20/);
    expect(result.answer.toLowerCase()).toMatch(/two|2/);
    expect(result.critique).toBeDefined();
  });

  test("generateSyntheticDataset writes grounded questions with Claude", async () => {
    const { cases } = await generateSyntheticDataset(DOCS, {
      llm: claude(),
      count: 3,
    });
    expect(cases.length).toBeGreaterThan(0);
    for (const c of cases) {
      expect(typeof c.prompt).toBe("string");
      expect(c.prompt.length).toBeGreaterThan(5);
      expect(c.sourceIds.length).toBeGreaterThan(0);
    }
  });

  test("verifyCitations with Claude as the judge", async () => {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 300,
        messages: [
          {
            role: "user",
            content: [
              ...DOCS.map((d) => ({
                type: "document",
                source: {
                  type: "text",
                  media_type: "text/plain",
                  data: d.content,
                },
                title: d.id,
                citations: { enabled: true },
              })),
              { type: "text", text: "Where can visitors park?" },
            ],
          },
        ],
      }),
    });
    const message = await res.json();
    expect(res.ok).toBe(true);
    const check = await verifyCitations(
      fromAnthropicCitations(message, { documents: DOCS }),
      { judge: claude() },
    );
    expect(check.claims.length).toBeGreaterThan(0);
    expect(
      check.claims.every((c) => c.citations[0].sourceId === "parking"),
    ).toBe(true);
    expect(check.verified).toBe(true);
    expect(check.judge.calls).toBeLessThanOrEqual(1);
  });
});

describe("AI SDK 6 with Claude, live", () => {
  const sdk = ai;
  const provider = () => createAnthropic({ apiKey });
  const run = apiKey ? test : test.skip;

  run(
    "createAiSdkAdapter: a pipeline answers through an AI SDK Claude model",
    async () => {
      const { embedder, retriever } = await memoryRetriever();
      const { llm } = createAiSdkAdapter({
        ai: sdk,
        languageModel: provider()(MODEL),
        settings: { maxOutputTokens: 200 },
      });
      const pipeline = createRagPipeline({ embedder, retriever, llm });
      const result = await pipeline.run({
        query: "How many remote days are allowed per week?",
        options: { citations: true },
      });
      expect(result.success).toBe(true);
      expect(result.answer.toLowerCase()).toMatch(/two|2/);
    },
  );

  run(
    "groundingMiddleware: generateText is grounded and reports its sources",
    async () => {
      const result = await sdk.generateText({
        model: sdk.wrapLanguageModel({
          model: provider()(MODEL),
          middleware: groundingMiddleware({ retriever: bm25(), topK: 1 }),
        }),
        prompt: "How many vacation days do full-time employees get?",
        maxOutputTokens: 200,
      });
      const report = result.providerMetadata.ragPipeline;
      expect(report.sources[0].id).toBe("vacation");
      expect(result.text.toLowerCase()).toMatch(/twenty|20/);
      expect(typeof report.groundedness).toBe("number");
      expect(result.sources[0]).toMatchObject({ id: "vacation" });
    },
  );

  run("groundingMiddleware: streamText with Claude as the judge", async () => {
    const result = sdk.streamText({
      model: sdk.wrapLanguageModel({
        model: provider()(MODEL),
        middleware: groundingMiddleware({
          retriever: bm25(),
          topK: 1,
          judge: claude(),
        }),
      }),
      prompt: "Where do visitors park?",
      maxOutputTokens: 200,
    });
    let text = "";
    for await (const part of result.textStream) text += part;
    const metadata = await result.providerMetadata;
    expect(text.toLowerCase()).toMatch(/north/);
    expect(metadata.ragPipeline.sources[0].id).toBe("parking");
    expect(metadata.ragPipeline.judge).toBeDefined();
  });
});

describe("AI SDK 7 with Claude, live", () => {
  const run = apiKey ? test : test.skip;

  // ai 7 is ESM only: ai-sdk-v7.live.mjs runs in its own process
  run(
    "createAiSdkAdapter and groundingMiddleware (generateText, streamText with the judge)",
    () => {
      const out = JSON.parse(
        execFileSync(
          process.execPath,
          [path.join(__dirname, "ai-sdk-v7.live.mjs")],
          {
            env: {
              ...process.env,
              ANTHROPIC_API_KEY: apiKey,
              LIVE_DOCS: JSON.stringify(DOCS),
            },
            encoding: "utf8",
            timeout: 120000,
          },
        )
          .trim()
          .split("\n")
          .pop(),
      );
      expect(out.version).toMatch(/^7\./);
      expect(out.adapter.success).toBe(true);
      expect(out.adapter.answer.toLowerCase()).toMatch(/two|2/);
      expect(out.generate.sourceId).toBe("vacation");
      expect(out.generate.sdkSourceId).toBe("vacation");
      expect(out.generate.text.toLowerCase()).toMatch(/twenty|20/);
      expect(typeof out.generate.groundedness).toBe("number");
      expect(out.stream.sourceId).toBe("parking");
      expect(out.stream.text.toLowerCase()).toMatch(/north/);
      expect(out.stream.judge).toBe(true);
    },
  );
});
