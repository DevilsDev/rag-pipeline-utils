/**
 * CLI messages for a missing or refused API key: one line naming the
 * provider, the variable to set and what the API said, never the key, and a
 * failing exit code (query, ingest, eval, generate-dataset). In-process; the
 * consumer journey J checks the same through the packed binary.
 */
const fs = require("fs");
const os = require("os");
const path = require("path");

const {
  describeCliError,
  reportCliError,
  isKeyError,
  redact,
} = require("../../../src/cli/shared/cli-errors");
const {
  missingApiKeyError,
  toConnectorError,
} = require("../../../src/connectors/connector-utils");
const { OpenAIConnector } = require("../../../src/connectors/openai-connector");
const { handleQuery } = require("../../../src/cli/handlers/query-handler");
const { handleIngest } = require("../../../src/cli/handlers/ingest-handler");
const { handleEval } = require("../../../src/cli/handlers/eval-handler");
const {
  handleGenerateDataset,
} = require("../../../src/cli/handlers/generate-handler");

const WRONG_KEY = "sk-ant-api03-INVALID-cli-key-errors-test-key";

/** An axios error as the Anthropic API returns it for a refused key. */
function axios401(provider, body) {
  return toConnectorError(
    {
      isAxiosError: true,
      message: "Request failed with status code 401",
      config: { headers: { "x-api-key": WRONG_KEY } },
      response: {
        status: 401,
        statusText: "Unauthorized",
        headers: {},
        data: body,
      },
    },
    provider,
  );
}

/** What the openai SDK throws for a refused key, tagged by the connector. */
function openai401(options = {}) {
  const err = new Error(
    "401 Incorrect API key provided: sk-proj-abcd****wxyz. You can find your API key at https://platform.openai.com/account/api-keys.",
  );
  err.status = 401;
  err.error = {
    message:
      "Incorrect API key provided: sk-proj-abcd****wxyz. You can find your API key at https://platform.openai.com/account/api-keys.",
    type: "invalid_request_error",
    code: "invalid_api_key",
  };
  return new OpenAIConnector({ apiKey: "x", ...options })._tagError(err);
}

