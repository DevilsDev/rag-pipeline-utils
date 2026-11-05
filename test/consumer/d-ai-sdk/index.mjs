// Journey D: a Vercel AI SDK app grounded with groundingMiddleware
// (Integrations docs "Ground an AI SDK app with middleware"), with Claude
// through @ai-sdk/anthropic in place of the docs' @ai-sdk/openai.
//
// The docs' snippets use `retriever` and `embedder` without defining them;
// the developer builds them as in the README quick start. Anthropic has no
// embedding model, so createAiSdkAdapter (Integrations "Vercel AI SDK models
// in a pipeline") is used with a language model only, next to LocalEmbedder,
// and for the judge, as in "Judge paraphrases".
import { generateText, streamText, wrapLanguageModel } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import {
  createAiSdkAdapter,
  createRagPipeline,
  groundingMiddleware,
  LocalEmbedder,
  MemoryRetriever,
} from "@devilsdev/rag-pipeline-utils";

const docs = [
  {
    id: "vacation",
    content:
      "Full-time employees receive twenty days of paid vacation per year.",
  },
  {
    id: "remote",
    content: "Remote work is allowed two days per week with manager approval.",
  },
];
const embedder = new LocalEmbedder();
embedder.train(docs.map((doc) => doc.content));
const retriever = new MemoryRetriever();
await retriever.store(
  docs.map((doc) => ({ ...doc, vector: embedder.embed(doc.content) })),
);

const out = {};
const errorOf = (e) => `${e && e.name}: ${e && e.message}`.slice(0, 400);

// ---- generateText with the middleware (docs example) --------------------
const model = wrapLanguageModel({
  model: anthropic("claude-haiku-4-5"),
  middleware: groundingMiddleware({ retriever, embedder, topK: 4 }),
});

try {
  const { text, sources, providerMetadata } = await generateText({
    model,
    prompt: "How many vacation days do I get?",
    maxOutputTokens: 200,
  });
  console.log(text);
  out.generate = {
    text,
    sources: (sources || []).length,
    sourceIds: (sources || []).map((s) => s.id),
    grounded: providerMetadata?.ragPipeline?.grounded,
    unsupported: providerMetadata?.ragPipeline?.unsupported?.length,
    hasReport: !!providerMetadata?.ragPipeline,
  };
} catch (e) {
  out.generate = { error: errorOf(e) };
}

// ---- streamText: report with the last part -------------------------------
try {
  const result = streamText({
    model,
    prompt: "Can I work from home?",
    maxOutputTokens: 200,
  });
  let streamed = "";
  let parts = 0;
  for await (const delta of result.textStream) {
    streamed += delta;
    parts += 1;
  }
  const providerMetadata = await result.providerMetadata;
  const sources = await result.sources;
  out.stream = {
    text: streamed,
    parts,
    grounded: providerMetadata?.ragPipeline?.grounded,
    hasReport: !!providerMetadata?.ragPipeline,
    sources: (sources || []).length,
  };
} catch (e) {
  out.stream = { error: errorOf(e) };
}

// ---- judge on the base model (docs "Judge paraphrases") -----------------
try {
  const base = anthropic("claude-haiku-4-5");
  const { llm: judge } = createAiSdkAdapter({
    ai: { generateText },
    languageModel: base,
  });
  const judged = wrapLanguageModel({
    model: base,
    middleware: groundingMiddleware({ retriever, embedder, judge }),
  });
  const { providerMetadata } = await generateText({
    model: judged,
    prompt: "How many vacation days do I get?",
    maxOutputTokens: 200,
  });
  out.judge = {
    hasJudge: !!providerMetadata?.ragPipeline?.judge,
    verdicts: providerMetadata?.ragPipeline?.judge?.verdicts?.length ?? null,
    calls: providerMetadata?.ragPipeline?.judge?.calls ?? null,
    error: providerMetadata?.ragPipeline?.judge?.error ?? null,
  };
} catch (e) {
  out.judge = { error: errorOf(e) };
}

// ---- createAiSdkAdapter as the pipeline's llm ---------------------------
try {
  const { llm } = createAiSdkAdapter({
    ai: { generateText, streamText },
    languageModel: anthropic("claude-haiku-4-5"),
    settings: { temperature: 0, maxOutputTokens: 200 },
  });
  const pipeline = createRagPipeline({ embedder, retriever, llm });
  const result = await pipeline.run({
    query: "How many vacation days do I get?",
    options: { citations: true },
  });
  out.adapter = {
    success: result.success,
    error: result.error ?? null,
    answer: result.answer,
    groundedness: result.citations?.groundednessScore ?? null,
  };
  const stream = await pipeline.run({
    query: "Can I work from home?",
    options: { stream: true },
  });
  let tokens = 0;
  let text = "";
  for await (const chunk of stream) {
    if (!chunk.done) {
      tokens += 1;
      text += chunk.token;
    }
  }
  out.adapter.streamTokens = tokens;
  out.adapter.streamText = text;
} catch (e) {
  out.adapter = { error: errorOf(e) };
}

console.log("RESULT " + JSON.stringify(out));
