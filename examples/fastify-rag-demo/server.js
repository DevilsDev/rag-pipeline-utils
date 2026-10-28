/**
 * Minimal end-to-end RAG service.
 *
 * Endpoints:
 *   POST /query           Run a RAG query, return answer + citations + evaluation
 *   POST /ingest          Index a document (text body)
 *   GET  /health          Liveness + mode check
 *   GET  /                Hello / usage hint
 *
 * Modes:
 *   default       OpenAIConnector embeds documents/queries and generates
 *                 answers (needs OPENAI_API_KEY)
 *   RAG_OFFLINE=1 (or `node server.js --offline`) LocalEmbedder (TF-IDF) +
 *                 an extractive stub llm; no API keys or network. For trying
 *                 the service and CI smoke tests.
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
  LocalEmbedder,
  MemoryRetriever,
  OpenAIConnector,
} from "@devilsdev/rag-pipeline-utils";

const OFFLINE =
  ["1", "true"].includes(process.env.RAG_OFFLINE ?? "") ||
  process.argv.includes("--offline");
const QUERY_TIMEOUT_MS = Number(process.env.QUERY_TIMEOUT_MS ?? 30_000);

// --- Pipeline construction --------------------------------------------------

const retriever = new MemoryRetriever();

/** Ingested documents by id; the offline mode re-indexes from these. */
const documents = new Map();

let embedder;
let llm;

if (OFFLINE) {
  // LocalEmbedder's vector size is its vocabulary size, so every ingest
  // retrains it and re-embeds all documents (fine for a demo-sized corpus).
  embedder = new LocalEmbedder();
  // Extractive stub: answers with the first sentence of the best document.
  llm = {
    async generate(query, docs = [], options = {}) {
      if (options.signal?.aborted) throw options.signal.reason;
      if (docs.length === 0) return "No relevant documents were found.";
      return (docs[0].content ?? "").split(/(?<=\.)\s+/)[0];
    },
  };
} else {
  // One connector serves as both embedder and llm. The key is read here;
  // calls without one fail fast with code MISSING_API_KEY.
  const openai = new OpenAIConnector({
    apiKey: process.env.OPENAI_API_KEY,
    model: process.env.OPENAI_MODEL ?? "gpt-4o-mini",
  });
  embedder = openai;
  llm = openai;
}

const basePipeline = createRagPipeline({ embedder, retriever, llm });

// strict: true makes a failed guard block the request (422 below) instead
// of only being reported.
const pipeline = new GuardrailsPipeline(basePipeline, {
  strict: true,
  preRetrieval: {
    enableInjectionDetection: true,
    maxQueryLength: 1000,
  },
  retrieval: {
    minRelevanceScore: Number(process.env.MIN_RELEVANCE_SCORE ?? 0.2),
  },
  postGeneration: {
    enablePIIDetection: true,
    groundednessThreshold: 0.3,
  },
});

// Serialise index updates so concurrent ingests don't interleave.
let indexing = Promise.resolve();

function ingest(id, text, metadata) {
  const task = indexing.then(async () => {
    documents.set(id, { text, metadata });
    if (OFFLINE) {
      embedder.train([...documents.values()].map((d) => d.text));
      await retriever.clear();
      const all = [];
      for (const [docId, doc] of documents) {
        all.push(toRecord(docId, doc, embedder.embed(doc.text)));
      }
      await retriever.store(all);
    } else {
      const vector = await embedder.embed(text);
      await retriever.store([toRecord(id, { text, metadata }, vector)]);
    }
  });
  indexing = task.catch(() => {});
  return task;
}

function toRecord(id, doc, vector) {
  return { id, vector, content: doc.text, metadata: doc.metadata };
}

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
  mode: OFFLINE ? "offline" : "openai",
  endpoints: {
    "POST /ingest": {
      body: { id: "string", text: "string", metadata: "object?" },
    },
    "POST /query": { body: { query: "string" } },
    "GET /health": "liveness check",
  },
}));

app.get("/health", async () => ({
  status: "ok",
  mode: OFFLINE ? "offline" : "openai",
  indexed: retriever.getStats().documentCount,
  llmConfigured: OFFLINE || Boolean(process.env.OPENAI_API_KEY),
}));

app.post(
  "/ingest",
  {
    schema: {
      body: {
        type: "object",
        required: ["id", "text"],
        properties: {
          id: { type: "string", minLength: 1, maxLength: 256 },
          text: { type: "string", minLength: 1, maxLength: 100_000 },
          metadata: { type: "object", additionalProperties: true },
        },
      },
    },
  },
  async (req, reply) => {
    const { id, text, metadata = {} } = req.body;
    try {
      await ingest(id, text, metadata);
    } catch (err) {
      req.log.error({ err }, "ingest failed");
      reply.code(502);
      return { error: err.message, code: err.code };
    }
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

    // Cancel the pipeline (embedding, retrieval, LLM call) if the client
    // disconnects before the response is sent.
    const controller = new AbortController();
    reply.raw.on("close", () => {
      if (!reply.raw.writableFinished) controller.abort();
    });

    // GuardrailsPipeline always requests citations.
    const result = await pipeline.run({
      query,
      options: {
        evaluate: true,
        timeout: QUERY_TIMEOUT_MS,
        signal: controller.signal,
      },
    });

    if (!result.success) {
      const g = result.guardrails ?? {};
      if (g.preRetrieval?.safe === false || g.postGeneration?.safe === false) {
        reply.code(422);
        return {
          blocked: true,
          reason: result.error,
          issues: [
            ...(g.preRetrieval?.issues ?? []),
            ...(g.postGeneration?.issues ?? []),
          ],
        };
      }
      reply.code(502);
      return { error: result.error };
    }

    return {
      answer: result.answer,
      citations: result.citations?.citations ?? [],
      groundednessScore: result.citations?.groundednessScore,
      evaluation: result.evaluation?.scores,
      retrievedCount: result.results?.length ?? 0,
      filteredOut: result.guardrails?.retrieval?.removed?.length ?? 0,
    };
  },
);

// --- Boot -------------------------------------------------------------------

const port = Number(process.env.PORT ?? 3000);
const host = process.env.HOST ?? "0.0.0.0";

try {
  await app.listen({ port, host });
  app.log.info(`mode: ${OFFLINE ? "offline" : "openai"}`);
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
