#!/usr/bin/env node
/**
 * The starter templates (packages/create-rag-pipeline) as a developer gets
 * them: scaffolds each with the CLI, installs the library from this
 * repository's tarballs (before a release, the version they ask for isn't on
 * npm yet), builds it, and asks it a question.
 *
 *   next     next build, then next start and POST /api/ask
 *   mastra   tsc, mastra build, then npm run ask
 *   workers  wrangler deploy --dry-run, then wrangler dev and GET /ask
 *
 * Without --live, no API key is passed and each starter must answer with
 * the matching passages. With --live, the key from the live-test env file
 * (see __tests__/live/live-env.js) is passed and each starter must give a
 * grounded answer; calls are recorded in the consumer ledger, through a
 * local proxy for the Worker, whose runtime isn't Node.
 *
 *   node scripts/test-templates.js [--only next,mastra,workers] [--live]
 *     [--reuse-pack] [--keep]
 */

"use strict";

const { spawn, spawnSync } = require("child_process");
const fs = require("fs");
const http = require("http");
const os = require("os");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const isWin = process.platform === "win32";
const NPM = isWin ? "npm.cmd" : "npm";
const NPX = isWin ? "npx.cmd" : "npx";

const argv = process.argv.slice(2);
const flag = (name) => argv.includes(name);
const option = (name) => {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : undefined;
};
const ALL = ["next", "mastra", "workers"];
const only = option("--only") ? option("--only").split(",") : ALL;
const live = flag("--live");
const keep = flag("--keep");

const CACHE = path.join(os.tmpdir(), "rag-templates");
const TARBALLS = path.join(CACHE, "tarballs");
const LEDGER = path.join(
  os.homedir(),
  ".config",
  "rag-pipeline-utils",
  "consumer-ledger.jsonl",
);
const HOOK = path.join(__dirname, "consumer-journeys", "ledger-hook.cjs");
const SCOPED = ["rag-core", "rag-connectors", "rag-eval", "rag-guardrails"];
const LIVE_MODEL = "claude-haiku-4-5";

let KEY;
if (live) {
  const { liveAnthropic } = require("../__tests__/live/live-env");
  const env = liveAnthropic();
  if (!env.apiKey) {
    console.error(`--live needs the live-test key: ${env.reason}`);
    process.exit(1);
  }
  KEY = env.apiKey;
}

const mask = (text) =>
  KEY ? String(text).split(KEY).join("[key]") : String(text);

function sh(cmd, args, cwd, env = process.env) {
  const r = spawnSync(cmd, args, {
    cwd,
    env,
    encoding: "utf8",
    shell: isWin && cmd !== process.execPath,
    maxBuffer: 64 * 1024 * 1024,
  });
  return {
    code: r.status,
    out: mask(`${r.stdout || ""}${r.stderr || ""}`),
  };
}

function must(label, r) {
  if (r.code !== 0) {
    throw new Error(`${label} failed (exit ${r.code}):\n${r.out.slice(-3000)}`);
  }
  return r.out;
}

// ------------------------------------------------------------- packing

function pack() {
  const manifest = path.join(TARBALLS, "manifest.json");
  if (flag("--reuse-pack") && fs.existsSync(manifest)) {
    return JSON.parse(fs.readFileSync(manifest, "utf8"));
  }
  fs.rmSync(TARBALLS, { recursive: true, force: true });
  fs.mkdirSync(TARBALLS, { recursive: true });
  console.log(`Packing into ${TARBALLS} (prepack runs the build)`);
  const packOne = (dir) => {
    const out = must(
      `npm pack in ${dir}`,
      sh(NPM, ["pack", "--silent", "--pack-destination", TARBALLS], dir),
    );
    return path.join(TARBALLS, out.trim().split("\n").pop().trim());
  };
  const result = { main: packOne(ROOT), scoped: {} };
  for (const dir of SCOPED) {
    result.scoped[`@devilsdev/${dir}`] = packOne(
      path.join(ROOT, "packages", dir),
    );
  }
  fs.writeFileSync(manifest, JSON.stringify(result, null, 2));
  return result;
}

// ------------------------------------------------------------- helpers

function envFor(name, extra = {}) {
  const env = { ...process.env, NEXT_TELEMETRY_DISABLED: "1" };
  env.WRANGLER_SEND_METRICS = "false";
  delete env.ANTHROPIC_API_KEY;
  if (live) {
    env.ANTHROPIC_API_KEY = KEY;
    env.RAG_LEDGER = LEDGER;
    env.RAG_JOURNEY = `templates:${name}`;
    env.RAG_LEDGER_HARD_CAP_USD = String(
      Number(process.env.RAG_LEDGER_HARD_CAP_USD) || 64,
    );
    env.NODE_OPTIONS =
      `${env.NODE_OPTIONS || ""} --require=${HOOK.replace(/\\/g, "/")}`.trim();
  }
  return { ...env, ...extra };
}

