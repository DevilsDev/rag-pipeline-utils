"use strict";

// jest.setup.js resets modules after every test, so load per test.
let PgVectorRetriever;
let quoteTable;

beforeEach(() => {
  ({
    PgVectorRetriever,
    quoteTable,
  } = require("../../../src/retrieval/pgvector-retriever"));
});

/** A pg Pool look-alike that records every statement. */
function fakePool({ failOn, rows = [] } = {}) {
  const statements = [];
  const run = async (text, params) => {
    statements.push({ text, params });
    if (failOn && failOn.test(text)) {
      const err = new Error("boom");
      err.code = "XX000";
      throw err;
    }
    return { rows, rowCount: rows.length };
  };
  const client = { query: run, release: jest.fn() };
  return {
    statements,
    client,
    totalCount: 0,
    query: run,
    connect: jest.fn(async () => client),
    end: jest.fn(async () => {}),
  };
}

const doc = (id, vector, metadata = {}) => ({
  id,
  vector,
  content: `content of ${id}`,
  metadata,
});

describe("PgVectorRetriever", () => {
  it("quotes table names and rejects anything else", () => {
    expect(quoteTable("rag_documents")).toBe('"rag_documents"');
    expect(quoteTable("app.chunks")).toBe('"app"."chunks"');
    for (const bad of [
      'docs"; DROP TABLE x; --',
      "a.b.c",
      "1table",
      "",
      "has space",
    ]) {
      expect(() => quoteTable(bad)).toThrow("invalid table name");
    }
    expect(
      () => new PgVectorRetriever({ pool: fakePool(), table: "x;y" }),
    ).toThrow("invalid table name");
  });

  it("creates the table sized to the first vector and upserts in a transaction", async () => {
    const pool = fakePool();
    const retriever = new PgVectorRetriever({ pool });
    await retriever.store([
      doc("a", [1, 0, 0], { source: "a.md" }),
      doc("b", [0, 1, 0]),
    ]);

    const sql = pool.statements.map((s) => s.text);
    expect(sql[0]).toBe("CREATE EXTENSION IF NOT EXISTS vector");
    expect(sql[1]).toMatch(
      /^CREATE TABLE IF NOT EXISTS "rag_documents" \(.*embedding vector\(3\) NOT NULL\)$/,
    );
    expect(sql[2]).toMatch(/USING hnsw \(embedding vector_cosine_ops\)$/);
    expect(sql.slice(3)).toEqual([
      "BEGIN",
      expect.stringMatching(
        /^INSERT INTO "rag_documents" .* VALUES \(\$1, \$2, \$3::jsonb, \$4::vector\), \(\$5, \$6, \$7::jsonb, \$8::vector\) ON CONFLICT \(id\) DO UPDATE/,
      ),
      "COMMIT",
    ]);
    // Values go in parameters, never in the SQL text.
    expect(pool.statements[4].params).toEqual([
      "a",
      "content of a",
      '{"source":"a.md"}',
      "[1,0,0]",
      "b",
      "content of b",
      "{}",
      "[0,1,0]",
    ]);
    expect(pool.client.release).toHaveBeenCalledTimes(1);

    // The table is created once.
    await retriever.store([doc("c", [0, 0, 1])]);
    expect(
      pool.statements.filter((s) => /CREATE TABLE/.test(s.text)),
    ).toHaveLength(1);
  });

  it("validates the whole batch before sending anything", async () => {
    const pool = fakePool();
    const retriever = new PgVectorRetriever({ pool });
    await expect(
      retriever.store([doc("a", [1, 0]), doc("b", [1, 0, 0])]),
    ).rejects.toThrow('document "b" has 3 dimensions, the batch has 2');
    await expect(retriever.store([doc("a", [1, NaN])])).rejects.toThrow(
      "non-finite",
    );
    await expect(retriever.store([{ vector: [1] }])).rejects.toThrow(
      "string id",
    );
    expect(pool.statements).toEqual([]);
  });

  it("rolls back a failed batch", async () => {
    const pool = fakePool({ failOn: /^INSERT/ });
    const retriever = new PgVectorRetriever({ pool, createTable: false });
    await expect(retriever.store([doc("a", [1, 0])])).rejects.toThrow("boom");
    expect(pool.statements.map((s) => s.text)).toEqual([
      "BEGIN",
      expect.stringMatching(/^INSERT/),
      "ROLLBACK",
    ]);
    expect(pool.client.release).toHaveBeenCalledTimes(1);
  });

  it("retrieves by cosine distance with parameters", async () => {
    const pool = fakePool({
      rows: [
        { id: "a", content: "x", metadata: { source: "a.md" }, score: "0.97" },
      ],
    });
    const retriever = new PgVectorRetriever({ pool, table: "app.chunks" });
    const results = await retriever.retrieve({ queryVector: [1, 0], topK: 5 });
    expect(pool.statements[0].text).toBe(
      'SELECT id, content, metadata, 1 - (embedding <=> $1::vector) AS score FROM "app"."chunks" ORDER BY embedding <=> $1::vector LIMIT $2',
    );
    expect(pool.statements[0].params).toEqual(["[1,0]", 5]);
    expect(results).toEqual([
      { id: "a", score: 0.97, content: "x", metadata: { source: "a.md" } },
    ]);
    await expect(
      retriever.retrieve({ queryVector: [1, 0], topK: 0 }),
    ).rejects.toThrow("topK");
  });

  it("raises hnsw.ef_search for one query when topK or efSearch needs it", async () => {
    // An HNSW scan returns at most ef_search rows (pgvector default 40)
    const pool = fakePool();
    const retriever = new PgVectorRetriever({ pool });
    await retriever.retrieve({ queryVector: [1, 0], topK: 50 });
    expect(pool.statements.map((s) => s.text.split(" ")[0])).toEqual([
      "BEGIN",
      "SET",
      "SELECT",
      "COMMIT",
    ]);
    expect(pool.statements[1].text).toBe("SET LOCAL hnsw.ef_search = 50");
    expect(pool.client.release).toHaveBeenCalledTimes(1);

    const tuned = fakePool();
    await new PgVectorRetriever({ pool: tuned, efSearch: 200 }).retrieve({
      queryVector: [1, 0],
      topK: 5,
    });
    expect(tuned.statements[1].text).toBe("SET LOCAL hnsw.ef_search = 200");

    // At or below the default it stays one statement
    const plain = fakePool();
    await new PgVectorRetriever({ pool: plain }).retrieve({
      queryVector: [1, 0],
      topK: 40,
    });
    expect(plain.statements).toHaveLength(1);

    const failing = fakePool({ failOn: /^SELECT/ });
    await expect(
      new PgVectorRetriever({ pool: failing }).retrieve({
        queryVector: [1, 0],
        topK: 100,
      }),
    ).rejects.toThrow();
    expect(failing.statements.at(-1).text).toBe("ROLLBACK");
    expect(failing.client.release).toHaveBeenCalledTimes(1);

    for (const efSearch of [0, 1.5, 1001, "100"]) {
      expect(() => new PgVectorRetriever({ pool, efSearch })).toThrow(
        "efSearch",
      );
    }
  });

  it("explains a missing table and permission errors", async () => {
    const missing = fakePool();
    missing.query = async () => {
      const err = new Error('relation "rag_documents" does not exist');
      err.code = "42P01";
      throw err;
    };
    const retriever = new PgVectorRetriever({ pool: missing });
    await expect(retriever.retrieve({ queryVector: [1] })).rejects.toThrow(
      'table "rag_documents" does not exist. Store documents first',
    );
    expect(await retriever.size()).toBe(0);
    expect(await retriever.removeBySource("a.md")).toBe(0);

    const denied = fakePool();
    denied.query = async () => {
      const err = new Error('permission denied to create extension "vector"');
      err.code = "42501";
      throw err;
    };
    await expect(
      new PgVectorRetriever({ pool: denied }).store([doc("a", [1])]),
    ).rejects.toThrow(
      "Run `CREATE EXTENSION IF NOT EXISTS vector;` as a database owner",
    );
  });

  it("has no cache identity unless given a cacheKey", () => {
    const pool = fakePool();
    expect(new PgVectorRetriever({ pool }).getCacheKey("retriever")).toBeNull();
    expect(
      new PgVectorRetriever({ pool, cacheKey: "v3" }).getCacheKey("retriever"),
    ).toBe("pgvector|rag_documents|v3");
    expect(
      new PgVectorRetriever({ pool, cacheKey: "v3" }).getCacheKey("llm"),
    ).toBeNull();
  });

  it("closes only a pool it created", async () => {
    const pool = fakePool();
    const borrowed = new PgVectorRetriever({ pool });
    await borrowed.close();
    expect(pool.end).not.toHaveBeenCalled();

    const end = jest.fn(async () => {});
    jest.doMock("pg", () => ({
      Pool: jest.fn(function Pool(config) {
        this.config = config;
        this.query = async () => ({ rows: [{ n: 2 }] });
        this.end = end;
      }),
    }));
    const {
      PgVectorRetriever: Fresh,
    } = require("../../../src/retrieval/pgvector-retriever");
    const owned = new Fresh({ connectionString: "postgres://example/db" });
    expect(await owned.size()).toBe(2);
    expect(require("pg").Pool).toHaveBeenCalledWith({
      connectionString: "postgres://example/db",
      allowExitOnIdle: true,
    });
    await owned.close();
    expect(end).toHaveBeenCalledTimes(1);
  });

  it("says to install pg when it is missing", async () => {
    jest.doMock("pg", () => {
      throw new Error("Cannot find module 'pg'");
    });
    const {
      PgVectorRetriever: Fresh,
    } = require("../../../src/retrieval/pgvector-retriever");
    await expect(
      new Fresh({ connectionString: "postgres://x" }).retrieve({
        queryVector: [1],
      }),
    ).rejects.toThrow('needs the "pg" package: npm install pg');
  });

  it("reads the connection string from the environment in a config", () => {
    const {
      buildComponents,
    } = require("../../../src/config/component-factory");
    const config = (retriever) => ({
      pipeline: [
        { stage: "embedder", name: "local" },
        { stage: "retriever", name: "pgvector", config: retriever },
      ],
    });
    delete process.env.RAG_TEST_PG_URL;
    expect(() =>
      buildComponents(config({ connectionStringEnv: "RAG_TEST_PG_URL" })),
    ).toThrow(
      "reads its connection string from RAG_TEST_PG_URL, which is not set",
    );
    process.env.RAG_TEST_PG_URL = "postgres://secret@host/db";
    try {
      const { retriever } = buildComponents(
        config({
          connectionStringEnv: "RAG_TEST_PG_URL",
          table: "chunks",
          cacheKey: "k",
        }),
      );
      expect(retriever.tableName).toBe("chunks");
      expect(retriever.getCacheKey("retriever")).toBe("pgvector|chunks|k");
    } finally {
      delete process.env.RAG_TEST_PG_URL;
    }
  });
});
