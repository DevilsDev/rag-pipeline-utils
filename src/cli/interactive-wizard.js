/**
 * Interactive CLI Wizard for RAG Pipeline Setup
 * Provides guided setup for plugin selection, DAG building, and configuration
 *
 * This module is a thin orchestrator that delegates to focused step modules
 * in src/cli/wizard/. Each step receives the wizard's config state and
 * inquirer instance.
 */

const inquirer = require("inquirer");
const path = require("path");
const {
  DEFAULT_REGISTRY_URLS,
} = require("../core/plugin-marketplace/plugin-registry-format.js");

// Step modules
const { setupProject } = require("./wizard/project-setup.js");
const { selectPlugins } = require("./wizard/plugin-selection.js");
const {
  configureSettings,
  configurePipeline,
} = require("./wizard/configuration.js");
const { configurePerformance } = require("./wizard/performance.js");
const { configureObservability } = require("./wizard/observability.js");
const {
  previewAndSave,
  showConfigSummary,
  runConfigurationTest,
} = require("./wizard/preview-save.js");

/**
 * Interactive wizard for RAG pipeline setup
 */
class InteractiveWizard {
  constructor(_options = {}) {
    this._options = {
      registryUrl: _options.registryUrl || DEFAULT_REGISTRY_URLS[0],
      outputPath: _options.outputPath || ".ragrc.json",
      ..._options,
    };
    this.registry = null;
    this._config = {
      plugins: {
        loader: {},
        embedder: {},
        retriever: {},
        llm: {},
      },
      registry: {
        urls: [this._options.registryUrl],
      },
    };

    // Initialize steps for testing interface
    this.steps = [
      "project-setup",
      "plugin-selection",
      "configuration",
      "pipeline-setup",
      "performance-tuning",
      "observability",
      "preview-save",
    ];
    this.currentStep = 0;
  }

  /**
   * Run the complete interactive wizard
   * @returns {Promise<object>} Generated configuration
   */
  async run() {
    console.log("🧙‍♂️ Welcome to the RAG Pipeline Interactive Setup Wizard!\n");
    // eslint-disable-line no-console
    console.log(
      "This wizard will help you configure your RAG pipeline with the right plugins and settings.\n",
    );
    // eslint-disable-line no-console

    try {
      // Step 1: Project setup
      await this.setupProject();

      // Step 2: Plugin selection
      await this.selectPlugins();

      // Step 3: Configuration
      await this.configureSettings();

      // Step 4: Pipeline stages
      await this.configurePipeline();

      // Step 5: Performance settings
      await this.configurePerformance();

      // Step 6: Observability settings
      await this.configureObservability();

      // Step 7: Preview and save
      await this.previewAndSave();

      console.log("\n🎉 RAG Pipeline setup complete!");
      // eslint-disable-line no-console
      console.log(`Configuration saved to: ${this._options.outputPath}`);
      // eslint-disable-line no-console

      return this._config;
    } catch (error) {
      console.error("\n❌ Setup wizard failed:", error.message);
      // eslint-disable-line no-console
      throw error;
    }
  }

  /**
   * Setup project metadata - delegates to project-setup module
   */
  async setupProject() {
    this._config = await setupProject(this._config, inquirer);
  }

  /**
   * Select plugins for each type - delegates to plugin-selection module
   */
  async selectPlugins() {
    const context = {
      registry: this.registry,
      getAvailablePlugins: (type) => this.getAvailablePlugins(type),
      getPluginInfo: (type, name) => this.getPluginInfo(type, name),
      loadRegistry: () => this.loadRegistry(),
    };
    this._config = await selectPlugins(this._config, inquirer, context);
    // Sync registry back from context (loadRegistry may have updated it)
    this.registry = context.registry;
  }

  /**
   * Configure general settings - delegates to configuration module
   */
  async configureSettings() {
    this._config = await configureSettings(this._config, inquirer);
  }

  /**
   * Configure pipeline stages - delegates to configuration module
   */
  async configurePipeline() {
    this._config = await configurePipeline(this._config, inquirer);
  }

  /**
   * Configure performance settings - delegates to performance module
   */
  async configurePerformance() {
    this._config = await configurePerformance(this._config, inquirer);
  }

  /**
   * Configure observability settings - delegates to observability module
   */
  async configureObservability() {
    this._config = await configureObservability(this._config, inquirer);
  }

  /**
   * Preview configuration and save - delegates to preview-save module
   */
  async previewAndSave() {
    this._config = await previewAndSave(this._config, inquirer, this._options);
  }

  /**
   * Show configuration summary - delegates to preview-save module
   */
  showConfigSummary() {
    showConfigSummary(this._config);
  }

