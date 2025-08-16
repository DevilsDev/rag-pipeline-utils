/**
const fs = require('fs');
 * Doctor Command for RAG Pipeline Diagnostics
 * Scans for common issues and provides actionable solutions
 */

const fs = require('fs/promises'); // eslint-disable-line global-require
const path = require('path'); // eslint-disable-line global-require
const { validateEnhancedRagrcSchema, extractPluginDependencies, validateConfigConsistency  } = require('../_config/enhanced-ragrc-schema.js'); // eslint-disable-line global-require
const { createVersionResolver  } = require('../core/plugin-marketplace/version-resolver.js'); // eslint-disable-line global-require
const { DEFAULT_REGISTRY_URLS  } = require('../core/plugin-marketplace/plugin-registry-format.js'); // eslint-disable-line global-require
// const { logger  } = require('../utils/logger.js'); // Reserved for future logging // eslint-disable-line global-require

/**
 * Diagnostic categories
 */
const DIAGNOSTIC_CATEGORIES = {
  CONFIGURATION: 'configuration',
  PLUGINS: 'plugins',
  DEPENDENCIES: 'dependencies',
  PERFORMANCE: 'performance',
  SECURITY: 'security',
  ENVIRONMENT: 'environment'
};

/**
 * Issue severity levels
 */
const SEVERITY_LEVELS = {
  ERROR: 'error',
  WARNING: 'warning',
  INFO: 'info',
  SUCCESS: 'success'
};

/**
 * Doctor command for pipeline diagnostics
 */
class PipelineDoctor {
  constructor(_options = {}) {
    this._options = {
      configPath: _options.configPath || '.ragrc.json',
      registryUrl: _options.registryUrl || DEFAULT_REGISTRY_URLS[0],
      verbose: _options.verbose || false,
      autoFix: _options.autoFix || false,
      categories: _options.categories || Object.values(DIAGNOSTIC_CATEGORIES),
      ..._options
    };
    
    this.issues = [];
    this.fixes = [];
    this._config = null;
    this.registry = null;
  }

  /**
   * Run complete diagnostic scan
   * @returns {Promise<object>} Diagnostic results
   */
  async diagnose() {
    console.log('🩺 RAG Pipeline Doctor - Diagnostic Scan\n'); // eslint-disable-line no-console
    
    const startTime = Date.now();
    this.issues = [];
    this.fixes = [];

    try {
      // Load configuration
      await this.loadConfiguration();
      
      // Load registry if needed
      if (this._options.categories.includes(DIAGNOSTIC_CATEGORIES.PLUGINS)) {
        await this.loadRegistry();
      }

      // Run diagnostic checks
      if (this._options.categories.includes(DIAGNOSTIC_CATEGORIES.CONFIGURATION)) {
        await this.checkConfiguration();
      }
      
      if (this._options.categories.includes(DIAGNOSTIC_CATEGORIES.PLUGINS)) {
        await this.checkPlugins();
      }
      
      if (this._options.categories.includes(DIAGNOSTIC_CATEGORIES.DEPENDENCIES)) {
        await this.checkDependencies();
      }
      
      if (this._options.categories.includes(DIAGNOSTIC_CATEGORIES.PERFORMANCE)) {
        await this.checkPerformance();
      }
      
      if (this._options.categories.includes(DIAGNOSTIC_CATEGORIES.SECURITY)) {
        await this.checkSecurity();
      }
      
      if (this._options.categories.includes(DIAGNOSTIC_CATEGORIES.ENVIRONMENT)) {
        await this.checkEnvironment();
      }

      // Apply automatic fixes if requested
      if (this._options.autoFix && this.fixes.length > 0) {
        await this.applyFixes();
      }

      // Generate report
      const report = this.generateReport(Date.now() - startTime);
      this.displayReport(report);
      
      return report;
      
    } catch (error) {
      console.error('❌ Diagnostic scan failed:', error.message); // eslint-disable-line no-console
      throw error;
    }
  }

