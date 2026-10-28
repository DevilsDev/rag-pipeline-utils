/**
 * Plugin Hub CLI Commands
 * Command-line interface for community plugin hub operations
 */

const { Command } = require("commander");
const { PluginHub } = require("../../ecosystem/plugin-hub");
const { PluginCertification } = require("../../ecosystem/plugin-certification");

const hubCommands = require("./plugin-hub/hub-commands");
const certificationCommands = require("./plugin-hub/certification-commands");
const reviewCommands = require("./plugin-hub/review-commands");
const { setupEventListeners } = require("./plugin-hub/event-handlers");
const {
  installFromSource,
  certifyLocal,
  listPlugins,
} = require("./plugin-hub/local-commands");

class PluginHubCLI {
  /**
   * @param {object} [options]
   * @param {string} [options.registryUrl] - Overrides --registry / RAG_PLUGIN_REGISTRY
   */
  constructor(options = {}) {
    this.registryUrl = options.registryUrl;
  }

  /**
   * There is no public registry: the old default (registry.rag-pipeline.dev)
   * does not resolve. Commands that talk to a registry need one configured.
   */
  _resolveRegistryUrl() {
    const url = this.registryUrl || process.env.RAG_PLUGIN_REGISTRY;
    if (!url) {
      throw new Error(
        "No plugin registry configured. Pass --registry <url> or set RAG_PLUGIN_REGISTRY.",
      );
    }
    return url;
  }

  _init() {
    if (!this._hub) {
      const registryUrl = this._resolveRegistryUrl();
      this._hub = new PluginHub({ registryUrl });
      this._certification = new PluginCertification({ registryUrl });
      setupEventListeners(this._hub, this._certification);
    }
  }

  get hub() {
    this._init();
    return this._hub;
  }

  get certification() {
    this._init();
    return this._certification;
  }

  createCommands() {
    const program = new Command("hub");
    program
      .alias("plugin")
      .description("Plugin registry operations (requires --registry <url>)")
      .option(
        "--registry <url>",
        "Plugin registry URL (or RAG_PLUGIN_REGISTRY)",
      )
      .hook("preAction", (_hubCommand, actionCommand) => {
        // Local commands: requirements and submit never need a registry; install
        // needs one only for registry ids and checks that itself.
        if (
          ["requirements", "install", "submit", "list"].includes(
            actionCommand.name(),
          )
        )
          return;
        this.registryUrl = this.registryUrl || program.opts().registry;
        try {
          this._resolveRegistryUrl();
        } catch (error) {
          console.error(`❌ ${error.message}`);
          process.exit(1);
        }
      });

    // Search command
    program
      .command("search <query>")
      .description("Search plugins in the community hub")
      .option("-c, --category <category>", "Filter by category")
      .option("-t, --tags <tags>", "Filter by tags (comma-separated)")
      .option("-a, --author <author>", "Filter by author")
      .option("-r, --min-rating <rating>", "Minimum rating (1-5)", parseFloat)
      .option("--verified", "Show only verified plugins")
      .option("-l, --limit <limit>", "Number of results", parseInt, 20)
      .option(
        "--sort <sort>",
        "Sort by: relevance, downloads, rating, updated",
        "relevance",
      )
      .action(async (query, _options) => {
        await hubCommands.searchPlugins(this.hub, query, _options);
      });

    program
      .command("install <source>")
      .description(
        "Install a plugin from a local path, .tgz, .js, npm:<package> or the registry",
      )
      .option("--stage <stage>", "loader, embedder, retriever, llm or reranker")
      .option("--name <name>", "Name to register the plugin under")
      .option("-v, --version <version>", "Registry version", "latest")
      .option("--force", "Replace an installed plugin with the same stage/name")
      .option("--allow-risky", "Install despite high-risk security findings")
      .action(async (source, _options, command) => {
        const globals = command.optsWithGlobals();
        this.registryUrl = this.registryUrl || globals.registry;
        const getHub = () =>
          this.registryUrl || process.env.RAG_PLUGIN_REGISTRY ? this.hub : null;
        await installFromSource(source, _options, globals, getHub);
      });

    // Info command
    program
      .command("info <plugin>")
      .description("Get detailed information about a plugin")
      .action(async (plugin) => {
        await hubCommands.getPluginInfo(this.hub, plugin);
      });

    // List installed command
    program
      .command("list")
      .alias("ls")
      .description("List plugins registered in the config")
      .option("--json", "Print as JSON")
      .action(async (_options, command) => {
        listPlugins(command.optsWithGlobals(), _options);
      });

    // Publish command
    program
      .command("publish [path]")
      .description("Publish a plugin to the hub")
      .option("--dry-run", "Validate without publishing")
      .option("--tag <tag>", "Release tag")
      .action(async (pluginPath, _options) => {
        await hubCommands.publishPlugin(
          this.hub,
          pluginPath || process.cwd(),
          _options,
        );
      });

    // Rate command
    program
      .command("rate <plugin> <rating>")
      .description("Rate a plugin (1-5 stars)")
      .option("-r, --review <review>", "Written review")
      .action(async (plugin, rating, _options) => {
        await reviewCommands.ratePlugin(
          this.hub,
          plugin,
          parseInt(rating),
          _options,
        );
      });

    // Reviews command
    program
      .command("reviews <plugin>")
      .description("View plugin reviews")
      .option("-l, --limit <limit>", "Number of reviews", parseInt, 10)
      .option("--sort <sort>", "Sort by: helpful, recent, rating", "helpful")
      .action(async (plugin, _options) => {
        await reviewCommands.getPluginReviews(this.hub, plugin, _options);
      });

    // Trending command
    program
      .command("trending")
      .description("Show trending plugins")
      .option("-p, --period <period>", "Time period: day, week, month", "week")
      .option("-c, --category <category>", "Filter by category")
      .option("-l, --limit <limit>", "Number of results", parseInt, 20)
      .action(async (_options) => {
        await hubCommands.getTrendingPlugins(this.hub, _options);
      });

    // Certification commands
    const certifyCmd = program
      .command("certify")
      .description("Plugin certification operations");

    certifyCmd
      .command("submit <path>")
      .alias("check")
      .description("Run automated certification checks on a local plugin")
      .option("--stage <stage>", "loader, embedder, retriever, llm or reranker")
      .option("--json", "Print the report as JSON")
      .option("--output <file>", "Save the report as JSON")
      .action(async (pluginPath, _options) => {
        await certifyLocal(pluginPath, _options);
      });

    certifyCmd
      .command("verify <plugin> <certificationId>")
      .description("Verify plugin certification")
      .action(async (plugin, certificationId) => {
        await certificationCommands.verifyCertification(
          this.certification,
          plugin,
          certificationId,
        );
      });

    certifyCmd
      .command("requirements [level]")
      .description("Show certification requirements")
      .action(async (level) => {
        // Requirements are a static list; no registry is contacted.
        await certificationCommands.showCertificationRequirements(
          new PluginCertification(),
          level,
        );
      });

    // Publisher commands
    const publisherCmd = program
      .command("publisher")
      .description("Publisher verification operations");

    publisherCmd
      .command("status [publisherId]")
      .description("Check publisher verification status")
      .action(async (publisherId) => {
        await certificationCommands.getPublisherStatus(
          this.certification,
          publisherId,
        );
      });

    publisherCmd
      .command("apply")
      .description("Apply for publisher verification")
      .action(async () => {
        await certificationCommands.applyForPublisherVerification(
          this.certification,
        );
      });

    return program;
  }
}

module.exports = { PluginHubCLI };
