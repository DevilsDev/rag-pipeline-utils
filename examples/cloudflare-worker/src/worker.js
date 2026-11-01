/**
 * A RAG API on Cloudflare Workers.
 *
 *   GET  /ask?q=...            answer as JSON (passages only without an API key)
 *   GET  /ask?q=...&stream=1   answer as server-sent events, token by token
 *
 * The documents are bundled with the Worker (./docs.js) and indexed in
 * memory on the first request with the built-in TF-IDF embedder, so there is
 * no database and no embedding API. Set the ANTHROPIC_API_KEY secret to
 * generate answers with Claude; without it the Worker returns the passages.
 * Needs the nodejs_compat compatibility flag (see wrangler.toml).
 */

import {
  AnthropicConnector,
  LocalEmbedder,
  MemoryRetriever,
  createRagPipeline,
} from "@devilsdev/rag-pipeline-utils";
import { documents } from "./docs.js";

/** One index per isolate, built on first use. */
let index;
async function getIndex() {
  if (!index) {
    index = (async () => {
      const embedder = new LocalEmbedder();
      embedder.train(documents);
      const retriever = new MemoryRetriever();
      await retriever.store(
        await Promise.all(
          documents.map(async (doc) => ({
            ...doc,
            vector: await embedder.embed(doc.content),
          })),
        ),
      );
      return { embedder, retriever };
    })();
  }
  return index;
}

function pipelineFor(env, { embedder, retriever }) {
  const llm = env.ANTHROPIC_API_KEY
    ? new AnthropicConnector({
        apiKey: env.ANTHROPIC_API_KEY,
        ...(env.ANTHROPIC_MODEL && { model: env.ANTHROPIC_MODEL }),
        maxTokens: 512,
      })
    : undefined;
  return createRagPipeline({ embedder, retriever, llm });
}

const sources = (results) =>
  results.map((d) => ({
    id: d.id,
    source: d.metadata?.source,
    score: d.score,
  }));

/** The stream as server-sent events: `token` events, then one `done`. */
function eventStream(stream) {
  const encoder = new TextEncoder();
  return new ReadableStream({
    async start(controller) {
      const send = (event, data) =>
        controller.enqueue(
          encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`),
        );
      try {
        for await (const chunk of stream) {
          if (chunk.token) send("token", chunk.token);
          if (chunk.done) {
            send("done", {
              ...(chunk.results && { sources: sources(chunk.results) }),
              groundedness: chunk.citations?.groundednessScore,
              timing: chunk.timing,
            });
          }
        }
      } catch (error) {
        send("error", { message: String(error?.message || error) });
      }
      controller.close();
    },
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname !== "/ask") {
      return Response.json(
        { error: "Ask with GET /ask?q=your+question" },
        { status: 404 },
      );
    }
    const query = (url.searchParams.get("q") || "").trim();
    if (!query) {
      return Response.json({ error: "Missing ?q=" }, { status: 400 });
    }

    const pipeline = pipelineFor(env, await getIndex());
    const options = { topK: 3, citations: true, timeout: 30000 };

    if (url.searchParams.get("stream") === "1") {
      const stream = await pipeline.run({
        query,
        options: { ...options, stream: true },
      });
      if (stream.success === false) {
        return Response.json({ error: stream.error }, { status: 502 });
      }
      return new Response(eventStream(stream), {
        headers: {
          "content-type": "text/event-stream; charset=utf-8",
          "cache-control": "no-store",
        },
      });
    }

    const result = await pipeline.run({ query, options });
    if (!result.success) {
      return Response.json({ error: result.error }, { status: 502 });
    }
    return Response.json({
      answer: result.answer,
      sources: sources(result.results),
      groundedness: result.citations?.groundednessScore,
      timing: result.timing,
    });
  },
};