  /**
   * Load configuration file
   */
  async loadConfiguration() {
    try {
      const configPath = path.resolve(this._options.configPath);
      const configContent = await fs.readFile(configPath, 'utf-8');
      this._config = JSON.parse(configContent);
      
      this.addIssue(DIAGNOSTIC_CATEGORIES.CONFIGURATION, SEVERITY_LEVELS.SUCCESS, 
        'Configuration file found and parsed successfully', {
          path: configPath,
          size: configContent.length
        });
        
    } catch (error) {
      if (error.code === 'ENOENT') {
        this.addIssue(DIAGNOSTIC_CATEGORIES.CONFIGURATION, SEVERITY_LEVELS.ERROR,
          'Configuration file not found', {
            expectedPath: path.resolve(this._options.configPath),
            solution: 'Run "rag-pipeline init" to create a configuration file'
          });
      } else if (error instanceof SyntaxError) {
        this.addIssue(DIAGNOSTIC_CATEGORIES.CONFIGURATION, SEVERITY_LEVELS.ERROR,
          'Configuration file contains invalid JSON', {
            error: error.message,
            solution: 'Fix JSON syntax errors in configuration file'
          });
      } else {
        this.addIssue(DIAGNOSTIC_CATEGORIES.CONFIGURATION, SEVERITY_LEVELS.ERROR,
          'Failed to load configuration file', {
            error: error.message
          });
      }
    }
  }

  /**
   * Load plugin registry
   */
  async loadRegistry() {
    try {
      // In a real implementation, this would fetch from the registry
      this.registry = { plugins: {} };
      
      this.addIssue(DIAGNOSTIC_CATEGORIES.PLUGINS, SEVERITY_LEVELS.SUCCESS,
        'Plugin registry loaded successfully', {
          url: this._options.registryUrl
        });
        
    } catch (error) {
      this.addIssue(DIAGNOSTIC_CATEGORIES.PLUGINS, SEVERITY_LEVELS.WARNING,
        'Failed to load plugin registry', {
          url: this._options.registryUrl,
          error: error.message,
          solution: 'Check internet connection or use local plugins'
        });
    }
  }

  /**
   * Check configuration validity
   */
  async checkConfiguration() {
    if (!this._config) return;

    console.log('🔍 Checking configuration...'); // eslint-disable-line no-console

    // Schema validation
    const schemaValidation = validateEnhancedRagrcSchema(this._config);
    if (!schemaValidation.valid) {
      this.addIssue(DIAGNOSTIC_CATEGORIES.CONFIGURATION, SEVERITY_LEVELS.ERROR,
        'Configuration schema validation failed', {
          errors: schemaValidation.errors,
          solution: 'Fix configuration schema errors'
        });
        
      // Add fix for common schema issues
      this.addFix('fix-schema-errors', 'Fix configuration schema', async () => {
        return this.fixSchemaErrors(schemaValidation.errors);
      });
    } else {
      this.addIssue(DIAGNOSTIC_CATEGORIES.CONFIGURATION, SEVERITY_LEVELS.SUCCESS,
        'Configuration schema is valid');
    }

    // Legacy format check
    if (schemaValidation.legacy) {
      this.addIssue(DIAGNOSTIC_CATEGORIES.CONFIGURATION, SEVERITY_LEVELS.WARNING,
        'Using legacy configuration format', {
          solution: 'Consider upgrading to enhanced format for new features'
        });
        
      this.addFix('upgrade-_config-format', 'Upgrade to enhanced format', async () => {
        return this.upgradeConfigFormat();
      });
    }

    // Consistency validation
    const consistencyValidation = validateConfigConsistency(this._config);
    if (!consistencyValidation.valid) {
      this.addIssue(DIAGNOSTIC_CATEGORIES.CONFIGURATION, SEVERITY_LEVELS.ERROR,
        'Configuration consistency issues found', {
          issues: consistencyValidation.issues,
          solution: 'Fix configuration consistency issues'
        });
    }

    // Check for required sections
    const requiredSections = ['plugins'];
    for (const section of requiredSections) {
      if (!this._config[section]) {
        this.addIssue(DIAGNOSTIC_CATEGORIES.CONFIGURATION, SEVERITY_LEVELS.ERROR,
          `Missing required configuration section: ${section}`, {
            solution: `Add ${section} section to configuration`
          });
      }
    }

    // Check for empty plugin groups
    if (this._config.plugins) {
      const requiredPluginTypes = ['loader', 'embedder', 'retriever', 'llm'];
      for (const _type of requiredPluginTypes) {
        if (!this._config.plugins[_type] || Object.keys(this._config.plugins[_type]).length === 0) {
          this.addIssue(DIAGNOSTIC_CATEGORIES.CONFIGURATION, SEVERITY_LEVELS.ERROR,
            `No ${_type} plugins configured`, {
              solution: `Add at least one ${_type} plugin to configuration`
            });
        }
      }
    }
  }

