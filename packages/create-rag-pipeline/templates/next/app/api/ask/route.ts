/**
 * POST /api/ask { question } -> { answer, sources, grounding }
 *
 * The AI SDK model is wrapped with groundingMiddleware: before the call it
 * retrieves passages for the question and gives them to the model as
 * reference data; after the call it checks every sentence of the answer
 * against them. Without ANTHROPIC_API_KEY the route returns the passages
 * only (answer: null).
 */

import { anthropic } from "@ai-sdk/anthropic";
import { groundingMiddleware } from "@devilsdev/rag-pipeline-utils";
import { generateText, wrapLanguageModel } from "ai";
import { getIndex } from "@/lib/rag";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const { question } = (await request.json().catch(() => ({}))) as {
    question?: unknown;
  };
  if (typeof question !== "string" || !question.trim()) {
    return Response.json({ error: "Send { question }" }, { status: 400 });
  }

  const { embedder, retriever } = await getIndex();

  if (!process.env.ANTHROPIC_API_KEY) {
    const results = await retriever.retrieve({
      query: question,
      queryVector: await embedder.embed(question),
      topK: 3,
    });
    return Response.json({
      answer: null,
      sources: results.map((r: any) => ({
        id: r.id,
        source: r.metadata?.source,
        content: r.content,
      })),
      grounding: null,
    });
  }

  const model = wrapLanguageModel({
    model: anthropic(process.env.ANTHROPIC_MODEL || "claude-sonnet-5-5"),
    middleware: groundingMiddleware({
      retriever,
      embedder,
      topK: 3,
      specificationVersion: "v4",
    }),
  });

  try {
    const result = await generateText({ model, prompt: question });
    const report = result.providerMetadata?.ragPipeline as
      | { grounded?: boolean; groundedness?: number; unsupported?: string[] }
      | undefined;
    return Response.json({
      answer: result.text,
      sources: result.sources.map((s: any) => ({
        id: s.id,
        source: s.title ?? s.id,
      })),
      grounding: report
        ? {
            grounded: report.grounded,
            groundedness: report.groundedness,
            unsupported: report.unsupported ?? [],
          }
        : null,
    });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 502 },
    );
  }
}
