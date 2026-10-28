/**
 * Keeps the docs-site .ragrc.json builder identical to `rag-pipeline init`:
 * same files for every combination, valid against .ragrc.schema.json, and
 * the same templates, defaults and API-key variables as the CLI.
 */

const path = require("path");
const Ajv = require("ajv");

const ROOT = path.resolve(__dirname, "../..");
const builder = require(path.join(ROOT, "docs-site/src/lib/ragrcBuilder.js"));
const { buildInitConfig } = require(
  path.join(ROOT, "src/cli/wizard/config-builder.js"),
);
const { TEMPLATES } = require(
  path.join(ROOT, "src/cli/handlers/init-handler.js"),
);
const { API_KEY_ENV } = require(
  path.join(ROOT, "src/cli/wizard/init-wizard.js"),
);
const schema = require(path.join(ROOT, ".ragrc.schema.json"));

const CREATED_AT = "2026-01-01T00:00:00.000Z";

function withoutTime(config) {
  const { $schema, ...rest } = config;
  return { ...rest, metadata: { ...rest.metadata, createdAt: CREATED_AT } };
}

/** Every combination the docs builder can produce. */
function combinations() {
  const out = [];
  for (const e of builder.STAGES.embedder)
    for (const r of builder.STAGES.retriever)
      for (const rr of builder.STAGES.reranker)
        for (const l of builder.STAGES.llm)
          out.push({
            embedder: e.value,
            retriever: r.value,
            reranker: rr.value,
            llm: l.value,
            embedderConfig: builder.OPTIONS.embedder[e.value] || {},
            llmConfig: builder.OPTIONS.llm[l.value] || {},
          });
  return out;
}

describe("docs-site .ragrc.json builder", () => {
  const validate = new Ajv({ allErrors: true, strict: false }).compile(schema);
  const cases = combinations();

  test("covers every stage choice", () => {
    expect(cases).toHaveLength(4 * 2 * 2 * 4);
  });

  test.each(
    cases.map((c) => [
      `${c.embedder}/${c.retriever}/${c.reranker}/${c.llm}`,
      c,
    ]),
  )("%s matches rag-pipeline init and the schema", (_name, c) => {
    const docs = builder.buildRagrc({ ...c, createdAt: CREATED_AT });
    expect(validate(docs)).toBe(true);

    const sel = (name, config) =>
      name && Object.keys(config).length > 0 ? { name, config } : name;
    const cli = buildInitConfig({
      embedder: sel(c.embedder, c.embedderConfig),
      retriever: c.retriever,
      reranker: c.reranker,
      llm: sel(c.llm, c.llmConfig),
    });
    expect(withoutTime(docs)).toEqual(withoutTime(cli));
  });

  test("blank options are left out, like the CLI defaults", () => {
    const docs = builder.buildRagrc({
      embedder: "openai",
      embedderConfig: { embeddingModel: "  " },
      createdAt: CREATED_AT,
    });
    const embedder = docs.pipeline.find((p) => p.stage === "embedder");
    expect(embedder).toEqual({ stage: "embedder", name: "openai" });
  });

  test("templates match rag-pipeline init --template", () => {
    expect(builder.TEMPLATES).toEqual(TEMPLATES);
    for (const [name, t] of Object.entries(TEMPLATES)) {
      expect(
        builder.matchingTemplate({
          ...t,
          retriever: "file-store",
          reranker: null,
        }),
      ).toBe(name);
    }
  });

  test("option defaults are the connectors' own defaults", () => {
    for (const stage of ["embedder", "llm"]) {
      for (const [provider, options] of Object.entries(
        builder.OPTIONS[stage],
      )) {
        const { DEFAULT_CONFIG } = require(
          path.join(ROOT, `src/connectors/${provider}-connector.js`),
        );
        for (const [key, value] of Object.entries(options)) {
          expect([provider, key, DEFAULT_CONFIG[key]]).toEqual([
            provider,
            key,
            value,
          ]);
        }
      }
    }
  });

  test("API key variables match the CLI", () => {
    expect(
      builder.requiredEnv({ embedder: "cohere", llm: "anthropic" }),
    ).toEqual([API_KEY_ENV.cohere, API_KEY_ENV.anthropic]);
    expect(builder.requiredEnv({ embedder: "local", llm: null })).toEqual([]);
  });
});