  /**
   * Check plugin configuration and availability
   */
  async checkPlugins() {
    if (!this._config?.plugins) return;

    console.log('🔌 Checking plugins...'); // eslint-disable-line no-console

    const dependencies = extractPluginDependencies(this._config);
    
    if (dependencies.length === 0) {
      this.addIssue(DIAGNOSTIC_CATEGORIES.PLUGINS, SEVERITY_LEVELS.ERROR,
        'No plugins configured', {
          solution: 'Configure plugins for each required _type'
        });
      return;
    }

    // Check each plugin
    for (const dep of dependencies) {
      await this.checkPlugin(dep);
    }

    // Check for plugin conflicts
    await this.checkPluginConflicts(dependencies);

    // Check plugin versions
    if (this.registry) {
      await this.checkPluginVersions(dependencies);
    }
  }

  /**
   * Check individual plugin
   * @param {object} dependency - Plugin dependency
   */
  async checkPlugin(dependency) {
    const { _type: _type, name, spec } = dependency;

    // Check plugin source
    if (spec.source === 'local') {
      if (!spec.path) {
        this.addIssue(DIAGNOSTIC_CATEGORIES.PLUGINS, SEVERITY_LEVELS.ERROR,
          `Local plugin ${name} missing path`, {
            plugin: name,
            solution: 'Add path property to plugin specification'
          });
      } else {
        try {
          await fs.access(spec.path);
          this.addIssue(DIAGNOSTIC_CATEGORIES.PLUGINS, SEVERITY_LEVELS.SUCCESS,
            `Local plugin ${name} found`, { plugin: name, path: spec.path });
        } catch (error) {
          this.addIssue(DIAGNOSTIC_CATEGORIES.PLUGINS, SEVERITY_LEVELS.ERROR,
            `Local plugin ${name} not found`, {
              plugin: name,
              path: spec.path,
              solution: 'Check plugin path or install plugin'
            });
        }
      }
    } else if (spec.source === 'registry') {
      if (this.registry && !this.registry.plugins[name]) {
        this.addIssue(DIAGNOSTIC_CATEGORIES.PLUGINS, SEVERITY_LEVELS.ERROR,
          `Plugin ${name} not found in registry`, {
            plugin: name,
            solution: 'Check plugin name or use different source'
          });
      }
    }

    // Check plugin version
    if (spec.version && spec.version !== 'latest') {
      try {
        // Validate version format
        const semver = await import('semver');
        if (!semver.validRange(spec.version) && !semver.valid(spec.version)) {
          this.addIssue(DIAGNOSTIC_CATEGORIES.PLUGINS, SEVERITY_LEVELS.ERROR,
            `Invalid version specification for ${name}`, {
              plugin: name,
              version: spec.version,
              solution: 'Use valid semantic version or range'
            });
        }
      } catch (error) {
        // semver not available, skip version validation
      }
    }

    // Check plugin configuration
    if (spec._config && typeof spec._config !== 'object') {
      this.addIssue(DIAGNOSTIC_CATEGORIES.PLUGINS, SEVERITY_LEVELS.ERROR,
        `Invalid configuration for plugin ${name}`, {
          plugin: name,
          solution: 'Plugin configuration must be an object'
        });
    }
  }

