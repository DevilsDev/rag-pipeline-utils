import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { searchDocuments } from "../retrieval";

export const searchDocumentsTool = createTool({
  id: "search_documents",
  description:
    "Search the documents. Returns the best-matching passages with their ids and source files.",
  inputSchema: z.object({
    query: z.string().describe("What to look for"),
  }),
  outputSchema: z.object({
    passages: z.array(
      z.object({
        id: z.string(),
        content: z.string(),
        source: z.string().optional(),
        score: z.number().optional(),
      }),
    ),
  }),
  execute: async ({ query }) => ({ passages: await searchDocuments(query) }),
});
