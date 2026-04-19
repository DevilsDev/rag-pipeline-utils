/**
 * Minimal end-to-end RAG service.
 *
 * Endpoints:
 *   POST /query           Run a RAG query, return answer + citations + evaluation
 *   POST /ingest          Index a document (text body)
 *   GET  /health          Liveness + dependency check
 *   GET  /                Hello / usage hint
 *
 * This file is intentionally short — the framework does the heavy
 * lifting. The interesting piece is the GuardrailsPipeline wiring.
 */

import Fastify from "fastify";
import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";
import {
  createRagPipeline,
  GuardrailsPipeline,
  MemoryRetriever,
  OpenAIConnector,
} from "@devilsdev/rag-pipeline-utils";

// --- Pipeline construction --------------------------------------------------

const retriever = new MemoryRetriever();

const llm = new OpenAIConnector({
  apiKey: process.env.OPENAI_API_KEY,
  model: process.env.OPENAI_MODEL ?? "gpt-4o-mini",
});

const basePipeline = createRagPipeline({ retriever, llm });

const pipeline = new GuardrailsPipeline(basePipeline, {
  preRetrieval: {
    enableInjectionDetection: true,
    maxQueryLength: 1000,
  },
  retrieval: {
    minRelevanceScore: 0.5,
    maxContextTokens: 4000,
  },
  postGeneration: {
    enablePIIDetection: true,
    minGroundedness: 0.6,
  },
});

// --- HTTP layer -------------------------------------------------------------

const app = Fastify({
  logger: { level: process.env.LOG_LEVEL ?? "info" },
  trustProxy: true,
});

await app.register(cors, { origin: true });
await app.register(rateLimit, {
  max: Number(process.env.RATE_LIMIT_MAX ?? 60),
  timeWindow: "1 minute",
});

app.get("/", async () => ({
  service: "fastify-rag-demo",
  version: "1.0.0",
  framework: "@devilsdev/rag-pipeline-utils",
  endpoints: {
    "POST /ingest": {
      body: { id: "string", text: "string", metadata: "object?" },
    },
    "POST /query": { body: { query: "string" } },
    "GET /health": "liveness check",
  },
}));

app.get("/health", async () => {
  const indexed = (await retriever.size?.()) ?? null;
  return {
    status: "ok",
    indexed,
    llmConfigured: Boolean(process.env.OPENAI_API_KEY),
  };
});

app.post(
  "/ingest",
  {
    schema: {
      body: {
        type: "object",
        required: ["id", "text"],
        properties: {
          id: { type: "string", maxLength: 256 },
          text: { type: "string", minLength: 1, maxLength: 100_000 },
          metadata: { type: "object", additionalProperties: true },
        },
      },
    },
  },
  async (req, reply) => {
    const { id, text, metadata = {} } = req.body;
    await retriever.upsert?.({ id, text, metadata });
    reply.code(201);
    return { ingested: id };
  },
);

app.post(
  "/query",
  {
    schema: {
      body: {
        type: "object",
        required: ["query"],
        properties: {
          query: { type: "string", minLength: 1, maxLength: 1000 },
        },
      },
    },
  },
  async (req, reply) => {
    const { query } = req.body;

    const result = await pipeline.run({
      query,
      options: { citations: true, evaluate: true },
    });

    if (result.blocked) {
      reply.code(422);
      return {
        blocked: true,
        reason: result.blockReason,
      };
    }

    return {
      answer: result.answer,
      citations: result.citations,
      groundednessScore: result.citations?.groundednessScore,
      evaluation: result.evaluation?.scores,
      retrievedCount: result.results?.length ?? 0,
    };
  },
);

// --- Boot -------------------------------------------------------------------

const port = Number(process.env.PORT ?? 3000);
const host = process.env.HOST ?? "0.0.0.0";

try {
  await app.listen({ port, host });
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
