/**
 *   npm run ask -- "How many vacation days do I get?"
 *
 * Asks the agent once and prints the answer, the passages it used and
 * whether every sentence is supported by them. Without ANTHROPIC_API_KEY it
 * prints the passages that match, so you can try retrieval first.
 */

import { checkAnswer } from "@devilsdev/rag-pipeline-utils";
import { mastra } from "./mastra";
import { searchDocuments, type Passage } from "./mastra/retrieval";

const question =
  process.argv.slice(2).join(" ").trim() || "How many vacation days do I get?";

if (!process.env.ANTHROPIC_API_KEY) {
  console.log(
    `No ANTHROPIC_API_KEY (copy .env.example to .env). Passages for "${question}":\n`,
  );
  for (const p of await searchDocuments(question)) {
    console.log(`[${p.source}] ${p.content.trim()}\n`);
  }
  process.exit(0);
}

const result = await mastra.getAgent("docsAgent").generate(question);

// The passages the agent's search_documents calls returned
const passages: Passage[] = (result.toolResults ?? []).flatMap((r: any) =>
  r.payload?.toolName === "search_documents"
    ? (r.payload.result?.passages ?? [])
    : [],
);

const check = await checkAnswer({
  answer: result.text,
  sources: passages.map((p) => ({ id: p.id, content: p.content })),
  evaluate: false,
});

console.log(result.text.trim());
console.log(
  `\nSources: ${[...new Set(passages.map((p) => p.source))].join(", ") || "none"}`,
);
console.log(
  check.grounded
    ? "Grounded: every sentence is supported by a passage."
    : `Not grounded. Unsupported: ${check.unsupported.map((s: string) => `"${s}"`).join("; ")}`,
);