/** Start a long-running command; resolves once `url` answers. */
async function serve(cmd, args, cwd, env, url, timeoutMs = 120000) {
  const child = spawn(cmd, args, {
    cwd,
    env,
    shell: isWin,
    stdio: ["ignore", "pipe", "pipe"],
    // Its own process group, so stop() reaches the servers npx starts
    detached: !isWin,
  });
  let log = "";
  child.stdout.on("data", (d) => (log += d));
  child.stderr.on("data", (d) => (log += d));
  const stop = () => {
    if (isWin) {
      spawnSync("taskkill", ["/pid", String(child.pid), "/t", "/f"], {
        stdio: "ignore",
      });
    } else {
      try {
        process.kill(-child.pid, "SIGKILL");
      } catch {
        // already gone
      }
    }
  };
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) break;
    try {
      await fetch(url, { signal: AbortSignal.timeout(2000) });
      return { stop, log: () => mask(log) };
    } catch {
      await new Promise((r) => setTimeout(r, 1000));
    }
  }
  stop();
  throw new Error(
    `${cmd} ${args.join(" ")} did not start:\n${mask(log).slice(-3000)}`,
  );
}

/** Forwards to api.anthropic.com with this process's fetch (recorded by the ledger hook). */
function anthropicProxy() {
  // The hook reads its settings when loaded, and records this process's fetch
  Object.assign(process.env, {
    RAG_LEDGER: LEDGER,
    RAG_JOURNEY: "templates:workers",
    RAG_LEDGER_HARD_CAP_USD: envFor("workers").RAG_LEDGER_HARD_CAP_USD,
  });
  require(HOOK);
  const server = http.createServer(async (req, res) => {
    const chunks = [];
    for await (const c of req) chunks.push(c);
    const headers = { ...req.headers };
    for (const h of ["host", "content-length", "connection"]) delete headers[h];
    // Only the Messages API, and only on api.anthropic.com
    // Only the Messages API: the URL is a constant, not built from the request
    const target = "https://api.anthropic.com/v1/messages";
    if (new URL(req.url, "http://proxy").pathname !== "/v1/messages") {
      res.writeHead(404, { "content-type": "text/plain" });
      res.end("not proxied");
      return;
    }
    try {
      const r = await fetch(target, {
        method: req.method,
        headers,
        body: chunks.length ? Buffer.concat(chunks) : undefined,
      });
      const out = {};
      r.headers.forEach((v, k) => {
        if (
          !["content-encoding", "content-length", "transfer-encoding"].includes(
            k,
          )
        )
          out[k] = v;
      });
      res.writeHead(r.status, out);
      res.end(Buffer.from(await r.arrayBuffer()));
    } catch (error) {
      console.error(`proxy: ${mask(error.message)}`);
      res.writeHead(502, { "content-type": "text/plain" });
      res.end("proxy error");
    }
  });
  return new Promise((resolve) =>
    server.listen(0, "127.0.0.1", () => resolve(server)),
  );
}

function expectAnswer(name, body) {
  if (live) {
    if (!body.answer)
      throw new Error(`${name}: no answer: ${JSON.stringify(body)}`);
    if (!/twenty|20/i.test(body.answer)) {
      throw new Error(
        `${name}: answer doesn't give the vacation days: ${body.answer}`,
      );
    }
  } else if (body.answer !== null) {
    throw new Error(`${name}: expected answer null without a key`);
  }
  const ids = (body.sources || []).map((s) => s.id);
  if (ids[0] !== "vacation") {
    throw new Error(`${name}: expected the vacation passage first, got ${ids}`);
  }
}

const QUESTION = "How many vacation days do I get?";

// ------------------------------------------------------------- templates

