// README use case: "Combine keyword and vector search".
// The same code as the README, run offline. Edit it, then run `npm run hybrid-search` in the terminal.

import {
  BM25Search,
  HybridRetriever,
  LocalEmbedder,
  MemoryRetriever,
} from "@devilsdev/rag-pipeline-utils";

const docs = [
  {
    id: "err-4012",
    content: "Error E4012 means the API token expired. Generate a new token.",
  },
  {
    id: "billing",
    content: "Invoices are emailed on the first business day of each month.",
  },
];

const bm25 = new BM25Search();
bm25.index(docs);

const embedder = new LocalEmbedder();
embedder.train(docs.map((doc) => doc.content));
const vectors = new MemoryRetriever();
await vectors.store(
  docs.map((doc) => ({ ...doc, vector: embedder.embed(doc.content) })),
);

const hybrid = new HybridRetriever([
  { retriever: bm25, weight: 1, name: "bm25" },
  { retriever: vectors, weight: 1, name: "vectors" },
]);
const results = await hybrid.retrieve({
  query: "what does E4012 mean",
  queryVector: embedder.embed("what does E4012 mean"),
  topK: 2,
});
console.log(results[0].id); // "err-4012"
