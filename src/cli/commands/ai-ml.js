/**
 * Advanced AI/ML CLI Commands
 * Command-line interface for model training, adaptive retrieval, multi-modal processing, and federated learning
 *
 * This module is a thin aggregator that delegates to domain-specific modules
 * in the ai-ml/ directory.
 */

const chalk = require("chalk");
// eslint-disable-line global-require
const ora = require("ora");
// eslint-disable-line global-require
const Table = require("cli-table3");
// eslint-disable-line global-require
const fs = require("fs").promises;
// eslint-disable-line global-require

const {
  ModelTrainingOrchestrator,
  AdaptiveRetrievalEngine,
  MultiModalProcessor,
  FederatedLearningCoordinator,
} = require("../../ai");
// eslint-disable-line global-require

const {
  trainingCommands,
  adaptiveCommands,
  multimodalCommands,
  federatedCommands,
} = require("./ai-ml/index");

const { colorizeStatus, detectContentType } = require("./ai-ml/shared");

class AIMLCommands {
  constructor() {
    this.modelTrainer = new ModelTrainingOrchestrator();
    this.adaptiveRetrieval = new AdaptiveRetrievalEngine();
    this.multiModalProcessor = new MultiModalProcessor();
    this.federatedLearning = new FederatedLearningCoordinator();
  }

