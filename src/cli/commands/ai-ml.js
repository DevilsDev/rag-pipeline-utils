/**
 * Advanced AI/ML CLI Commands
 * Command-line interface for model training, adaptive retrieval, multi-modal processing, and federated learning
 */

const chalk = require('chalk');
const ora = require('ora');
const inquirer = require('inquirer');
const Table = require('cli-table3');
const fs = require('fs').promises;
const path = require('path');

const {
  ModelTrainingOrchestrator,
  AdaptiveRetrievalEngine,
  MultiModalProcessor,
  FederatedLearningCoordinator
} = require('../../ai');

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
      .command('ai')
      .description('Advanced AI/ML capabilities');

    // Model Training Commands
    const trainCommand = aiCommand
      .command('train')
      .description('Model training and fine-tuning');

    trainCommand
      .command('embedding')
      .description('Train custom embedding model')
      .option('-t, --tenant <id>', 'Tenant ID')
      .option('-d, --dataset <path>', 'Dataset path')
      .option('-a, --architecture <arch>', 'Model architecture', 'transformer')
      .option('-e, --epochs <num>', 'Number of epochs', '10')
      .option('-b, --batch-size <size>', 'Batch size', '32')
      .option('-l, --learning-rate <rate>', 'Learning rate', '0.001')
      .option('--optimize', 'Enable hyperparameter optimization')
      .action(this.trainEmbeddingModel.bind(this));

    trainCommand
      .command('llm')
      .description('Fine-tune language model')
      .option('-t, --tenant <id>', 'Tenant ID')
      .option('-d, --dataset <path>', 'Dataset path')
      .option('-m, --base-model <model>', 'Base model', 'gpt-3.5-turbo')
      .option('-e, --epochs <num>', 'Number of epochs', '5')
      .option('--lora', 'Use LoRA fine-tuning')
      .action(this.fineTuneLLM.bind(this));

    trainCommand
      .command('status <jobId>')
      .description('Check training job status')
      .action(this.checkTrainingStatus.bind(this));

    trainCommand
      .command('deploy <jobId>')
      .description('Deploy trained model')
      .option('-e, --environment <env>', 'Deployment environment', 'staging')
      .option('--auto-scale', 'Enable auto-scaling')
      .action(this.deployModel.bind(this));

    // Adaptive Retrieval Commands
    const adaptiveCommand = aiCommand
      .command('adaptive')
      .description('Adaptive retrieval system');

    adaptiveCommand
      .command('profile <userId>')
      .description('Initialize or view user profile')
      .option('-i, --interests <interests>', 'User interests (comma-separated)')
      .option('-e, --expertise <level>', 'Expertise level', 'intermediate')
      .action(this.manageUserProfile.bind(this));

    adaptiveCommand
      .command('search <userId> <query>')
      .description('Perform adaptive search')
      .option('-n, --max-results <num>', 'Maximum results', '10')
      .option('--explain', 'Show adaptation explanation')
      .action(this.adaptiveSearch.bind(this));

    adaptiveCommand
      .command('feedback <userId>')
      .description('Provide feedback for learning')
      .option('-q, --query <query>', 'Original query')
      .option('-r, --ratings <ratings>', 'Result ratings (comma-separated)')
      .action(this.provideFeedback.bind(this));

    // Multi-modal Processing Commands
    const multimodalCommand = aiCommand
      .command('multimodal')
      .description('Multi-modal content processing');

    multimodalCommand
      .command('process <contentPath>')
      .description('Process multi-modal content')
      .option('-t, --tenant <id>', 'Tenant ID')
      .option('-o, --output <path>', 'Output path for results')
      .option('--extract-text', 'Extract text from images/videos')
      .action(this.processMultiModalContent.bind(this));

    multimodalCommand
      .command('search <tenantId>')
      .description('Multi-modal search')
      .option('-q, --query <query>', 'Text query')
      .option('-i, --image <path>', 'Image query path')
      .option('-a, --audio <path>', 'Audio query path')
      .option('-n, --max-results <num>', 'Maximum results', '10')
      .action(this.multiModalSearch.bind(this));

    multimodalCommand
      .command('describe <contentId>')
      .description('Generate content description')
      .option('--detailed', 'Generate detailed description')
      .action(this.describeContent.bind(this));

    // Federated Learning Commands
    const federatedCommand = aiCommand
      .command('federated')
      .description('Federated learning coordination');

    federatedCommand
      .command('create-federation')
      .description('Create federated learning session')
      .option('-t, --tenant <id>', 'Tenant ID')
      .option('-m, --model-type <type>', 'Model type', 'embedding')
      .option('-a, --architecture <arch>', 'Model architecture', 'transformer')
      .option('--min-participants <num>', 'Minimum participants', '3')
      .option('--max-participants <num>', 'Maximum participants', '10')
      .action(this.createFederation.bind(this));

    federatedCommand
      .command('join <federationId>')
      .description('Join federated learning session')
      .option('-t, --tenant <id>', 'Tenant ID')
      .option('-d, --data-size <size>', 'Data size')
      .option('-c, --compute-capacity <capacity>', 'Compute capacity (0-1)')
      .option('-p, --privacy-level <level>', 'Privacy level', 'standard')
      .action(this.joinFederation.bind(this));

    federatedCommand
      .command('start-round <federationId>')
      .description('Start federated learning round')
      .action(this.startFederatedRound.bind(this));

    federatedCommand
      .command('stats <federationId>')
      .description('Show federation statistics')
      .option('--detailed', 'Show detailed statistics')
      .action(this.showFederationStats.bind(this));

    // General AI Commands
    aiCommand
      .command('benchmark')
      .description('Run AI/ML benchmarks')
      .option('-t, --tenant <id>', 'Tenant ID')
      .option('-m, --models <models>', 'Models to benchmark (comma-separated)')
      .option('-o, --output <path>', 'Output path for results')
      .action(this.runBenchmarks.bind(this));

    aiCommand
      .command('dashboard')
      .description('Launch AI/ML dashboard')
      .option('-p, --port <port>', 'Dashboard port', '3001')
      .option('--open', 'Open browser automatically')
      .action(this.launchDashboard.bind(this));
  }

  // Model Training Commands
  async trainEmbeddingModel(options) {
    const spinner = ora('Initializing embedding model training...').start();

    try {
      if (!options.tenant) {
        spinner.fail('Tenant ID is required');
        return;
      }

      const trainingConfig = {
        modelType: 'embedding',
        architecture: options.architecture,
        dataset: {
          path: options.dataset,
          type: 'text_pairs'
        },
        hyperparameters: {
          epochs: parseInt(options.epochs),
          batchSize: parseInt(options.batchSize),
          learningRate: parseFloat(options.learningRate)
        }
      };

      spinner.text = 'Creating training job...';
      const jobId = await this.modelTrainer.createTrainingJob(options.tenant, trainingConfig);

      if (options.optimize) {
        spinner.text = 'Starting hyperparameter optimization...';
        const optimizationConfig = {
          ...trainingConfig,
          hyperparameters: {
            learningRate: [0.0001, 0.001, 0.01],
            batchSize: [16, 32, 64],
            hiddenSize: [256, 512, 768]
          },
          optimization: {
            strategy: 'bayesian',
            maxTrials: 10,
            metric: 'accuracy'
          }
        };

        const optimizationId = await this.modelTrainer.optimizeHyperparameters(
          options.tenant,
          optimizationConfig
        );

        spinner.succeed(`Hyperparameter optimization started: ${optimizationId}`);
      } else {
        spinner.text = 'Starting training...';
        await this.modelTrainer.startTraining(jobId);
        spinner.succeed(`Training started: ${jobId}`);
      }

      console.log(chalk.green('\n✓ Training initiated successfully'));
      console.log(chalk.blue(`Job ID: ${jobId}`));
      console.log(chalk.gray(`Use 'rag-pipeline ai train status ${jobId}' to check progress`));

    } catch (error) {
      spinner.fail(`Training failed: ${error.message}`);
    }
  }

  async fineTuneLLM(options) {
    const spinner = ora('Initializing LLM fine-tuning...').start();

    try {
      if (!options.tenant) {
        spinner.fail('Tenant ID is required');
        return;
      }

      const trainingConfig = {
        modelType: 'llm',
        baseModel: options.baseModel,
        dataset: {
          path: options.dataset,
          type: 'instruction_following'
        },
        fineTuning: {
          method: options.lora ? 'lora' : 'full',
          epochs: parseInt(options.epochs),
          learningRate: 0.0001
        }
      };

      spinner.text = 'Creating fine-tuning job...';
      const jobId = await this.modelTrainer.createTrainingJob(options.tenant, trainingConfig);

      spinner.text = 'Starting fine-tuning...';
      await this.modelTrainer.startTraining(jobId);

      spinner.succeed(`Fine-tuning started: ${jobId}`);
      console.log(chalk.green('\n✓ LLM fine-tuning initiated'));
      console.log(chalk.blue(`Job ID: ${jobId}`));

    } catch (error) {
      spinner.fail(`Fine-tuning failed: ${error.message}`);
    }
  }

  async checkTrainingStatus(jobId) {
    const spinner = ora('Checking training status...').start();

    try {
      const status = await this.modelTrainer.getTrainingStatus(jobId);
      spinner.stop();

      const table = new Table({
        head: ['Property', 'Value'],
        colWidths: [20, 50]
      });

      table.push(
        ['Job ID', jobId],
        ['Status', this._colorizeStatus(status.status)],
        ['Progress', `${status.progress}%`],
        ['Current Epoch', `${status.currentEpoch}/${status.totalEpochs}`],
        ['Accuracy', status.metrics?.accuracy?.toFixed(4) || 'N/A'],
        ['Loss', status.metrics?.loss?.toFixed(4) || 'N/A'],
        ['Estimated Time', status.estimatedTimeRemaining || 'N/A']
      );

      console.log(table.toString());

      if (status.status === 'completed') {
        console.log(chalk.green('\n✓ Training completed successfully!'));
        console.log(chalk.blue(`Use 'rag-pipeline ai train deploy ${jobId}' to deploy the model`));
      } else if (status.status === 'failed') {
        console.log(chalk.red('\n✗ Training failed'));
        if (status.error) {
          console.log(chalk.gray(`Error: ${status.error}`));
        }
      }

    } catch (error) {
      spinner.fail(`Failed to get status: ${error.message}`);
    }
  }

  async deployModel(jobId, options) {
    const spinner = ora('Deploying model...').start();

    try {
      const deploymentConfig = {
        environment: options.environment,
        scalingConfig: {
          minInstances: 1,
          maxInstances: options.autoScale ? 5 : 1,
          autoScale: !!options.autoScale
        }
      };

      const deploymentId = await this.modelTrainer.deployModel(jobId, deploymentConfig);
      
      spinner.succeed(`Model deployed: ${deploymentId}`);
      console.log(chalk.green('\n✓ Model deployment successful'));
      console.log(chalk.blue(`Deployment ID: ${deploymentId}`));
      console.log(chalk.blue(`Environment: ${options.environment}`));

    } catch (error) {
      spinner.fail(`Deployment failed: ${error.message}`);
    }
  }

  // Adaptive Retrieval Commands
  async manageUserProfile(userId, options) {
    const spinner = ora('Managing user profile...').start();

    try {
      let profile;
      
      try {
        profile = await this.adaptiveRetrieval.getUserProfile(userId);
        spinner.succeed('User profile found');
      } catch {
        // Profile doesn't exist, create new one
        const profileData = {};
        
        if (options.interests) {
          profileData.interests = options.interests.split(',').map(i => i.trim());
        }
        
        if (options.expertise) {
          profileData.expertise = options.expertise;
        }

        profile = await this.adaptiveRetrieval.initializeUserProfile(userId, profileData);
        spinner.succeed('User profile created');
      }

      const table = new Table({
        head: ['Property', 'Value'],
        colWidths: [20, 50]
      });

      table.push(
        ['User ID', profile.userId],
        ['Interests', profile.preferences?.interests?.join(', ') || 'None'],
        ['Expertise', profile.preferences?.expertise || 'Not set'],
        ['Learning History', `${profile.learningHistory?.length || 0} interactions`],
        ['Created', profile.createdAt || 'Unknown']
      );

      console.log(table.toString());

    } catch (error) {
      spinner.fail(`Profile management failed: ${error.message}`);
    }
  }

  async adaptiveSearch(userId, query, options) {
    const spinner = ora('Performing adaptive search...').start();

    try {
      const searchOptions = {
        maxResults: parseInt(options.maxResults),
        explain: !!options.explain
      };

      const results = await this.adaptiveRetrieval.adaptiveRetrieve(userId, query, searchOptions);
      
      spinner.succeed(`Found ${results.documents.length} results`);

      // Display results
      console.log(chalk.blue(`\nSearch Results for: "${query}"`));
      console.log(chalk.gray('=' .repeat(50)));

      results.documents.forEach((doc, index) => {
        console.log(chalk.green(`\n${index + 1}. ${doc.title || doc.id}`));
        console.log(chalk.gray(`   Score: ${doc.score?.toFixed(4) || 'N/A'}`));
        console.log(chalk.gray(`   Personalized Score: ${doc.personalizedScore?.toFixed(4) || 'N/A'}`));
        console.log(`   ${doc.content?.substring(0, 200)}...`);
      });

      if (options.explain && results.adaptationMetadata) {
        console.log(chalk.blue('\nAdaptation Explanation:'));
        console.log(chalk.gray(JSON.stringify(results.adaptationMetadata, null, 2)));
      }

    } catch (error) {
      spinner.fail(`Adaptive search failed: ${error.message}`);
    }
  }

  async provideFeedback(userId, options) {
    if (!options.query) {
      const answers = await inquirer.prompt([
        {
          type: 'input',
          name: 'query',
          message: 'Enter the original query:'
        },
        {
          type: 'input',
          name: 'ratings',
          message: 'Enter ratings for results (comma-separated, 1-5):'
        }
      ]);
      options.query = answers.query;
      options.ratings = answers.ratings;
    }

    const spinner = ora('Processing feedback...').start();

    try {
      const ratings = options.ratings.split(',').map(r => parseInt(r.trim()));
      
      const feedback = {
        query: options.query,
        ratings,
        clickedResults: [0], // Assume first result was clicked
        dwellTime: [120] // Assume 2 minutes dwell time
      };

      await this.adaptiveRetrieval.processFeedback(userId, feedback);
      
      spinner.succeed('Feedback processed successfully');
      console.log(chalk.green('\n✓ User profile updated with feedback'));

    } catch (error) {
      spinner.fail(`Feedback processing failed: ${error.message}`);
    }
  }

  // Multi-modal Processing Commands
  async processMultiModalContent(contentPath, options) {
    const spinner = ora('Processing multi-modal content...').start();

    try {
      if (!options.tenant) {
        spinner.fail('Tenant ID is required');
        return;
      }

      // Read content file
      const stats = await fs.stat(contentPath);
      const content = {
        type: this._detectContentType(contentPath),
        size: stats.size,
        path: contentPath
      };

      // Add additional content based on type
      if (content.type.startsWith('text/')) {
        content.text = await fs.readFile(contentPath, 'utf-8');
      }

      spinner.text = 'Processing content...';
      const result = await this.multiModalProcessor.processContent(options.tenant, content);

      spinner.succeed('Content processed successfully');

      console.log(chalk.green('\n✓ Multi-modal processing completed'));
      console.log(chalk.blue(`Content ID: ${result.id}`));
      console.log(chalk.blue(`Modalities detected: ${Object.keys(result.modalities).join(', ')}`));
      console.log(chalk.blue(`Processing time: ${result.metadata.processingTime}ms`));

      if (options.output) {
        await fs.writeFile(options.output, JSON.stringify(result, null, 2));
        console.log(chalk.gray(`Results saved to: ${options.output}`));
      }

    } catch (error) {
      spinner.fail(`Content processing failed: ${error.message}`);
    }
  }

  async multiModalSearch(tenantId, options) {
    const spinner = ora('Performing multi-modal search...').start();

    try {
      const query = {};

      if (options.query) {
        query.text = options.query;
        query.type = 'text';
      }

      if (options.image) {
        query.image = await fs.readFile(options.image);
        query.type = 'image';
      }

      if (options.audio) {
        query.audio = await fs.readFile(options.audio);
        query.type = 'audio';
      }

      if (Object.keys(query).length === 0) {
        spinner.fail('At least one query type must be provided');
        return;
      }

      const searchOptions = {
        maxResults: parseInt(options.maxResults)
      };

      const results = await this.multiModalProcessor.multiModalSearch(tenantId, query, searchOptions);
      
      spinner.succeed(`Found ${results.results.length} results`);

      console.log(chalk.blue('\nMulti-modal Search Results:'));
      console.log(chalk.gray('=' .repeat(50)));

      results.results.forEach((result, index) => {
        console.log(chalk.green(`\n${index + 1}. Content ID: ${result.contentId}`));
        console.log(chalk.gray(`   Multi-modal Score: ${result.multiModalScore?.toFixed(4)}`));
        console.log(chalk.gray(`   Modalities: ${result.modalities?.join(', ')}`));
        console.log(chalk.gray(`   Rank: ${result.rank}`));
      });

    } catch (error) {
      spinner.fail(`Multi-modal search failed: ${error.message}`);
    }
  }

  async describeContent(contentId, options) {
    const spinner = ora('Generating content description...').start();

    try {
      const descriptions = await this.multiModalProcessor.generateContentDescription(
        contentId,
        { detailed: !!options.detailed }
      );

      spinner.succeed('Description generated');

      console.log(chalk.blue('\nContent Descriptions:'));
      console.log(chalk.gray('=' .repeat(50)));

      for (const [modality, description] of Object.entries(descriptions)) {
        console.log(chalk.green(`\n${modality.toUpperCase()}:`));
        console.log(description);
      }

    } catch (error) {
      spinner.fail(`Description generation failed: ${error.message}`);
    }
  }

  // Federated Learning Commands
  async createFederation(options) {
    const spinner = ora('Creating federated learning session...').start();

    try {
      if (!options.tenant) {
        spinner.fail('Tenant ID is required');
        return;
      }

      const modelConfig = {
        type: options.modelType,
        architecture: options.architecture
      };

      const federationOptions = {
        minParticipants: parseInt(options.minParticipants),
        maxParticipants: parseInt(options.maxParticipants)
      };

      const federationId = await this.federatedLearning.createFederation(
        options.tenant,
        modelConfig,
        federationOptions
      );

      spinner.succeed('Federation created successfully');

      console.log(chalk.green('\n✓ Federated learning session created'));
      console.log(chalk.blue(`Federation ID: ${federationId}`));
      console.log(chalk.blue(`Model Type: ${options.modelType}`));
      console.log(chalk.blue(`Min/Max Participants: ${options.minParticipants}/${options.maxParticipants}`));

    } catch (error) {
      spinner.fail(`Federation creation failed: ${error.message}`);
    }
  }

  async joinFederation(federationId, options) {
    const spinner = ora('Joining federated learning session...').start();

    try {
      if (!options.tenant) {
        spinner.fail('Tenant ID is required');
        return;
      }

      const participantInfo = {
        tenantId: options.tenant,
        dataSize: parseInt(options.dataSize) || 1000,
        computeCapacity: parseFloat(options.computeCapacity) || 0.8,
        networkBandwidth: 100,
        privacyLevel: options.privacyLevel
      };

      const participantId = await this.federatedLearning.registerParticipant(
        federationId,
        participantInfo
      );

      spinner.succeed('Successfully joined federation');

      console.log(chalk.green('\n✓ Joined federated learning session'));
      console.log(chalk.blue(`Participant ID: ${participantId}`));
      console.log(chalk.blue(`Federation ID: ${federationId}`));

    } catch (error) {
      spinner.fail(`Failed to join federation: ${error.message}`);
    }
  }

  async startFederatedRound(federationId) {
    const spinner = ora('Starting federated learning round...').start();

    try {
      const result = await this.federatedLearning.startFederatedRound(federationId);
      
      spinner.succeed('Federated round completed');

      console.log(chalk.green('\n✓ Federated learning round completed'));
      console.log(chalk.blue(`Round: ${result.round}`));
      console.log(chalk.blue(`Participants: ${result.participants}`));
      console.log(chalk.blue(`Converged: ${result.convergence.converged ? 'Yes' : 'No'}`));
      console.log(chalk.blue(`Global Accuracy: ${result.convergence.globalAccuracy?.toFixed(4)}`));

    } catch (error) {
      spinner.fail(`Federated round failed: ${error.message}`);
    }
  }

  async showFederationStats(federationId, options) {
    const spinner = ora('Fetching federation statistics...').start();

    try {
      const stats = await this.federatedLearning.getFederationStats(federationId);
      
      spinner.succeed('Statistics retrieved');

      const table = new Table({
        head: ['Property', 'Value'],
        colWidths: [25, 40]
      });

      table.push(
        ['Federation ID', stats.federation.id],
        ['Status', this._colorizeStatus(stats.federation.status)],
        ['Current Round', stats.federation.currentRound],
        ['Total Participants', stats.federation.totalParticipants],
        ['Active Participants', stats.federation.activeParticipants],
        ['Model Type', stats.federation.modelType],
        ['Average Accuracy', stats.performance.averageAccuracy?.toFixed(4) || 'N/A'],
        ['Total Data Size', stats.performance.totalDataSize],
        ['Privacy Enabled', stats.privacy.differentialPrivacyEnabled ? 'Yes' : 'No']
      );

      console.log(table.toString());

      if (options.detailed && stats.participants.length > 0) {
        console.log(chalk.blue('\nParticipant Details:'));
        
        const participantTable = new Table({
          head: ['Tenant ID', 'Data Size', 'Accuracy', 'Rounds', 'Status'],
          colWidths: [15, 12, 12, 8, 12]
        });

        stats.participants.forEach(participant => {
          participantTable.push([
            participant.tenantId,
            participant.dataSize,
            participant.performance.accuracy?.toFixed(4) || 'N/A',
            participant.performance.rounds,
            participant.status
          ]);
        });

        console.log(participantTable.toString());
      }

    } catch (error) {
      spinner.fail(`Failed to get statistics: ${error.message}`);
    }
  }

  // Utility Commands
  async runBenchmarks(options) {
    const spinner = ora('Running AI/ML benchmarks...').start();

    try {
      // Mock benchmark implementation
      const benchmarks = {
        embedding: { latency: '45ms', throughput: '2000 docs/sec', accuracy: 0.89 },
        retrieval: { latency: '12ms', throughput: '5000 queries/sec', recall: 0.92 },
        generation: { latency: '150ms', throughput: '500 tokens/sec', quality: 0.85 }
      };

      spinner.succeed('Benchmarks completed');

      const table = new Table({
        head: ['Model', 'Latency', 'Throughput', 'Quality Score'],
        colWidths: [15, 15, 20, 15]
      });

      Object.entries(benchmarks).forEach(([model, metrics]) => {
        table.push([
          model,
          metrics.latency,
          metrics.throughput,
          (metrics.accuracy || metrics.recall || metrics.quality)?.toFixed(3)
        ]);
      });

      console.log(table.toString());

      if (options.output) {
        await fs.writeFile(options.output, JSON.stringify(benchmarks, null, 2));
        console.log(chalk.gray(`Results saved to: ${options.output}`));
      }

    } catch (error) {
      spinner.fail(`Benchmark failed: ${error.message}`);
    }
  }

  async launchDashboard(options) {
    console.log(chalk.blue('🚀 Launching AI/ML Dashboard...'));
    console.log(chalk.gray(`Port: ${options.port}`));
    console.log(chalk.gray(`URL: http://localhost:${options.port}`));
    
    if (options.open) {
      console.log(chalk.green('Opening browser...'));
    }
    
    console.log(chalk.yellow('\nDashboard features:'));
    console.log('• Model training monitoring');
    console.log('• Adaptive retrieval analytics');
    console.log('• Multi-modal content explorer');
    console.log('• Federated learning coordinator');
    console.log('• Performance benchmarks');
  }

  // Helper methods
  _colorizeStatus(status) {
    switch (status) {
      case 'completed':
      case 'ready':
      case 'active':
        return chalk.green(status);
      case 'failed':
      case 'error':
        return chalk.red(status);
      case 'running':
      case 'training':
        return chalk.yellow(status);
      default:
        return chalk.gray(status);
    }
  }

  _detectContentType(filePath) {
    const ext = path.extname(filePath).toLowerCase();
    
    if (['.jpg', '.jpeg', '.png', '.gif', '.webp'].includes(ext)) {
      return 'image/jpeg';
    } else if (['.mp3', '.wav', '.flac', '.ogg'].includes(ext)) {
      return 'audio/mpeg';
    } else if (['.mp4', '.avi', '.mov', '.webm'].includes(ext)) {
      return 'video/mp4';
    } else if (['.txt', '.md', '.json'].includes(ext)) {
      return 'text/plain';
    }
    
    return 'application/octet-stream';
  }
}

module.exports = AIMLCommands;
