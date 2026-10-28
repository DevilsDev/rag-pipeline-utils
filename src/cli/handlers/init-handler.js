/**
 * Init command handler
 * Writes a .ragrc.json whose pipeline names built-in components (or custom
 * plugins checked by the setup wizard), so the result works with
 * `ingest` / `query` immediately.
 */

const fs = require("fs/promises");
const { buildInitConfig } = require("../wizard/config-builder.js");
const { runInitWizard, ask } = require("../wizard/init-wizard.js");
const {
  buildComponents: defaultBuildComponents,
} = require("../../config/component-factory");

/**
 * Starting points for `init --template <name>`. "local" needs no API keys or
 * services; it has no llm stage, so `query` prints the retrieved passages.
 * In interactive mode the template only sets the wizard's defaults.
 */
const TEMPLATES = {
  local: { embedder: "local", llm: null },
  openai: { embedder: "openai", llm: "openai" },
  ollama: { embedder: "ollama", llm: "ollama" },
  anthropic: { embedder: "local", llm: "anthropic" },
};

/**
 * inquirer prompt function. With custom streams it uses a prompt module
 * bound to them (inquirer@8 reads `{input, output}` from createPromptModule,
 * not from prompt()'s second argument, which holds pre-filled answers).
 */
function inquirerPrompt({ input, output } = {}) {
  const inquirer = require("inquirer");
  if (!input && !output) return (questions) => inquirer.prompt(questions);
  const promptModule = inquirer.createPromptModule({ input, output });
  return (questions) => promptModule(questions);
}

/** Grace period before the CLI forces an exit after a connection test. */
const EXIT_GRACE_MS = 1000;

/**
 * Last-resort exit for `rag-pipeline init` after a connection test ran.
 *
 * The test aborts each provider call on timeout (connectors that honour
 * `options.signal` cancel their request), but a custom plugin or a provider
 * SDK may still hold a socket or timer open, which would keep the process
 * alive after "Configuration written". The exit timer is unref'd: when
 * nothing is left running the process ends normally and the timer never
 * fires; otherwise it exits with the current exit code after the grace
 * period. Only the CLI command calls this, never the handler itself.
 *
 * @param {{connectionTested?: boolean}|undefined} result - handleInit result
 * @param {object} [options]
 * @param {number} [options.graceMs=1000]
 * @param {Function} [options.exit=process.exit]
 * @returns {NodeJS.Timeout|null} The scheduled timer, or null
 */
function exitAfterConnectionTest(result, options = {}) {
  if (!result || !result.connectionTested) return null;
  const { graceMs = EXIT_GRACE_MS, exit = (code) => process.exit(code) } =
    options;
  const timer = setTimeout(() => exit(process.exitCode ?? 0), graceMs);
  if (typeof timer.unref === "function") timer.unref();
  return timer;
}

/**
 * Handle init command
 * @param {object} globalOptions - Global CLI options from program.opts()
 * @param {object} options - Command-specific options
 * @param {object} [deps] - Injectable dependencies for tests
 * @param {Function} [deps.prompt] - inquirer-style prompt([question]) => answers
 * @param {object} [deps.env] - Environment for the API key check
 * @param {Function} [deps.buildComponents] - Used by the connection test
 * @param {Function} [deps.log] - Wizard output (console.log)
 * @param {number} [deps.timeoutMs] - Connection test timeout
 * @param {import("stream").Readable} [deps.input] - Prompt input (process.stdin)
 * @param {import("stream").Writable} [deps.output] - Prompt output (process.stdout)
 * @returns {Promise<{written: boolean, connectionTested: boolean}>}
 *   connectionTested is true when the connection test built a provider
 */
async function handleInit(globalOptions, options, deps = {}) {
  const outcome = { written: false, connectionTested: false };
  try {
    const templateName = options.template || "local";
    const template = TEMPLATES[templateName];
    if (!template) {
      throw new Error(
        `Unknown template "${templateName}". Available: ${Object.keys(TEMPLATES).join(", ")}`,
      );
    }

    // commander sets options.interactive=false for --no-interactive; only
    // prompt when a person is at the terminal.
    const interactive =
      options.interactive !== false &&
      Boolean((deps.input || process.stdin).isTTY);

    if (globalOptions.dryRun) {
      console.log("🧪 Dry run: would write configuration");
      console.log(`Output file: ${options.output}`);
      console.log(`Template: ${templateName}`);
      console.log(`Interactive: ${interactive}`);
      return outcome;
    }

    const prompt =
      deps.prompt || inquirerPrompt({ input: deps.input, output: deps.output });
    const exists = await fs
      .access(options.output)
      .then(() => true)
      .catch(() => false);
    if (exists && !options.force) {
      if (!interactive) {
        throw new Error(
          `Configuration file already exists: ${options.output}. Use --force to overwrite.`,
        );
      }
      const overwrite = await ask(prompt, {
        type: "confirm",
        name: "overwrite",
        message: `${options.output} already exists. Replace it?`,
        default: false,
      });
      if (!overwrite) {
        console.log("Nothing written.");
        return outcome;
      }
    }

    let config;
    if (interactive) {
      const result = await runInitWizard({
        prompt,
        defaults: template,
        outputPath: options.output,
        overwrite: exists,
        env: deps.env || process.env,
        // Only the connection test builds components; note that it did, so
        // the CLI can make sure no provider request keeps the process alive.
        buildComponents: (...args) => {
          outcome.connectionTested = true;
          return (deps.buildComponents || defaultBuildComponents)(...args);
        },
        log: deps.log || console.log,
        timeoutMs: deps.timeoutMs,
      });
      if (!result) {
        console.log("Nothing written.");
        return outcome;
      }
      config = result.config;
    } else {
      config = buildInitConfig(template);
    }

    await fs.writeFile(options.output, JSON.stringify(config, null, 2) + "\n");
    console.log(`✅ Configuration written: ${options.output}`);
    console.log("Next: rag-pipeline ingest <file-or-directory>");
    outcome.written = true;
  } catch (error) {
    console.error(`❌ Initialization failed: ${error.message}`);
    process.exitCode = 1;
  }
  return outcome;
}

module.exports = {
  handleInit,
  exitAfterConnectionTest,
  buildInitConfig,
  TEMPLATES,
};