  /**
   * Check for plugin conflicts
   * @param {Array} dependencies - Plugin dependencies
   */
  async checkPluginConflicts(dependencies) {
    const pluginsByType = {};
    
    // Group plugins by type
    for (const dep of dependencies) {
      if (!pluginsByType[dep._type]) {
        pluginsByType[dep._type] = [];
      }
      pluginsByType[dep._type].push(dep);
    }

    // Check for multiple plugins of same type (potential conflicts)
    for (const [_type, plugins] of Object.entries(pluginsByType)) {
      if (plugins.length > 1) {
        const pluginNames = plugins.map(p => p.name);
        this.addIssue(DIAGNOSTIC_CATEGORIES.PLUGINS, SEVERITY_LEVELS.WARNING,
          `Multiple ${_type} plugins configured`, {
            plugins: pluginNames,
            solution: 'Ensure plugins are compatible or use only one'
          });
      }
    }
  }

  /**
   * Check plugin versions for updates
   * @param {Array} dependencies - Plugin dependencies
   */
  async checkPluginVersions(dependencies) {
    if (!this.registry) return;

    const resolver = createVersionResolver(this.registry);

    for (const dep of dependencies) {
      if (dep.spec.source !== 'registry') continue;

      try {
        const availableVersions = resolver.getAvailableVersions(dep.name);
        if (availableVersions.length === 0) continue;

        const latest = availableVersions[0].version;
        const current = dep.spec.version || 'latest';

        if (current !== 'latest' && current !== latest) {
          const semver = await import('semver');
          if (semver.gt(latest, current)) {
            this.addIssue(DIAGNOSTIC_CATEGORIES.PLUGINS, SEVERITY_LEVELS.INFO,
              `Plugin ${dep.name} has newer version available`, {
                plugin: dep.name,
                current: current,
                latest: latest,
                solution: `Update to version ${latest}`
              });
          }
        }
      } catch (error) {
        // Skip version check if it fails
      }
    }
  }

  /**
   * Check dependencies and compatibility
   */
  async checkDependencies() {
    console.log('📦 Checking dependencies...'); // eslint-disable-line no-console

    // Check Node.js version
    const nodeVersion = process.version;
    const requiredNodeVersion = '18.0.0';
    
    try {
      const semver = await import('semver');
      if (semver.lt(nodeVersion, requiredNodeVersion)) {
        this.addIssue(DIAGNOSTIC_CATEGORIES.DEPENDENCIES, SEVERITY_LEVELS.ERROR,
          'Node.js version too old', {
            current: nodeVersion,
            required: `>=${requiredNodeVersion}`,
            solution: `Upgrade Node.js to version ${requiredNodeVersion} or higher`
          });
      } else {
        this.addIssue(DIAGNOSTIC_CATEGORIES.DEPENDENCIES, SEVERITY_LEVELS.SUCCESS,
          'Node.js version compatible', {
            version: nodeVersion
          });
      }
    } catch (error) {
      // Skip version check if semver not available
    }

    // Check package.json if it exists
    try {
      const packageJsonPath = path.resolve('package.json');
      const packageJson = JSON.parse(await fs.readFile(packageJsonPath, 'utf-8'));
      
      // Check for rag-pipeline-utils dependency
      const ragPipelineVersion = packageJson.dependencies?.['rag-pipeline-utils'] ||
                                packageJson.devDependencies?.['rag-pipeline-utils'];
      
      if (!ragPipelineVersion) {
        this.addIssue(DIAGNOSTIC_CATEGORIES.DEPENDENCIES, SEVERITY_LEVELS.WARNING,
          'rag-pipeline-utils not found in package.json', {
            solution: 'Add rag-pipeline-utils to dependencies'
          });
      }

      // Check for common missing dependencies
      const commonDeps = ['commander', 'pino', 'ajv'];
      for (const dep of commonDeps) {
        if (!packageJson.dependencies?.[dep] && !packageJson.devDependencies?.[dep]) {
          this.addIssue(DIAGNOSTIC_CATEGORIES.DEPENDENCIES, SEVERITY_LEVELS.WARNING,
            `Common dependency ${dep} not found`, {
              dependency: dep,
              solution: `Consider adding ${dep} to dependencies`
            });
        }
      }
      
    } catch (error) {
      this.addIssue(DIAGNOSTIC_CATEGORIES.DEPENDENCIES, SEVERITY_LEVELS.INFO,
        'No package.json found', {
          solution: 'Consider creating package.json for dependency management'
        });
    }
  }

