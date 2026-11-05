"use strict";

/**
 * PineconeRetriever against a real Pinecone serverless index: the retriever
 * contract, in a namespace of its own that the test deletes. Needs
 * PINECONE_API_KEY and PINECONE_INDEX (an existing cosine index of
 * dimension 4) or PINECONE_INDEX_HOST; see live-env.js.
 */

const { livePinecone } = require("./live-env");
const { describeRetrieverContract } = require("../utils/retriever-contract");
const { PineconeRetriever } = require("../../src/retrieval/pinecone-retriever");

const env = livePinecone();
const suite = env.apiKey ? describe : describe.skip;

suite(`PineconeRetriever live${env.reason ? ` (${env.reason})` : ""}`, () => {
  jest.setTimeout(120000);
  const namespace = `rag-live-${Date.now()}`;
  let n = 0;
  describeRetrieverContract(
    "PineconeRetriever (live)",
    async () => {
      const retriever = new PineconeRetriever({
        apiKey: env.apiKey,
        ...(env.host ? { host: env.host } : { index: env.index }),
        // A fresh namespace per test: deletes are eventually consistent too
        namespace: `${namespace}-${n++}`,
      });
      return retriever;
    },
    { extended: true, cleanup: (retriever) => retriever.clear() },
  );
});
