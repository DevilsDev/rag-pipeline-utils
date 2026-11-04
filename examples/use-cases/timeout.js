// README use case: "Keep request latency bounded".
// Runs offline: the test pipeline with an LLM that takes two seconds, so the
// one-second timeout fires. Edit it, then run `npm run timeout` in the terminal.

import { createRagPipeline } from "@devilsdev/rag-pipeline-utils";
import { createTestPipeline } from "@devilsdev/rag-pipeline-utils/testing";

const { embedder, retriever } = await createTestPipeline();
const slowLLM = {
  async generate(query, docs, options = {}) {
    // Stops waiting when the run is aborted, as real connectors do.
    await new Promise((resolve, reject) => {
      const timer = setTimeout(resolve, 2000);
      options.signal?.addEventListener("abort", () => {
        clearTimeout(timer);
        reject(options.signal.reason);
      });
    });
    return "Too late.";
  },
};
const pipeline = createRagPipeline({ embedder, retriever, llm: slowLLM });

const controller = new AbortController(); // e.g. aborted when the HTTP client disconnects
const result = await pipeline.run({
  query: "Summarise the travel policy",
  options: { timeout: 1000, signal: controller.signal },
});
console.log(result.success); // false
if (!result.success) console.error(result.error); // "Execution timeout" or "Execution aborted"
