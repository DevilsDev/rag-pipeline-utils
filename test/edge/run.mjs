/**
 * Edge runtime check: bundles Workers with Wrangler, the way users deploy
 * them, with @devilsdev/rag-pipeline-utils aliased to this repository's
 * build (dist/index.cjs and dist/edge.mjs; run `npm run build` first), and
 * runs them in workerd, the Cloudflare Workers runtime, through Miniflare.
 * The main entry runs with nodejs_compat; /edge runs without it, where no
 * Node.js API exists (stricter than Vercel Edge, which has process.env,
 * Buffer and events). Outbound requests are answered by fake Anthropic,
 * Ollama, OpenAI and Qdrant APIs.
 *
 *   npm install && npm test      (in test/edge)
 *
 * Exits 1 when any check fails.
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { Miniflare, Response } from "miniflare";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../..");
const library = path.join(root, "dist", "index.cjs");
const edgeLibrary = path.join(root, "dist", "edge.mjs");
const wrangler = path.join(
  here,
  "node_modules",
  "wrangler",
  "bin",
  "wrangler.js",
);
const COMPAT_DATE = "2025-09-01";

for (const file of [library, edgeLibrary]) {
  if (!fs.existsSync(file)) {
    console.error(
      `No build at ${file}. Run \`npm run build\` in the repository first.`,
    );
    process.exit(1);
  }
}

/**
 * Bundle `entry` with Wrangler and return the bundled module's source.
 * Without `nodejs_compat`, Wrangler fails on any Node.js import.
 */
function bundle(entry, { nodejsCompat = true } = {}) {
  const out = fs.mkdtempSync(path.join(os.tmpdir(), "rag-edge-"));
  const config = path.join(out, "wrangler.toml");
  fs.writeFileSync(
    config,
    [
      `name = "rag-edge-check"`,
      `main = ${JSON.stringify(entry.replaceAll("\\", "/"))}`,
      `compatibility_date = "${COMPAT_DATE}"`,
      `compatibility_flags = [${nodejsCompat ? '"nodejs_compat"' : ""}]`,
      "",
    ].join("\n"),
  );
  execFileSync(
    process.execPath,
    [
      wrangler,
      "deploy",
      "--dry-run",
      "--config",
      config,
      "--outdir",
      path.join(out, "dist"),
      "--alias",
      `@devilsdev/rag-pipeline-utils:${library.replaceAll("\\", "/")}`,
      "--alias",
      `@devilsdev/rag-pipeline-utils/edge:${edgeLibrary.replaceAll("\\", "/")}`,
    ],
    {
      cwd: here,
      stdio: "pipe",
      env: { ...process.env, WRANGLER_SEND_METRICS: "false" },
    },
  );
  const file = path.join(out, "dist", path.basename(entry));
  const size = fs.statSync(file).size;
  return { file, source: fs.readFileSync(file, "utf8"), size, out };
}

const sse = (events) =>
  events
    .map((e) => `event: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`)
    .join("");

/** A body split into byte chunks, cutting through multi-byte characters. */
function chunked(text, size = 7) {
  const bytes = new TextEncoder().encode(text);
  return new ReadableStream({
    start(controller) {
      for (let i = 0; i < bytes.length; i += size) {
        controller.enqueue(bytes.slice(i, i + size));
      }
      controller.close();
    },
  });
}

// Qdrant point ids the Workers stored, to compare with the Node build's.
const storedPointIds = [];

async function upstream(request) {
  const url = new URL(request.url);
  const json = (body) =>
    new Response(JSON.stringify(body), {
      headers: { "content-type": "application/json" },
    });
  const body = ["POST", "PUT"].includes(request.method)
    ? await request.json()
    : {};
  const question = JSON.stringify(body);

  if (url.pathname === "/v1/messages") {
    if (body.stream) {
      // The probe asks "unicode-check" to get multi-byte characters, which
      // chunked() splits across chunks.
      const tokens = question.includes("unicode-check")
        ? ["Twenty days.", " Ünïcödé"]
        : ["Twenty days ", "of paid vacation."];
      return new Response(
        chunked(
          sse([
            ...tokens.map((text) => ({
              type: "content_block_delta",
              delta: { type: "text_delta", text },
            })),
            { type: "message_stop" },
          ]),
        ),
        { headers: { "content-type": "text/event-stream" } },
      );
    }
    return json({
      content: [
        {
          type: "text",
          text: "Full-time employees receive twenty days of paid vacation per year.",
        },
      ],
      usage: { input_tokens: 1, output_tokens: 1 },
    });
  }
  if (url.pathname === "/api/generate") {
    if (body.stream) {
      return new Response(
        chunked(
          [
            '{"response":"Twenty ","done":false}',
            '{"response":"days.","done":false}',
            '{"response":"","done":true}',
          ].join("\n") + "\n",
        ),
      );
    }
    return json({ response: "ollama ok", done: true });
  }
  if (url.pathname === "/v1/chat/completions") {
    return json({
      id: "x",
      object: "chat.completion",
      created: 0,
      model: "m",
      choices: [
        {
          index: 0,
          message: { role: "assistant", content: "openai ok" },
          finish_reason: "stop",
        },
      ],
      usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
    });
  }
  if (
    url.pathname === "/collections/docs/points/query" ||
    url.pathname === "/collections/docs/points/search"
  ) {
    return json({
      result: {
        points: [{ id: 1, score: 0.9, payload: { content: "qdrant ok" } }],
      },
      status: "ok",
    });
  }
  if (url.pathname === "/collections/docs/points" && request.method === "PUT") {
    storedPointIds.push(...body.points.map((p) => p.id));
    return json({ result: { status: "completed" }, status: "ok" });
  }
  if (url.pathname === "/collections/docs/index") {
    return json({ result: { status: "completed" }, status: "ok" });
  }
  if (url.pathname === "/collections/docs") {
    return json({ result: { status: "green" }, status: "ok" });
  }
  return new Response(`no fake for ${request.method} ${url.pathname}`, {
    status: 404,
  });
}

