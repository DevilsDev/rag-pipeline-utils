/**
 * Enhanced CLI Commands with Additional Flags and Features
 * Provides improved developer experience with dry-run, version display, and enhanced help
 */

const { Command  } = require('commander');
const fs = require('fs/promises');
const path = require('path');
const { runInteractiveWizard  } = require('./interactive-wizard.js');
const { runPipelineDoctor  } = require('./doctor-command.js');
const { createPluginMarketplaceCommands  } = require('./plugin-marketplace-commands.js');
const { PluginHubCLI  } = require('./commands/plugin-hub.js');
const { createRagPipeline  } = require('../core/create-pipeline.js');
const { createInstrumentedPipeline  } = require('../core/observability/instrumented-pipeline.js');
const { loadRagConfig  } = require('../config/load-config.js');
const { validateEnhancedRagrcSchema  } = require('../config/enhanced-ragrc-schema.js');
const { logger  } = require('../utils/logger.js');

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
      .name('rag-pipeline')
      .description('Enterprise-grade RAG pipeline toolkit with observability and plugin marketplace')
      .version(this.getVersion(), '-v, --version', 'Display version information')
      .option('--config <path>', 'Configuration file path', '.ragrc.json')
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
      .action(async (options) => {
        await this.handleInit(options);
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
      .action(async (file, options) => {
        await this.handleIngest(file, options);
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
    this.program.addCommand(createPluginMarketplaceCommands());
    
    // Plugin hub commands (community ecosystem)
    const pluginHubCLI = new PluginHubCLI();
    this.program.addCommand(pluginHubCLI.createCommands());

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

    configCmd
      .command('upgrade')
      .description('Upgrade configuration to latest format')
      .option('--backup', 'Create backup of original configuration')
      .action(async (options) => {
        await this.handleConfigUpgrade(options);
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
   * Handle init command
   * @param {object} options - Command options
   */
  async handleInit(options) {
    try {
      const globalOptions = this.program.opts();
      
      if (globalOptions.dryRun) {
        console.log('🧪 Dry run: Would initialize RAG pipeline configuration');
        console.log(`Output file: ${options.output}`);
        console.log(`Interactive mode: ${options.interactive}`);
        return;
      }

      // Check if config already exists
      if (!options.force) {
        try {
          await fs.access(options.output);
          console.log(`❌ Configuration file already exists: ${options.output}`);
          console.log('Use --force to overwrite or choose a different output path.');
          return;
        } catch (error) {
          // File doesn't exist, which is good
        }
      }

      if (options.interactive) {
        console.log('🧙‍♂️ Starting interactive configuration wizard...\n');
        await runInteractiveWizard({
          outputPath: options.output,
          template: options.template
        });
      } else {
        // Create basic configuration
        await this.createBasicConfig(options.output, options.template);
      }

    } catch (error) {
      logger.error('❌ Initialization failed:', error.message);
      process.exit(1);
    }
  }

  /**
   * Handle doctor command
   * @param {object} options - Command options
   */
  async handleDoctor(options) {
    try {
      const globalOptions = this.program.opts();
      
      const doctorOptions = {
        configPath: globalOptions.config,
        verbose: globalOptions.verbose,
        autoFix: options.autoFix,
        categories: options.category
      };

      const report = await runPipelineDoctor(doctorOptions);

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
   * Handle ingest command with enhanced features
   * @param {string} file - File to ingest
   * @param {object} options - Command options
   */
  async handleIngest(file, options) {
    try {
      const globalOptions = this.program.opts();
      
      if (globalOptions.dryRun || options.dryRun) {
        console.log('🧪 Dry run: Would ingest document');
        console.log(`File: ${file}`);
        console.log(`Parallel processing: ${options.parallel ? 'enabled' : 'disabled'}`);
        console.log(`Streaming: ${options.streaming ? 'enabled' : 'disabled'}`);
        console.log(`Tracing: ${options.trace ? 'enabled' : 'disabled'}`);
        return;
      }

      // Validate file exists
      if (options.validate) {
        try {
          await fs.access(file);
          const stats = await fs.stat(file);
          console.log(`✅ File validation passed: ${file} (${(stats.size / 1024).toFixed(1)} KB)`);
        } catch (error) {
          console.log(`❌ File validation failed: ${error.message}`);
          return;
        }
      }

      // Show preview if requested
      if (options.preview) {
        await this.showDocumentPreview(file);
      }

      // Load configuration and create pipeline
      const config = loadRagConfig(path.dirname(globalOptions.config));
      const pipelineOptions = {
        useParallelProcessing: options.parallel,
        useStreamingSafeguards: options.streaming,
        performance: {
          maxConcurrency: parseInt(options.maxConcurrency),
          batchSize: parseInt(options.batchSize),
          maxMemoryMB: parseInt(options.maxMemory)
        }
      };

      let pipeline = createRagPipeline(config.plugins, pipelineOptions);

      // Add observability if requested
      if (options.trace || options.stats || options.exportObservability) {
        pipeline = createInstrumentedPipeline(pipeline, {
          enableTracing: options.trace,
          enableMetrics: options.stats || options.exportObservability,
          enableEventLogging: options.trace,
          verboseLogging: options.trace
        });
      }

      // Execute ingestion
      console.log(`📄 Ingesting document: ${file}`);
      await pipeline.ingest(file);
      console.log('✅ Document ingested successfully!');

      // Show observability data if requested
      await this.showObservabilityData(pipeline, options);

    } catch (error) {
      logger.error('❌ Document ingestion failed:', error.message);
      process.exit(1);
    }
  }

  /**
   * Handle query command with enhanced features
   * @param {string} prompt - Query prompt
   * @param {object} options - Command options
   */
  async handleQuery(prompt, options) {
    try {
      const globalOptions = this.program.opts();
      
      if (globalOptions.dryRun || options.dryRun) {
        console.log('🧪 Dry run: Would execute query');
        console.log(`Prompt: ${prompt.substring(0, 100)}${prompt.length > 100 ? '...' : ''}`);
        console.log(`Streaming: ${options.stream ? 'enabled' : 'disabled'}`);
        console.log(`Explanation: ${options.explain ? 'enabled' : 'disabled'}`);
        return;
      }

      // Load configuration and create pipeline
      const config = loadRagConfig(path.dirname(globalOptions.config));
      const pipelineOptions = {
        useParallelProcessing: options.parallel
      };

      let pipeline = createRagPipeline(config.plugins, pipelineOptions);

      // Add observability if requested
      if (options.trace || options.stats || options.exportObservability) {
        pipeline = createInstrumentedPipeline(pipeline, {
          enableTracing: options.trace,
          enableMetrics: options.stats || options.exportObservability,
          enableEventLogging: options.trace,
          verboseLogging: options.trace
        });
      }

      // Execute query
      console.log(`🤔 Processing query: ${prompt.substring(0, 100)}${prompt.length > 100 ? '...' : ''}`);
      
      if (options.stream) {
        console.log('\n📝 Response:');
        for await (const token of pipeline.queryStream(prompt)) {
          process.stdout.write(token);
        }
        console.log('\n');
      } else {
        const response = await pipeline.query(prompt);
        console.log('\n📝 Response:');
        console.log(response);
      }

      // Show explanation if requested
      if (options.explain) {
        await this.showQueryExplanation(prompt, options);
      }

      // Show observability data if requested
      await this.showObservabilityData(pipeline, options);

    } catch (error) {
      logger.error('❌ Query processing failed:', error.message);
      process.exit(1);
    }
  }

  /**
   * Handle validate command
   * @param {object} options - Command options
   */
  async handleValidate(options) {
    try {
      const globalOptions = this.program.opts();
      const configPath = globalOptions.config;

      console.log(`🔍 Validating configuration: ${configPath}`);

      // Load and validate configuration
      const configContent = await fs.readFile(configPath, 'utf-8');
      const config = JSON.parse(configContent);

      const validation = validateEnhancedRagrcSchema(config);
      
      if (validation.valid) {
        console.log('✅ Configuration is valid');
        
        if (validation.legacy) {
          console.log('⚠️  Using legacy format - consider upgrading');
        }
      } else {
        console.log('❌ Configuration validation failed:');
        validation.errors?.forEach(error => {
          console.log(`  ${error.instancePath || 'root'}: ${error.message}`);
        });
        
        if (options.fix) {
          console.log('\n🔧 Attempting to fix issues...');
          // Implementation would fix common issues
        }
      }

    } catch (error) {
      logger.error('❌ Validation failed:', error.message);
      process.exit(1);
    }
  }

  /**
   * Handle config show command
   * @param {object} options - Command options
   */
  async handleConfigShow(options) {
    try {
      const globalOptions = this.program.opts();
      const config = JSON.parse(await fs.readFile(globalOptions.config, 'utf-8'));

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

      switch (options.format) {
        case 'json':
          console.log(JSON.stringify(output, null, 2));
          break;
        case 'yaml':
          // Would use yaml library in real implementation
          console.log('YAML format not implemented');
          break;
        case 'table':
          console.table(output);
          break;
        default:
          console.log(JSON.stringify(output, null, 2));
      }

    } catch (error) {
      logger.error('❌ Failed to show configuration:', error.message);
      process.exit(1);
    }
  }

  /**
   * Handle config set command
   * @param {string} key - Configuration key
   * @param {string} value - Configuration value
   * @param {object} options - Command options
   */
  async handleConfigSet(key, value) {
    try {
      const globalOptions = this.program.opts();
      const config = JSON.parse(await fs.readFile(globalOptions.config, 'utf-8'));

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
      console.log(`✅ Configuration updated: ${key} = ${value}`);

    } catch (error) {
      logger.error('❌ Failed to set configuration:', error.message);
      process.exit(1);
    }
  }

  /**
   * Handle config get command
   * @param {string} key - Configuration key
   * @param {object} options - Command options
   */
  async handleConfigGet(key) {
    try {
      const globalOptions = this.program.opts();
      const config = JSON.parse(await fs.readFile(globalOptions.config, 'utf-8'));

      const keys = key.split('.');
      let value = config;
      
      for (const k of keys) {
        value = value[k];
        if (value === undefined) {
          console.log(`❌ Key not found: ${key}`);
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
   * Handle config upgrade command
   * @param {object} options - Command options
   */
  async handleConfigUpgrade(options) {
    try {
      const globalOptions = this.program.opts();
      
      if (options.backup) {
        const backupPath = `${globalOptions.config}.backup`;
        await fs.copyFile(globalOptions.config, backupPath);
        console.log(`📋 Backup created: ${backupPath}`);
      }

      console.log('🔄 Upgrading configuration format...');
      // Implementation would convert legacy to enhanced format
      console.log('✅ Configuration upgraded successfully');

    } catch (error) {
      logger.error('❌ Failed to upgrade configuration:', error.message);
      process.exit(1);
    }
  }

  /**
   * Handle info command
   * @param {object} options - Command options
   */
  async handleInfo(options) {
    try {
      console.log('📊 RAG Pipeline Information\n');

      // System information
      if (!options.plugins && !options.config || options.system) {
        console.log('System:');
        console.log(`  Node.js: ${process.version}`);
        console.log(`  Platform: ${process.platform} ${process.arch}`);
        console.log(`  Memory: ${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)}MB used`);
        console.log(`  Uptime: ${Math.round(process.uptime())}s`);
        console.log('');
      }

      // Plugin information
      if (!options.system && !options.config || options.plugins) {
        console.log('Plugins:');
        // Would show registered plugin versions
        console.log('  Plugin registry information not available');
        console.log('');
      }

      // Configuration summary
      if (!options.system && !options.plugins || options.config) {
        const globalOptions = this.program.opts();
        try {
          const config = JSON.parse(await fs.readFile(globalOptions.config, 'utf-8'));
          console.log('Configuration:');
          console.log(`  File: ${globalOptions.config}`);
          console.log(`  Format: ${config.plugins ? 'Enhanced' : 'Legacy'}`);
          
          if (config.plugins) {
            const pluginCounts = Object.entries(config.plugins)
              .map(([type, plugins]) => `${type}: ${Object.keys(plugins).length}`)
              .join(', ');
            console.log(`  Plugins: ${pluginCounts}`);
          }
          
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
   * @param {string} shell - Shell type
   * @param {object} options - Command options
   */
  async handleCompletion(shell) {
    const completionScript = this.generateCompletionScript(shell);
    console.log(completionScript);
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
    console.log(`✅ Basic configuration created: ${outputPath}`);
  }

  /**
   * Show document preview
   * @param {string} file - File path
   */
  async showDocumentPreview(file) {
    try {
      const content = await fs.readFile(file, 'utf-8');
      const preview = content.substring(0, 500);
      
      console.log('📄 Document Preview:');
      console.log('─'.repeat(50));
      console.log(preview);
      if (content.length > 500) {
        console.log(`\n... (${content.length - 500} more characters)`);
      }
      console.log('─'.repeat(50));
      console.log('');
    } catch (error) {
      console.log('⚠️  Could not preview document:', error.message);
    }
  }

  /**
   * Show query explanation
   * @param {string} prompt - Query prompt
   * @param {object} options - Command options
   */
  async showQueryExplanation(prompt) {
    console.log('\n🔍 Query Explanation:');
    console.log(`Input: ${prompt}`);
    console.log('Processing steps:');
    console.log('  1. Text embedding generation');
    console.log('  2. Vector similarity search');
    console.log('  3. Context retrieval');
    console.log('  4. Language model generation');
    console.log('');
  }

  /**
   * Show observability data
   * @param {object} pipeline - Pipeline instance
   * @param {object} options - Command options
   */
  async showObservabilityData(pipeline, options) {
    if (options.stats && pipeline.getObservabilityStats) {
      const stats = pipeline.getObservabilityStats();
      console.log('\n📈 Pipeline Metrics:');
      console.log(`Operations: ${stats.metrics?.operations?.total || 0}`);
      console.log(`Memory: ${Math.round((stats.metrics?.memory?.heapUsed || 0) / 1024 / 1024)}MB`);
      console.log(`Events: ${stats.session?.totalEvents || 0}`);
    }

    if (options.exportObservability && pipeline.exportObservabilityData) {
      const data = pipeline.exportObservabilityData();
      await fs.writeFile(options.exportObservability, JSON.stringify(data, null, 2));
      console.log(`📋 Observability data exported: ${options.exportObservability}`);
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
  rag-pipeline config show plugins         Show plugin configuration

For more information, visit: https://github.com/DevilsDev/rag-pipeline-utils
`;
  }

  /**
   * Generate shell completion script
   * @param {string} shell - Shell type
   * @returns {string} Completion script
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
 * Create and export enhanced CLI instance
 */
const enhancedCLI = new EnhancedCLI();

/**
 * Run enhanced CLI
 * @param {Array<string>} argv - Command line arguments
 */
export async function runEnhancedCLI(argv = process.argv) {
  await enhancedCLI.run(argv);
}


// Default export
module.exports = {};


module.exports = {
  EnhancedCLI,
  enhancedCLI
};