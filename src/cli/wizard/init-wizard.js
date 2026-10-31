"use strict";

/**
 * Interactive setup wizard for `rag-pipeline init`.
 *
 * Every choice maps to something buildComponents() can instantiate: the
 * built-in components in config/component-factory, or a custom plugin
 * module that is loaded and checked for the stage's methods before it is
 * accepted. The prompt function is injected (inquirer.prompt in the CLI) and
 * is always called with a single question, so tests can script answers.
 */

const fs = require("fs");
const path = require("path");
const {
  BUILT_INS,
  loadPluginModule,
  buildComponents: defaultBuildComponents,
} = require("../../config/component-factory");
const { embedQuery } = require("../../utils/embed-query");
const { buildInitConfig, DEFAULT_INDEX_PATH } = require("./config-builder");
// Methods a custom plugin must expose; shared with validatePlugin().
const { STAGE_CONTRACTS } = require("../../core/stage-contracts");

const CUSTOM = "custom";
const NONE = "none";
const DEFAULT_TIMEOUT_MS = 15000;

/** Environment variable each hosted provider reads its API key from. */
const API_KEY_ENV = {
  openai: "OPENAI_API_KEY",
  anthropic: "ANTHROPIC_API_KEY",
  cohere: "COHERE_API_KEY",
};

// Static requires, loaded on first use, so the CLI bundle (dist/cli.cjs)
// includes them; a require() of a computed path can't be bundled.
/* eslint-disable global-require */
const CONNECTOR_MODULES = {
  openai: () => require("../../connectors/openai-connector"),
  anthropic: () => require("../../connectors/anthropic-connector"),
  ollama: () => require("../../connectors/ollama-connector"),
  cohere: () => require("../../connectors/cohere-connector"),
};
/* eslint-enable global-require */

/** Connector options the wizard asks for, per stage and provider. */
const PROVIDER_OPTIONS = {
  embedder: {
    openai: ["embeddingModel"],
    ollama: ["baseURL", "embeddingModel"],
    cohere: ["embeddingModel"],
  },
  llm: {
    openai: ["model"],
    anthropic: ["model"],
    ollama: ["baseURL", "model"],
  },
};

const OPTION_LABELS = {
  model: "model",
  embeddingModel: "embedding model",
  baseURL: "server URL",
};

const CUSTOM_CHOICE = {
  name: "custom plugin (path to a .js module)",
  value: CUSTOM,
};

const STAGE_CHOICES = {
  embedder: [
    { name: "local (TF-IDF, offline, no API key)", value: "local" },
    { name: "openai (OPENAI_API_KEY)", value: "openai" },
    { name: "ollama (local Ollama server)", value: "ollama" },
    { name: "cohere (COHERE_API_KEY)", value: "cohere" },
    CUSTOM_CHOICE,
  ],
  llm: [
    { name: "none (query prints the retrieved passages)", value: NONE },
    { name: "openai (OPENAI_API_KEY)", value: "openai" },
    { name: "anthropic (ANTHROPIC_API_KEY)", value: "anthropic" },
    { name: "ollama (local Ollama server)", value: "ollama" },
    CUSTOM_CHOICE,
  ],
  retriever: [
    {
      name: "file-store (JSON index on disk, persists between commands)",
      value: "file-store",
    },
    {
      name: "memory (in-process only, lost when the command exits)",
      value: "memory",
    },
    CUSTOM_CHOICE,
  ],
  reranker: [
    { name: "none", value: NONE },
    { name: "scoring (BM25 re-scoring, offline)", value: "scoring" },
    CUSTOM_CHOICE,
  ],
};

const STAGE_TITLES = {
  embedder: "Embedder",
  llm: "Language model",
  retriever: "Retriever",
  reranker: "Reranker (optional)",
};

/** Ask one question and return its answer. */
async function ask(prompt, question) {
  const answers = await prompt([question]);
  return answers ? answers[question.name] : undefined;
}

