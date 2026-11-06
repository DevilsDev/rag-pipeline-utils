/**
 * QdrantRetriever and PineconeRetriever against the fake Qdrant and
 * Pinecone in run.mjs: store, retrieve, list, size, delete, removeBySource
 * and clear. Run in Workers (stores-worker.js, stores-edge-worker.js) from
 * the installed package, and on Node.js, whose results the Workers' must
 * equal. Each check also asserts what the answer should be, so a bug in
 * both builds still fails.
 */

const UPSTREAM = "https://upstream.test";
export const PINECONE_KEY = "test-key";
export const PINECONE_DOCS_INDEX = "docs";
export const PINECONE_VECTORS_HOST = "https://vecs-abc.svc.test.pinecone.io";

// Ids the stores hash (sha256): non-ASCII (UTF-8 bytes), longer than one
// 64-byte block, and, for Pinecone, ids it does not accept as they are.
const LONG_ID = `handbook/${"section-".repeat(70)}end`;
const DOCS = [
  {
    id: "vacation",
    content: "Employees get twenty vacation days per year.",
    vector: [1, 0, 0, 0],
    metadata: { source: "handbook.md" },
  },
  {
    id: "télétravail-ünïcödé",
    content: "Remote work is allowed two days a week.",
    vector: [0.6, 0.8, 0, 0],
    metadata: { source: "remote.md", lang: "fr" },
  },
  {
    id: LONG_ID,
    content: "Parental leave is sixteen weeks.",
    vector: [0, 0, 1, 0],
    metadata: { source: "handbook.md" },
  },
];

const sorted = (ids) => [...ids].sort();

function expect(name, actual, expected) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(
      `${name}: ${JSON.stringify(actual).slice(0, 200)} != ${JSON.stringify(expected).slice(0, 200)}`,
    );
  }
}

/** The same steps for any retriever; resolves what each step returned. */
async function exercise(retriever) {
  // Two writes before a read: the fake Pinecone indexes one write per
  // search, so the retriever must wait for its writes (log sequence
  // numbers) to see both.
  await retriever.store(DOCS.slice(0, 1));
  await retriever.store(DOCS.slice(1));
  const top = await retriever.retrieve({
    queryVector: [0.9, 0.1, 0, 0],
    topK: 2,
  });
  expect(
    "retrieve",
    top.map((d) => d.id),
    ["vacation", DOCS[1].id],
  );
  expect("retrieve metadata", top[1].metadata, DOCS[1].metadata);
  expect("retrieve content", top[0].content, DOCS[0].content);
  const listed = await retriever.list();
  expect(
    "list",
    sorted(listed.map((d) => d.id)),
    sorted(DOCS.map((d) => d.id)),
  );
  const sizes = [await retriever.size()];
  await retriever.delete([DOCS[1].id]);
  sizes.push(await retriever.size());
  await retriever.removeBySource("handbook.md");
  sizes.push(await retriever.size());
  await retriever.store([DOCS[0]]);
  sizes.push(await retriever.size());
  await retriever.clear();
  sizes.push(await retriever.size());
  expect(
    "sizes after store, delete, removeBySource, store, clear",
    sizes,
    [3, 2, 0, 1, 0],
  );
  return {
    retrieved: top.map((d) => ({ id: d.id, score: d.score })),
    listed: sorted(listed.map((d) => d.id)),
    sizes,
  };
}

/**
 * The checks. `run` names this run (main, edge, node), so the fakes keep
 * each run's data apart and record the ids each run sent. `fetch` is for
 * Node.js only: the Workers use the global fetch.
 */
export function vectorStoreChecks(lib, { fetch } = {}) {
  const { QdrantRetriever, PineconeRetriever } = lib;
  const withFetch = fetch ? { fetch } : {};
  return {
    async "QdrantRetriever store, retrieve, list, size, delete"(env) {
      return exercise(
        new QdrantRetriever({
          url: UPSTREAM,
          collection: `stores_${env.RUN}`,
          ...withFetch,
        }),
      );
    },
    async "PineconeRetriever on a document index (Documents API)"(env) {
      return exercise(
        new PineconeRetriever({
          apiKey: env.PINECONE_API_KEY,
          index: PINECONE_DOCS_INDEX,
          namespace: env.RUN,
          ...withFetch,
        }),
      );
    },
    async "PineconeRetriever on a vector index, by host (vectors API)"(env) {
      return exercise(
        new PineconeRetriever({
          apiKey: env.PINECONE_API_KEY,
          host: PINECONE_VECTORS_HOST,
          namespace: env.RUN,
          ...withFetch,
        }),
      );
    },
  };
}
