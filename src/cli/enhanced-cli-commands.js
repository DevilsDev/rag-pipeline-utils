/**
 * Enhanced CLI Commands with Additional Flags and Features
 * Provides improved developer experience with dry-run, version display, and enhanced help
 *
 * This is the thin orchestrator that delegates to focused handler modules.
 */

const { Command } = require("commander");

const { logger } = require("../utils/logger.js");

// Shared utilities
const {
  parsePositiveInteger,
  collectMin,
  parseTolerance,
  generateCompletionScript,
  getVersion,
  getExtendedHelp,
} = require("./shared/cli-utils.js");

// Handler modules load when their command runs, so `--help` or one command
// does not pay for every other command's dependencies (inquirer, jsdom, ora,
// marked, csv-parse...).
/* eslint-disable global-require */
const handlers = {
  run: () => require("./handlers/run-handler.js"),
  init: () => require("./handlers/init-handler.js"),
  diagnostics: () => require("./handlers/diagnostics-handler.js"),
  config: () => require("./handlers/config-handler.js"),
  ingest: () => require("./handlers/ingest-handler.js"),
  query: () => require("./handlers/query-handler.js"),
  eval: () => require("./handlers/eval-handler.js"),
  generate: () => require("./handlers/generate-handler.js"),
};
/* eslint-enable global-require */

function parseNonNegativeInt(value) {
  const n = Number(value);
  if (!Number.isInteger(n) || n < 0) {
    throw new Error(`Expected a non-negative integer, got "${value}"`);
  }
  return n;
}

/**
 * Enhanced CLI with improved UX and additional features
 */
class EnhancedCLI {
  constructor() {
    this.program = new Command();
    this.setupGlobalOptions();
    this.setupCommands();
  }

  /**
   * Setup global CLI options
   */
  setupGlobalOptions() {
    this.program
      .name("rag-pipeline")
      .description("Enterprise-grade RAG pipeline toolkit")
      .version(getVersion(), "-v, --version", "Display version information")
      .option("--config <path>", "Configuration file path", ".ragrc.json")
      .option("--verbose", "Enable verbose output")
      .option("--quiet", "Print only results, no status messages")
      .option("--no-color", "Disable colored output")
      .option("--dry-run", "Show what would be done without executing")
      .helpOption("-h, --help", "Display help information")
      .showHelpAfterError()
      .addHelpText("after", getExtendedHelp());
  }