/** Defaults for the options the wizard asks for (never the API key). */
function connectorDefaults(provider) {
  const { DEFAULT_CONFIG } = CONNECTOR_MODULES[provider]();
  return {
    model: DEFAULT_CONFIG.model,
    embeddingModel: DEFAULT_CONFIG.embeddingModel,
    baseURL: DEFAULT_CONFIG.baseURL,
  };
}

/** Path written to the config: relative to its directory, forward slashes. */
function toConfigPath(absPath, configDir) {
  // Segment-wise instead of path.relative(), which returns wrong results on
  // some Windows Node releases (e.g. "..C:/..." for a file inside `from`).
  const win = process.platform === "win32";
  const same = (a, b) => (win ? a.toLowerCase() === b.toLowerCase() : a === b);
  const from = path
    .resolve(configDir)
    .split(/[\\/]+/)
    .filter(Boolean);
  const to = path
    .resolve(absPath)
    .split(/[\\/]+/)
    .filter(Boolean);
  if (win && !same(from[0] || "", to[0] || "")) {
    return path.resolve(absPath).split(path.sep).join("/"); // other drive
  }
  let common = 0;
  while (
    common < from.length &&
    common < to.length &&
    same(from[common], to[common])
  ) {
    common++;
  }
  const rel = [
    ...Array(from.length - common).fill(".."),
    ...to.slice(common),
  ].join("/");
  return rel.startsWith("../") ? rel : `./${rel}`;
}

/** Plugin name from the file name, never shadowed by a built-in. */
function pluginNameFor(stage, absPath) {
  const base =
    path
      .basename(absPath, path.extname(absPath))
      .replace(/[^A-Za-z0-9_-]+/g, "-")
      .replace(/^-+|-+$/g, "") || `custom-${stage}`;
  const builtIns = BUILT_INS[stage] || {};
  let name = base;
  for (let n = 2; Object.prototype.hasOwnProperty.call(builtIns, name); n++) {
    name = n === 2 ? `${base}-custom` : `${base}-custom-${n}`;
  }
  return name;
}

/**
 * Load a custom plugin the way buildComponents() will and check that it
 * exposes the stage's methods.
 *
 * @param {string} stage - embedder | llm | retriever | reranker
 * @param {string} input - Path as typed by the user (relative to cwd)
 * @param {object} options
 * @param {string} options.cwd - Directory user input is resolved against
 * @param {string} options.configDir - Directory of the output config file
 * @returns {{ok: true, selection: object, warnings: string[]} | {ok: false, error: string}}
 */
function inspectPlugin(stage, input, { cwd, configDir }) {
  const absPath = path.resolve(cwd, input);
  let stat;
  try {
    stat = fs.statSync(absPath);
  } catch {
    return { ok: false, error: `File not found: ${absPath}` };
  }
  if (!stat.isFile()) {
    return { ok: false, error: `Not a file: ${absPath}` };
  }

  // Pick up edits when the user fixes the file and tries again.
  try {
    delete require.cache[require.resolve(absPath)];
  } catch {
    // not resolvable yet; loadPluginModule reports the real error
  }

  let instance;
  try {
    instance = loadPluginModule(absPath, {}, configDir);
  } catch (error) {
    return { ok: false, error: `Could not load ${absPath}: ${error.message}` };
  }

  const contract = STAGE_CONTRACTS[stage];
  const has = (method) => instance && typeof instance[method] === "function";
  if (!contract.anyOf.some(has)) {
    return {
      ok: false,
      error: `${absPath} does not look like a ${stage}: it must export a class or object with ${contract.anyOf.map((m) => `${m}()`).join(" or ")}`,
    };
  }

  const warnings = Object.entries(contract.recommended)
    .filter(([method]) => !has(method))
    .map(([method, why]) => `No ${method}() method: ${why}, so it will fail.`);

  return {
    ok: true,
    selection: {
      name: pluginNameFor(stage, absPath),
      module: toConfigPath(absPath, configDir),
    },
    warnings,
  };
}

