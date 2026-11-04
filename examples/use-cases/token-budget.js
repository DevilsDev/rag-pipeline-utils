// README use case: "Fit retrieved context into a token budget".
// Runs offline on the test pipeline's fixture documents and EchoLLM. Edit it,
// then run `npm run token-budget` in the terminal.

import { createTestPipeline } from "@devilsdev/rag-pipeline-utils/testing";

const { pipeline } = await createTestPipeline();

const result = await pipeline.run({
  query: "How many vacation days do employees get?",
  options: { topK: 10, maxContextTokens: 40 },
});

console.log(result.packing); // { tokens, maxTokens: 40, kept, dropped, truncated }
console.log(result.packing.maxTokens); // 40
