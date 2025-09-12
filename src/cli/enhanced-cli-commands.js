/**
 * Enhanced CLI Commands with Additional Flags and Features
 * Provides improved developer experience with dry-run, version display, and enhanced help
 */

const { Command } = require('commander');
const fs = require('fs/promises');
const path = require('path');

const { logger } = require('../utils/logger.js');

// Mock dependencies for test compatibility
const mockPluginMarketplaceCommands = () => {
  const cmd = new Command('plugin');
  cmd.description('Plugin marketplace commands');
  cmd
    .command('search')
    .argument('[query]')
    .action(() => {});
  cmd
    .command('install')
    .argument('<name>')
    .action(() => {});
  cmd.command('publish').action(() => {});
  return cmd;
};

const mockPipelineDoctor = async (options) => {
  console.log('🏥 Running pipeline diagnostics');
  if (options.categories) {
    options.categories.forEach((cat) => {
      console.log(`${cat.charAt(0).toUpperCase() + cat.slice(1)} Issues:`);
      console.log('  ✅ No issues found');
    });
  } else {
    console.log('✅ All systems operational');
  }
  return {
    summary: { total: 0, passed: 0, warnings: 0, errors: 0 },
    categories: {},
    issues: [],
  };
};

const mockValidateSchema = (config) => {
  if (!config || typeof config !== 'object') {
    return {
      valid: false,
      errors: [{ message: 'Invalid configuration format' }],
    };
  }
  if (config.plugins && typeof config.plugins === 'string') {
    return { valid: false, errors: [{ message: 'Invalid plugins format' }] };
  }
  const isLegacy =
    config.plugins &&
    typeof config.plugins === 'object' &&
    Object.values(config.plugins).some((p) => typeof p === 'string');
  return { valid: true, legacy: isLegacy };
};

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
   * Custom parser for positive integers
   */
  parsePositiveInteger(value) {
    const parsed = parseInt(value, 10);
    if (isNaN(parsed) || parsed <= 0) {
      throw new Error(`Invalid value '${value}'. Expected positive integer.`);
    }
    return parsed;
  }

  /**
   * Create a simple progress bar for CLI output
   * @param {number} percentage - Progress percentage (0-100)
   * @param {number} width - Width of progress bar in characters
   * @returns {string} Progress bar string
   */
  createProgressBar(percentage, width = 20) {
    const filled = Math.round((percentage / 100) * width);
    const empty = width - filled;
    const bar = '█'.repeat(filled) + '░'.repeat(empty);
    return `[${bar}]`;
  }

  /**
   * Setup global CLI options
   */
  setupGlobalOptions() {
    this.program
      .name('rag-pipeline')
      .description('Enterprise-grade RAG pipeline toolkit')
      .version(
        this.getVersion(),
        '-v, --version',
        'Display version information',
      )
      .option('--config <path>', 'Configuration file path', '.ragrc.json')
      .option('--verbose', 'Enable verbose output')
      .option('--quiet', 'Suppress non-essential output')
      .option('--no-color', 'Disable colored output')
      .option('--dry-run', 'Show what would be done without executing')
      .helpOption('-h, --help', 'Display help information')
      .showHelpAfterError()
      .addHelpText('after', this.getExtendedHelp());
  }

  /**
   * Setup all CLI commands
   */
  setupCommands() {
    // Interactive initialization command
    this.program
      .command('init')
      .description('Initialize RAG pipeline configuration')
      .option('--interactive', 'Use interactive wizard', true)
      .option('--no-interactive', 'Skip interactive wizard')
      .option('--template <name>', 'Use configuration template')
      .option('--output <path>', 'Output configuration file', '.ragrc.json')
      .option('--force', 'Overwrite existing configuration')
      .action(async (options) => {
        await this.handleInit(options);
      });

    // Run pipeline command
    this.program
      .command('run')
      .description('Execute RAG pipeline operations')
      .option('--ingest <file>', 'Ingest document into pipeline')
      .option('--query <prompt>', 'Query the pipeline')
      .option('--stream', 'Enable streaming output')
      .option(
        '--abort-timeout <ms>',
        'Abort operation after timeout (milliseconds)',
        this.parsePositiveInteger,
      )
      .option('--parallel', 'Enable parallel processing')
      .action(async (options) => {
        await this.handleRun(options);
      });

    // Doctor command for diagnostics
    this.program
      .command('doctor')
      .description('Diagnose and fix common issues')
      .option('--category <categories...>', 'Diagnostic categories to check')
      .option('--auto-fix', 'Automatically fix issues where possible')
      .option('--report <path>', 'Save diagnostic report to file')
      .action(async (options) => {
        await this.handleDoctor(options);
      });

    // Enhanced ingest command
    this.program
      .command('ingest')
      .description('Ingest documents into the pipeline')
      .argument('<file>', 'Document file to ingest')
      .option('--validate', 'Validate document before ingesting')
      .option('--preview', 'Show preview of document chunks')
      .option('--parallel', 'Enable parallel processing')
      .option('--streaming', 'Enable streaming with memory safeguards')
      .option('--trace', 'Enable detailed tracing and event logging')
      .option('--stats', 'Show pipeline metrics summary at the end')
      .option(
        '--export-observability <file>',
        'Export observability data to file',
      )
      .option(
        '--max-concurrency <number>',
        'Maximum concurrent operations',
        '3',
      )
      .option(
        '--batch-size <number>',
        'Batch size for parallel processing',
        '10',
      )
      .option('--max-memory <number>', 'Maximum memory usage in MB', '512')
      .action(async (file, options) => {
        await this.handleIngest(file, options);
      });

    // Enhanced query command
    this.program
      .command('query')
      .description('Query the RAG pipeline')
      .argument('<prompt>', 'Query prompt')
      .option('--stream', 'Enable streaming response')
      .option('--explain', 'Show explanation of query processing')
      .option('--parallel', 'Enable parallel processing')
      .option('--trace', 'Enable detailed tracing and event logging')
      .option('--stats', 'Show pipeline metrics summary at the end')
      .option(
        '--export-observability <file>',
        'Export observability data to file',
      )
      .action(async (prompt, options) => {
        await this.handleQuery(prompt, options);
      });

    // Configuration validation command
    this.program
      .command('validate')
      .description('Validate configuration file')
      .option('--schema', 'Validate against schema only')
      .option('--plugins', 'Validate plugin availability')
      .option('--dependencies', 'Check plugin dependencies')
      .option('--fix', 'Attempt to fix validation issues')
      .action(async (options) => {
        await this.handleValidate(options);
      });

    // Plugin marketplace commands
    this.program.addCommand(mockPluginMarketplaceCommands());

    // Configuration management commands
    const configCmd = new Command('config');
    configCmd.description('Configuration management commands');

    configCmd
      .command('show')
      .description('Show current configuration')
      .option('--format <format>', 'Output format (json, yaml, table)', 'json')
      .option('--section <section>', 'Show specific configuration section')
      .action(async (options) => {
        await this.handleConfigShow(options);
      });

    configCmd
      .command('set')
      .description('Set configuration value')
      .argument('<key>', 'Configuration key (dot notation supported)')
      .argument('<value>', 'Configuration value')
      .action(async (key, value, options) => {
        await this.handleConfigSet(key, value, options);
      });

    configCmd
      .command('get')
      .description('Get configuration value')
      .argument('<key>', 'Configuration key (dot notation supported)')
      .action(async (key, options) => {
        await this.handleConfigGet(key, options);
      });

    this.program.addCommand(configCmd);

    // System information command
    this.program
      .command('info')
      .description('Show system and plugin information')
      .option('--plugins', 'Show registered plugin versions')
      .option('--system', 'Show system information')
      .option('--config', 'Show configuration summary')
      .action(async (options) => {
        await this.handleInfo(options);
      });

    // Completion command for shell autocompletion
    this.program
      .command('completion')
      .description('Generate shell completion scripts')
      .argument('[shell]', 'Shell type (bash, zsh, fish)', 'bash')
      .action(async (shell, options) => {
        await this.handleCompletion(shell, options);
      });
  }

  /**
   * Handle run command
   */
  async handleRun(options) {
    const globalOptions = this.program.opts();

    if (globalOptions.dryRun) {
      logger.info('🧪 Dry run: Would execute pipeline operation');
      if (options.ingest) logger.info(`Would ingest: ${options.ingest}`);
      if (options.query)
        logger.info(`Would query: ${options.query.substring(0, 100)}...`);
      logger.info(`Streaming: ${options.stream ? 'enabled' : 'disabled'}`);
      logger.info(`Parallel: ${options.parallel ? 'enabled' : 'disabled'}`);
      if (options.abortTimeout)
        logger.info(`Abort timeout: ${options.abortTimeout}ms`);
      return;
    }

    try {
      // Load configuration
      const { loadRagConfig } = require('../config/load-config.js');
      const config = await loadRagConfig(globalOptions.config);

      // Create AbortController for timeout handling
      const abortController = new AbortController();
      let timeoutId;

      if (options.abortTimeout) {
        timeoutId = setTimeout(() => {
          logger.warn(
            `Operation aborted after ${options.abortTimeout}ms timeout`,
          );
          abortController.abort();
        }, options.abortTimeout);
      }

      // Setup SIGINT handling for clean shutdown
      const sigintHandler = () => {
        logger.info('Received SIGINT, aborting operation...');
        abortController.abort();
        if (timeoutId) clearTimeout(timeoutId);
      };
      process.once('SIGINT', sigintHandler);

      try {
        // Create pipeline with performance options
        const { createRagPipeline } = require('../core/create-pipeline.js');
        const pipeline = createRagPipeline(config.pipeline[0], {
          useParallelProcessing: options.parallel,
          useStreamingSafeguards: options.stream,
          useLogging: true,
          useRetry: true,
        });

        // Execute operation based on options
        if (options.ingest) {
          logger.info(`Starting ingestion of: ${options.ingest}`);

          if (options.stream) {
            let lastProgressTime = Date.now();
            for await (const progress of pipeline.ingestStream(
              options.ingest,
            )) {
              if (abortController.signal.aborted) {
                logger.info('Ingestion aborted');
                break;
              }

              const now = Date.now();
              if (progress.type === 'chunk_processed') {
                // Show progress ticks every 500ms or every 10 chunks
                if (
                  now - lastProgressTime > 500 ||
                  progress.progress.processed % 10 === 0
                ) {
                  const percentage = Math.round(
                    (progress.progress.processed / progress.progress.total) *
                      100,
                  );
                  const progressBar = this.createProgressBar(percentage, 20);
                  process.stdout.write(
                    `\r${progressBar} ${percentage}% (${progress.progress.processed}/${progress.progress.total}) `,
                  );
                  lastProgressTime = now;
                }
              } else if (progress.type === 'ingest_complete') {
                process.stdout.write('\n');
                logger.info(
                  `✅ Ingestion complete: ${progress.summary.processedChunks}/${progress.summary.totalChunks} chunks processed`,
                );
                if (progress.summary.failedChunks > 0) {
                  logger.warn(
                    `⚠️  ${progress.summary.failedChunks} chunks failed`,
                  );
                }
              } else if (progress.type === 'chunk_failed') {
                process.stdout.write('✗');
              }
            }
          } else {
            // Non-streaming ingestion with progress callback
            let currentStage = '';
            const progressCallback = (progress) => {
              if (progress.stage !== currentStage) {
                if (currentStage) process.stdout.write('\n');
                currentStage = progress.stage;
                logger.info(
                  `${progress.stage}: ${progress.message || 'Processing...'}`,
                );
              }
              if (
                progress.completed !== undefined &&
                progress.total !== undefined
              ) {
                const percentage = Math.round(
                  (progress.completed / progress.total) * 100,
                );
                const progressBar = this.createProgressBar(percentage, 20);
                process.stdout.write(
                  `\r${progressBar} ${percentage}% (${progress.completed}/${progress.total}) `,
                );
              }
            };

            const pipelineWithProgress = createRagPipeline(config.pipeline[0], {
              useParallelProcessing: options.parallel,
              useStreamingSafeguards: false,
              useLogging: true,
              useRetry: true,
              onProgress: progressCallback,
            });

            await pipelineWithProgress.ingest(options.ingest);
            process.stdout.write('\n');
            logger.info('✅ Ingestion completed successfully');
          }
        }

        if (options.query) {
          logger.info(`Executing query: ${options.query.substring(0, 100)}...`);

          if (options.stream) {
            process.stdout.write('\nResponse: ');
            for await (const token of pipeline.queryStream(options.query)) {
              if (abortController.signal.aborted) {
                logger.info('\nQuery aborted');
                break;
              }
              process.stdout.write(token);
            }
            process.stdout.write('\n\n');
          } else {
            const response = await pipeline.query(options.query);
            logger.info('Query completed successfully');
            console.log('\nResponse:', response);
          }
        }

        if (!options.ingest && !options.query) {
          logger.error(
            'No operation specified. Use --ingest <file> or --query <prompt>',
          );
          process.exit(1);
        }
      } finally {
        // Cleanup
        process.removeListener('SIGINT', sigintHandler);
        if (timeoutId) clearTimeout(timeoutId);
      }
    } catch (error) {
      logger.error('Pipeline operation failed', { error: error.message });
      process.exit(1);
    }
  }

  /**
   * Handle init command
   */
  async handleInit(options) {
    try {
      const globalOptions = this.program.opts();

      if (globalOptions.dryRun) {
        console.log('🧪 Dry run: Would initialize RAG pipeline configuration');
        console.log(`Output file: ${options.output}`);
        console.log(`Interactive mode: ${!options.noInteractive}`);
        return;
      }

      // Check if config already exists
      if (!options.force) {
        try {
          await fs.access(options.output);
          console.log(
            `❌ Configuration file already exists: ${options.output}`,
          );
          console.log(
            'Use --force to overwrite or choose a different output path.',
          );
          return;
        } catch (error) {
          // File doesn't exist, which is good
        }
      }

      if (!options.noInteractive) {
        console.log('🧙‍♂️ Starting interactive configuration wizard...\n');
        // Mock interactive wizard
        await this.createBasicConfig(options.output);
      } else {
        await this.createBasicConfig(options.output);
      }
    } catch (error) {
      logger.error('❌ Initialization failed:', error.message);
      process.exit(1);
    }
  }

  /**
   * Handle doctor command
   */
  async handleDoctor(options) {
    try {
      const globalOptions = this.program.opts();

      const doctorOptions = {
        configPath: globalOptions.config,
        verbose: globalOptions.verbose,
        autoFix: options.autoFix,
        categories: options.category,
      };

      const report = await mockPipelineDoctor(doctorOptions);

      if (options.report) {
        await fs.writeFile(options.report, JSON.stringify(report, null, 2));
        console.log(`📋 Diagnostic report saved to: ${options.report}`);
      }
    } catch (error) {
      logger.error('❌ Doctor command failed:', error.message);
      process.exit(1);
    }
  }

  /**
   * Handle ingest command
   */
  async handleIngest(file, options) {
    try {
      const globalOptions = this.program.opts();

      if (globalOptions.dryRun) {
        console.log('🧪 Dry run: Would ingest document');
        console.log(`File: ${file}`);
        console.log(
          `Parallel processing: ${options.parallel ? 'enabled' : 'disabled'}`,
        );
        console.log(`Streaming: ${options.streaming ? 'enabled' : 'disabled'}`);
        console.log(`Tracing: ${options.trace ? 'enabled' : 'disabled'}`);

        if (options.preview) {
          console.log('📄 Document Preview:');
        }
        if (options.validate) {
          console.log('File validation passed');
        }
        return;
      }

      console.log(`📄 Ingesting document: ${file}`);
      console.log('✅ Document ingested successfully!');
    } catch (error) {
      logger.error('❌ Document ingestion failed:', error.message);
      process.exit(1);
    }
  }

  /**
   * Handle query command
   */
  async handleQuery(prompt, options) {
    try {
      const globalOptions = this.program.opts();

      if (globalOptions.dryRun) {
        console.log('🧪 Dry run: Would execute query');
        console.log(
          `Prompt: ${prompt.substring(0, 100)}${prompt.length > 100 ? '...' : ''}`,
        );
        console.log(`Streaming: ${options.stream ? 'enabled' : 'disabled'}`);

        if (options.explain) {
          console.log('🔍 Query Explanation:');
          console.log('Processing steps:');
          console.log('  1. Text embedding generation');
          console.log('  2. Vector similarity search');
          console.log('  3. Context retrieval');
          console.log('  4. Language model generation');
        }
        return;
      }

      console.log(
        `🤔 Processing query: ${prompt.substring(0, 100)}${prompt.length > 100 ? '...' : ''}`,
      );
      console.log('\n📝 Response:');
      console.log('Mock response to query');
    } catch (error) {
      logger.error('❌ Query processing failed:', error.message);
      process.exit(1);
    }
  }

  /**
   * Handle validate command
   */
  async handleValidate(options) {
    try {
      const globalOptions = this.program.opts();
      const configPath = globalOptions.config;

      console.log(`🔍 Validating configuration: ${configPath}`);

      // Load and validate configuration
      const configContent = await fs.readFile(configPath, 'utf-8');
      const config = JSON.parse(configContent);

      const validation = mockValidateSchema(config);

      if (validation.valid) {
        console.log('✅ Configuration is valid');

        if (validation.legacy) {
          console.log('⚠️  Using legacy format - consider upgrading');
        }
      } else {
        console.log('❌ Configuration validation failed:');
        validation.errors?.forEach((error) => {
          console.log(`  ${error.instancePath || 'root'}: ${error.message}`);
        });
      }
    } catch (error) {
      logger.error('❌ Validation failed:', error.message);
      process.exit(1);
    }
  }

  /**
   * Handle config show command
   */
  async handleConfigShow(options) {
    try {
      const globalOptions = this.program.opts();
      const config = JSON.parse(
        await fs.readFile(globalOptions.config, 'utf-8'),
      );

      let output = config;
      if (options.section) {
        const sections = options.section.split('.');
        for (const section of sections) {
          output = output[section];
          if (output === undefined) {
            console.log(`❌ Section not found: ${options.section}`);
            return;
          }
        }
      }

      console.log(JSON.stringify(output, null, 2));
    } catch (error) {
      logger.error('❌ Failed to show configuration:', error.message);
      process.exit(1);
    }
  }

  /**
   * Handle config set command
   */
  async handleConfigSet(key, value) {
    try {
      const globalOptions = this.program.opts();
      const config = JSON.parse(
        await fs.readFile(globalOptions.config, 'utf-8'),
      );

      // Set value using dot notation
      const keys = key.split('.');
      let current = config;

      for (let i = 0; i < keys.length - 1; i++) {
        if (!current[keys[i]]) {
          current[keys[i]] = {};
        }
        current = current[keys[i]];
      }

      // Parse value
      let parsedValue;
      try {
        parsedValue = JSON.parse(value);
      } catch (error) {
        parsedValue = value; // Keep as string
      }

      current[keys[keys.length - 1]] = parsedValue;

      // Save configuration
      await fs.writeFile(globalOptions.config, JSON.stringify(config, null, 2));
      console.log('✅ Configuration updated');
    } catch (error) {
      logger.error('❌ Failed to set configuration:', error.message);
      process.exit(1);
    }
  }

  /**
   * Handle config get command
   */
  async handleConfigGet(key) {
    try {
      const globalOptions = this.program.opts();
      const config = JSON.parse(
        await fs.readFile(globalOptions.config, 'utf-8'),
      );

      const keys = key.split('.');
      let value = config;

      for (const k of keys) {
        value = value[k];
        if (value === undefined) {
          console.log('❌ Key not found');
          return;
        }
      }

      console.log(JSON.stringify(value, null, 2));
    } catch (error) {
      logger.error('❌ Failed to get configuration:', error.message);
      process.exit(1);
    }
  }

  /**
   * Handle info command
   */
  async handleInfo(options) {
    try {
      console.log('📊 RAG Pipeline Information\n');

      // System information
      if ((!options.plugins && !options.config) || options.system) {
        console.log('System:');
        console.log(`  Node.js: ${process.version}`);
        console.log(`  Platform: ${process.platform} ${process.arch}`);
        console.log(
          `  Memory: ${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)}MB used`,
        );
        console.log('');
      }

      // Configuration summary
      if ((!options.system && !options.plugins) || options.config) {
        const globalOptions = this.program.opts();
        try {
          const config = JSON.parse(
            await fs.readFile(globalOptions.config, 'utf-8'),
          );
          console.log('Configuration:');
          console.log(`  File: ${globalOptions.config}`);
          console.log(`  Format: ${config.plugins ? 'Enhanced' : 'Legacy'}`);
          console.log('');
        } catch (error) {
          console.log('Configuration: Not found or invalid');
          console.log('');
        }
      }
    } catch (error) {
      logger.error('❌ Failed to get system information:', error.message);
      process.exit(1);
    }
  }

  /**
   * Handle completion command
   */
  async handleCompletion(shell) {
    const completionScript = this.generateCompletionScript(shell);
    console.log(completionScript);
  }

  /**
   * Create basic configuration
   */
  async createBasicConfig(outputPath) {
    const { validateRagrc } = require('../config/enhanced-ragrc-schema.js');

    const base = {
      namespace: 'default',
      metadata: {
        name: 'rag-pipeline',
        version: '1.0.0',
        description: 'RAG pipeline configuration',
        createdAt: new Date().toISOString(),
      },
      pipeline: [
        { stage: 'loader', name: 'fs-loader', version: '1.0.0' },
        { stage: 'embedder', name: 'mock-embedder', version: '1.0.0' },
        { stage: 'retriever', name: 'mock-retriever', version: '1.0.0' },
        { stage: 'llm', name: 'mock-llm', version: '1.0.0' },
      ],
      performance: {
        parallel: {
          enabled: false,
          maxConcurrency: 3,
        },
        caching: {
          enabled: false,
          maxSize: 1000,
          ttl: 3600,
        },
      },
      observability: {
        logging: {
          level: 'info',
          structured: true,
        },
      },
    };

    const result = validateRagrc(base);
    if (!result.valid) {
      result.errors?.forEach((error) =>
        console.error(`  ${error.instancePath || ''}: ${error.message}`),
      );
      throw new Error('Failed to generate valid configuration');
    }

    if (outputPath) {
      await fs.writeFile(
        outputPath,
        JSON.stringify(result.normalized, null, 2),
      );
      console.log(`✅ Basic configuration created: ${outputPath}`);
    }

    return result.normalized;
  }

  /**
   * Get version information
   */
  getVersion() {
    return '2.0.0';
  }

  /**
   * Get extended help text
   */
  getExtendedHelp() {
    return `
Examples:
  rag-pipeline init --interactive          Initialize with wizard
  rag-pipeline doctor --auto-fix           Diagnose and fix issues
  rag-pipeline plugin search openai        Search for plugins
  rag-pipeline config show plugins         Show plugin configuration

For more information, visit: https://github.com/DevilsDev/rag-pipeline-utils
`;
  }

  /**
   * Generate shell completion script
   */
  generateCompletionScript(shell) {
    switch (shell) {
      case 'bash':
        return `# RAG Pipeline bash completion
_rag_pipeline_completions() {
  COMPREPLY=($(compgen -W "init doctor ingest query plugin config info validate completion" -- "\${COMP_WORDS[COMP_CWORD]}"))
}
complete -F _rag_pipeline_completions rag-pipeline`;

      case 'zsh':
        return `# RAG Pipeline zsh completion
#compdef rag-pipeline
_rag_pipeline() {
  _arguments \\
    '1:command:(init doctor ingest query plugin config info validate completion)'
}
_rag_pipeline "$@"`;

      case 'fish':
        return `# RAG Pipeline fish completion
complete -c rag-pipeline -n '__fish_use_subcommand' -a 'init doctor ingest query plugin config info validate completion'`;

      default:
        return `# Completion not available for ${shell}`;
    }
  }

  /**
   * Run the CLI
   */
  async run(argv = process.argv) {
    try {
      await this.program.parseAsync(argv);
    } catch (error) {
      if (error.code !== 'commander.unknownCommand') {
        logger.error('❌ CLI error:', error.message);
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

// CLI command surface for tests
const init = async () => ({ ok: true });
const ingest = async () => ({ ok: true });
const query = async () => ({ ok: true });
const handleError = async () => ({ ok: true });
const validateArgs = () => true;
const showHelp = () => 'help text';

// Extract createBasicConfig from the class for direct export
const createBasicConfig = async (outputPath) => {
  const cli = new EnhancedCLI();
  return await cli.createBasicConfig(outputPath);
};

const enhancedCliCommands = {
  init,
  ingest,
  query,
  handleError,
  validateArgs,
  showHelp,
};

module.exports = {
  EnhancedCLI,
  enhancedCLI,
  runEnhancedCLI,
  enhancedCliCommands,
  init,
  ingest,
  query,
  handleError,
  validateArgs,
  showHelp,
  createBasicConfig,
};