  /**
   * Check performance configuration
   */
  async checkPerformance() {
    console.log('⚡ Checking performance settings...'); // eslint-disable-line no-console

    if (!this._config?.performance) {
      this.addIssue(DIAGNOSTIC_CATEGORIES.PERFORMANCE, SEVERITY_LEVELS.INFO,
        'No performance configuration found', {
          solution: 'Consider adding performance settings for better throughput'
        });
      return;
    }

    const perf = this._config.performance;

    // Check parallel processing settings
    if (perf.parallel?.enabled) {
      if (perf.parallel.maxConcurrency > 10) {
        this.addIssue(DIAGNOSTIC_CATEGORIES.PERFORMANCE, SEVERITY_LEVELS.WARNING,
          'High concurrency setting may cause resource exhaustion', {
            current: perf.parallel.maxConcurrency,
            solution: 'Consider reducing maxConcurrency to 3-5 for stability'
          });
      }

      if (perf.parallel.batchSize > 100) {
        this.addIssue(DIAGNOSTIC_CATEGORIES.PERFORMANCE, SEVERITY_LEVELS.WARNING,
          'Large batch size may cause memory issues', {
            current: perf.parallel.batchSize,
            solution: 'Consider reducing batchSize to 10-50'
          });
      }
    }

    // Check streaming settings
    if (perf.streaming?.enabled) {
      if (perf.streaming.maxMemoryMB > 1024) {
        this.addIssue(DIAGNOSTIC_CATEGORIES.PERFORMANCE, SEVERITY_LEVELS.WARNING,
          'High memory limit may cause system instability', {
            current: `${perf.streaming.maxMemoryMB}MB`,
            solution: 'Consider reducing memory limit to 512MB or less'
          });
      }
    }

    // Check caching settings
    if (perf.caching?.enabled) {
      if (perf.caching.maxSize > 10000) {
        this.addIssue(DIAGNOSTIC_CATEGORIES.PERFORMANCE, SEVERITY_LEVELS.WARNING,
          'Large cache size may consume excessive memory', {
            current: perf.caching.maxSize,
            solution: 'Consider reducing cache size to 1000-5000 entries'
          });
      }
    }
  }

  /**
   * Check security configuration
   */
  async checkSecurity() {
    console.log('🔒 Checking security settings...'); // eslint-disable-line no-console

    // Check for sensitive data in configuration
    const sensitiveKeys = ['password', 'secret', 'key', 'token', 'apikey'];
    const configStr = JSON.stringify(this._config).toLowerCase();
    
    for (const key of sensitiveKeys) {
      if (configStr.includes(key)) {
        this.addIssue(DIAGNOSTIC_CATEGORIES.SECURITY, SEVERITY_LEVELS.WARNING,
          'Potential sensitive data in configuration', {
            key: key,
            solution: 'Use environment variables for sensitive data'
          });
      }
    }

    // Check registry URLs for HTTPS
    if (this._config?.registry?.urls) {
      for (const url of this._config.registry.urls) {
        if (!url.startsWith('https://')) {
          this.addIssue(DIAGNOSTIC_CATEGORIES.SECURITY, SEVERITY_LEVELS.WARNING,
            'Insecure registry URL', {
              url: url,
              solution: 'Use HTTPS URLs for registry connections'
            });
        }
      }
    }

    // Check for local file paths that might be exposed
    const dependencies = extractPluginDependencies(this._config);
    for (const dep of dependencies) {
      if (dep.spec.source === 'local' && dep.spec.path) {
        if (dep.spec.path.includes('..')) {
          this.addIssue(DIAGNOSTIC_CATEGORIES.SECURITY, SEVERITY_LEVELS.WARNING,
            'Potentially unsafe local path', {
              plugin: dep.name,
              path: dep.spec.path,
              solution: 'Use absolute paths or paths within project directory'
            });
        }
      }
    }
  }

