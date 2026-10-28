/**
 * Init command handler
 * Writes a .ragrc.json whose pipeline names built-in components, so the
 * result works with `ingest` / `query` immediately.
 */

const fs = require("fs/promises");
const { validateRagrc } = require("../../config/enhanced-ragrc-schema.js");

/**
 * Starting points for `init --template <name>`. "local" needs no API keys or
 * services; it has no llm stage, so `query` prints the retrieved passages.
 */
const TEMPLATES = {
  local: { embedder: "local", llm: null },
  openai: { embedder: "openai", llm: "openai" },
  ollama: { embedder: "ollama", llm: "ollama" },
  anthropic: { embedder: "local", llm: "anthropic" },
};

/**
 * @param {{embedder: string, llm: string|null, indexPath?: string}} choice
 * @returns {object} Normalized, validated configuration
 */
function buildInitConfig({ embedder, llm, indexPath = ".rag/index.json" }) {
  const pipeline = [
    { stage: "loader", name: "auto" },
    { stage: "embedder", name: embedder },
    { stage: "retriever", name: "file-store", config: { path: indexPath } },
  ];
  if (llm) pipeline.push({ stage: "llm", name: llm });

  const result = validateRagrc({
    namespace: "default",
    metadata: { name: "rag-pipeline", createdAt: new Date().toISOString() },
    pipeline,
  });
  if (!result.valid) {
    throw new Error(
      `Generated configuration is invalid: ${JSON.stringify(result.errors)}`,
    );
  }
  return result.normalized;
}

async function promptForChoice(defaults) {
  const inquirer = require("inquirer");
  return inquirer.prompt([
    {
      type: "list",
      name: "embedder",
      message: "Embedder:",
      default: defaults.embedder,
      choices: [
        { name: "local (TF-IDF, offline, no API key)", value: "local" },
        { name: "openai (OPENAI_API_KEY)", value: "openai" },
        { name: "ollama (local Ollama server)", value: "ollama" },
        { name: "cohere (COHERE_API_KEY)", value: "cohere" },
      ],
    },
    {
      type: "list",
      name: "llm",
      message: "Language model:",
      default: defaults.llm,
      choices: [
        { name: "none (query prints retrieved passages)", value: null },
        { name: "openai (OPENAI_API_KEY)", value: "openai" },
        { name: "anthropic (ANTHROPIC_API_KEY)", value: "anthropic" },
        { name: "ollama (local Ollama server)", value: "ollama" },
      ],
    },
    {
      type: "input",
      name: "indexPath",
      message: "Index file (relative to the config):",
      default: ".rag/index.json",
    },
  ]);
}

/**
 * Handle init command
 * @param {object} globalOptions - Global CLI options from program.opts()
 * @param {object} options - Command-specific options
 * @param {object} [deps] - Injectable prompt for tests
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

    if (!options.force) {
      const exists = await fs
        .access(options.output)
        .then(() => true)
        .catch(() => false);
      if (exists) {
        throw new Error(
          `Configuration file already exists: ${options.output}. Use --force to overwrite.`,
        );
      }
    }

    const prompt = deps.prompt || promptForChoice;
    const choice = interactive ? await prompt(template) : template;
    const config = buildInitConfig(choice);

    await fs.writeFile(options.output, JSON.stringify(config, null, 2) + "\n");
    console.log(`✅ Configuration written: ${options.output}`);
    console.log("Next: rag-pipeline ingest <file-or-directory>");
  } catch (error) {
    console.error(`❌ Initialization failed: ${error.message}`);
    process.exitCode = 1;
  }
}

module.exports = { handleInit, buildInitConfig, TEMPLATES };
