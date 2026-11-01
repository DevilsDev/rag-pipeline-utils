/**
 * Edge runtime check: bundles Workers with Wrangler, the way users deploy
 * them, with @devilsdev/rag-pipeline-utils aliased to this repository's
 * build (dist/index.cjs; run `npm run build` first), and runs them in
 * workerd, the Cloudflare Workers runtime, through Miniflare. Outbound
 * requests are answered by fake Anthropic, Ollama, OpenAI and Qdrant APIs.
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
import { Miniflare, Response } from "miniflare";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../..");
const library = path.join(root, "dist", "index.cjs");
const wrangler = path.join(
  here,
  "node_modules",
  "wrangler",
  "bin",
  "wrangler.js",
);
const COMPAT_DATE = "2025-09-01";

if (!fs.existsSync(library)) {
  console.error(
    `No build at ${library}. Run \`npm run build\` in the repository first.`,
  );
  process.exit(1);
}

/** Bundle `entry` with Wrangler and return the bundled module's source. */
function bundle(entry) {
  const out = fs.mkdtempSync(path.join(os.tmpdir(), "rag-edge-"));
  const config = path.join(out, "wrangler.toml");
  fs.writeFileSync(
    config,
    [
      `name = "rag-edge-check"`,
      `main = ${JSON.stringify(entry.replaceAll("\\", "/"))}`,
      `compatibility_date = "${COMPAT_DATE}"`,
      `compatibility_flags = ["nodejs_compat"]`,
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

async function upstream(request) {
  const url = new URL(request.url);
  const json = (body) =>
    new Response(JSON.stringify(body), {
      headers: { "content-type": "application/json" },
    });
  const body = request.method === "POST" ? await request.json() : {};
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
  if (url.pathname === "/collections/docs") {
    return json({ result: { status: "green" }, status: "ok" });
  }
  return new Response(`no fake for ${request.method} ${url.pathname}`, {
    status: 404,
  });
}

async function serve(bundled, bindings = {}) {
  return new Miniflare({
    modules: [
      { type: "ESModule", path: bundled.file, contents: bundled.source },
    ],
    modulesRoot: path.dirname(bundled.file),
    compatibilityDate: COMPAT_DATE,
    compatibilityFlags: ["nodejs_compat"],
    bindings,
    outboundService: upstream,
  });
}

let failed = 0;
function report(name, ok, detail = "") {
  if (!ok) failed++;
  console.log(`${ok ? "ok  " : "FAIL"}  ${name}${detail ? `  ${detail}` : ""}`);
}

// 1. The library's runtime-neutral features.
const probe = bundle(path.join(here, "probe-worker.js"));
console.log(`probe bundle: ${(probe.size / 1024 / 1024).toFixed(1)} MB`);
{
  const mf = await serve(probe);
  try {
    const res = await mf.dispatchFetch("http://localhost/");
    const results = await res.json();
    for (const [name, r] of Object.entries(results)) {
      report(
        name,
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

// 2. The Cloudflare Worker example, as written.
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

for (const b of [probe, example])
  fs.rmSync(b.out, { recursive: true, force: true });
if (failed) {
  console.error(`\n${failed} edge check(s) failed`);
  process.exit(1);
}
console.log("\nall edge checks passed");
