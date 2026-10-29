"use strict";

/**
 * The shared retriever contract against every vector store. MemoryRetriever
 * always runs. The database-backed retrievers run against real servers
 * when their URL is set; the vector-store CI job sets
 * REQUIRE_VECTOR_STORES=1 so a missing URL fails instead of skipping.
 */

const { randomBytes } = require("crypto");
const { describeRetrieverContract } = require("../utils/retriever-contract");

const required = process.env.REQUIRE_VECTOR_STORES === "1";

function databaseSuite(name, variable, run) {
  const url = process.env[variable];
  if (url) {
    run(url);
  } else if (required) {
    describe(name, () => {
      it(`needs ${variable}`, () => {
        throw new Error(`${variable} is not set, so ${name} was not tested`);
      });
    });
  } else {
    describe.skip(`${name} (set ${variable} to run)`, () => {
      it("runs against a real server", () => {});
    });
  }
}

databaseSuite("QdrantRetriever", "QDRANT_URL", (url) => {
  const { QdrantRetriever } = require("../../src/retrieval/qdrant-retriever");
  describeRetrieverContract(
    "QdrantRetriever",
    () =>
      new QdrantRetriever({
        url,
        collection: `contract_${randomBytes(4).toString("hex")}`,
      }),
    {
      extended: true,
      cleanup: async (retriever) => {
        await fetch(`${url}/collections/${retriever.collection}`, {
          method: "DELETE",
        });
      },
    },
  );
});

describeRetrieverContract("MemoryRetriever", () => {
  const { MemoryRetriever } = require("../../src/connectors/memory-retriever");
  return new MemoryRetriever();
});

databaseSuite("PgVectorRetriever", "PGVECTOR_URL", (connectionString) => {
  const {
    PgVectorRetriever,
  } = require("../../src/retrieval/pgvector-retriever");
  describeRetrieverContract(
    "PgVectorRetriever",
    () =>
      new PgVectorRetriever({
        connectionString,
        table: `contract_${randomBytes(4).toString("hex")}`,
      }),
    {
      extended: true,
      cleanup: async (retriever) => {
        await retriever._query(`DROP TABLE IF EXISTS ${retriever.table}`);
        await retriever.close();
      },
    },
  );
});
