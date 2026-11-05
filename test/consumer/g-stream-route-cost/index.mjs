// Journey G: streaming, routing between two Claude models, and cost.
//
// - Streaming: Usage guide "Querying & Response Generation" (stream: true,
//   print chunk.token), with citations so the done chunk carries them.
//   One short call on claude-opus-5-5.
// - Routing: Performance docs "Routing queries to cheaper models", with the
//   real connectors its comment names in place of the stand-ins:
//   AnthropicConnector({ model: "claude-haiku-4-5" }) and AnthropicConnector().
// - Cost: Performance/Enterprise "CostTracker", wrapping the routed
//   pipeline, with the docs' own `model: "gpt-4o-mini"`.
import {
  createRagPipeline,
  createModelRouter,
  CostTracker,
  LocalEmbedder,
  MemoryRetriever,
  AnthropicConnector,
} from "@devilsdev/rag-pipeline-utils";

const docs = [
  { id: "vacation", content: "Employees get twenty vacation days." },
  {
    id: "contractors",
    content:
      "Contractors get ten vacation days because their contracts are renewed every six months.",
  },
];
const embedder = new LocalEmbedder();
embedder.train(docs.map((d) => d.content));
const retriever = new MemoryRetriever();
await retriever.store(
  docs.map((d) => ({ ...d, vector: embedder.embed(d.content) })),
);

const out = {};

// ---- streaming, token by token ------------------------------------------
{
  const pipeline = createRagPipeline({
    embedder,
    retriever,
    llm: new AnthropicConnector({ model: "claude-opus-5-5", maxTokens: 120 }),
  });
  const stream = await pipeline.run({
    query: "How many vacation days do employees get? One sentence.",
    options: { stream: true, citations: true },
  });
  let tokens = 0;
  let text = "";
  let done = null;
  for await (const chunk of stream) {
    if (!chunk.done) {
      process.stdout.write(chunk.token);
      tokens += 1;
      text += chunk.token;
    } else {
      done = chunk;
    }
  }
  process.stdout.write("\n");
  out.stream = {
    tokens,
    text,
    doneChunk: !!done,
    citations: done?.citations ? done.citations.groundednessScore : null,
    firstTokenMs: done?.timing?.firstTokenMs ?? null,
  };
}

// ---- routing between two Claude models ----------------------------------
{
  const llm = createModelRouter({
    routes: [
      {
        model: "claude-haiku-4-5",
        llm: new AnthropicConnector({
          model: "claude-haiku-4-5",
          maxTokens: 150,
        }),
        handles: ["simple"],
      },
      {
        model: "claude-sonnet-5-5",
        llm: new AnthropicConnector({ maxTokens: 200 }),
      }, // every class
    ],
  });
  const pipeline = createRagPipeline({ embedder, retriever, llm });

  const simple = await pipeline.run({
    query: "How many vacation days do I get?",
  });
  console.log(simple.route);
  const complex = await pipeline.run({
    query: "Why do contractors get fewer days?",
  });
  console.log(complex.route?.model);
  out.route = {
    simple: simple.route ?? null,
    simpleSuccess: simple.success,
    simpleError: simple.error ?? null,
    complex: complex.route ?? null,
    complexSuccess: complex.success,
    complexError: complex.error ?? null,
  };

  // ---- CostTracker over the routed pipeline -----------------------------
  // As in the docs; "CostTracker prices routed runs at the chosen model".
  const tracker = new CostTracker({
    model: "gpt-4o-mini",
    enableBudget: true,
    budgetOptions: { maxCost: 5 }, // USD
  });
  const tracked = tracker.wrap(pipeline);
  const result = await tracked.run({ query: "What is the vacation policy?" });
  console.log(result.cost); // { inputTokens, outputTokens, estimatedCost, model, currency }
  console.log(tracker.getSummary());
  out.cost = {
    success: result.success,
    cost: result.cost ?? null,
    summary: tracker.getSummary(),
    route: result.route ?? null,
  };
}

console.log("RESULT " + JSON.stringify(out));
