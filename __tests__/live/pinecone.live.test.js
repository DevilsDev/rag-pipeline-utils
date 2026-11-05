"use strict";

/**
 * PineconeRetriever against real Pinecone serverless indexes: the retriever
 * contract, in namespaces of its own that the test deletes. Needs
 * PINECONE_API_KEY and PINECONE_INDEX (index names) or PINECONE_INDEX_HOST
 * (hosts), comma-separated to run on several: a document index with a
 * 4-dimension dense_vector field and a vector index of dimension 4, both
 * cosine, cover both of Pinecone's APIs. See live-env.js. It never creates
 * or deletes an index.
 */

const { livePinecone } = require("./live-env");
const { describeRetrieverContract } = require("../utils/retriever-contract");
const { PineconeRetriever } = require("../../src/retrieval/pinecone-retriever");

const env = livePinecone();
const targets = env.apiKey
  ? (env.host || env.index).split(",").map((t) => t.trim())
  : ["(skipped)"];

for (const target of targets) {
  const suite = env.apiKey ? describe : describe.skip;
  suite(
    `PineconeRetriever live: ${target}${env.reason ? ` (${env.reason})` : ""}`,
    () => {
      jest.setTimeout(120000);
      const namespace = `rag-live-${Date.now()}`;
      let n = 0;
      describeRetrieverContract(
        `PineconeRetriever (live, ${target})`,
        async () =>
          new PineconeRetriever({
            apiKey: env.apiKey,
            ...(env.host ? { host: target } : { index: target }),
            // A fresh namespace per test
            namespace: `${namespace}-${n++}`,
          }),
        { extended: true, cleanup: (retriever) => retriever.clear() },
      );
    },
  );
}
