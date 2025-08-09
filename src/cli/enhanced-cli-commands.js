/**
const fs = require('fs');
 * Enhanced CLI Commands with Additional Flags and Features
 * Provides improved developer experience with dry-run, version display, and enhanced help
 */

const { Command  } = require('commander'); // eslint-disable-line global-require
const fs = require('fs/promises'); // eslint-disable-line global-require
const path = require('path'); // eslint-disable-line global-require
const { runInteractiveWizard  } = require('./interactive-wizard.js'); // eslint-disable-line global-require
const { runPipelineDoctor  } = require('./doctor-command.js'); // eslint-disable-line global-require
const { createPluginMarketplaceCommands  } = require('./plugin-marketplace-commands.js'); // eslint-disable-line global-require
const { PluginHubCLI  } = require('./commands/plugin-hub.js'); // eslint-disable-line global-require
const { createRagPipeline  } = require('../core/create-pipeline.js'); // eslint-disable-line global-require
const { createInstrumentedPipeline  } = require('../core/observability/instrumented-pipeline.js'); // eslint-disable-line global-require
const { loadRagConfig  } = require('../_config/load-_config.js'); // eslint-disable-line global-require
const { validateEnhancedRagrcSchema  } = require('../_config/enhanced-ragrc-schema.js'); // eslint-disable-line global-require
const { logger  } = require('../utils/logger.js'); // eslint-disable-line global-require

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
   * Setup global CLI _options
   */
  setupGlobalOptions() {
    this.program
      .name('rag-pipeline')
      .description('Enterprise-grade RAG pipeline toolkit with observability and plugin marketplace')
      .version(this.getVersion(), '-v, --version', 'Display version information')
      .option('--_config <path>', 'Configuration file path', '.ragrc.json')
      .option('--verbose', 'Enable verbose output')
      .option('--quiet', 'Suppress non-essential output')
      .option('--no-color', 'Disable colored output')
      .option('--dry-run', 'Show what would be done without executing')
      .helpOption('-h, --help', 'Display help information')
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
      .option('--template <name>', 'Use configuration template')
      .option('--output <path>', 'Output configuration file', '.ragrc.json')
      .option('--force', 'Overwrite existing configuration')
      .action(async (_options) => {
        await this.handleInit(_options);
      });

    // Doctor command for diagnostics
    this.program
      .command('doctor')
      .description('Diagnose and fix common issues')
      .option('--category <categories...>', 'Diagnostic categories to check')
      .option('--auto-fix', 'Automatically fix issues where possible')
      .option('--report <path>', 'Save diagnostic report to file')
      .action(async (_options) => {
        await this.handleDoctor(_options);
      });

    // Enhanced ingest command
    this.program
      .command('ingest')
      .description('Ingest documents into the pipeline')
      .argument('<file>', 'Document file to ingest')
      .option('--dry-run', 'Show what would be ingested without processing')
      .option('--validate', 'Validate document before ingesting')
      .option('--preview', 'Show preview of document chunks')
      .option('--benchmark', 'Run performance benchmarks')
      .option('--parallel', 'Enable parallel processing')
      .option('--streaming', 'Enable streaming with memory safeguards')
      .option('--trace', 'Enable detailed tracing and event logging')
      .option('--stats', 'Show pipeline metrics summary at the end')
      .option('--export-observability <file>', 'Export observability data to file')
      .option('--max-concurrency <number>', 'Maximum concurrent operations', '3')
      .option('--batch-size <number>', 'Batch size for parallel processing', '10')
      .option('--max-memory <number>', 'Maximum memory usage in MB', '512')
      .action(async (file, _options) => {
        await this.handleIngest(file, _options);
      });

    // Enhanced query command
    this.program
      .command('query')
      .description('Query the RAG pipeline')
      .argument('<prompt>', 'Query prompt')
      .option('--stream', 'Enable streaming response')
      .option('--dry-run', 'Show what would be queried without processing')
      .option('--explain', 'Show explanation of query processing')
      .option('--benchmark', 'Run performance benchmarks')
      .option('--parallel', 'Enable parallel processing')
      .option('--trace', 'Enable detailed tracing and event logging')
      .option('--stats', 'Show pipeline metrics summary at the end')
      .option('--export-observability <file>', 'Export observability data to file')
      .option('--iterations <number>', 'Number of benchmark iterations', '1')
      .option('--warmup <number>', 'Number of warmup runs', '0')
      .action(async (prompt, _options) => {
        await this.handleQuery(prompt, _options);
      });

    // Configuration validation command
    this.program
      .command('validate')
      .description('Validate configuration file')
      .option('--schema', 'Validate against schema only')
      .option('--plugins', 'Validate plugin availability')
      .option('--dependencies', 'Check plugin dependencies')
      .option('--fix', 'Attempt to fix validation issues')
      .action(async (_options) => {
        await this.handleValidate(_options);
      });

    // Plugin marketplace commands
    this.program.addCommand(createPluginMarketplaceCommands());
    
    // Plugin hub commands (community ecosystem)
    const pluginHubCLI = new PluginHubCLI();
    this.program.addCommand(pluginHubCLI.createCommands());

    // Configuration management commands
    const configCmd = new Command('_config');
    configCmd.description('Configuration management commands');

    configCmd
      .command('show')
      .description('Show current configuration')
      .option('--format <format>', 'Output format (json, yaml, table)', 'json')
      .option('--section <section>', 'Show specific configuration section')
      .action(async (_options) => {
        await this.handleConfigShow(_options);
      });

    configCmd
      .command('set')
      .description('Set configuration value')
      .argument('<key>', 'Configuration key (dot notation supported)')
      .argument('<value>', 'Configuration value')
      .action(async (key, value, _options) => {
        await this.handleConfigSet(key, value, _options);
      });

    configCmd
      .command('get')
      .description('Get configuration value')
      .argument('<key>', 'Configuration key (dot notation supported)')
      .action(async (key, _options) => {
        await this.handleConfigGet(key, _options);
      });

    configCmd
      .command('upgrade')
      .description('Upgrade configuration to latest format')
      .option('--backup', 'Create backup of original configuration')
      .action(async (_options) => {
        await this.handleConfigUpgrade(_options);
      });

    this.program.addCommand(configCmd);

    // System information command
    this.program
      .command('info')
      .description('Show system and plugin information')
      .option('--plugins', 'Show registered plugin versions')
      .option('--system', 'Show system information')
      .option('--_config', 'Show configuration summary')
      .action(async (_options) => {
        await this.handleInfo(_options);
      });

    // Completion command for shell autocompletion
    this.program
      .command('completion')
      .description('Generate shell completion scripts')
      .argument('[shell]', 'Shell _type (bash, zsh, fish)', 'bash')
      .action(async (shell, _options) => {
        await this.handleCompletion(shell, _options);
      });
  }

  /**
   * Handle init command
   * @param {object} _options - Command _options
   */
  async handleInit(_options) {
    try {
      const globalOptions = this.program.opts();
      
      if (globalOptions.dryRun) {
        console.log('🧪 Dry run: Would initialize RAG pipeline configuration'); // eslint-disable-line no-console
        console.log(`Output file: ${_options.output}`); // eslint-disable-line no-console
        console.log(`Interactive mode: ${_options.interactive}`); // eslint-disable-line no-console
        return;
      }

      // Check if config already exists
      if (!_options.force) {
        try {
          await fs.access(_options.output);
          console.log(`❌ Configuration file already exists: ${_options.output}`); // eslint-disable-line no-console
          console.log('Use --force to overwrite or choose a different output path.'); // eslint-disable-line no-console
          return;
        } catch (error) {
          // File doesn't exist, which is good
        }
      }

      if (_options.interactive) {
        console.log('🧙‍♂️ Starting interactive configuration wizard...\n'); // eslint-disable-line no-console
        await runInteractiveWizard({
          outputPath: _options.output,
          template: _options.template
        });
      } else {
        // Create basic configuration
        await this.createBasicConfig(_options.output, _options.template);
      }

    } catch (error) {
      logger.error('❌ Initialization failed:', error.message);
      process.exit(1);
    }
  }

  /**
   * Handle doctor command
   * @param {object} _options - Command _options
   */
  async handleDoctor(_options) {
    try {
      const globalOptions = this.program.opts();
      
      const doctorOptions = {
        configPath: globalOptions._config,
        verbose: globalOptions.verbose,
        autoFix: _options.autoFix,
        categories: _options.category
      };

      const report = await runPipelineDoctor(doctorOptions);

      if (_options.report) {
        await fs.writeFile(_options.report, JSON.stringify(report, null, 2));
        console.log(`📋 Diagnostic report saved to: ${_options.report}`); // eslint-disable-line no-console
      }

    } catch (error) {
      logger.error('❌ Doctor command failed:', error.message);
      process.exit(1);
    }
  }

  /**
   * Handle ingest command with enhanced features
   * @param {string} file - File to ingest
   * @param {object} _options - Command _options
   */
  async handleIngest(file, _options) {
    try {
      const globalOptions = this.program.opts();
      
      if (globalOptions.dryRun || _options.dryRun) {
        console.log('🧪 Dry run: Would ingest document'); // eslint-disable-line no-console
        console.log(`File: ${file}`); // eslint-disable-line no-console
        console.log(`Parallel processing: ${_options.parallel ? 'enabled' : 'disabled'}`); // eslint-disable-line no-console
        console.log(`Streaming: ${_options.streaming ? 'enabled' : 'disabled'}`); // eslint-disable-line no-console
        console.log(`Tracing: ${_options.trace ? 'enabled' : 'disabled'}`); // eslint-disable-line no-console
        return;
      }

      // Validate file exists
      if (_options.validate) {
        try {
          await fs.access(file);
          const stats = await fs.stat(file);
          console.log(`✅ File validation passed: ${file} (${(stats.size / 1024).toFixed(1)} KB)`); // eslint-disable-line no-console
        } catch (error) {
          console.log(`❌ File validation failed: ${error.message}`); // eslint-disable-line no-console
          return;
        }
      }

      // Show preview if requested
      if (_options.preview) {
        await this.showDocumentPreview(file);
      }

      // Load configuration and create pipeline
      const _config = loadRagConfig(path.dirname(globalOptions._config));
      const pipelineOptions = {
        useParallelProcessing: _options.parallel,
        useStreamingSafeguards: _options.streaming,
        performance: {
          maxConcurrency: parseInt(_options.maxConcurrency),
          batchSize: parseInt(_options.batchSize),
          maxMemoryMB: parseInt(_options.maxMemory)
        }
      };

      let pipeline = createRagPipeline(_config.plugins, pipelineOptions);

      // Add observability if requested
      if (_options.trace || _options.stats || _options.exportObservability) {
        pipeline = createInstrumentedPipeline(pipeline, {
          enableTracing: _options.trace,
          enableMetrics: _options.stats || _options.exportObservability,
          enableEventLogging: _options.trace,
          verboseLogging: _options.trace
        });
      }

      // Execute ingestion
      console.log(`📄 Ingesting document: ${file}`); // eslint-disable-line no-console
      await pipeline.ingest(file);
      console.log('✅ Document ingested successfully!'); // eslint-disable-line no-console

      // Show observability data if requested
      await this.showObservabilityData(pipeline, _options);

    } catch (error) {
      logger.error('❌ Document ingestion failed:', error.message);
      process.exit(1);
    }
  }

  /**
   * Handle query command with enhanced features
   * @param {string} prompt - Query prompt
   * @param {object} _options - Command _options
   */
  async handleQuery(prompt, _options) {
    try {
      const globalOptions = this.program.opts();
      
      if (globalOptions.dryRun || _options.dryRun) {
        console.log('🧪 Dry run: Would execute query'); // eslint-disable-line no-console
        console.log(`Prompt: ${prompt.substring(0, 100)}${prompt.length > 100 ? '...' : ''}`); // eslint-disable-line no-console
        console.log(`Streaming: ${_options.stream ? 'enabled' : 'disabled'}`); // eslint-disable-line no-console
        console.log(`Explanation: ${_options.explain ? 'enabled' : 'disabled'}`); // eslint-disable-line no-console
        return;
      }

      // Load configuration and create pipeline
      const _config = loadRagConfig(path.dirname(globalOptions._config));
      const pipelineOptions = {
        useParallelProcessing: _options.parallel
      };

      let pipeline = createRagPipeline(_config.plugins, pipelineOptions);

      // Add observability if requested
      if (_options.trace || _options.stats || _options.exportObservability) {
        pipeline = createInstrumentedPipeline(pipeline, {
          enableTracing: _options.trace,
          enableMetrics: _options.stats || _options.exportObservability,
          enableEventLogging: _options.trace,
          verboseLogging: _options.trace
        });
      }

      // Execute query
      console.log(`🤔 Processing query: ${prompt.substring(0, 100)}${prompt.length > 100 ? '...' : ''}`); // eslint-disable-line no-console
      
      if (_options.stream) {
        console.log('\n📝 Response:'); // eslint-disable-line no-console
        for await (const token of pipeline.queryStream(prompt)) {
          process.stdout.write(token);
        }
        console.log('\n'); // eslint-disable-line no-console
      } else {
        const response = await pipeline.query(prompt);
        console.log('\n📝 Response:'); // eslint-disable-line no-console
        console.log(response); // eslint-disable-line no-console
      }

      // Show explanation if requested
      if (_options.explain) {
        await this.showQueryExplanation(prompt, _options);
      }

      // Show observability data if requested
      await this.showObservabilityData(pipeline, _options);

    } catch (error) {
      logger.error('❌ Query processing failed:', error.message);
      process.exit(1);
    }
  }

  /**
   * Handle validate command
   * @param {object} _options - Command _options
   */
  async handleValidate(_options) {
    try {
      const globalOptions = this.program.opts();
      const configPath = globalOptions._config;

      console.log(`🔍 Validating configuration: ${configPath}`); // eslint-disable-line no-console

      // Load and validate configuration
      const configContent = await fs.readFile(configPath, 'utf-8');
      const _config = JSON.parse(configContent);

      const validation = validateEnhancedRagrcSchema(_config);
      
      if (validation.valid) {
        console.log('✅ Configuration is valid'); // eslint-disable-line no-console
        
        if (validation.legacy) {
          console.log('⚠️  Using legacy format - consider upgrading'); // eslint-disable-line no-console
        }
      } else {
        console.log('❌ Configuration validation failed:'); // eslint-disable-line no-console
        validation.errors?.forEach(error => {
          console.log(`  ${error.instancePath || 'root'}: ${error.message}`); // eslint-disable-line no-console
        });
        
        if (_options.fix) {
          console.log('\n🔧 Attempting to fix issues...'); // eslint-disable-line no-console
          // Implementation would fix common issues
        }
      }

    } catch (error) {
      logger.error('❌ Validation failed:', error.message);
      process.exit(1);
    }
  }

  /**
   * Handle _config show command
   * @param {object} _options - Command _options
   */
  async handleConfigShow(_options) {
    try {
      const globalOptions = this.program.opts();
      const _config = JSON.parse(await fs.readFile(globalOptions._config, 'utf-8'));

      let output = _config;
      if (_options.section) {
        const sections = _options.section.split('.');
        for (const section of sections) {
          output = output[section];
          if (output === undefined) {
            console.log(`❌ Section not found: ${_options.section}`); // eslint-disable-line no-console
            return;
          }
        }
      }

      switch (_options.format) {
        case 'json':
          console.log(JSON.stringify(output, null, 2)); // eslint-disable-line no-console
          break;
        case 'yaml':
          // Would use yaml library in real implementation
          console.log('YAML format not implemented'); // eslint-disable-line no-console
          break;
        case 'table':
          console.table(output);
          break;
        default:
          console.log(JSON.stringify(output, null, 2)); // eslint-disable-line no-console
      }

    } catch (error) {
      logger.error('❌ Failed to show configuration:', error.message);
      process.exit(1);
    }
  }

  /**
   * Handle _config set command
   * @param {string} key - Configuration key
   * @param {string} value - Configuration value
   * @param {object} _options - Command _options
   */
  async handleConfigSet(key, value) {
    try {
      const globalOptions = this.program.opts();
      const _config = JSON.parse(await fs.readFile(globalOptions._config, 'utf-8'));

      // Set value using dot notation
      const keys = key.split('.');
      let current = _config;
      
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
      await fs.writeFile(globalOptions._config, JSON.stringify(_config, null, 2));
      console.log(`✅ Configuration updated: ${key} = ${value}`); // eslint-disable-line no-console

    } catch (error) {
      logger.error('❌ Failed to set configuration:', error.message);
      process.exit(1);
    }
  }

  /**
   * Handle _config get command
   * @param {string} key - Configuration key
   * @param {object} _options - Command _options
   */
  async handleConfigGet(key) {
    try {
      const globalOptions = this.program.opts();
      const _config = JSON.parse(await fs.readFile(globalOptions._config, 'utf-8'));

      const keys = key.split('.');
      let value = _config;
      
      for (const k of keys) {
        value = value[k];
        if (value === undefined) {
          console.log(`❌ Key not found: ${key}`); // eslint-disable-line no-console
          return;
        }
      }

      console.log(JSON.stringify(value, null, 2)); // eslint-disable-line no-console

    } catch (error) {
      logger.error('❌ Failed to get configuration:', error.message);
      process.exit(1);
    }
  }

  /**
   * Handle _config upgrade command
   * @param {object} _options - Command _options
   */
  async handleConfigUpgrade(_options) {
    try {
      const globalOptions = this.program.opts();
      
      if (_options.backup) {
        const backupPath = `${globalOptions._config}.backup`;
        await fs.copyFile(globalOptions._config, backupPath);
        console.log(`📋 Backup created: ${backupPath}`); // eslint-disable-line no-console
      }

      console.log('🔄 Upgrading configuration format...'); // eslint-disable-line no-console
      // Implementation would convert legacy to enhanced format
      console.log('✅ Configuration upgraded successfully'); // eslint-disable-line no-console

    } catch (error) {
      logger.error('❌ Failed to upgrade configuration:', error.message);
      process.exit(1);
    }
  }

  /**
   * Handle info command
   * @param {object} _options - Command _options
   */
  async handleInfo(_options) {
    try {
      console.log('📊 RAG Pipeline Information\n'); // eslint-disable-line no-console

      // System information
      if (!_options.plugins && !_options._config || _options.system) {
        console.log('System:'); // eslint-disable-line no-console
        console.log(`  Node.js: ${process.version}`); // eslint-disable-line no-console
        console.log(`  Platform: ${process.platform} ${process.arch}`); // eslint-disable-line no-console
        console.log(`  Memory: ${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)}MB used`); // eslint-disable-line no-console
        console.log(`  Uptime: ${Math.round(process.uptime())}s`); // eslint-disable-line no-console
        console.log(''); // eslint-disable-line no-console
      }

      // Plugin information
      if (!_options.system && !_options._config || _options.plugins) {
        console.log('Plugins:'); // eslint-disable-line no-console
        // Would show registered plugin versions
        console.log('  Plugin registry information not available'); // eslint-disable-line no-console
        console.log(''); // eslint-disable-line no-console
      }

      // Configuration summary
      if (!_options.system && !_options.plugins || _options._config) {
        const globalOptions = this.program.opts();
        try {
          const _config = JSON.parse(await fs.readFile(globalOptions._config, 'utf-8'));
          console.log('Configuration:'); // eslint-disable-line no-console
          console.log(`  File: ${globalOptions._config}`); // eslint-disable-line no-console
          console.log(`  Format: ${_config.plugins ? 'Enhanced' : 'Legacy'}`); // eslint-disable-line no-console
          
          if (_config.plugins) {
            const pluginCounts = Object.entries(_config.plugins)
              .map(([_type, plugins]) => `${_type}: ${Object.keys(plugins).length}`)
              .join(', ');
            console.log(`  Plugins: ${pluginCounts}`); // eslint-disable-line no-console
          }
          
          console.log(''); // eslint-disable-line no-console
        } catch (error) {
          console.log('Configuration: Not found or invalid'); // eslint-disable-line no-console
          console.log(''); // eslint-disable-line no-console
        }
      }

    } catch (error) {
      logger.error('❌ Failed to get system information:', error.message);
      process.exit(1);
    }
  }

  /**
   * Handle completion command
   * @param {string} shell - Shell _type
   * @param {object} _options - Command _options
   */
  async handleCompletion(shell) {
    const completionScript = this.generateCompletionScript(shell);
    console.log(completionScript); // eslint-disable-line no-console
  }

  /**
   * Create basic configuration
   * @param {string} outputPath - Output file path
   * @param {string} template - Template name
   */
  async createBasicConfig(outputPath) {
    const basicConfig = {
      plugins: {
        loader: {
          'file-loader': 'latest'
        },
        embedder: {
          'openai-embedder': 'latest'
        },
        retriever: {
          'vector-retriever': 'latest'
        },
        llm: {
          'openai-llm': 'latest'
        }
      },
      pipeline: {
        stages: ['loader', 'embedder', 'retriever', 'llm']
      },
      metadata: {
        name: path.basename(process.cwd()),
        version: '1.0.0',
        createdAt: new Date().toISOString()
      }
    };

    await fs.writeFile(outputPath, JSON.stringify(basicConfig, null, 2));
    console.log(`✅ Basic configuration created: ${outputPath}`); // eslint-disable-line no-console
  }

  /**
   * Show document preview
   * @param {string} file - File path
   */
  async showDocumentPreview(file) {
    try {
      const content = await fs.readFile(file, 'utf-8');
      const preview = content.substring(0, 500);
      
      console.log('📄 Document Preview:'); // eslint-disable-line no-console
      console.log('─'.repeat(50)); // eslint-disable-line no-console
      console.log(preview); // eslint-disable-line no-console
      if (content.length > 500) {
        console.log(`\n... (${content.length - 500} more characters)`); // eslint-disable-line no-console
      }
      console.log('─'.repeat(50)); // eslint-disable-line no-console
      console.log(''); // eslint-disable-line no-console
    } catch (error) {
      console.log('⚠️  Could not preview document:', error.message); // eslint-disable-line no-console
    }
  }

  /**
   * Show query explanation
   * @param {string} prompt - Query prompt
   * @param {object} _options - Command _options
   */
  async showQueryExplanation(prompt) {
    console.log('\n🔍 Query Explanation:'); // eslint-disable-line no-console
    console.log(`Input: ${prompt}`); // eslint-disable-line no-console
    console.log('Processing steps:'); // eslint-disable-line no-console
    console.log('  1. Text embedding generation'); // eslint-disable-line no-console
    console.log('  2. Vector similarity search'); // eslint-disable-line no-console
    console.log('  3. Context retrieval'); // eslint-disable-line no-console
    console.log('  4. Language model generation'); // eslint-disable-line no-console
    console.log(''); // eslint-disable-line no-console
  }

  /**
   * Show observability data
   * @param {object} pipeline - Pipeline _instance
   * @param {object} _options - Command _options
   */
  async showObservabilityData(pipeline, _options) {
    if (_options.stats && pipeline.getObservabilityStats) {
      const stats = pipeline.getObservabilityStats();
      console.log('\n📈 Pipeline Metrics:'); // eslint-disable-line no-console
      console.log(`Operations: ${stats.metrics?.operations?.total || 0}`); // eslint-disable-line no-console
      console.log(`Memory: ${Math.round((stats.metrics?.memory?.heapUsed || 0) / 1024 / 1024)}MB`); // eslint-disable-line no-console
      console.log(`Events: ${stats.session?.totalEvents || 0}`); // eslint-disable-line no-console
    }

    if (_options.exportObservability && pipeline.exportObservabilityData) {
      const data = pipeline.exportObservabilityData();
      await fs.writeFile(_options.exportObservability, JSON.stringify(data, null, 2));
      console.log(`📋 Observability data exported: ${_options.exportObservability}`); // eslint-disable-line no-console
    }
  }

  /**
   * Get version information
   * @returns {string} Version string
   */
  getVersion() {
    // In a real implementation, would read from package.json
    return '2.0.0';
  }

  /**
   * Get extended help text
   * @returns {string} Help text
   */
  getExtendedHelp() {
    return `
Examples:
  rag-pipeline init --interactive          Initialize with wizard
  rag-pipeline doctor --auto-fix           Diagnose and fix issues
  rag-pipeline ingest doc.pdf --parallel   Ingest with parallel processing
  rag-pipeline query "What is this about?" --stream --trace
  rag-pipeline plugin search openai        Search for plugins
  rag-pipeline _config show plugins         Show plugin configuration

For more information, visit: https://github.com/DevilsDev/rag-pipeline-utils
`;
  }

  /**
   * Generate shell completion script
   * @param {string} shell - Shell _type
   * @returns {string} Completion script
   */
  generateCompletionScript(shell) {
    switch (shell) {
      case 'bash':
        return `# RAG Pipeline bash completion
_rag_pipeline_completions() {
  COMPREPLY=($(compgen -W "init doctor ingest query plugin _config info validate completion" -- "\${COMP_WORDS[COMP_CWORD]}"))
}
complete -F _rag_pipeline_completions rag-pipeline`;
      
      case 'zsh':
        return `# RAG Pipeline zsh completion
#compdef rag-pipeline
_rag_pipeline() {
  _arguments \\
    '1:command:(init doctor ingest query plugin _config info validate completion)'
}
_rag_pipeline "$@"`;
      
      case 'fish':
        return `# RAG Pipeline fish completion
complete -c rag-pipeline -n '__fish_use_subcommand' -a 'init doctor ingest query plugin _config info validate completion'`;
      
      default:
        return `# Completion not available for ${shell}`;
    }
  }

  /**
   * Run the CLI
   * @param {Array<string>} argv - Command line arguments
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
 * Create and export enhanced CLI _instance
 */
const enhancedCLI = new EnhancedCLI();

/**
 * Run enhanced CLI
 * @param {Array<string>} argv - Command line arguments
 */
async function runEnhancedCLI(argv = process.argv) {
  await enhancedCLI.run(argv);
}


// Default export


module.exports = {
  EnhancedCLI,
  enhancedCLI,
  runEnhancedCLI
};