async function serve(bundled, bindings = {}, { nodejsCompat = true } = {}) {
  return new Miniflare({
    modules: [
      { type: "ESModule", path: bundled.file, contents: bundled.source },
    ],
    modulesRoot: path.dirname(bundled.file),
    compatibilityDate: COMPAT_DATE,
    compatibilityFlags: nodejsCompat ? ["nodejs_compat"] : [],
    bindings,
    outboundService: upstream,
  });
}

let failed = 0;
function report(name, ok, detail = "") {
  if (!ok) failed++;
  console.log(`${ok ? "ok  " : "FAIL"}  ${name}${detail ? `  ${detail}` : ""}`);
}

async function runProbe(label, bundled, bindings, options) {
  const mf = await serve(bundled, bindings, options);
  try {
    const res = await mf.dispatchFetch("http://localhost/");
    const results = await res.json();
    for (const [name, r] of Object.entries(results)) {
      report(
        `${label}: ${name}`,
        r.ok,
        r.ok
          ? JSON.stringify(r.value).slice(0, 100)
          : r.error.split("\n").slice(0, 3).join(" | "),
      );
    }
  } finally {
    await mf.dispose();
  }
}

// 1. The main entry's runtime-neutral features, with nodejs_compat.
const probe = bundle(path.join(here, "probe-worker.js"));
console.log(`probe bundle: ${(probe.size / 1024 / 1024).toFixed(1)} MB`);
await runProbe("main", probe);

// 2. /edge without nodejs_compat, compared with the Node build: the same
// cache key and Qdrant point ids from Node's crypto and the edge's.
const node = createRequire(import.meta.url)(library);
const SYSTEM_PROMPT = "Answer from the documents only. ".repeat(4);
const nodeCacheKey = new node.AnthropicConnector({
  apiKey: "k",
  baseURL: "https://upstream.test",
  systemPrompt: SYSTEM_PROMPT,
}).getCacheKey("llm");
const nodePointIds = [];
await new node.QdrantRetriever({
  url: "https://upstream.test",
  collection: "docs",
  fetch: async (url, init) => {
    const u = new URL(url);
    if (u.pathname.endsWith("/points") && init.method === "PUT") {
      nodePointIds.push(...JSON.parse(init.body).points.map((p) => p.id));
    }
    return globalThis.Response.json({ result: {}, status: "ok" });
  },
}).store([{ id: "vacation", content: "twenty days", vector: [1, 0] }]);

const edgeProbe = bundle(path.join(here, "edge-probe.js"), {
  nodejsCompat: false,
});
console.log(
  `edge probe bundle: ${(edgeProbe.size / 1024 / 1024).toFixed(1)} MB`,
);
await runProbe(
  "edge",
  edgeProbe,
  { NODE_CACHE_KEY: nodeCacheKey },
  { nodejsCompat: false },
);
report(
  "edge: Qdrant point ids match the Node build",
  storedPointIds.length === 1 &&
    nodePointIds.length === 1 &&
    storedPointIds[0] === nodePointIds[0],
  `${storedPointIds[0]} / ${nodePointIds[0]}`,
);

// 3. The Cloudflare Worker example, as written.
const example = bundle(
  path.join(root, "examples", "cloudflare-worker", "src", "worker.js"),
);
{
  const mf = await serve(example, { ANTHROPIC_API_KEY: "test-key" });
  try {
    const ask = (q) => mf.dispatchFetch(`http://localhost/ask?${q}`);

    const res = await ask("q=How+many+vacation+days+do+I+get%3F");
    const body = await res.json();
    report(
      "example: GET /ask answers from the vacation document",
      res.status === 200 &&
        body.sources[0]?.id === "vacation" &&
        /twenty days/i.test(body.answer),
      JSON.stringify(body).slice(0, 120),
    );

    const streamed = await ask("q=How+many+vacation+days&stream=1");
    const events = (await streamed.text()).trim().split("\n\n");
    const tokens = events
      .filter((e) => e.startsWith("event: token"))
      .map((e) => JSON.parse(e.split("data: ")[1]))
      .join("");
    const done = JSON.parse(events.at(-1).split("data: ")[1]);
    report(
      "example: GET /ask&stream=1 streams tokens, then timing",
      streamed.headers.get("content-type").startsWith("text/event-stream") &&
        tokens === "Twenty days of paid vacation." &&
        typeof done.timing?.totalMs === "number",
      `${JSON.stringify(tokens)} ${JSON.stringify(done)}`,
    );

    const missing = await ask("");
    report("example: a missing ?q= is a 400", missing.status === 400);
  } finally {
    await mf.dispose();
  }
}
{
  // Without the secret: retrieval only.
  const mf = await serve(example);
  try {
    const res = await mf.dispatchFetch(
      "http://localhost/ask?q=remote+work+days",
    );
    const body = await res.json();
    report(
      "example: without ANTHROPIC_API_KEY returns passages only",
      res.status === 200 &&
        body.answer === null &&
        body.sources[0]?.id === "remote-work",
      JSON.stringify(body).slice(0, 120),
    );
  } finally {
    await mf.dispose();
  }
}

for (const b of [probe, edgeProbe, example])
  fs.rmSync(b.out, { recursive: true, force: true });
if (failed) {
  console.error(`\n${failed} edge check(s) failed`);
  process.exit(1);
}
console.log("\nall edge checks passed");