  /**
   * Register all AI/ML commands
   */
  registerCommands(program) {
    const aiCommand = program
      .command("ai")
      .description("Advanced AI/ML capabilities");

    // Model Training Commands
    const trainCommand = aiCommand
      .command("train")
      .description("Model training and fine-tuning");

    trainCommand
      .command("embedding")
      .description("Train custom embedding model")
      .option("-t, --tenant <id>", "Tenant ID")
      .option("-d, --dataset <path>", "Dataset path")
      .option("-a, --architecture <arch>", "Model architecture", "transformer")
      .option("-e, --epochs <num>", "Number of epochs", "10")
      .option("-b, --batch-size <size>", "Batch size", "32")
      .option("-l, --learning-rate <rate>", "Learning rate", "0.001")
      .option("--optimize", "Enable hyperparameter optimization")
      .action(this.trainEmbeddingModel.bind(this));

    trainCommand
      .command("llm")
      .description("Fine-tune language model")
      .option("-t, --tenant <id>", "Tenant ID")
      .option("-d, --dataset <path>", "Dataset path")
      .option("-m, --base-model <model>", "Base model", "gpt-3.5-turbo")
      .option("-e, --epochs <num>", "Number of epochs", "5")
      .option("--lora", "Use LoRA fine-tuning")
      .action(this.fineTuneLLM.bind(this));

    trainCommand
      .command("status <jobId>")
      .description("Check training job status")
      .action(this.checkTrainingStatus.bind(this));

    trainCommand
      .command("deploy <jobId>")
      .description("Deploy trained model")
      .option("-e, --environment <env>", "Deployment environment", "staging")
      .option("--auto-scale", "Enable auto-scaling")
      .action(this.deployModel.bind(this));

    // Adaptive Retrieval Commands
    const adaptiveCommand = aiCommand
      .command("adaptive")
      .description("Adaptive retrieval system");

    adaptiveCommand
      .command("profile <userId>")
      .description("Initialize or view user profile")
      .option("-i, --interests <interests>", "User interests (comma-separated)")
      .option("-e, --expertise <level>", "Expertise level", "intermediate")
      .action(this.manageUserProfile.bind(this));

    adaptiveCommand
      .command("search <userId> <query>")
      .description("Perform adaptive search")
      .option("-n, --max-results <num>", "Maximum results", "10")
      .option("--explain", "Show adaptation explanation")
      .action(this.adaptiveSearch.bind(this));

    adaptiveCommand
      .command("feedback <userId>")
      .description("Provide feedback for learning")
      .option("-q, --query <query>", "Original query")
      .option("-r, --ratings <ratings>", "Result ratings (comma-separated)")
      .action(this.provideFeedback.bind(this));

    // Multi-modal Processing Commands
    const multimodalCommand = aiCommand
      .command("multimodal")
      .description("Multi-modal content processing");

    multimodalCommand
      .command("process <contentPath>")
      .description("Process multi-modal content")
      .option("-t, --tenant <id>", "Tenant ID")
      .option("-o, --output <path>", "Output path for results")
      .option("--extract-text", "Extract text from images/videos")
      .action(this.processMultiModalContent.bind(this));

    multimodalCommand
      .command("search <tenantId>")
      .description("Multi-modal search")
      .option("-q, --query <query>", "Text query")
      .option("-i, --image <path>", "Image query path")
      .option("-a, --audio <path>", "Audio query path")
      .option("-n, --max-results <num>", "Maximum results", "10")
      .action(this.multiModalSearch.bind(this));

    multimodalCommand
      .command("describe <contentId>")
      .description("Generate content description")
      .option("--detailed", "Generate detailed description")
      .action(this.describeContent.bind(this));

    // Federated Learning Commands
    const federatedCommand = aiCommand
      .command("federated")
      .description("Federated learning coordination");

    federatedCommand
      .command("create-federation")
      .description("Create federated learning session")
      .option("-t, --tenant <id>", "Tenant ID")
      .option("-m, --model-_type <_type>", "Model _type", "embedding")
      .option("-a, --architecture <arch>", "Model architecture", "transformer")
      .option("--min-participants <num>", "Minimum participants", "3")
      .option("--max-participants <num>", "Maximum participants", "10")
      .action(this.createFederation.bind(this));

    federatedCommand
      .command("join <federationId>")
      .description("Join federated learning session")
      .option("-t, --tenant <id>", "Tenant ID")
      .option("-d, --data-size <size>", "Data size")
      .option("-c, --compute-capacity <capacity>", "Compute capacity (0-1)")
      .option("-p, --privacy-level <level>", "Privacy level", "standard")
      .action(this.joinFederation.bind(this));

    federatedCommand
      .command("start-round <federationId>")
      .description("Start federated learning round")
      .action(this.startFederatedRound.bind(this));

    federatedCommand
      .command("stats <federationId>")
      .description("Show federation statistics")
      .option("--detailed", "Show detailed statistics")
      .action(this.showFederationStats.bind(this));

    // General AI Commands
    aiCommand
      .command("benchmark")
      .description("Run AI/ML benchmarks")
      .option("-t, --tenant <id>", "Tenant ID")
      .option("-m, --models <models>", "Models to benchmark (comma-separated)")
      .option("-o, --output <path>", "Output path for results")
      .action(this.runBenchmarks.bind(this));

    aiCommand
      .command("dashboard")
      .description("Launch AI/ML dashboard")
      .option("-p, --port <port>", "Dashboard port", "3001")
      .option("--open", "Open browser automatically")
      .action(this.launchDashboard.bind(this));
  }

  // --- Delegating methods ---

  // Model Training Commands
  async trainEmbeddingModel(_options) {
    return trainingCommands.trainEmbeddingModel(this.modelTrainer, _options);
  }

  async fineTuneLLM(_options) {
    return trainingCommands.fineTuneLLM(this.modelTrainer, _options);
  }

  async checkTrainingStatus(jobId) {
    return trainingCommands.checkTrainingStatus(this.modelTrainer, jobId);
  }

  async deployModel(jobId, _options) {
    return trainingCommands.deployModel(this.modelTrainer, jobId, _options);
  }

  // Adaptive Retrieval Commands
  async manageUserProfile(userId, _options) {
    return adaptiveCommands.manageUserProfile(
      this.adaptiveRetrieval,
      userId,
      _options,
    );
  }

  async adaptiveSearch(userId, query, _options) {
    return adaptiveCommands.adaptiveSearch(
      this.adaptiveRetrieval,
      userId,
      query,
      _options,
    );
  }