describe("describeCliError", () => {
  test("missing key: names the provider and the variable, not the apiKey option", () => {
    const line = describeCliError(
      missingApiKeyError("Anthropic", "ANTHROPIC_API_KEY"),
    );
    expect(line).toBe(
      "no Anthropic API key. Set ANTHROPIC_API_KEY and run the command again.",
    );
  });

  test("the library's own message is unchanged", () => {
    expect(missingApiKeyError("Anthropic", "ANTHROPIC_API_KEY").message).toBe(
      "Anthropic API key required. Set ANTHROPIC_API_KEY or pass the apiKey option.",
    );
  });

  test("refused Anthropic key: status, the API's type and message, the variable", () => {
    const err = axios401("Anthropic", {
      type: "error",
      error: { type: "authentication_error", message: "invalid x-api-key" },
    });
    expect(describeCliError(err)).toBe(
      "Anthropic rejected the API key (401 authentication_error: invalid x-api-key). Check ANTHROPIC_API_KEY.",
    );
  });

  test("refused Cohere key", () => {
    const err = axios401("Cohere", { message: "invalid api token" });
    expect(describeCliError(err)).toBe(
      "Cohere rejected the API key (401 invalid api token). Check COHERE_API_KEY.",
    );
  });

  test("refused OpenAI key: the echoed part of the key is redacted", () => {
    const line = describeCliError(openai401());
    expect(line).toMatch(
      /^OpenAI rejected the API key \(401 invalid_api_key: Incorrect API key provided: sk-\[redacted\]\. /,
    );
    expect(line).toMatch(/Check OPENAI_API_KEY\.$/);
    expect(line).not.toMatch(/abcd|wxyz/);
  });

  test("an OpenAI-compatible baseURL is not told to set OPENAI_API_KEY", () => {
    const line = describeCliError(
      openai401({ baseURL: "https://api.groq.com/openai/v1" }),
    );
    expect(line).toMatch(/^The OpenAI-compatible API rejected the API key/);
    expect(line).not.toMatch(/OPENAI_API_KEY/);
    expect(line).toMatch(/"apiKey"/);
  });

  test("403 is a key error too; 404 and errors without a provider are not", () => {
    const forbidden = axios401("Anthropic", {
      error: { type: "permission_error", message: "no access" },
    });
    forbidden.status = 403;
    expect(isKeyError(forbidden)).toBe(true);
    const notFound = new Error("Anthropic API error 404: not_found_error");
    notFound.status = 404;
    notFound.provider = "Anthropic";
    expect(isKeyError(notFound)).toBe(false);
    const bare = new Error("Request failed");
    bare.status = 401;
    expect(isKeyError(bare)).toBe(false);
    expect(describeCliError(notFound)).toBe(notFound.message);
    expect(describeCliError("plain")).toBe("plain");
  });

  test("the value of a key variable is never printed", () => {
    const saved = process.env.COHERE_API_KEY;
    process.env.COHERE_API_KEY = "cohere-secret-value-123";
    try {
      expect(
        describeCliError(new Error("bad token cohere-secret-value-123")),
      ).toBe("bad token [redacted]");
    } finally {
      if (saved === undefined) delete process.env.COHERE_API_KEY;
      else process.env.COHERE_API_KEY = saved;
    }
  });

  test("redact handles long input quickly (no backtracking)", () => {
    const text = `sk-${"a".repeat(100000)}!`;
    const start = Date.now();
    expect(redact(text)).toBe("sk-[redacted]!");
    expect(Date.now() - start).toBeLessThan(1000);
  });
});

describe("reportCliError", () => {
  let errors;
  beforeEach(() => {
    errors = [];
    jest
      .spyOn(console, "error")
      .mockImplementation((...a) => errors.push(a.join(" ")));
  });
  afterEach(() => {
    jest.restoreAllMocks();
    process.exitCode = undefined;
  });

  test("one line and a failing exit code; the stack only with --verbose", () => {
    const err = missingApiKeyError("Anthropic", "ANTHROPIC_API_KEY");
    reportCliError("Query failed", err, {});
    expect(errors).toEqual([
      "❌ Query failed: no Anthropic API key. Set ANTHROPIC_API_KEY and run the command again.",
    ]);
    expect(process.exitCode).toBe(1);

    errors.length = 0;
    reportCliError("Query failed", err, { verbose: true });
    expect(errors).toHaveLength(2);
    expect(errors[1]).toMatch(/\n\s+at /);
  });

  test("the verbose stack is redacted too", () => {
    const err = new Error(`boom ${WRONG_KEY}`);
    reportCliError("Query failed", err, { verbose: true });
    expect(errors.join("\n")).not.toContain(WRONG_KEY);
  });
});

describe("commands with a missing or refused key", () => {
  let dir;
  let configPath;
  let errors;
  let savedKey;

  const writeConfig = (llm, plugins) =>
    fs.writeFileSync(
      configPath,
      JSON.stringify({
        pipeline: [
          { stage: "loader", name: "auto" },
          { stage: "embedder", name: "local" },
          { stage: "retriever", name: "file-store" },
          { stage: "llm", name: llm },
        ],
        ...(plugins && { plugins: { llm: plugins } }),
      }),
    );

  beforeAll(async () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "rag-cli-key-"));
    fs.mkdirSync(path.join(dir, "docs"));
    fs.writeFileSync(
      path.join(dir, "docs", "vacation.md"),
      "# Vacation\n\nEmployees receive twenty days of paid vacation per year. " +
        "Up to five unused days can be carried over into the next year.\n",
    );
    fs.writeFileSync(
      path.join(dir, "refused-llm.js"),
      `const { toConnectorError } = require(${JSON.stringify(
        path.resolve(__dirname, "../../../src/connectors/connector-utils"),
      )});\n` +
        "module.exports = class RefusedLLM {\n" +
        "  async generate() {\n" +
        "    throw toConnectorError({ isAxiosError: true, message: 'x',\n" +
        `      config: { headers: { 'x-api-key': '${WRONG_KEY}' } },\n` +
        "      response: { status: 401, headers: {}, data: { type: 'error',\n" +
        "        error: { type: 'authentication_error', message: 'invalid x-api-key' } } } },\n" +
        "      'Anthropic');\n" +
        "  }\n" +
        "};\n",
    );
    fs.writeFileSync(
      path.join(dir, "cases.json"),
      JSON.stringify([
        { question: "How many vacation days?", expectedAnswer: "twenty" },
      ]),
    );
    configPath = path.join(dir, ".ragrc.json");
    writeConfig("anthropic");
    jest.spyOn(console, "log").mockImplementation(() => {});
    await handleIngest({ config: configPath }, path.join(dir, "docs"));
    jest.restoreAllMocks();
  });

  afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));

  beforeEach(() => {
    savedKey = process.env.ANTHROPIC_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    errors = [];
    jest.spyOn(console, "log").mockImplementation(() => {});
    jest.spyOn(console, "warn").mockImplementation(() => {});
    jest
      .spyOn(console, "error")
      .mockImplementation((...a) => errors.push(a.join(" ")));
  });

  afterEach(() => {
    jest.restoreAllMocks();
    process.exitCode = undefined;
    if (savedKey !== undefined) process.env.ANTHROPIC_API_KEY = savedKey;
  });

  const MISSING =
    "no Anthropic API key. Set ANTHROPIC_API_KEY and run the command again.";
  const REFUSED =
    "Anthropic rejected the API key (401 authentication_error: invalid x-api-key). Check ANTHROPIC_API_KEY.";

  test("query without a key", async () => {
    writeConfig("anthropic");
    await handleQuery({ config: configPath }, "How many vacation days?");
    expect(errors).toEqual([`❌ Query failed: ${MISSING}`]);
    expect(process.exitCode).toBe(1);
  });

  test("query with a refused key (and --streaming)", async () => {
    writeConfig("refused", { refused: "./refused-llm.js" });
    await handleQuery({ config: configPath }, "How many vacation days?");
    await handleQuery({ config: configPath }, "How many vacation days?", {
      streaming: true,
    });
    expect(errors).toEqual([
      `❌ Query failed: ${REFUSED}`,
      `❌ Query failed: ${REFUSED}`,
    ]);
    expect(errors.join("\n")).not.toContain(WRONG_KEY);
    expect(process.exitCode).toBe(1);
  });

  test("eval without a key says so once", async () => {
    writeConfig("anthropic");
    await handleEval({ config: configPath }, path.join(dir, "cases.json"));
    expect(errors).toEqual([`❌ Evaluation failed: ${MISSING}`]);
    expect(process.exitCode).toBe(1);
  });

  test("generate-dataset with a refused key writes nothing", async () => {
    writeConfig("refused", { refused: "./refused-llm.js" });
    const output = path.join(dir, "generated.json");
    await handleGenerateDataset({ config: configPath }, { output, count: 1 });
    expect(errors).toEqual([`❌ Generating the dataset failed: ${REFUSED}`]);
    expect(fs.existsSync(output)).toBe(false);
    expect(process.exitCode).toBe(1);
  });

  test("ingest with an OpenAI embedder and no OPENAI_API_KEY", async () => {
    const saved = process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_API_KEY;
    const openaiConfig = path.join(dir, "openai.json");
    fs.writeFileSync(
      openaiConfig,
      JSON.stringify({
        pipeline: [
          { stage: "loader", name: "auto" },
          { stage: "embedder", name: "openai" },
          {
            stage: "retriever",
            name: "file-store",
            config: { path: ".rag/openai.json" },
          },
        ],
      }),
    );
    try {
      await handleIngest({ config: openaiConfig }, path.join(dir, "docs"));
    } finally {
      if (saved !== undefined) process.env.OPENAI_API_KEY = saved;
    }
    expect(errors).toEqual([
      "❌ Ingestion failed: no OpenAI API key. Set OPENAI_API_KEY and run the command again.",
    ]);
    expect(process.exitCode).toBe(1);
  });

  test("other failures keep their message", async () => {
    writeConfig("anthropic");
    await handleQuery({ config: path.join(dir, "missing.json") }, "q");
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatch(/^❌ Query failed: /);
    expect(errors[0]).not.toMatch(/API key/);
    expect(process.exitCode).toBe(1);
  });
});
