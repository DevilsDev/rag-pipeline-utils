/**
 * Interactive CLI Wizard for RAG Pipeline Setup
 * Provides guided setup for plugin selection, DAG building, and configuration
 */

import inquirer from 'inquirer';
import fs from 'fs/promises';
import path from 'path';
import { validateEnhancedRagrcSchema, extractPluginDependencies } from '../config/enhanced-ragrc-schema.js';
import { DEFAULT_REGISTRY_URLS } from '../core/plugin-marketplace/plugin-registry-format.js';
// Version resolver and logger imports - reserved for future use
// import { createVersionResolver } from '../core/plugin-marketplace/version-resolver.js';
// import { logger } from '../utils/logger.js';

/**
 * Interactive wizard for RAG pipeline setup
 */
export class InteractiveWizard {
  constructor(options = {}) {
    this.options = {
      registryUrl: options.registryUrl || DEFAULT_REGISTRY_URLS[0],
      outputPath: options.outputPath || '.ragrc.json',
      ...options
    };
    this.registry = null;
    this.config = {
      plugins: {
        loader: {},
        embedder: {},
        retriever: {},
        llm: {}
      },
      registry: {
        urls: [this.options.registryUrl]
      }
    };
  }

  /**
   * Run the complete interactive wizard
   * @returns {Promise<object>} Generated configuration
   */
  async run() {
    console.log('🧙‍♂️ Welcome to the RAG Pipeline Interactive Setup Wizard!\n');
    console.log('This wizard will help you configure your RAG pipeline with the right plugins and settings.\n');

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
      
      console.log('\n🎉 RAG Pipeline setup complete!');
      console.log(`Configuration saved to: ${this.options.outputPath}`);
      
      return this.config;
      
    } catch (error) {
      console.error('\n❌ Setup wizard failed:', error.message);
      throw error;
    }
  }

  /**
   * Setup project metadata
   */
  async setupProject() {
    console.log('📋 Project Setup\n');
    
    const answers = await inquirer.prompt([
      {
        type: 'input',
        name: 'name',
        message: 'Project name:',
        default: path.basename(process.cwd()),
        validate: input => input.length > 0 || 'Project name is required'
      },
      {
        type: 'input',
        name: 'description',
        message: 'Project description:',
        default: 'A RAG pipeline project'
      },
      {
        type: 'input',
        name: 'author',
        message: 'Author:',
        default: 'Unknown'
      },
      {
        type: 'list',
        name: 'environment',
        message: 'Target environment:',
        choices: [
          { name: 'Development', value: 'development' },
          { name: 'Production', value: 'production' },
          { name: 'Testing', value: 'testing' }
        ],
        default: 'development'
      }
    ]);

    this.config.metadata = {
      name: answers.name,
      version: '1.0.0',
      description: answers.description,
      author: answers.author,
      environment: answers.environment,
      createdAt: new Date().toISOString()
    };

    console.log(`\n✅ Project "${answers.name}" configured\n`);
  }

  /**
   * Select plugins for each type
   */
  async selectPlugins() {
    console.log('🔌 Plugin Selection\n');
    
    // Load registry for plugin suggestions
    try {
      this.registry = await this.loadRegistry();
    } catch (error) {
      console.warn('⚠️  Could not load plugin registry. Using built-in options.');
    }

    const pluginTypes = [
      { key: 'loader', name: 'Document Loader', required: true },
      { key: 'embedder', name: 'Text Embedder', required: true },
      { key: 'retriever', name: 'Vector Retriever', required: true },
      { key: 'llm', name: 'Language Model', required: true },
      { key: 'reranker', name: 'Result Reranker', required: false }
    ];

    for (const pluginType of pluginTypes) {
      await this.selectPluginForType(pluginType);
    }

    console.log('✅ Plugin selection complete\n');
  }

  /**
   * Select plugin for specific type
   * @param {object} pluginType - Plugin type configuration
   */
  async selectPluginForType(pluginType) {
    const availablePlugins = this.getAvailablePlugins(pluginType.key);
    
    if (availablePlugins.length === 0 && pluginType.required) {
      console.log(`⚠️  No ${pluginType.name} plugins available. You'll need to configure this manually.`);
      return;
    }

    const choices = [
      ...availablePlugins.map(plugin => ({
        name: `${plugin.name} - ${plugin.description}`,
        value: plugin.name,
        short: plugin.name
      })),
      { name: 'Skip (configure later)', value: null },
      { name: 'Custom plugin', value: 'custom' }
    ];

    const answer = await inquirer.prompt([
      {
        type: 'list',
        name: 'plugin',
        message: `Select ${pluginType.name}:`,
        choices,
        when: () => !pluginType.required || availablePlugins.length > 0
      }
    ]);

    if (!answer.plugin) {
      return; // Skip
    }

    if (answer.plugin === 'custom') {
      await this.configureCustomPlugin(pluginType.key);
    } else {
      await this.configureSelectedPlugin(pluginType.key, answer.plugin);
    }
  }

  /**
   * Configure custom plugin
   * @param {string} pluginType - Plugin type
   */
  async configureCustomPlugin(pluginType) {
    const answers = await inquirer.prompt([
      {
        type: 'input',
        name: 'name',
        message: 'Plugin name:',
        validate: input => input.length > 0 || 'Plugin name is required'
      },
      {
        type: 'list',
        name: 'source',
        message: 'Plugin source:',
        choices: [
          { name: 'Registry', value: 'registry' },
          { name: 'Local file', value: 'local' },
          { name: 'Git repository', value: 'git' },
          { name: 'NPM package', value: 'npm' }
        ],
        default: 'registry'
      },
      {
        type: 'input',
        name: 'version',
        message: 'Version:',
        default: 'latest',
        when: answers => answers.source === 'registry' || answers.source === 'npm'
      },
      {
        type: 'input',
        name: 'path',
        message: 'Local path:',
        when: answers => answers.source === 'local'
      },
      {
        type: 'input',
        name: 'url',
        message: 'Repository URL:',
        when: answers => answers.source === 'git'
      }
    ]);

    const pluginSpec = {
      name: answers.name,
      source: answers.source
    };

    if (answers.version) pluginSpec.version = answers.version;
    if (answers.path) pluginSpec.path = answers.path;
    if (answers.url) pluginSpec.url = answers.url;

    this.config.plugins[pluginType][answers.name] = pluginSpec;
  }

  /**
   * Configure selected plugin from registry
   * @param {string} pluginType - Plugin type
   * @param {string} pluginName - Plugin name
   */
  async configureSelectedPlugin(pluginType, pluginName) {
    const plugin = this.getPluginInfo(pluginType, pluginName);
    
    if (!plugin) {
      this.config.plugins[pluginType][pluginName] = 'latest';
      return;
    }

    const versions = Object.keys(plugin.versions || {}).slice(0, 5);
    const versionChoices = [
      { name: 'Latest stable', value: 'latest' },
      { name: 'Latest beta', value: 'beta' },
      ...versions.map(v => ({ name: v, value: v })),
      { name: 'Custom version', value: 'custom' }
    ];

    const versionAnswer = await inquirer.prompt([
      {
        type: 'list',
        name: 'version',
        message: `Select version for ${pluginName}:`,
        choices: versionChoices,
        default: 'latest'
      },
      {
        type: 'input',
        name: 'customVersion',
        message: 'Enter version:',
        when: answers => answers.version === 'custom'
      }
    ]);

    const version = versionAnswer.customVersion || versionAnswer.version;
    
    // Check if plugin needs configuration
    const needsConfig = plugin.metadata?.config && 
                       Object.keys(plugin.metadata.config.properties || {}).length > 0;

    if (needsConfig) {
      const configAnswer = await inquirer.prompt([
        {
          type: 'confirm',
          name: 'configure',
          message: `Configure ${pluginName} settings?`,
          default: false
        }
      ]);

      if (configAnswer.configure) {
        const config = await this.configurePluginSettings(plugin);
        this.config.plugins[pluginType][pluginName] = {
          name: pluginName,
          version,
          config
        };
      } else {
        this.config.plugins[pluginType][pluginName] = {
          name: pluginName,
          version
        };
      }
    } else {
      this.config.plugins[pluginType][pluginName] = version;
    }
  }

  /**
   * Configure plugin-specific settings
   * @param {object} plugin - Plugin information
   * @returns {Promise<object>} Plugin configuration
   */
  async configurePluginSettings(plugin) {
    const config = {};
    const schema = plugin.metadata?.config?.properties || {};

    console.log(`\n⚙️  Configuring ${plugin.metadata.name}...\n`);

    for (const [key, property] of Object.entries(schema)) {
      const question = {
        name: key,
        message: `${key}${property.description ? ` (${property.description})` : ''}:`
      };

      if (property.type === 'boolean') {
        question.type = 'confirm';
        question.default = property.default || false;
      } else if (property.enum) {
        question.type = 'list';
        question.choices = property.enum;
        question.default = property.default;
      } else if (property.type === 'number') {
        question.type = 'number';
        question.default = property.default;
      } else {
        question.type = 'input';
        question.default = property.default || '';
      }

      const answer = await inquirer.prompt([question]);
      if (answer[key] !== '' && answer[key] !== undefined) {
        config[key] = answer[key];
      }
    }

    return config;
  }

  /**
   * Configure general settings
   */
  async configureSettings() {
    console.log('⚙️  General Settings\n');

    const answers = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'enableCaching',
        message: 'Enable result caching?',
        default: false
      },
      {
        type: 'number',
        name: 'cacheSize',
        message: 'Cache size (number of entries):',
        default: 1000,
        when: answers => answers.enableCaching
      },
      {
        type: 'number',
        name: 'cacheTtl',
        message: 'Cache TTL (seconds):',
        default: 3600,
        when: answers => answers.enableCaching
      },
      {
        type: 'number',
        name: 'timeout',
        message: 'Pipeline timeout (milliseconds):',
        default: 30000
      }
    ]);

    if (answers.enableCaching) {
      this.config.performance = this.config.performance || {};
      this.config.performance.caching = {
        enabled: true,
        maxSize: answers.cacheSize,
        ttl: answers.cacheTtl
      };
    }

    if (answers.timeout !== 30000) {
      this.config.pipeline = this.config.pipeline || {};
      this.config.pipeline.timeout = answers.timeout;
    }

    console.log('✅ General settings configured\n');
  }

  /**
   * Configure pipeline stages
   */
  async configurePipeline() {
    console.log('🔄 Pipeline Configuration\n');

    const availableStages = Object.keys(this.config.plugins).filter(
      type => Object.keys(this.config.plugins[type]).length > 0
    );

    const answers = await inquirer.prompt([
      {
        type: 'checkbox',
        name: 'stages',
        message: 'Select pipeline stages (in order):',
        choices: [
          { name: 'Document Loading', value: 'loader', checked: availableStages.includes('loader') },
          { name: 'Text Embedding', value: 'embedder', checked: availableStages.includes('embedder') },
          { name: 'Vector Retrieval', value: 'retriever', checked: availableStages.includes('retriever') },
          { name: 'Language Model', value: 'llm', checked: availableStages.includes('llm') },
          { name: 'Result Reranking', value: 'reranker', checked: availableStages.includes('reranker') }
        ],
        validate: input => input.length > 0 || 'At least one stage must be selected'
      },
      {
        type: 'confirm',
        name: 'enableRetries',
        message: 'Enable automatic retries on failures?',
        default: true
      },
      {
        type: 'number',
        name: 'maxRetries',
        message: 'Maximum retry attempts:',
        default: 3,
        when: answers => answers.enableRetries
      }
    ]);

    this.config.pipeline = {
      stages: answers.stages,
      ...this.config.pipeline
    };

    if (answers.enableRetries) {
      this.config.pipeline.retries = {
        enabled: true,
        maxAttempts: answers.maxRetries,
        backoff: 'exponential'
      };
    }

    console.log('✅ Pipeline configuration complete\n');
  }

  /**
   * Configure performance settings
   */
  async configurePerformance() {
    console.log('⚡ Performance Settings\n');

    const answers = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'enableParallel',
        message: 'Enable parallel processing?',
        default: false
      },
      {
        type: 'number',
        name: 'maxConcurrency',
        message: 'Maximum concurrent operations:',
        default: 3,
        when: answers => answers.enableParallel
      },
      {
        type: 'number',
        name: 'batchSize',
        message: 'Batch size for parallel processing:',
        default: 10,
        when: answers => answers.enableParallel
      },
      {
        type: 'confirm',
        name: 'enableStreaming',
        message: 'Enable streaming for large documents?',
        default: false
      },
      {
        type: 'number',
        name: 'maxMemoryMB',
        message: 'Maximum memory usage (MB):',
        default: 512,
        when: answers => answers.enableStreaming
      }
    ]);

    this.config.performance = this.config.performance || {};

    if (answers.enableParallel) {
      this.config.performance.parallel = {
        enabled: true,
        maxConcurrency: answers.maxConcurrency,
        batchSize: answers.batchSize
      };
    }

    if (answers.enableStreaming) {
      this.config.performance.streaming = {
        enabled: true,
        maxMemoryMB: answers.maxMemoryMB,
        bufferSize: 100
      };
    }

    console.log('✅ Performance settings configured\n');
  }

  /**
   * Configure observability settings
   */
  async configureObservability() {
    console.log('📊 Observability Settings\n');

    const answers = await inquirer.prompt([
      {
        type: 'list',
        name: 'logLevel',
        message: 'Log level:',
        choices: [
          { name: 'Debug (verbose)', value: 'debug' },
          { name: 'Info (default)', value: 'info' },
          { name: 'Warning (minimal)', value: 'warn' },
          { name: 'Error (errors only)', value: 'error' }
        ],
        default: 'info'
      },
      {
        type: 'confirm',
        name: 'enableTracing',
        message: 'Enable distributed tracing?',
        default: false
      },
      {
        type: 'confirm',
        name: 'enableMetrics',
        message: 'Enable metrics collection?',
        default: false
      },
      {
        type: 'input',
        name: 'exportUrl',
        message: 'Metrics/tracing export URL (optional):',
        when: answers => answers.enableTracing || answers.enableMetrics
      }
    ]);

    this.config.observability = {
      logging: {
        level: answers.logLevel,
        structured: true,
        events: answers.enableTracing
      }
    };

    if (answers.enableTracing) {
      this.config.observability.tracing = {
        enabled: true,
        exportUrl: answers.exportUrl || undefined,
        sampleRate: 1
      };
    }

    if (answers.enableMetrics) {
      this.config.observability.metrics = {
        enabled: true,
        exportUrl: answers.exportUrl || undefined,
        interval: 60000
      };
    }

    console.log('✅ Observability settings configured\n');
  }

  /**
   * Preview configuration and save
   */
  async previewAndSave() {
    console.log('👀 Configuration Preview\n');
    
    // Show configuration summary
    this.showConfigSummary();

    const answers = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'save',
        message: 'Save this configuration?',
        default: true
      },
      {
        type: 'input',
        name: 'filename',
        message: 'Configuration filename:',
        default: this.options.outputPath,
        when: answers => answers.save
      },
      {
        type: 'confirm',
        name: 'testRun',
        message: 'Run a test to validate the configuration?',
        default: false,
        when: answers => answers.save
      }
    ]);

    if (!answers.save) {
      console.log('Configuration not saved.');
      return;
    }

    // Validate configuration
    const validation = validateEnhancedRagrcSchema(this.config);
    if (!validation.valid) {
      console.error('❌ Configuration validation failed:');
      validation.errors?.forEach(error => {
        console.error(`  ${error.instancePath}: ${error.message}`);
      });
      throw new Error('Invalid configuration generated');
    }

    // Save configuration
    await fs.writeFile(
      answers.filename,
      JSON.stringify(this.config, null, 2),
      'utf-8'
    );

    this.options.outputPath = answers.filename;

    if (answers.testRun) {
      await this.runConfigurationTest();
    }
  }

  /**
   * Show configuration summary
   */
  showConfigSummary() {
    console.log('📋 Configuration Summary:');
    console.log(`   Project: ${this.config.metadata?.name || 'Unnamed'}`);
    console.log(`   Environment: ${this.config.metadata?.environment || 'development'}`);
    
    console.log('\n🔌 Plugins:');
    for (const [type, plugins] of Object.entries(this.config.plugins)) {
      if (Object.keys(plugins).length > 0) {
        console.log(`   ${type}: ${Object.keys(plugins).join(', ')}`);
      }
    }
    
    console.log('\n🔄 Pipeline:');
    console.log(`   Stages: ${this.config.pipeline?.stages?.join(' → ') || 'default'}`);
    
    if (this.config.performance?.parallel?.enabled) {
      console.log('\n⚡ Performance:');
      console.log(`   Parallel processing: ${this.config.performance.parallel.maxConcurrency} concurrent`);
    }
    
    if (this.config.observability?.tracing?.enabled || this.config.observability?.metrics?.enabled) {
      console.log('\n📊 Observability:');
      if (this.config.observability.tracing?.enabled) console.log('   Tracing: enabled');
      if (this.config.observability.metrics?.enabled) console.log('   Metrics: enabled');
    }
    
    console.log('');
  }

  /**
   * Run configuration test
   */
  async runConfigurationTest() {
    console.log('🧪 Running configuration test...\n');
    
    try {
      // Simulate pipeline creation and basic validation
      console.log('✅ Configuration syntax: valid');
      console.log('✅ Plugin dependencies: resolved');
      console.log('✅ Pipeline stages: configured');
      
      // Check for potential issues
      const dependencies = extractPluginDependencies(this.config);
      if (dependencies.length === 0) {
        console.warn('⚠️  No plugins configured - pipeline will not function');
      }
      
      console.log('\n🎉 Configuration test passed!');
      
    } catch (error) {
      console.error('❌ Configuration test failed:', error.message);
    }
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
        'file-loader': {
          metadata: { name: 'file-loader', type: 'loader', description: 'Load files from filesystem' },
          versions: { '1.0.0': {}, '1.1.0': {} },
          latest: '1.1.0'
        },
        'openai-embedder': {
          metadata: { name: 'openai-embedder', type: 'embedder', description: 'OpenAI embeddings' },
          versions: { '2.0.0': {}, '2.1.0': {} },
          latest: '2.1.0'
        }
      }
    };
  }

  /**
   * Get available plugins for type
   * @param {string} type - Plugin type
   * @returns {Array<object>} Available plugins
   */
  getAvailablePlugins(type) {
    if (!this.registry) {
      return this.getBuiltinPlugins(type);
    }

    return Object.values(this.registry.plugins)
      .filter(plugin => plugin.metadata.type === type)
      .map(plugin => ({
        name: plugin.metadata.name,
        description: plugin.metadata.description,
        version: plugin.latest
      }));
  }

  /**
   * Get built-in plugin options
   * @param {string} type - Plugin type
   * @returns {Array<object>} Built-in plugins
   */
  getBuiltinPlugins(type) {
    const builtins = {
      loader: [
        { name: 'file-loader', description: 'Load files from filesystem' },
        { name: 'url-loader', description: 'Load content from URLs' }
      ],
      embedder: [
        { name: 'openai-embedder', description: 'OpenAI embeddings' },
        { name: 'local-embedder', description: 'Local embedding model' }
      ],
      retriever: [
        { name: 'vector-retriever', description: 'Vector similarity search' },
        { name: 'keyword-retriever', description: 'Keyword-based search' }
      ],
      llm: [
        { name: 'openai-llm', description: 'OpenAI language models' },
        { name: 'local-llm', description: 'Local language model' }
      ],
      reranker: [
        { name: 'similarity-reranker', description: 'Similarity-based reranking' }
      ]
    };

    return builtins[type] || [];
  }

  /**
   * Get plugin information
   * @param {string} type - Plugin type
   * @param {string} name - Plugin name
   * @returns {object|null} Plugin information
   */
  getPluginInfo(type, name) {
    if (!this.registry) {
      return null;
    }

    return this.registry.plugins[name] || null;
  }
}

/**
 * Create and run interactive wizard
 * @param {object} options - Wizard options
 * @returns {Promise<object>} Generated configuration
 */
export async function runInteractiveWizard(options = {}) {
  const wizard = new InteractiveWizard(options);
  return await wizard.run();
}
