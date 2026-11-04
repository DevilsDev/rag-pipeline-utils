// README use case: "Test your RAG code offline".
// The same code as the README, run offline. Edit it, then run `npm run testing` in the terminal.

import { createTestPipeline } from "@devilsdev/rag-pipeline-utils/testing";

const { pipeline, llm } = await createTestPipeline();
const result = await pipeline.run({
  query: "How many vacation days do I get?",
});

console.log(result.results[0].id); // "vacation"
console.log(llm.calls.length); // 1