const CHECKS = {
  async next(dir) {
    must("next build", sh(NPX, ["next", "build"], dir, envFor("next")));
    const port = 3200 + Math.floor(Math.random() * 500);
    const server = await serve(
      NPX,
      ["next", "start", "-p", String(port)],
      dir,
      envFor("next", live ? { ANTHROPIC_MODEL: LIVE_MODEL } : {}),
      `http://127.0.0.1:${port}/`,
    );
    try {
      const res = await fetch(`http://127.0.0.1:${port}/api/ask`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ question: QUESTION }),
      });
      const body = await res.json();
      expectAnswer("next", body);
      if (live && !body.grounding?.grounded) {
        throw new Error(
          `next: answer not grounded: ${JSON.stringify(body.grounding)}`,
        );
      }
      return live ? body.answer : `${body.sources.length} passages`;
    } finally {
      server.stop();
    }
  },

  async mastra(dir) {
    must("tsc", sh(NPX, ["tsc", "--noEmit"], dir));
    must("mastra build", sh(NPX, ["mastra", "build"], dir, envFor("mastra")));
    const out = must(
      "npm run ask",
      sh(
        NPM,
        ["run", "-s", "ask", "--", QUESTION],
        dir,
        envFor("mastra", live ? { MODEL: `anthropic/${LIVE_MODEL}` } : {}),
      ),
    );
    if (live && !/Grounded: every sentence/.test(out)) {
      throw new Error(`mastra: answer not grounded:\n${out}`);
    }
    if (!live && !/\[vacation\.md\]/.test(out)) {
      throw new Error(`mastra: no vacation passage without a key:\n${out}`);
    }
    return out.trim().split("\n").slice(-3).join(" | ");
  },

  async workers(dir) {
    must(
      "wrangler deploy --dry-run",
      sh(
        NPX,
        ["wrangler", "deploy", "--dry-run", "--outdir", "dist"],
        dir,
        envFor("workers"),
      ),
    );
    const proxy = live ? await anthropicProxy() : null;
    const port = 8800 + Math.floor(Math.random() * 500);
    const extra = live
      ? {
          CLOUDFLARE_INCLUDE_PROCESS_ENV: "true",
          ANTHROPIC_MODEL: LIVE_MODEL,
          ANTHROPIC_BASE_URL: `http://127.0.0.1:${proxy.address().port}`,
        }
      : {};
    const env = envFor("workers", extra);
    // The proxy (in this process) makes the recorded calls, not workerd
    delete env.NODE_OPTIONS;
    const server = await serve(
      NPX,
      ["wrangler", "dev", "--port", String(port), "--ip", "127.0.0.1"],
      dir,
      env,
      `http://127.0.0.1:${port}/`,
    );
    try {
      const res = await fetch(
        `http://127.0.0.1:${port}/ask?q=${encodeURIComponent(QUESTION)}`,
      );
      const body = await res.json();
      expectAnswer("workers", body);
      if (live && body.groundedness !== 1) {
        throw new Error(`workers: groundedness ${body.groundedness}`);
      }
      return live ? body.answer : `${body.sources.length} passages`;
    } finally {
      server.stop();
      if (proxy) proxy.close();
    }
  },
};

async function main() {
  const tarballs = pack();
  const results = [];
  for (const name of only) {
    if (!CHECKS[name]) throw new Error(`Unknown template ${name}`);
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), `rag-template-${name}-`));
    fs.rmSync(dir, { recursive: true, force: true });
    const started = Date.now();
    try {
      must(
        "create-rag-pipeline",
        sh(
          process.execPath,
          [
            path.join(
              ROOT,
              "packages",
              "create-rag-pipeline",
              "bin",
              "create-rag-pipeline.js",
            ),
            dir,
            "--template",
            name,
          ],
          ROOT,
        ),
      );
      // The library and its scoped packages from this repository
      const pkgFile = path.join(dir, "package.json");
      const pkg = JSON.parse(fs.readFileSync(pkgFile, "utf8"));
      pkg.dependencies["@devilsdev/rag-pipeline-utils"] =
        `file:${tarballs.main}`;
      pkg.overrides = Object.fromEntries(
        Object.entries(tarballs.scoped).map(([n, f]) => [n, `file:${f}`]),
      );
      fs.writeFileSync(pkgFile, JSON.stringify(pkg, null, 2));
      must("npm install", sh(NPM, ["install", "--no-audit", "--no-fund"], dir));
      const detail = await CHECKS[name](dir);
      results.push({
        name,
        ok: true,
        detail,
        s: (Date.now() - started) / 1000,
      });
      console.log(
        `✓ ${name} (${Math.round((Date.now() - started) / 1000)}s): ${detail}`,
      );
    } catch (error) {
      results.push({ name, ok: false, detail: mask(error.message) });
      console.log(`✗ ${name}: ${mask(error.message)}`);
    } finally {
      if (!keep) fs.rmSync(dir, { recursive: true, force: true });
      else console.log(`  kept ${dir}`);
    }
  }
  // Exit even if a server's pipes are still open
  process.exit(results.some((r) => !r.ok) ? 1 : 0);
}

main().catch((error) => {
  console.error(mask(error.stack || error.message));
  process.exit(1);
});
