#!/usr/bin/env node
"use strict";

/**
 * Consumer journeys: the package as developers use it after `npm install`,
 * against the real Claude API.
 *
 * 1. Packs what `npm publish` would upload: the main package (its prepack
 *    runs the build) and the scoped packages in packages/.
 * 2. For each journey, creates a fresh project under the OS temp dir,
 *    `npm install`s the tarballs plus the third-party packages a developer
 *    would add (latest versions from the npm registry), copies in the
 *    journey's code from test/consumer/<journey>/ and runs it.
 * 3. Checks each journey's outcome and prints a summary table.
 *
 * The Claude key comes from __tests__/live/live-env.js (ANTHROPIC_API_KEY or
 * ~/.config/rag-pipeline-utils/live-test.env) and reaches a journey only as
 * the ANTHROPIC_API_KEY environment variable of its process. It is never
 * written to a file, and is masked in everything printed or saved.
 *
 * Every Claude call is recorded (model and token counts only) in
 * ~/.config/rag-pipeline-utils/consumer-ledger.jsonl by a preload hook
 * (scripts/consumer-journeys/ledger-hook.cjs), which also stops calls past a
 * spend cap.
 *
 * Not part of `npm test` or CI. Without a key it skips and exits 0.
 *
 * Usage: npm run test:consumer -- [--only A,B] [--reuse-pack] [--keep]
 *        [--cap <usd>]
 */

const { spawnSync } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");

const { liveAnthropic } = require("../__tests__/live/live-env");
const { priceOf } = require("./consumer-journeys/ledger-hook.cjs");
const { JOURNEYS } = require("./consumer-journeys/journeys");

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
const only = option("--only")
  ? option("--only")
      .split(",")
      .map((s) => s.trim().toUpperCase())
  : null;
const reusePack = flag("--reuse-pack");
const keep = flag("--keep");
const CAP = Number(option("--cap") || 4); // stop starting journeys past this
const HARD_CAP = CAP + 0.75; // the hook refuses calls past this

const CONFIG_DIR = path.join(os.homedir(), ".config", "rag-pipeline-utils");
const LEDGER = path.join(CONFIG_DIR, "consumer-ledger.jsonl");
const CACHE = path.join(os.tmpdir(), "rag-consumer-journeys");
const TARBALLS = path.join(CACHE, "tarballs");
const LOGS = path.join(CACHE, "last-run");
const HOOK = path
  .join(__dirname, "consumer-journeys", "ledger-hook.cjs")
  .replace(/\\/g, "/");

const SCOPED_DIRS = [
  "rag-core",
  "rag-connectors",
  "rag-eval",
  "rag-guardrails",
  "rag-mcp-server",
];

// ---------------------------------------------------------------- helpers

let KEY = null;
function mask(text) {
  let out = String(text == null ? "" : text);
  if (KEY) out = out.split(KEY).join("[REDACTED-KEY]");
  return out;
}

