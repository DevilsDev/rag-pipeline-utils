// README use case: "Cache repeated questions".
// The same code as the README, run offline. Edit it, then run `npm run cache` in the terminal.

import { createRagPipeline } from "@devilsdev/rag-pipeline-utils";
import {
  createTestPipeline,
  EchoLLM,
} from "@devilsdev/rag-pipeline-utils/testing";

const { embedder, retriever } = await createTestPipeline();
const llm = new EchoLLM();
const pipeline = createRagPipeline({ embedder, retriever, llm, cache: true });

await pipeline.run({ query: "How many vacation days do I get?" });
const again = await pipeline.run({ query: "How many vacation days do I get?" });

console.log(again.cache.generation); // "hit"
console.log(llm.calls.length); // 1
