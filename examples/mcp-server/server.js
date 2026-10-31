#!/usr/bin/env node
/**
 * An MCP server that lets Claude (or any MCP client) search your documents.
 *
 * It serves one tool, `search_documents`, over stdio. The tool runs a
 * retrieval-only @devilsdev/rag-pipeline-utils pipeline against the index
 * that `rag-pipeline ingest` builds, and returns the best passages with
 * their sources. The assistant is the language model, so no LLM or API key
 * is needed here.
 *
 *   npm run ingest     # index ./docs into .rag/index.json
 *   npm start          # what your MCP client runs
 *
 * Environment:
 *   RAG_INDEX   path of the index (default: .rag/index.json next to this file)
 *   RAG_TOP_K   passages per search by default (default: 4)
 *
 * stdout carries the MCP protocol, so this file only ever logs to stderr.
 */

import { fileURLToPath } from "node:url";
import path from "node:path";
import fs from "node:fs";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import {
  createRagPipeline,
  FileVectorStore,
  LocalEmbedder,
} from "@devilsdev/rag-pipeline-utils";

const here = path.dirname(fileURLToPath(import.meta.url));
const indexPath = path.resolve(
  process.env.RAG_INDEX || path.join(here, ".rag", "index.json"),
);
const defaultTopK = Number(process.env.RAG_TOP_K || 4);

/** The pipeline over the ingested index, or a reason it isn't ready. */
function openIndex() {
  if (!fs.existsSync(indexPath)) {
    return { error: `No index at ${indexPath}. Run \`npm run ingest\` first.` };
  }
  const retriever = new FileVectorStore({ path: indexPath });
  const embedder = new LocalEmbedder();
  // The index stores the embedder's vocabulary from ingestion; queries must
  // embed into the same space.
  const info = retriever.getEmbedderInfo();
  if (!info || info.name !== "local" || !info.state) {
    return {
      error:
        "This example reads indexes built with the local embedder (`rag-pipeline init` default). " +
        "For another embedder, construct it here the same way your .ragrc.json does.",
    };
  }
  embedder.setState(info.state);
  return { pipeline: createRagPipeline({ embedder, retriever }) };
}

/** Passages as text the assistant can quote and cite. */
function formatResults(results) {
  if (!results.length) return "No matching passages were found.";
  return results
    .map((r, i) => {
      const source = (r.metadata && r.metadata.source) || r.id;
      return `[${i + 1}] ${source} (score ${r.score.toFixed(3)})\n${r.content}`;
    })
    .join("\n\n");
}

const server = new McpServer({ name: "rag-pipeline-utils", version: "1.0.0" });

server.registerTool(
  "search_documents",
  {
    title: "Search documents",
    description:
      "Search the indexed documents and return the most relevant passages with their source files. " +
      "Use it to answer questions about the documents, and cite the sources you use.",
    inputSchema: {
      query: z
        .string()
        .min(1)
        .describe("What to look for, in natural language"),
      topK: z
        .number()
        .int()
        .min(1)
        .max(20)
        .optional()
        .describe(`How many passages to return (default ${defaultTopK})`),
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
  },
  async ({ query, topK }) => {
    const index = openIndex();
    if (index.error) {
      return { isError: true, content: [{ type: "text", text: index.error }] };
    }
    const result = await index.pipeline.run({
      query,
      options: { topK: topK ?? defaultTopK, timeout: 15000 },
    });
    if (!result.success) {
      return {
        isError: true,
        content: [{ type: "text", text: `Search failed: ${result.error}` }],
      };
    }
    return { content: [{ type: "text", text: formatResults(result.results) }] };
  },
);

await server.connect(new StdioServerTransport());
console.error(
  `rag-mcp-server: serving search_documents over stdio (index: ${indexPath})`,
);