  /**
   * Setup all CLI commands
   */
  setupCommands() {
    this.program
      .command("init")
      .description("Create a .ragrc.json configuration")
      .option("--no-interactive", "Use the template without prompting")
      .option(
        "--template <name>",
        "Starting point: local, openai, ollama, anthropic",
        "local",
      )
      .option("--output <path>", "Output configuration file", ".ragrc.json")
      .option("--force", "Overwrite existing configuration")
      .action(async (options) => {
        const result = await handlers
          .init()
          .handleInit(this.program.opts(), options);
        // After a connection test, exit even if a provider call left a
        // socket or timer open (see exitAfterConnectionTest).
        handlers.init().exitAfterConnectionTest(result);
      });

    this.program
      .command("run")
      .description("Ingest and/or query in one step")
      .option("--ingest <path>", "File or directory to ingest first")
      .option("--query <text>", "Question to ask after ingesting")
      .option("--rebuild", "Discard the existing index before ingesting")
      .option("--top-k <n>", "Passages to retrieve", parsePositiveInteger, 3)
      .option("--json", "Print the query result as JSON")
      .action(async (options) => {
        await handlers.run().handleRun(this.program.opts(), options);
      });

    this.program
      .command("doctor")
      .description("Diagnose configuration, plugins and environment")
      .option(
        "--category <categories...>",
        "Only run: configuration, plugins, dependencies, performance, security, environment",
      )
      .option(
        "--auto-fix",
        "Fix issues where possible (npm install, file permissions)",
      )
      .option("--report <path>", "Save the diagnostic report as JSON")
      .action(async (options) => {
        await handlers.diagnostics().handleDoctor(this.program.opts(), options);
      });

    this.program
      .command("ingest")
      .description("Load, embed and index documents")
      .argument("<path>", "File or directory (.md, .html, .csv, .txt)")
      .option("--rebuild", "Discard the existing index before ingesting")
      .action(async (inputPath, options) => {
        await handlers
          .ingest()
          .handleIngest(this.program.opts(), inputPath, options);
      });

    this.program
      .command("query")
      .description("Ask a question against the ingested documents")
      .argument("<question>", "Question text")
      .option("--top-k <n>", "Passages to retrieve", parsePositiveInteger, 3)
      .option("--json", "Print the result as JSON")
      .option("--streaming", "Print the answer as it is generated")
      .option(
        "--timeout <ms>",
        "Abort the query after this many milliseconds",
        parsePositiveInteger,
      )
      .option("--trace", "Show time spent in each stage")
      .option(
        "--explain",
        "Show passage scores and which passages support each answer sentence",
      )
      .option("--stats", "Show latency and estimated tokens and cost")
      .action(async (question, options) => {
        await handlers
          .query()
          .handleQuery(this.program.opts(), question, options);
      });

    this.program
      .command("eval")
      .description(
        "Run an evaluation dataset; exit 1 on failures, low scores or regressions",
      )
      .argument("<dataset>", "Test set: .json (array or { cases }) or .jsonl")
      .option("--baseline <report>", "Compare with a report saved by --output")
      .option("--output <report>", "Save this run's report as JSON")
      .option(
        "--report <file>",
        "Write a summary: .html for a page, .md for Markdown",
      )
      .option(
        "--min <metric=value>",
        "Minimum mean for a metric, e.g. faithfulness=0.8 (repeatable)",
        collectMin,
      )
      .option(
        "--tolerance <n>",
        "Allowed drop in a metric's mean from the baseline (default 0.02)",
        parseTolerance,
      )
      .option(
        "--case-tolerance <n>",
        "Drop in one case's score that lists it (default 0.1)",
        parseTolerance,
      )
      .option(
        "--concurrency <n>",
        "Cases run at the same time",
        parsePositiveInteger,
        1,
      )
      .option(
        "--timeout <ms>",
        "Abort each case after this many milliseconds",
        parsePositiveInteger,
      )
      .option("--top-k <n>", "Passages to retrieve", parsePositiveInteger, 3)
      .option("--json", "Print the verdict, summary and comparison as JSON")
      .action(async (dataset, options) => {
        await handlers.eval().handleEval(this.program.opts(), dataset, options);
      });

    this.program
      .command("generate-dataset")
      .description(
        "Write a test set from the index: the llm writes questions about each chunk",
      )
      .requiredOption("--output <file>", "Where to write the test set (.json)")
      .option("--count <n>", "Cases to write at most", parsePositiveInteger, 20)
      .option(
        "--per-document <n>",
        "Questions to ask per chunk",
        parsePositiveInteger,
        1,
      )
      .option(
        "--min-faithfulness <n>",
        "Share of an answer's sentences its chunk must support (default 1)",
        parseTolerance,
      )
      .option(
        "--concurrency <n>",
        "Chunks processed at the same time",
        parsePositiveInteger,
        1,
      )
      .option("--force", "Replace --output if it exists")
      .action(async (options) => {
        await handlers
          .generate()
          .handleGenerateDataset(this.program.opts(), options);
      });

    this.program
      .command("validate")
      .description("Validate the configuration and resolve its components")
      .action(async () => {
        await handlers.diagnostics().handleValidate(this.program.opts());
      });

    this.program
      .command("serve")
      .description("Serve GET /health and POST /query over HTTP (local use)")
      .option(
        "--port <n>",
        "Port (0 picks a free one)",
        parseNonNegativeInt,
        3000,
      )
      .option("--host <host>", "Interface to bind", "127.0.0.1")
      .action(async (options) => {
        const { handleServe } = require("./handlers/serve-handler.js");
        await handleServe(this.program.opts(), options);
      });

    const { PluginHubCLI } = require("./commands/plugin-hub.js");
    this.program.addCommand(new PluginHubCLI().createCommands());

    const { createAiCommand } = require("./commands/ai.js");
    this.program.addCommand(createAiCommand(() => this.program.opts()));

    // Configuration management commands
    const configCmd = new Command("config");
    configCmd.description("Configuration management commands");

    configCmd
      .command("show")
      .description("Show current configuration")
      .option("--section <section>", "Show specific configuration section")
      .action(async (options) => {
        await handlers.config().handleConfigShow(this.program.opts(), options);
      });

    configCmd
      .command("set")
      .description("Set configuration value")
      .argument("<key>", "Configuration key (dot notation supported)")
      .argument("<value>", "Configuration value")
      .action(async (key, value, options) => {
        await handlers
          .config()
          .handleConfigSet(this.program.opts(), key, value);
      });

    configCmd
      .command("get")
      .description("Get configuration value")
      .argument("<key>", "Configuration key (dot notation supported)")
      .action(async (key, options) => {
        await handlers.config().handleConfigGet(this.program.opts(), key);
      });

    this.program.addCommand(configCmd);

    // System information command
    this.program
      .command("info")
      .description("Show system and plugin information")
      .option("--plugins", "Show built-in components and custom plugins")
      .option("--system", "Show system information")
      .option("--config", "Show configuration summary")
      .action(async (options) => {
        await handlers.diagnostics().handleInfo(this.program.opts(), options);
      });

    // Completion command for shell autocompletion
    this.program
      .command("completion")
      .description("Generate shell completion scripts")
      .argument("[shell]", "Shell type (bash, zsh, fish)", "bash")
      .action(async (shell, options) => {
        const completionScript = generateCompletionScript(shell);
        console.log(completionScript);
      });
  }

  /**
   * Run the CLI
   */
  async run(argv = process.argv) {
    try {
      await this.program.parseAsync(argv);
    } catch (error) {
      if (error.code !== "commander.unknownCommand") {
        logger.error("❌ CLI error:", error.message);
        process.exit(1);
      }
      throw error;
    }
  }
}

/**
 * Create and export enhanced CLI instance
 */
const enhancedCLI = new EnhancedCLI();

/**
 * Run enhanced CLI
 */
async function runEnhancedCLI(argv = process.argv) {
  await enhancedCLI.run(argv);
}

module.exports = {
  EnhancedCLI,
  enhancedCLI,
  runEnhancedCLI,
};