  /**
   * Run configuration test - delegates to preview-save module
   */
  async runConfigurationTest() {
    await runConfigurationTest(this._config);
  }

  /**
   * Configure plugin-specific settings
   * @param {object} plugin - Plugin information
   * @returns {Promise<object>} Plugin configuration
   */
  async configurePluginSettings(plugin) {
    const {
      configurePluginSettings: configPluginSettings,
    } = require("./wizard/plugin-selection.js");
    return configPluginSettings(plugin, inquirer);
  }

  /**
   * Load plugin registry
   * @returns {Promise<object>} Registry data
   */
  async loadRegistry() {
    // In a real implementation, this would fetch from the registry URL
    // For now, return mock data
    return {
      plugins: {
        "file-loader": {
          metadata: {
            name: "file-loader",
            _type: "loader",
            description: "Load files from filesystem",
          },
          versions: { "1.0.0": {}, "1.1.0": {} },
          latest: "1.1.0",
        },
        "openai-embedder": {
          metadata: {
            name: "openai-embedder",
            _type: "embedder",
            description: "OpenAI embeddings",
          },
          versions: { "2.0.0": {}, "2.1.0": {} },
          latest: "2.1.0",
        },
      },
    };
  }

  /**
   * Get available plugins for type
   * @param {string} _type - Plugin type
   * @returns {Array<object>} Available plugins
   */
  getAvailablePlugins(_type) {
    if (!this.registry) {
      return this.getBuiltinPlugins(_type);
    }

    return Object.values(this.registry.plugins)
      .filter((plugin) => plugin.metadata._type === _type)
      .map((plugin) => ({
        name: plugin.metadata.name,
        description: plugin.metadata.description,
        version: plugin.latest,
      }));
  }

  /**
   * Get built-in plugin options
   * @param {string} _type - Plugin type
   * @returns {Array<object>} Built-in plugins
   */
  getBuiltinPlugins(_type) {
    const builtins = {
      loader: [
        { name: "file-loader", description: "Load files from filesystem" },
        { name: "url-loader", description: "Load content from URLs" },
      ],
      embedder: [
        { name: "openai-embedder", description: "OpenAI embeddings" },
        { name: "local-embedder", description: "Local embedding model" },
      ],
      retriever: [
        { name: "vector-retriever", description: "Vector similarity search" },
        { name: "keyword-retriever", description: "Keyword-based search" },
      ],
      llm: [
        { name: "openai-llm", description: "OpenAI language models" },
        { name: "local-llm", description: "Local language model" },
      ],
      reranker: [
        {
          name: "similarity-reranker",
          description: "Similarity-based reranking",
        },
      ],
    };

    return builtins[_type] || [];
  }

  /**
   * Get plugin information
   * @param {string} _type - Plugin type
   * @param {string} name - Plugin name
   * @returns {object|null} Plugin information
   */
  getPluginInfo(_type, name) {
    if (!this.registry) {
      return null;
    }

    return this.registry.plugins[name] || null;
  }

  /**
   * Load wizard configuration
   * @returns {object} Current configuration
   */
  loadConfig() {
    return { ...this._config };
  }

  /**
   * Navigate to next step
   * @returns {string} Next step name
   */
  nextStep() {
    if (this.currentStep < this.steps.length - 1) {
      this.currentStep++;
    }
    return this.steps[this.currentStep];
  }

  /**
   * Navigate to previous step
   * @returns {string} Previous step name
   */
  previousStep() {
    if (this.currentStep > 0) {
      this.currentStep--;
    }
    return this.steps[this.currentStep];
  }

  /**
   * Complete the wizard
   * @returns {Promise<object>} Completion result
   */
  async complete() {
    return {
      success: true,
      config: this._config,
      message: "Wizard completed successfully",
    };
  }

  /**
   * Validate user input
   * @param {string} input - Input to validate
   * @returns {boolean} Whether input is valid
   */
  validateInput(input) {
    return typeof input === "string" && input.trim().length > 0;
  }

  /**
   * Process user selection
   * @param {string} selection - User selection
   * @returns {object} Processing result
   */
  processSelection(selection) {
    return {
      selection,
      processed: true,
      timestamp: Date.now(),
    };
  }
}

/**
 * Main wizard function for CLI usage
 * @param {object} options - Wizard options
 * @returns {Promise<object>} Generated configuration
 */
async function runInteractiveWizard(options = {}) {
  const wizard = new InteractiveWizard(options);
  return await wizard.run();
}

module.exports = {
  InteractiveWizard,
  runInteractiveWizard,
};
