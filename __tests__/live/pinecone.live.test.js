"use strict";

/**
 * PineconeRetriever against real Pinecone serverless indexes: the retriever
 * contract, in namespaces of its own that the test deletes. Needs
 * PINECONE_API_KEY and PINECONE_INDEX (index names) or PINECONE_INDEX_HOST
 * (hosts), comma-separated to run on several: a document index with a
 * 4-dimension dense_vector field and a vector index of dimension 4, both
 * cosine, cover both of Pinecone's APIs; an index that embeds text itself
 * (integrated embedding, such as the console's quick start) runs the text
 * contract. See live-env.js. It never creates or deletes an index.
 */

const { execFileSync } = require("child_process");
const { livePinecone } = require("./live-env");
const {
  describeRetrieverContract,
  describeTextRetrieverContract,
} = require("../utils/retriever-contract");
const { PineconeRetriever } = require("../../src/retrieval/pinecone-retriever");

const env = livePinecone();
const targets = env.apiKey
  ? (env.host || env.index).split(",").map((t) => t.trim())
  : ["(skipped)"];

const options = (target) => ({
  apiKey: env.apiKey,
  ...(env.host ? { host: target } : { index: target }),
});

/**
 * Whether the index embeds text itself, read from its description the way
 * the retriever reads it. Jest defines suites synchronously, so this runs
 * in a child process; on any error it says "vectors" and that suite fails
 * loudly.
 */
function embedsText(target) {
  const script = `
    const { PineconeRetriever } = require(${JSON.stringify(
      require.resolve("../../src/retrieval/pinecone-retriever"),
    )});
    const r = new PineconeRetriever(JSON.parse(process.env.RAG_PINECONE_OPTIONS));
    r._resolve().then(
      () => process.stdout.write(r._integrated ? "text" : "vectors"),
      () => process.stdout.write("vectors"),
    );`;
  // No NODE_OPTIONS: the usage ledger's --require (for Claude calls, which
  // this child makes none of) is not needed here
  const childEnv = {
    ...process.env,
    RAG_PINECONE_OPTIONS: JSON.stringify(options(target)),
  };
  delete childEnv.NODE_OPTIONS;
  try {
    const out = execFileSync(process.execPath, ["-e", script], {
      env: childEnv,
      encoding: "utf8",
      timeout: 60000,
    });
    return out.trim() === "text";
  } catch {
    return false;
  }
}

for (const target of targets) {
  const suite = env.apiKey ? describe : describe.skip;
  const text = env.apiKey ? embedsText(target) : false;
  suite(
    `PineconeRetriever live: ${target}${text ? " (embeds text)" : ""}${env.reason ? ` (${env.reason})` : ""}`,
    () => {
      jest.setTimeout(120000);
      const namespace = `rag-live-${Date.now()}`;
      const used = [];
      const contract = text
        ? describeTextRetrieverContract
        : describeRetrieverContract;
      contract(
        `PineconeRetriever (live, ${target})`,
        async () => {
          // A fresh namespace per test
          const ns = `${namespace}-${used.length}`;
          used.push(ns);
          return new PineconeRetriever({ ...options(target), namespace: ns });
        },
        { extended: true, cleanup: (retriever) => retriever.clear() },
      );

      // clear() deletes the records; this deletes the namespaces too
      afterAll(async () => {
        const probe = new PineconeRetriever({ ...options(target) });
        await probe._resolve();
        for (const ns of used) {
          const res = await fetch(
            `${probe._host}/namespaces/${encodeURIComponent(ns)}`,
            {
              method: "DELETE",
              headers: {
                "Api-Key": env.apiKey,
                "X-Pinecone-Api-Version": "2026-07",
              },
            },
          );
          if (!res.ok && res.status !== 404) {
            throw new Error(`could not delete namespace ${ns}: ${res.status}`);
          }
        }
      });
    },
  );
}
