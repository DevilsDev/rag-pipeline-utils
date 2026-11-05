// Journey B: the quick-start pipeline in strict TypeScript (module NodeNext),
// typed with the package's exported types. "TypeScript declarations
// included" (README); the type names are the ones the API reference lists.
import {
  createRagPipeline,
  LocalEmbedder,
  MemoryRetriever,
  AnthropicConnector,
  checkAnswer,
  type PipelineRunResult,
  type SearchResult,
} from "@devilsdev/rag-pipeline-utils";

interface Doc {
  id: string;
  content: string;
}

const docs: Doc[] = [
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

const llm = new AnthropicConnector({
  model: "claude-haiku-4-5",
  maxTokens: 300,
});

const pipeline = createRagPipeline({ embedder, retriever, llm });
const result: PipelineRunResult = await pipeline.run({
  query: "How many vacation days do I get?",
  options: { citations: true, evaluate: true, topK: 2 },
});

// Changed from the README's `result.results[0]` / `result.answer`: in the
// declarations `results` and `answer` are optional even on success, so
// strict mode rejects the README pattern (TS18048, TS2322).
const top: SearchResult | undefined = result.results?.[0];
const answer: string | null = result.answer ?? null;
const groundedness: number | undefined = result.citations?.groundednessScore;
const faithfulness: number | undefined = result.evaluation?.scores.faithfulness;

// Check the answer the way the README's "Check an answer" shows
const check = await checkAnswer({
  question: "How many vacation days do I get?",
  answer: answer ?? "",
  sources: result.results ?? [],
});
const grounded: boolean = check.grounded;

console.log(answer);
console.log(
  "RESULT " +
    JSON.stringify({
      success: result.success,
      error: result.error ?? null,
      topId: top?.id ?? null,
      answer,
      groundedness: groundedness ?? null,
      faithfulness: faithfulness ?? null,
      grounded,
      unsupported: check.unsupported.length,
    }),
);