/** Ask for a custom plugin path until it validates; empty input cancels. */
async function askCustomPlugin(ctx, stage) {
  for (;;) {
    const answer = await ask(ctx.prompt, {
      type: "input",
      name: `${stage}Plugin`,
      message: `Path to your ${stage} module (empty to go back):`,
    });
    const input = String(answer || "").trim();
    if (!input) return null;

    const result = inspectPlugin(stage, input, ctx);
    if (!result.ok) {
      ctx.log(`  ✖ ${result.error}`);
      continue;
    }
    for (const warning of result.warnings) ctx.log(`  ⚠ ${warning}`);
    ctx.log(
      `  ✔ ${stage} plugin "${result.selection.name}" -> ${result.selection.module}`,
    );
    return result.selection;
  }
}

/** Ask for the connector options of a built-in provider. */
async function askProviderOptions(ctx, stage, provider) {
  const keys = (PROVIDER_OPTIONS[stage] || {})[provider] || [];
  if (keys.length === 0) return undefined;

  const defaults = connectorDefaults(provider);
  const config = {};
  for (const key of keys) {
    // Reuse the Ollama URL typed for the embedder as the LLM's default.
    const fallback =
      key === "baseURL" && ctx.ollamaBaseURL
        ? ctx.ollamaBaseURL
        : defaults[key];
    const answer = await ask(ctx.prompt, {
      type: "input",
      name: `${stage}_${key}`,
      message: `${provider} ${OPTION_LABELS[key]}:`,
      default: fallback,
    });
    config[key] = String(answer ?? "").trim() || fallback;
    if (key === "baseURL") ctx.ollamaBaseURL = config[key];
  }
  return config;
}

/** One pipeline stage: pick a provider, then its options or plugin path. */
async function askStage(ctx, stage, defaultName) {
  for (;;) {
    const choice = await ask(ctx.prompt, {
      type: "list",
      name: stage,
      message: `${STAGE_TITLES[stage]}:`,
      choices: STAGE_CHOICES[stage],
      default: defaultName,
    });

    if (choice === NONE || choice === null || choice === undefined) {
      if (stage === "embedder" || stage === "retriever") {
        ctx.log(`  ✖ A ${stage} is required.`);
        continue;
      }
      return null;
    }

    if (choice === CUSTOM) {
      const selection = await askCustomPlugin(ctx, stage);
      if (selection) return selection;
      continue;
    }

    if (!BUILT_INS[stage] || !BUILT_INS[stage][choice]) {
      ctx.log(`  ✖ Unknown ${stage} "${choice}".`);
      continue;
    }

    if (stage === "retriever") return askRetrieverOptions(ctx, choice);

    const config = await askProviderOptions(ctx, stage, choice);
    return config ? { name: choice, config } : { name: choice };
  }
}

async function askRetrieverOptions(ctx, name) {
  if (name === "memory") {
    ctx.log(
      "  ⚠ The memory retriever does not persist: `ingest` and `query` run as " +
        "separate processes, so documents ingested by one command are gone " +
        "for the next. Use it from code or with `run --ingest ... --query ...`.",
    );
    return { name };
  }
  const answer = await ask(ctx.prompt, {
    type: "input",
    name: "indexPath",
    message: "Index file (relative to the config file):",
    default: ctx.defaults.indexPath || DEFAULT_INDEX_PATH,
  });
  const indexPath =
    String(answer ?? "").trim() || ctx.defaults.indexPath || DEFAULT_INDEX_PATH;
  return { name, config: { path: indexPath } };
}

/**
 * Which API keys / services the chosen built-in providers need.
 *
 * @param {object} selection - Stage selections from the wizard
 * @param {object} env - Environment to check (process.env in the CLI)
 * @returns {Array<{provider: string, stages: string[], envVar?: string, set?: boolean, baseURL?: string}>}
 */
