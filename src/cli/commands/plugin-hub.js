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
        // requirements is local; install is disabled and explains why
        if (["requirements", "install"].includes(actionCommand.name())) return;
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

    // Install is disabled until it is real: the hub's install path discards
    // its own security-scan result, "sandbox installation" is a timer, it only
    // writes metadata.json, and a registry-supplied plugin id can write
    // outside the plugins directory.
    program
      .command("install <plugin>")
      .description("Not available yet (see message)")
      .action(() => {
        console.error(
          "❌ hub install is disabled: it does not yet verify or install plugin code safely.\n" +
            '   Add plugins manually under "plugins" in .ragrc.json instead.',
        );
        process.exitCode = 1;
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
      .description("List installed plugins")
      .option("--format <format>", "Output format: table, json", "table")
      .action(async (_options) => {
        await hubCommands.listInstalledPlugins(this.hub, _options);
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
      .command("submit <plugin>")
      .description("Submit plugin for certification")
      .option(
        "-l, --level <level>",
        "Certification level: BASIC, VERIFIED, ENTERPRISE",
        "BASIC",
      )
      .action(async (plugin, _options) => {
        await certificationCommands.submitForCertification(
          this.certification,
          plugin,
          _options,
        );
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
