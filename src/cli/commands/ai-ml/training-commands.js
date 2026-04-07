/**
 * Training-related CLI commands
 * Handles model training, fine-tuning, status checking, and deployment
 */

const chalk = require("chalk");
const ora = require("ora");
const Table = require("cli-table3");
const { colorizeStatus } = require("./shared");

/**
 * Train a custom embedding model
 * @param {ModelTrainingOrchestrator} modelTrainer - The model training orchestrator instance
 * @param {object} _options - Command options
 */
async function trainEmbeddingModel(modelTrainer, _options) {
  const spinner = ora("Initializing embedding model training...").start();

  try {
    if (!_options.tenant) {
      spinner.fail("Tenant ID is required");
      return;
    }

    const trainingConfig = {
      modelType: "embedding",
      architecture: _options.architecture,
      dataset: {
        path: _options.dataset,
        _type: "text_pairs",
      },
      hyperparameters: {
        epochs: parseInt(_options.epochs),
        batchSize: parseInt(_options.batchSize),
        learningRate: parseFloat(_options.learningRate),
      },
    };

    spinner.text = "Creating training job...";
    const jobId = await modelTrainer.createTrainingJob(
      _options.tenant,
      trainingConfig,
    );

    if (_options.optimize) {
      spinner.text = "Starting hyperparameter optimization...";
      const optimizationConfig = {
        ...trainingConfig,
        hyperparameters: {
          learningRate: [0.0001, 0.001, 0.01],
          batchSize: [16, 32, 64],
          hiddenSize: [256, 512, 768],
        },
        optimization: {
          strategy: "bayesian",
          maxTrials: 10,
          metric: "accuracy",
        },
      };

      const optimizationId = await modelTrainer.optimizeHyperparameters(
        _options.tenant,
        optimizationConfig,
      );

      spinner.succeed(`Hyperparameter optimization started: ${optimizationId}`);
    } else {
      spinner.text = "Starting training...";
      await modelTrainer.startTraining(jobId);
      spinner.succeed(`Training started: ${jobId}`);
    }

    console.log(chalk.green("\n✓ Training initiated successfully"));
    // eslint-disable-line no-console
    console.log(chalk.blue(`Job ID: ${jobId}`));
    // eslint-disable-line no-console
    console.log(
      chalk.gray(
        `Use 'rag-pipeline ai train status ${jobId}' to check progress`,
      ),
    );
    // eslint-disable-line no-console
  } catch (error) {
    spinner.fail(`Training failed: ${error.message}`);
  }
}

/**
 * Fine-tune a language model
 * @param {ModelTrainingOrchestrator} modelTrainer - The model training orchestrator instance
 * @param {object} _options - Command options
 */
async function fineTuneLLM(modelTrainer, _options) {
  const spinner = ora("Initializing LLM fine-tuning...").start();

  try {
    if (!_options.tenant) {
      spinner.fail("Tenant ID is required");
      return;
    }

    const trainingConfig = {
      modelType: "llm",
      baseModel: _options.baseModel,
      dataset: {
        path: _options.dataset,
        _type: "instruction_following",
      },
      fineTuning: {
        method: _options.lora ? "lora" : "full",
        epochs: parseInt(_options.epochs),
        learningRate: 0.0001,
      },
    };

    spinner.text = "Creating fine-tuning job...";
    const jobId = await modelTrainer.createTrainingJob(
      _options.tenant,
      trainingConfig,
    );

    spinner.text = "Starting fine-tuning...";
    await modelTrainer.startTraining(jobId);

    spinner.succeed(`Fine-tuning started: ${jobId}`);
    console.log(chalk.green("\n✓ LLM fine-tuning initiated"));
    // eslint-disable-line no-console
    console.log(chalk.blue(`Job ID: ${jobId}`));
    // eslint-disable-line no-console
  } catch (error) {
    spinner.fail(`Fine-tuning failed: ${error.message}`);
  }
}

/**
 * Check training job status
 * @param {ModelTrainingOrchestrator} modelTrainer - The model training orchestrator instance
 * @param {string} jobId - Training job ID
 */
async function checkTrainingStatus(modelTrainer, jobId) {
  const spinner = ora("Checking training status...").start();

  try {
    const status = await modelTrainer.getTrainingStatus(jobId);
    spinner.stop();

    const table = new Table({
      head: ["Property", "Value"],
      colWidths: [20, 50],
    });

    table.push(
      ["Job ID", jobId],
      ["Status", colorizeStatus(status.status)],
      ["Progress", `${status.progress}%`],
      ["Current Epoch", `${status.currentEpoch}/${status.totalEpochs}`],
      ["Accuracy", status.metrics?.accuracy?.toFixed(4) || "N/A"],
      ["Loss", status.metrics?.loss?.toFixed(4) || "N/A"],
      ["Estimated Time", status.estimatedTimeRemaining || "N/A"],
    );

    console.log(table.toString());
    // eslint-disable-line no-console

    if (status.status === "completed") {
      console.log(chalk.green("\n✓ Training completed successfully!"));
      // eslint-disable-line no-console
      console.log(
        chalk.blue(
          `Use 'rag-pipeline ai train deploy ${jobId}' to deploy the model`,
        ),
      );
      // eslint-disable-line no-console
    } else if (status.status === "failed") {
      console.log(chalk.red("\n✗ Training failed"));
      // eslint-disable-line no-console
      if (status.error) {
        console.log(chalk.gray(`Error: ${status.error}`));
        // eslint-disable-line no-console
      }
    }
  } catch (error) {
    spinner.fail(`Failed to get status: ${error.message}`);
  }
}

/**
 * Deploy a trained model
 * @param {ModelTrainingOrchestrator} modelTrainer - The model training orchestrator instance
 * @param {string} jobId - Training job ID
 * @param {object} _options - Command options
 */
async function deployModel(modelTrainer, jobId, _options) {
  const spinner = ora("Deploying model...").start();

  try {
    const deploymentConfig = {
      environment: _options.environment,
      scalingConfig: {
        minInstances: 1,
        maxInstances: _options.autoScale ? 5 : 1,
        autoScale: !!_options.autoScale,
      },
    };

    const deploymentId = await modelTrainer.deployModel(
      jobId,
      deploymentConfig,
    );

    spinner.succeed(`Model deployed: ${deploymentId}`);
    console.log(chalk.green("\n✓ Model deployment successful"));
    // eslint-disable-line no-console
    console.log(chalk.blue(`Deployment ID: ${deploymentId}`));
    // eslint-disable-line no-console
    console.log(chalk.blue(`Environment: ${_options.environment}`));
    // eslint-disable-line no-console
  } catch (error) {
    spinner.fail(`Deployment failed: ${error.message}`);
  }
}

module.exports = {
  trainEmbeddingModel,
  fineTuneLLM,
  checkTrainingStatus,
  deployModel,
};