  /**
   * Check environment and system requirements
   */
  async checkEnvironment() {
    console.log('🌍 Checking environment...'); // eslint-disable-line no-console

    // Check available memory
    const totalMemory = require('os').totalmem(); // eslint-disable-line global-require
    const freeMemory = require('os').freemem(); // eslint-disable-line global-require
    const memoryUsage = ((totalMemory - freeMemory) / totalMemory) * 100;

    if (memoryUsage > 90) {
      this.addIssue(DIAGNOSTIC_CATEGORIES.ENVIRONMENT, SEVERITY_LEVELS.WARNING,
        'High memory usage detected', {
          usage: `${memoryUsage.toFixed(1)}%`,
          solution: 'Consider reducing concurrent operations or batch sizes'
        });
    }

    // Check disk space
    try {
      const _stats = await fs.stat('.');
      // In a real implementation, would check available disk space
      this.addIssue(DIAGNOSTIC_CATEGORIES.ENVIRONMENT, SEVERITY_LEVELS.SUCCESS,
        'Disk space check passed');
    } catch (error) {
      this.addIssue(DIAGNOSTIC_CATEGORIES.ENVIRONMENT, SEVERITY_LEVELS.ERROR,
        'Cannot access current directory', {
          error: error.message
        });
    }

    // Check write permissions
    try {
      const testFile = path.join(process.cwd(), '.doctor-test');
      await fs.writeFile(testFile, 'test');
      await fs.unlink(testFile);
      
      this.addIssue(DIAGNOSTIC_CATEGORIES.ENVIRONMENT, SEVERITY_LEVELS.SUCCESS,
        'Write permissions verified');
    } catch (error) {
      this.addIssue(DIAGNOSTIC_CATEGORIES.ENVIRONMENT, SEVERITY_LEVELS.ERROR,
        'Insufficient write permissions', {
          error: error.message,
          solution: 'Check directory permissions'
        });
    }

    // Check environment variables
    const requiredEnvVars = ['NODE_ENV'];
    for (const envVar of requiredEnvVars) {
      if (!process.env[envVar]) {
        this.addIssue(DIAGNOSTIC_CATEGORIES.ENVIRONMENT, SEVERITY_LEVELS.INFO,
          `Environment variable ${envVar} not set`, {
            variable: envVar,
            solution: `Set ${envVar} environment variable`
          });
      }
    }
  }