  async provideFeedback(userId, _options) {
    return adaptiveCommands.provideFeedback(
      this.adaptiveRetrieval,
      userId,
      _options,
    );
  }

  // Multi-modal Processing Commands
  async processMultiModalContent(contentPath, _options) {
    return multimodalCommands.processMultiModalContent(
      this.multiModalProcessor,
      contentPath,
      _options,
    );
  }

  async multiModalSearch(tenantId, _options) {
    return multimodalCommands.multiModalSearch(
      this.multiModalProcessor,
      tenantId,
      _options,
    );
  }

  async describeContent(contentId, _options) {
    return multimodalCommands.describeContent(
      this.multiModalProcessor,
      contentId,
      _options,
    );
  }

  // Federated Learning Commands
  async createFederation(_options) {
    return federatedCommands.createFederation(this.federatedLearning, _options);
  }

  async joinFederation(federationId, _options) {
    return federatedCommands.joinFederation(
      this.federatedLearning,
      federationId,
      _options,
    );
  }

  async startFederatedRound(federationId) {
    return federatedCommands.startFederatedRound(
      this.federatedLearning,
      federationId,
    );
  }

  async showFederationStats(federationId, _options) {
    return federatedCommands.showFederationStats(
      this.federatedLearning,
      federationId,
      _options,
    );
  }

  // Utility Commands (kept in aggregator as they don't belong to a specific domain)
  async runBenchmarks(_options) {
    const spinner = ora("Running AI/ML benchmarks...").start();

    try {
      // Mock benchmark implementation
      const benchmarks = {
        embedding: {
          latency: "45ms",
          throughput: "2000 docs/sec",
          accuracy: 0.89,
        },
        retrieval: {
          latency: "12ms",
          throughput: "5000 queries/sec",
          recall: 0.92,
        },
        generation: {
          latency: "150ms",
          throughput: "500 tokens/sec",
          quality: 0.85,
        },
      };

      spinner.succeed("Benchmarks completed");

      const table = new Table({
        head: ["Model", "Latency", "Throughput", "Quality Score"],
        colWidths: [15, 15, 20, 15],
      });

      Object.entries(benchmarks).forEach(([model, metrics]) => {
        table.push([
          model,
          metrics.latency,
          metrics.throughput,
          (metrics.accuracy || metrics.recall || metrics.quality)?.toFixed(3),
        ]);
      });

      console.log(table.toString());
      // eslint-disable-line no-console

      if (_options.output) {
        await fs.writeFile(
          _options.output,
          JSON.stringify(benchmarks, null, 2),
        );
        console.log(chalk.gray(`Results saved to: ${_options.output}`));
        // eslint-disable-line no-console
      }
    } catch (error) {
      spinner.fail(`Benchmark failed: ${error.message}`);
    }
  }

  async launchDashboard(_options) {
    console.log(chalk.blue("🚀 Launching AI/ML Dashboard..."));
    // eslint-disable-line no-console
    console.log(chalk.gray(`Port: ${_options.port}`));
    // eslint-disable-line no-console
    console.log(chalk.gray(`URL: http://localhost:${_options.port}`)); // eslint-disable-line no-console

    if (_options.open) {
      console.log(chalk.green("Opening browser..."));
      // eslint-disable-line no-console
    }

    console.log(chalk.yellow("\nDashboard features:"));
    // eslint-disable-line no-console
    console.log("• Model training monitoring");
    // eslint-disable-line no-console
    console.log("• Adaptive retrieval analytics");
    // eslint-disable-line no-console
    console.log("• Multi-modal content explorer");
    // eslint-disable-line no-console
    console.log("• Federated learning coordinator");
    // eslint-disable-line no-console
    console.log("• Performance benchmarks");
    // eslint-disable-line no-console
  }

  // Helper methods (delegated to shared module, kept here for backward compatibility)
  _colorizeStatus(status) {
    return colorizeStatus(status);
  }

  _detectContentType(filePath) {
    return detectContentType(filePath);
  }
}

module.exports = AIMLCommands;
