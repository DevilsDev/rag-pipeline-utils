/**
 * Init command handler
 * Writes a .ragrc.json whose pipeline names built-in components (or custom
 * plugins checked by the setup wizard), so the result works with
 * `ingest` / `query` immediately.
 */

const fs = require("fs/promises");
const { buildInitConfig } = require("../wizard/config-builder.js");
const { runInitWizard, ask } = require("../wizard/init-wizard.js");

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

function inquirerPrompt(questions) {
  const inquirer = require("inquirer");
  return inquirer.prompt(questions);
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
 */
async function handleInit(globalOptions, options, deps = {}) {
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
      options.interactive !== false && Boolean(process.stdin.isTTY);

    if (globalOptions.dryRun) {
      console.log("🧪 Dry run: would write configuration");
      console.log(`Output file: ${options.output}`);
      console.log(`Template: ${templateName}`);
      console.log(`Interactive: ${interactive}`);
      return;
    }

    const prompt = deps.prompt || inquirerPrompt;
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
        return;
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
        buildComponents: deps.buildComponents,
        log: deps.log || console.log,
        timeoutMs: deps.timeoutMs,
      });
      if (!result) {
        console.log("Nothing written.");
        return;
      }
      config = result.config;
    } else {
      config = buildInitConfig(template);
    }

    await fs.writeFile(options.output, JSON.stringify(config, null, 2) + "\n");
    console.log(`✅ Configuration written: ${options.output}`);
    console.log("Next: rag-pipeline ingest <file-or-directory>");
  } catch (error) {
    console.error(`❌ Initialization failed: ${error.message}`);
    process.exitCode = 1;
  }
}

module.exports = { handleInit, buildInitConfig, TEMPLATES };