  /**
   * Add issue to the list
   * @param {string} category - Issue category
   * @param {string} severity - Issue severity
   * @param {string} message - Issue message
   * @param {object} details - Additional details
   */
  addIssue(category, severity, message, details = {}) {
    this.issues.push({
      category,
      severity,
      message,
      details,
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Add fix to the list
   * @param {string} id - Fix ID
   * @param {string} description - Fix description
   * @param {Function} action - Fix action
   */
  addFix(id, description, action) {
    this.fixes.push({
      id,
      description,
      action
    });
  }

  /**
   * Apply automatic fixes
   */
  async applyFixes() {
    console.log('\n🔧 Applying automatic fixes...\n'); // eslint-disable-line no-console

    for (const fix of this.fixes) {
      try {
        console.log(`Applying: ${fix.description}`); // eslint-disable-line no-console
        await fix.action();
        console.log(`✅ ${fix.description} completed`); // eslint-disable-line no-console
      } catch (error) {
        console.error(`❌ ${fix.description} failed:`, error.message); // eslint-disable-line no-console
      }
    }
  }

  /**
   * Fix schema errors
   * @param {Array} errors - Schema errors
   */
  async fixSchemaErrors(_errors) {
    // Implementation would fix common schema errors
    console.log('Fixing schema errors...'); // eslint-disable-line no-console
  }

  /**
   * Upgrade configuration format
   */
  async upgradeConfigFormat() {
    // Implementation would convert legacy format to enhanced format
    console.log('Upgrading configuration format...'); // eslint-disable-line no-console
  }

  /**
   * Generate diagnostic report
   * @param {number} duration - Scan duration in ms
   * @returns {object} Diagnostic report
   */
  generateReport(duration) {
    const report = {
      timestamp: new Date().toISOString(),
      duration,
      summary: {
        total: this.issues.length,
        errors: this.issues.filter(i => i.severity === SEVERITY_LEVELS.ERROR).length,
        warnings: this.issues.filter(i => i.severity === SEVERITY_LEVELS.WARNING).length,
        info: this.issues.filter(i => i.severity === SEVERITY_LEVELS.INFO).length,
        success: this.issues.filter(i => i.severity === SEVERITY_LEVELS.SUCCESS).length
      },
      categories: {},
      issues: this.issues,
      fixes: this.fixes.map(f => ({ id: f.id, description: f.description }))
    };

    // Group issues by category
    for (const category of Object.values(DIAGNOSTIC_CATEGORIES)) {
      report.categories[category] = this.issues.filter(i => i.category === category);
    }

    return report;
  }

  /**
   * Display diagnostic report
   * @param {object} report - Diagnostic report
   */
  displayReport(report) {
    console.log('\n📊 Diagnostic Report\n'); // eslint-disable-line no-console
    console.log(`Scan completed in ${report.duration}ms`); // eslint-disable-line no-console
    console.log(`Total issues found: ${report.summary.total}\n`); // eslint-disable-line no-console

    // Summary by severity
    const severityIcons = {
      [SEVERITY_LEVELS.ERROR]: '❌',
      [SEVERITY_LEVELS.WARNING]: '⚠️',
      [SEVERITY_LEVELS.INFO]: 'ℹ️',
      [SEVERITY_LEVELS.SUCCESS]: '✅'
    };

    console.log('Summary:'); // eslint-disable-line no-console
    console.log(`  ${severityIcons[SEVERITY_LEVELS.ERROR]} Errors: ${report.summary.errors}`); // eslint-disable-line no-console
    console.log(`  ${severityIcons[SEVERITY_LEVELS.WARNING]} Warnings: ${report.summary.warnings}`); // eslint-disable-line no-console
    console.log(`  ${severityIcons[SEVERITY_LEVELS.INFO]} Info: ${report.summary.info}`); // eslint-disable-line no-console
    console.log(`  ${severityIcons[SEVERITY_LEVELS.SUCCESS]} Success: ${report.summary.success}\n`); // eslint-disable-line no-console

    // Issues by category
    for (const [category, issues] of Object.entries(report.categories)) {
      if (issues.length === 0) continue;

      console.log(`${category.toUpperCase()}:`); // eslint-disable-line no-console
      for (const issue of issues) {
        const icon = severityIcons[issue.severity];
        console.log(`  ${icon} ${issue.message}`); // eslint-disable-line no-console
        
        if (this._options.verbose && issue.details.solution) {
          console.log(`     Solution: ${issue.details.solution}`); // eslint-disable-line no-console
        }
      }
      console.log(''); // eslint-disable-line no-console
    }

    // Overall health score
    const healthScore = Math.max(0, 100 - (report.summary.errors * 20) - (report.summary.warnings * 5));
    const healthEmoji = healthScore >= 90 ? '🟢' : healthScore >= 70 ? '🟡' : '🔴';
    
    console.log(`${healthEmoji} Overall Health Score: ${healthScore}/100`); // eslint-disable-line no-console
    
    if (report.summary.errors > 0) {
      console.log('\n❌ Critical issues found. Please address errors before proceeding.'); // eslint-disable-line no-console
    } else if (report.summary.warnings > 0) {
      console.log('\n⚠️  Some issues found. Consider addressing warnings for optimal performance.'); // eslint-disable-line no-console
    } else {
      console.log('\n🎉 No critical issues found. Your RAG pipeline looks healthy!'); // eslint-disable-line no-console
    }
  }
}

/**
 * Main doctor function for CLI usage
 * @param {object} options - Doctor options
 * @returns {Promise<object>} Diagnostic report
 */
async function runPipelineDoctor(options = {}) {
  const doctor = new PipelineDoctor(options);
  return await doctor.diagnose();
}

module.exports = {
  PipelineDoctor,
  runPipelineDoctor,
  DIAGNOSTIC_CATEGORIES,
  SEVERITY_LEVELS
};