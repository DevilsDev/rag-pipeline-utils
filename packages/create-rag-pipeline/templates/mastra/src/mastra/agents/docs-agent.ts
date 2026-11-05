import { Agent } from "@mastra/core/agent";
import { createScorer } from "@mastra/core/evals";
import {
  createMastraGuardrails,
  createMastraScorer,
} from "@devilsdev/rag-pipeline-utils";
import { searchDocumentsTool } from "../tools/search-documents";

// Prompt-injection detection on the question, PII redaction on the answer
const guardrails = createMastraGuardrails();

export const docsAgent = new Agent({
  id: "docs-agent",
  name: "Docs agent",
  instructions: `You answer questions from the user's documents.
Always call search_documents first, then answer only from the passages it returns.
If they don't contain the answer, say you don't know. Keep answers short.`,
  model: process.env.MODEL || "anthropic/claude-sonnet-5-5",
  tools: { search_documents: searchDocumentsTool },
  inputProcessors: [guardrails],
  outputProcessors: [guardrails],
  // Scores each answer against the passages the tool returned: a lexical
  // check, no model calls. See it in Mastra Studio (npm run dev)
  scorers: {
    groundedness: {
      scorer: createMastraScorer({ createScorer, metric: "groundedness" }),
    },
  },
});
