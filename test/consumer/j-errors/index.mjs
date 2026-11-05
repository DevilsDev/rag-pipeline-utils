// Journey J: what a developer sees when something is wrong.
//   node index.mjs missing   ANTHROPIC_API_KEY not set
//   node index.mjs wrong     an invalid key
//   node index.mjs model     a real key and a model name that doesn't exist
//   node index.mjs offline   the API unreachable (nothing listens on the port)
// For each: the pipeline's result.error, and the error thrown by the
// connector's generate(), as a developer would log it.
import { inspect } from "node:util";
import {
  createRagPipeline,
  AnthropicConnector,
  MemoryRetriever,
} from "@devilsdev/rag-pipeline-utils";

const mode = process.argv[2];
const options = { maxTokens: 20 };
if (mode === "model") options.model = "claude-sonnet-9-9";
if (mode === "offline") {
  options.baseURL = "http://127.0.0.1:9";
  options.maxRetries = 1;
  options.retryDelay = 100;
}

const key = process.env.ANTHROPIC_API_KEY || "";
const out = { mode };

let llm;
try {
  llm = new AnthropicConnector(options);
  out.constructed = true;
} catch (e) {
  out.constructed = false;
  out.constructorError = { code: e.code, message: e.message };
}

if (llm) {
  const retriever = new MemoryRetriever();
  await retriever.store([
    {
      id: "vacation",
      content: "Employees get twenty vacation days.",
      vector: [1, 0],
    },
  ]);
  const pipeline = createRagPipeline({
    embedder: { embed: async () => [1, 0] },
    retriever,
    llm,
  });
  const started = Date.now();
  const result = await pipeline.run({ query: "How many vacation days?" });
  out.pipeline = {
    success: result.success,
    error: result.error ?? null,
    ms: Date.now() - started,
  };

  try {
    await llm.generate("Say OK");
    out.generate = { threw: false };
  } catch (e) {
    const logged = inspect(e, { depth: 4 }); // what console.error(e) prints
    out.generate = {
      threw: true,
      name: e.name,
      code: e.code ?? null,
      status: e.status ?? e.response?.status ?? null,
      message: e.message,
      // Does the logged error carry the key? (true/false only)
      keyInLoggedError: key.length > 0 && logged.includes(key),
      loggedLength: logged.length,
      loggedHasHeaders: /x-api-key/i.test(logged),
      apiErrorMessage: e.response?.data?.error?.message ?? null,
    };
  }
}

console.log("RESULT " + JSON.stringify(out));
