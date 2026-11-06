"use strict";

/**
 * The CLI's ingest, query and doctor with no embedder, on a retriever that
 * embeds text itself (PineconeRetriever on an integrated-embedding index,
 * against the in-memory Pinecone): chunks are stored as text, queries go
 * as text, and no vectors are computed. Other retrievers still need an
 * embedder, with the same error as before.
 */

const fs = require("fs");
const os = require("os");
const path = require("path");
const {
  ingest,
  query,
  retrieve,
} = require("../../../src/cli/services/rag-service");
const {
  checkConfiguration,
} = require("../../../src/cli/diagnostics/config-checker");
const { fakePinecone } = require("../../utils/fake-pinecone");

const pinecone = (extra = []) => ({
  pipeline: [
    { stage: "loader", name: "auto" },
    ...extra,
    { stage: "retriever", name: "pinecone", config: { namespace: "cli" } },
  ],
});

describe("CLI with a retriever that embeds text itself", () => {
  let dir;
  let saved;
  let fake;

  const useFake = (kind) => {
    fake = fakePinecone({ kind });
    globalThis.fetch = fake.fetch;
    process.env.PINECONE_API_KEY = fake.apiKey;
    process.env.PINECONE_INDEX_HOST = fake.host;
  };
  // One file at a time: reading a directory goes through fast-glob, which
  // doesn't settle under this suite's jest setup (the e2e tests cover it)
  const ingestFile = (name, options = {}) =>
    ingest({
      config: pinecone(),
      configDir: dir,
      inputPath: path.join(dir, "docs", name),
      ...options,
    });
  const upserted = () =>
    fake.calls
      .filter((c) => c.url.endsWith("/documents/upsert"))
      .flatMap((c) => c.body.documents);

  // The freshness wait sleeps between searches
  beforeAll(() => jest.useRealTimers());

  beforeEach(() => {
    saved = {
      fetch: globalThis.fetch,
      key: process.env.PINECONE_API_KEY,
      host: process.env.PINECONE_INDEX_HOST,
      index: process.env.PINECONE_INDEX,
    };
    delete process.env.PINECONE_INDEX;
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "rag-embeds-text-"));
    fs.mkdirSync(path.join(dir, "docs"));
    fs.writeFileSync(
      path.join(dir, "docs", "vacation.md"),
      "Employees get twenty days of paid vacation every year.\n",
    );
    fs.writeFileSync(
      path.join(dir, "docs", "remote.md"),
      "Remote work from home is allowed three times a week.\n",
    );
  });

  afterEach(() => {
    globalThis.fetch = saved.fetch;
    for (const [k, v] of [
      ["PINECONE_API_KEY", saved.key],
      ["PINECONE_INDEX_HOST", saved.host],
      ["PINECONE_INDEX", saved.index],
    ]) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
    fs.rmSync(dir, { recursive: true, force: true });
  });

  test("ingest stores the chunks as text, with no embedder and no vectors", async () => {
    useFake("integrated");
    const first = await ingestFile("vacation.md");
    expect(first).toMatchObject({
      files: 1,
      chunks: 1,
      totalChunks: 1,
      sources: ["docs/vacation.md"],
    });
    const result = await ingestFile("remote.md");
    expect(result).toMatchObject({ files: 1, chunks: 1, totalChunks: 2 });
    const docs = upserted();
    expect(docs.map((d) => d.rag_id).sort()).toEqual([
      "docs/remote.md#0",
      "docs/vacation.md#0",
    ]);
    for (const d of docs) {
      expect(typeof d.chunk_text).toBe("string");
      expect(Object.values(d).some(Array.isArray)).toBe(false);
    }

    // Re-ingesting a file replaces its chunks; --rebuild starts over
    expect((await ingestFile("remote.md")).totalChunks).toBe(2);
    expect((await ingestFile("remote.md", { rebuild: true })).totalChunks).toBe(
      1,
    );
  });

  test("query and retrieve search by the question's text", async () => {
    useFake("integrated");
    await ingestFile("vacation.md");
    await ingestFile("remote.md");
    const answered = await query({
      config: pinecone(),
      configDir: dir,
      question: "How many days of paid vacation?",
      topK: 1,
    });
    expect(answered.answer).toBeNull();
    expect(answered.results.map((r) => r.id)).toEqual(["docs/vacation.md#0"]);
    const search = fake.calls.filter((c) =>
      c.url.endsWith("/documents/search"),
    );
    expect(search[search.length - 1].body.score_by).toEqual([
      {
        type: "embed",
        fields: ["chunk_text"],
        query: "How many days of paid vacation?",
      },
    ]);

    const results = await retrieve({
      config: pinecone(),
      configDir: dir,
      question: "work from home",
      topK: 1,
    });
    expect(results[0].id).toBe("docs/remote.md#0");
  });

  test("an index that doesn't embed text still needs an embedder, as before", async () => {
    useFake("documents");
    await expect(
      ingest({
        config: pinecone(),
        configDir: dir,
        inputPath: path.join(dir, "docs", "vacation.md"),
      }),
    ).rejects.toThrow(
      'No embedder configured. Add a { "stage": "embedder", ... } entry to the pipeline in .ragrc.json.',
    );
    await expect(
      query({ config: pinecone(), configDir: dir, question: "vacation" }),
    ).rejects.toThrow(/No embedder configured/);
    expect(upserted()).toHaveLength(0);
  });

  test("other retrievers still need an embedder, with the same error", async () => {
    const config = {
      pipeline: [
        { stage: "loader", name: "auto" },
        { stage: "retriever", name: "file-store" },
      ],
    };
    await expect(
      ingest({
        config,
        configDir: dir,
        inputPath: path.join(dir, "docs", "vacation.md"),
      }),
    ).rejects.toThrow(/No embedder configured/);
  });

  test("doctor accepts no embedder only when the retriever embeds text", async () => {
    const configPath = path.join(dir, ".ragrc.json");
    fs.writeFileSync(configPath, JSON.stringify(pinecone()));
    const missingEmbedder = (issues) =>
      issues.some(
        (i) => i.code === "CONFIG_STAGE_MISSING" && /embedder/.test(i.message),
      );

    useFake("integrated");
    expect(missingEmbedder(await checkConfiguration({ configPath }))).toBe(
      false,
    );
    useFake("documents");
    expect(missingEmbedder(await checkConfiguration({ configPath }))).toBe(
      true,
    );
  });
});