function quoteWindowsArg(arg) {
  return arg
    .replace(/(\\*)"/g, (_, slashes) => `${slashes}${slashes}\\"`)
    .replace(/(\\+)$/, (_, slashes) => `${slashes}${slashes}`);
}

function sh(cmd, args, cwd, extra = {}) {
  // npm and npx are .cmd shims on Windows and need a shell, which splits
  // arguments on spaces: quote them.
  const shell = isWin && (cmd === NPM || cmd === NPX);
  const argv = shell
    ? args.map((a) =>
        // Windows quoting (CommandLineToArgvW): backslashes are literal
        // except before a quote, so double only those (and any at the end,
        // which come before the closing quote), then escape the quotes
        /[\s"&|<>^]/.test(a) ? `"${quoteWindowsArg(a)}"` : a,
      )
    : args;
  const result = spawnSync(cmd, argv, {
    cwd,
    encoding: "utf8",
    shell,
    maxBuffer: 64 * 1024 * 1024,
    ...extra,
  });
  return {
    code: result.status,
    stdout: mask(result.stdout),
    stderr: mask(result.stderr),
    error: result.error ? mask(result.error.message) : null,
  };
}

function readLedger() {
  if (!fs.existsSync(LEDGER)) return [];
  return fs
    .readFileSync(LEDGER, "utf8")
    .split("\n")
    .filter((l) => l.trim())
    .map((l) => {
      try {
        return JSON.parse(l);
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}

function cost(entries) {
  return entries.reduce((sum, e) => {
    const [i, o] = priceOf(e.model);
    return sum + ((e.input_tokens || 0) * i + (e.output_tokens || 0) * o) / 1e6;
  }, 0);
}

function parseResults(stdout) {
  return stdout
    .split(/\r?\n/)
    .filter((l) => l.startsWith("RESULT "))
    .map((l) => {
      try {
        return JSON.parse(l.slice(7));
      } catch {
        return { unparsable: l };
      }
    });
}

// ---------------------------------------------------------------- packing

function pack() {
  const manifest = path.join(TARBALLS, "manifest.json");
  if (reusePack && fs.existsSync(manifest)) {
    console.log(`📦 Reusing tarballs in ${TARBALLS}`);
    return JSON.parse(fs.readFileSync(manifest, "utf8"));
  }
  fs.rmSync(TARBALLS, { recursive: true, force: true });
  fs.mkdirSync(TARBALLS, { recursive: true });
  console.log(`📦 Packing into ${TARBALLS} (prepack runs the build)`);
  const packOne = (dir) => {
    const r = sh(
      NPM,
      ["pack", "--silent", "--pack-destination", TARBALLS],
      dir,
    );
    if (r.code !== 0) {
      throw new Error(`npm pack failed in ${dir}:\n${r.stderr || r.stdout}`);
    }
    return path.join(TARBALLS, r.stdout.trim().split("\n").pop().trim());
  };
  const result = { main: packOne(ROOT), scoped: {} };
  for (const dir of SCOPED_DIRS) {
    const pkgDir = path.join(ROOT, "packages", dir);
    const name = require(path.join(pkgDir, "package.json")).name;
    result.scoped[name] = packOne(pkgDir);
  }
  fs.writeFileSync(manifest, JSON.stringify(result, null, 2));
  return result;
}

// ---------------------------------------------------------------- journeys

function envFor(journey, step, workDir) {
  const env = { ...process.env };
  delete env.ANTHROPIC_API_KEY;
  delete env.RAG_LIVE_ENV;
  // A journey runs as a developer's process: their key or nothing.
  if (step.key === true) env.ANTHROPIC_API_KEY = KEY;
  else if (typeof step.key === "string") env.ANTHROPIC_API_KEY = step.key;
  env.RAG_LEDGER = LEDGER;
  env.RAG_JOURNEY = `${journey.id}${step.name ? ":" + step.name : ""}`;
  env.RAG_LEDGER_HARD_CAP_USD = String(HARD_CAP);
  env.RAG_PROBE_FILE = path.join(workDir, ".probe.jsonl");
  if (journey.markers) env.RAG_PROBE_MARKERS = journey.markers.join(",");
  env.NODE_OPTIONS = `${env.NODE_OPTIONS || ""} --require=${HOOK}`.trim();
  env.NO_COLOR = "1";
  env.FORCE_COLOR = "0";
  Object.assign(env, step.env || {});
  return env;
}

function runJourney(journey, tarballs) {
  const workDir = fs.mkdtempSync(
    path.join(os.tmpdir(), `rag-consumer-${journey.id.toLowerCase()}-`),
  );
  const log = [];
  const say = (line) => log.push(mask(line));
  const ctx = { workDir, steps: {}, install: null };
  const ledgerBefore = readLedger().length;

  // 1. A fresh project with its own package.json
  const overrides = Object.fromEntries(
    Object.entries(tarballs.scoped)
      .filter(([name]) => name !== "@devilsdev/rag-mcp-server")
      .map(([name, file]) => [name, `file:${file}`]),
  );
  const pkg = {
    name: `consumer-${journey.id.toLowerCase()}`,
    version: "1.0.0",
    private: true,
    ...(journey.type ? { type: journey.type } : {}),
    overrides,
  };
  fs.writeFileSync(
    path.join(workDir, "package.json"),
    JSON.stringify(pkg, null, 2),
  );

  // 2. npm install the tarball(s) and the developer's own packages
  const installs = (journey.install || ["main"]).map((t) =>
    t === "main"
      ? tarballs.main
      : t.startsWith("@devilsdev/")
        ? tarballs.scoped[t]
        : t,
  );
  say(`$ npm install ${installs.map((p) => path.basename(p)).join(" ")}`);
  const inst = sh(
    NPM,
    ["install", "--no-audit", "--no-fund", ...installs],
    workDir,
  );
  say(inst.stdout + inst.stderr);
  if (inst.code !== 0) {
    ctx.install = { ok: false, output: inst.stderr || inst.stdout };
    return { ctx, log, workDir, ledger: [] };
  }
  const ls = sh(NPM, ["ls", "--depth=0"], workDir);
  ctx.install = { ok: true, tree: ls.stdout };
  say(ls.stdout);

  // 3. The developer's code
  // `source`: a folder elsewhere in the repo (an example), copied without
  // its package.json and lockfile, which the install above already replaced
  const src = journey.source
    ? path.join(ROOT, journey.source)
    : path.join(ROOT, "test", "consumer", journey.dir);
  fs.cpSync(src, workDir, {
    recursive: true,
    filter: (p) =>
      !journey.source ||
      !["package.json", "package-lock.json", "node_modules"].includes(
        path.basename(p),
      ),
  });

  // 4. Run it
  for (const step of journey.steps) {
    if (step.setup) step.setup(workDir);
    const env = envFor(journey, step, workDir);
    const display = [step.npx ? "npx" : "node", ...(step.npx || step.args)];
    say(
      `\n$ ${display.join(" ")}   [key: ${step.key === true ? "real" : step.key ? "fake" : "none"}]`,
    );
    const started = Date.now();
    const r = step.npx
      ? sh(NPX, step.npx, workDir, {
          env,
          timeout: step.timeout || 300000,
          input: step.input,
        })
      : sh(process.execPath, step.args, workDir, {
          env,
          timeout: step.timeout || 300000,
          input: step.input,
        });
    r.ms = Date.now() - started;
    r.results = parseResults(r.stdout);
    r.result = r.results[r.results.length - 1] || null;
    ctx.steps[step.name] = r;
    say(r.stdout);
    if (r.stderr.trim()) say(`[stderr]\n${r.stderr}`);
    say(`[exit ${r.code} in ${r.ms} ms]`);
  }
  const probeFile = path.join(workDir, ".probe.jsonl");
  ctx.probe = fs.existsSync(probeFile)
    ? fs
        .readFileSync(probeFile, "utf8")
        .split("\n")
        .filter(Boolean)
        .map((l) => JSON.parse(l))
    : [];
  const ledger = readLedger().slice(ledgerBefore);
  ctx.ledger = ledger;
  return { ctx, log, workDir, ledger };
}

function check(journey, ctx) {
  const outcomes = [];
  if (!ctx.install || !ctx.install.ok) {
    outcomes.push({
      name: "npm install",
      ok: false,
      detail: ctx.install && ctx.install.output.slice(0, 600),
    });
    return outcomes;
  }
  for (const [name, fn] of journey.checks) {
    let ok = false;
    let detail = "";
    try {
      // true/undefined pass; false or a string (the detail) fail;
      // { info } passes with a detail.
      const value = fn(ctx);
      ok = value !== false && typeof value !== "string";
      if (typeof value === "string") detail = value;
      else if (value && typeof value === "object" && "info" in value) {
        detail = value.info;
      }
    } catch (error) {
      detail = mask(error.message);
    }
    const known = journey.known && journey.known[name];
    if (ok && known) {
      detail = `${detail ? detail + "; " : ""}known failure no longer reproduces (${known})`;
    }
    outcomes.push({ name, ok, detail, known: !ok && known ? known : null });
  }
  return outcomes;
}

// ---------------------------------------------------------------- main

function main() {
  const { apiKey, reason } = liveAnthropic();
  if (!apiKey) {
    console.log(`⏭️  Consumer journeys skipped: ${reason}`);
    return 0;
  }
  KEY = apiKey;
  fs.mkdirSync(CONFIG_DIR, { recursive: true });
  fs.mkdirSync(LOGS, { recursive: true });

  const selected = JOURNEYS.filter((j) => !only || only.includes(j.id));
  const tarballs = pack();
  const rows = [];

  for (const journey of selected) {
    const spent = cost(readLedger());
    if (spent >= CAP) {
      console.log(
        `🛑 Ledger spend $${spent.toFixed(4)} reached the $${CAP} cap; not starting ${journey.id}`,
      );
      rows.push({ id: journey.id, title: journey.title, status: "SKIP" });
      continue;
    }
    console.log(`\n▶ ${journey.id}. ${journey.title}`);
    const { ctx, log, workDir, ledger } = runJourney(journey, tarballs);
    const outcomes = check(journey, ctx);
    for (const o of outcomes) {
      const mark = o.ok ? "✅" : o.known ? "⚠️ " : "❌";
      console.log(
        `  ${mark} ${o.name}${o.detail ? ` — ${o.detail}` : ""}${o.known ? ` [known: ${o.known}]` : ""}`,
      );
    }
    const failed = outcomes.filter((o) => !o.ok && !o.known).length;
    const knownFailed = outcomes.filter((o) => !o.ok && o.known).length;
    const tokens = ledger.reduce(
      (s, e) => [s[0] + e.input_tokens, s[1] + e.output_tokens],
      [0, 0],
    );
    rows.push({
      id: journey.id,
      title: journey.title,
      status: failed ? "FAIL" : knownFailed ? "PASS*" : "PASS",
      checks: `${outcomes.filter((o) => o.ok).length}/${outcomes.length}`,
      calls: ledger.length,
      tokens: `${tokens[0]}/${tokens[1]}`,
      usd: cost(ledger),
      models: [...new Set(ledger.map((e) => e.model))].join(", "),
      outcomes,
    });
    const logFile = path.join(LOGS, `${journey.id}.log`);
    fs.writeFileSync(
      logFile,
      mask(
        log.join("\n") +
          "\n\n" +
          JSON.stringify({ outcomes, ledger }, null, 2) +
          "\n",
      ),
    );
    console.log(`  log: ${logFile}`);
    if (keep) console.log(`  project: ${workDir}`);
    else fs.rmSync(workDir, { recursive: true, force: true });
  }

  // Summary
  console.log(
    "\nJourney  Status  Checks  Calls  Tokens(in/out)    US$      Models",
  );
  for (const r of rows) {
    console.log(
      `${r.id.padEnd(8)} ${r.status.padEnd(7)} ${String(r.checks || "-").padEnd(7)} ${String(r.calls ?? "-").padEnd(6)} ${String(r.tokens || "-").padEnd(17)} ${r.usd != null ? r.usd.toFixed(4) : "-".padEnd(6)}   ${r.models || ""}`,
    );
  }
  const all = readLedger();
  console.log(
    `\nLedger total: ${all.length} calls, $${cost(all).toFixed(4)} (${LEDGER})`,
  );
  console.log("PASS* = passed except for checks marked as known failures");
  fs.writeFileSync(
    path.join(LOGS, "summary.json"),
    mask(JSON.stringify(rows, null, 2)),
  );
  return rows.some((r) => r.status === "FAIL") ? 1 : 0;
}

process.exitCode = main();