function checkEnvironment(selection, env) {
  const byProvider = new Map();
  for (const stage of ["embedder", "llm", "reranker"]) {
    const sel = selection[stage];
    if (!sel || sel.module) continue;
    const envVar = API_KEY_ENV[sel.name];
    if (envVar) {
      const item = byProvider.get(sel.name) || {
        provider: sel.name,
        stages: [],
        envVar,
        set: Boolean(env[envVar]),
      };
      item.stages.push(stage);
      byProvider.set(sel.name, item);
    } else if (sel.name === "ollama") {
      const baseURL =
        (sel.config && sel.config.baseURL) || "http://localhost:11434";
      const key = `ollama ${baseURL}`;
      const item = byProvider.get(key) || {
        provider: "ollama",
        stages: [],
        baseURL,
      };
      item.stages.push(stage);
      byProvider.set(key, item);
    }
  }
  return [...byProvider.values()];
}

function reportEnvironment(checks, log) {
  log("\nEnvironment check:");
  if (checks.length === 0) {
    log("  ✔ No API keys needed for the chosen components.");
    return;
  }
  for (const check of checks) {
    const used = `${check.provider} ${check.stages.join(" + ")}`;
    if (check.envVar && check.set) {
      log(`  ✔ ${check.envVar} is set (${used})`);
    } else if (check.envVar) {
      log(
        `  ⚠ ${check.envVar} is not set (${used}). Set it before ingest/query:`,
      );
      log(`      export ${check.envVar}=<your key>        # bash/zsh`);
      log(`      $env:${check.envVar} = "<your key>"      # PowerShell`);
    } else {
      log(
        `  • ${used} needs an Ollama server at ${check.baseURL} (no API key)`,
      );
    }
  }
  log(
    "  API keys are read from the environment and never written to the config file.",
  );
}

/**
 * Run fn(signal) with a time limit. On timeout the AbortSignal handed to fn
 * is aborted (with the timeout error as its reason) so a connector that
 * honours `options.signal` cancels its request instead of leaving a socket
 * open; the timer is unref'd and always cleared.
 */
async function withTimeout(fn, ms, label) {
  const controller = new AbortController();
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      const error = new Error(`${label} timed out after ${ms} ms`);
      controller.abort(error);
      reject(error);
    }, ms);
    if (timer && typeof timer.unref === "function") timer.unref();
  });
  try {
    return await Promise.race([
      Promise.resolve().then(() => fn(controller.signal)),
      timeout,
    ]);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Instantiate the embedder and llm from the config and make one real call
 * to each. Failures are reported, never thrown.
 *
 * @returns {Promise<Array<{stage: string, ok: boolean, skipped?: boolean, message: string}>>}
 */
async function testConnections(config, options) {
  const { buildComponents, configDir, timeoutMs } = options;
  const results = [];

  for (const stage of ["embedder", "llm"]) {
    const entry = config.pipeline.find((e) => e.stage === stage);
    if (!entry) continue;
    if (stage === "embedder" && entry.name === "local") {
      results.push({
        stage,
        ok: true,
        skipped: true,
        message: "local embedder runs offline; nothing to test",
      });
      continue;
    }

    try {
      const components = buildComponents(
        { ...config, pipeline: [entry] },
        { configDir },
      );
      const component = components[stage];
      if (stage === "embedder") {
        const vector = await withTimeout(
          (signal) => embedQuery(component, "test", { signal }),
          timeoutMs,
          'embedQuery("test")',
        );
        if (!Array.isArray(vector) || vector.length === 0) {
          throw new Error('embedQuery("test") returned no vector');
        }
        results.push({
          stage,
          ok: true,
          message: `${entry.name} returned a ${vector.length}-dimension vector`,
        });
      } else {
        const reply = await withTimeout(
          (signal) => component.generate("Say OK", [], { signal }),
          timeoutMs,
          'generate("Say OK")',
        );
        const text =
          typeof reply === "string"
            ? reply
            : reply && (reply.text || reply.content || reply.answer);
        results.push({
          stage,
          ok: true,
          message: `${entry.name} replied${text ? `: ${String(text).trim().slice(0, 60)}` : ""}`,
        });
      }
    } catch (error) {
      results.push({
        stage,
        ok: false,
        message: `${entry.name}: ${error && error.message ? error.message : error}`,
      });
    }
  }
  return results;
}

/**
 * Run the wizard.
 *
 * @param {object} options
 * @param {Function} options.prompt - inquirer-style prompt([question]) => answers
 * @param {object} [options.defaults] - {embedder, llm, indexPath} from --template
 * @param {string} [options.outputPath='.ragrc.json'] - Config file to write
 * @param {boolean} [options.overwrite=false] - The output file exists and will be replaced
 * @param {object} [options.env=process.env] - Environment for the API key check
 * @param {Function} [options.buildComponents] - Used by the connection test
 * @param {Function} [options.log=console.log]
 * @param {string} [options.cwd=process.cwd()] - Base for plugin paths typed by the user
 * @param {number} [options.timeoutMs=15000] - Connection test timeout per call
 * @returns {Promise<null | {config: object, selection: object, environment: Array, connection: Array|null}>}
 *   null when the user declines to write the file
 */
async function runInitWizard(options) {
  const {
    prompt,
    defaults = {},
    outputPath = ".ragrc.json",
    overwrite = false,
    env = process.env,
    buildComponents = defaultBuildComponents,
    log = console.log,
    cwd = process.cwd(),
    timeoutMs = DEFAULT_TIMEOUT_MS,
  } = options;
  if (typeof prompt !== "function") {
    throw new Error("runInitWizard requires a prompt function");
  }

  const configDir = path.dirname(path.resolve(cwd, outputPath));
  const ctx = { prompt, log, cwd, configDir, defaults };

  log("rag-pipeline setup: choose the components for your pipeline.");
  log(
    "Custom plugin paths are checked now and stored relative to the config file.\n",
  );

  const selection = {};
  selection.embedder = await askStage(
    ctx,
    "embedder",
    defaults.embedder || "local",
  );
  selection.llm = await askStage(ctx, "llm", defaults.llm || NONE);
  selection.retriever = await askStage(ctx, "retriever", "file-store");
  selection.reranker = await askStage(ctx, "reranker", NONE);

  const config = buildInitConfig(selection);

  const environment = checkEnvironment(selection, env);
  reportEnvironment(environment, log);

  let connection = null;
  const wantsTest = await ask(prompt, {
    type: "confirm",
    name: "testConnection",
    message: "Test the embedder/LLM now? (makes real API calls)",
    default: false,
  });
  if (wantsTest) {
    log("\nConnection test:");
    connection = await testConnections(config, {
      buildComponents,
      configDir,
      timeoutMs,
    });
    for (const result of connection) {
      const mark = result.skipped ? "•" : result.ok ? "✔" : "✖";
      log(`  ${mark} ${result.stage}: ${result.message}`);
    }
    if (connection.some((r) => !r.ok)) {
      log(
        "  The configuration can still be saved; fix the issue before running queries.",
      );
    }
  }

  log(`\nConfiguration preview (${outputPath}):`);
  log(JSON.stringify(config, null, 2));
  const confirmed = await ask(prompt, {
    type: "confirm",
    name: "confirmWrite",
    message: overwrite
      ? `Overwrite ${outputPath} with this configuration?`
      : `Write this configuration to ${outputPath}?`,
    default: true,
  });
  if (!confirmed) return null;

  return { config, selection, environment, connection };
}

module.exports = {
  runInitWizard,
  inspectPlugin,
  checkEnvironment,
  testConnections,
  ask,
  API_KEY_ENV,
  STAGE_CONTRACTS,
};
