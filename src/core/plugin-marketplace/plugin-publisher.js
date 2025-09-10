/**
const fs = require('fs');
 * Plugin Publishing System
 * Handles plugin packaging, validation, and publishing to registries
 */

const fs = require('fs/promises');
// eslint-disable-line global-require
const path = require('path');
// eslint-disable-line global-require
const crypto = require('crypto');
// eslint-disable-line global-require
const {
  metadataExtractor,
  metadataValidator,
} = require('./plugin-metadata.js');
// eslint-disable-line global-require
const {
  validatePluginRegistry,
  createEmptyRegistry,
} = require('./plugin-registry-format.js');
// eslint-disable-line global-require
const { VersionUtils } = require('./version-resolver.js');
// eslint-disable-line global-require

/**
 * Plugin publisher for marketplace publishing
 */
class PluginPublisher {
  constructor(_options = {}) {
    this._options = {
      registryUrl: _options.registryUrl || 'https://registry.rag-pipeline.dev',
      authToken: _options.authToken,
      timeout: _options.timeout || 30000,
      dryRun: _options.dryRun || false,
      ..._options,
    };
  }

  /**
   * Publish plugin to registry
   * @param {string} pluginPath - Path to plugin directory
   * @param {object} publishOptions - Publishing _options
   * @returns {Promise<object>} Publishing result
   */
  async publishPlugin(pluginPath, publishOptions = {}) {
    const startTime = Date.now();

    try {
      // Step 1: Validate plugin structure
      console.log('📋 Validating plugin structure...'); // eslint-disable-line no-console
      const validation = await this.validatePluginStructure(pluginPath);
      if (!validation.valid) {
        throw new Error(
          `Plugin validation failed: ${validation.errors.join(', ')}`,
        );
      }

      // Step 2: Extract and validate metadata
      console.log('🔍 Extracting plugin metadata...'); // eslint-disable-line no-console
      const metadata = await this.extractPluginMetadata(pluginPath);

      // Step 3: Package plugin
      console.log('📦 Packaging plugin...'); // eslint-disable-line no-console
      const packageInfo = await this.packagePlugin(
        pluginPath,
        metadata,
        publishOptions,
      );

      // Step 4: Upload to registry (unless dry run)
      if (this._options.dryRun) {
        console.log('🧪 Dry run - skipping actual upload'); // eslint-disable-line no-console
        return {
          success: true,
          dryRun: true,
          metadata,
          packageInfo,
          duration: Date.now() - startTime,
        };
      }

      console.log('🚀 Publishing to registry...'); // eslint-disable-line no-console
      const publishResult = await this.uploadToRegistry(
        packageInfo,
        metadata,
        publishOptions,
      );

      console.log(
        `✅ Plugin '${metadata.name}@${metadata.version}' published successfully!`,
      ); // eslint-disable-line no-console

      return {
        success: true,
        metadata,
        packageInfo,
        publishResult,
        duration: Date.now() - startTime,
      };
    } catch (error) {
      console.error(`❌ Publishing failed: ${error.message}`); // eslint-disable-line no-console
      return {
        success: false,
        error: error.message,
        duration: Date.now() - startTime,
      };
    }
  }

  /**
   * Validate plugin directory structure
   * @param {string} pluginPath - Plugin directory path
   * @returns {Promise<{valid: boolean, errors: Array<string>}>}
   */
  async validatePluginStructure(pluginPath) {
    const errors = [];

    try {
      const stats = await fs.stat(pluginPath);
      if (!stats.isDirectory()) {
        errors.push('Plugin path must be a directory');
        return { valid: false, errors };
      }
    } catch (error) {
      errors.push(`Plugin directory not found: ${pluginPath}`);
      return { valid: false, errors };
    }

    // Check for required files
    const requiredFiles = ['index.js', 'package.json'];
    for (const file of requiredFiles) {
      const _filePath = path.join(pluginPath, file);
      try {
        await fs.access(_filePath);
      } catch (error) {
        errors.push(`Required file missing: ${file}`);
      }
    }

    // Check for recommended files
    const recommendedFiles = ['README.md', 'LICENSE'];
    for (const file of recommendedFiles) {
      const _filePath = path.join(pluginPath, file);
      try {
        await fs.access(_filePath);
      } catch (error) {
        console.warn(`⚠️  Recommended file missing: ${file}`); // eslint-disable-line no-console
      }
    }

    // Validate package.json structure
    try {
      const packageJsonPath = path.join(pluginPath, 'package.json');
      const packageJson = JSON.parse(
        await fs.readFile(packageJsonPath, 'utf-8'),
      );

      if (!packageJson.name) {
        errors.push('package.json missing name field');
      }

      if (!packageJson.version) {
        errors.push('package.json missing version field');
      }

      if (!packageJson.main && !packageJson.exports) {
        errors.push('package.json missing main or exports field');
      }
    } catch (error) {
      errors.push(`Invalid package.json: ${error.message}`);
    }

    return { valid: errors.length === 0, errors };
  }

  /**
   * Extract plugin metadata from directory
   * @param {string} pluginPath - Plugin directory path
   * @returns {Promise<object>} Plugin metadata
   */
  async extractPluginMetadata(pluginPath) {
    // Load plugin module
    const pluginIndexPath = path.join(pluginPath, 'index.js');
    const pluginModule = await import(pluginIndexPath);

    // Load package.json for additional metadata
    const packageJsonPath = path.join(pluginPath, 'package.json');
    const packageJson = JSON.parse(await fs.readFile(packageJsonPath, 'utf-8'));

    // Determine plugin type from package.json or metadata
    let pluginType = null;
    if (packageJson.keywords) {
      const typeKeywords = [
        'loader',
        'embedder',
        'retriever',
        'llm',
        'reranker',
      ];
      pluginType = packageJson.keywords.find((k) => typeKeywords.includes(k));
    }

    if (!pluginType) {
      throw new Error(
        'Cannot determine plugin _type. Add plugin _type to package.json keywords or metadata.',
      );
    }

    // Extract metadata using the extractor
    const extractedMetadata = metadataExtractor.extractMetadata(
      pluginModule,
      pluginType,
    );

    // Merge with package.json data
    const mergedMetadata = {
      ...extractedMetadata,
      name: packageJson.name || extractedMetadata.name,
      version: packageJson.version || extractedMetadata.version,
      description: packageJson.description || extractedMetadata.description,
      author: packageJson.author || extractedMetadata.author,
      homepage: packageJson.homepage || extractedMetadata.homepage,
      repository: packageJson.repository || extractedMetadata.repository,
      license: packageJson.license || extractedMetadata.license,
      keywords: [
        ...(packageJson.keywords || []),
        ...(extractedMetadata.keywords || []),
      ],
      dependencies:
        packageJson.dependencies || extractedMetadata.dependencies || {},
      peerDependencies:
        packageJson.peerDependencies ||
        extractedMetadata.peerDependencies ||
        {},
    };

    // Validate merged metadata
    const validation = metadataValidator.validatePlugin(
      pluginType,
      mergedMetadata.name,
      pluginModule,
    );
    if (!validation.valid) {
      throw new Error(`Metadata validation failed: ${validation.error}`);
    }

    // Show warnings
    if (validation.warnings.length > 0) {
      console.warn('⚠️  Metadata warnings:'); // eslint-disable-line no-console
      validation.warnings.forEach((warning) => console.warn(`   ${warning}`)); // eslint-disable-line no-console
    }

    return mergedMetadata;
  }

  /**
   * Package plugin for distribution
   * @param {string} pluginPath - Plugin directory path
   * @param {object} metadata - Plugin metadata
   * @param {object} _options - Packaging _options
   * @returns {Promise<object>} Package information
   */
  async packagePlugin(pluginPath, metadata, _options) {
    const packageName = `${metadata.name}-${metadata.version}.tgz`;
    const packagePath = path.join(
      _options.outputDir || pluginPath,
      packageName,
    );

    // Create package archive (simplified - in real implementation would use tar)
    const packageFiles = await this.collectPackageFiles(pluginPath, _options);

    // Calculate package size and integrity hash
    const packageSize = await this.calculatePackageSize(packageFiles);
    const integrity = await this.calculateIntegrity(packageFiles);

    return {
      name: packageName,
      path: packagePath,
      size: packageSize,
      integrity,
      files: packageFiles.map((f) => f.relativePath),
    };
  }

  /**
   * Collect files to include in package
   * @param {string} pluginPath - Plugin directory path
   * @param {object} _options - Collection _options
   * @returns {Promise<Array<object>>} Package files
   */
  async collectPackageFiles(pluginPath, _options) {
    const files = [];
    const excludePatterns = _options.exclude || [
      'node_modules',
      '.git',
      '.DS_Store',
      '*.log',
      'coverage',
      '.nyc_output',
      'test',
      'tests',
      '__tests__',
      '*.test.js',
      '*.spec.js',
    ];

    const collectDir = async (dir, relativePath = '') => {
      const entries = await fs.readdir(dir, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        const relPath = path.join(relativePath, entry.name);

        // Check exclude patterns
        if (
          excludePatterns.some((pattern) => {
            if (pattern.includes('*')) {
              return relPath.match(new RegExp(pattern.replace('*', '.*')));
            }
            return relPath.includes(pattern);
          })
        ) {
          continue;
        }

        if (entry.isDirectory()) {
          await collectDir(fullPath, relPath);
        } else {
          const stats = await fs.stat(fullPath);
          files.push({
            fullPath,
            relativePath: relPath,
            size: stats.size,
          });
        }
      }
    };

    await collectDir(pluginPath);
    return files;
  }

  /**
   * Calculate total package size
   * @param {Array<object>} files - Package files
   * @returns {number} Total size in bytes
   */
  async calculatePackageSize(files) {
    return files.reduce((total, file) => total + file.size, 0);
  }

  /**
   * Calculate package integrity hash
   * @param {Array<object>} files - Package files
   * @returns {Promise<string>} SHA-256 hash
   */
  async calculateIntegrity(files) {
    const hash = crypto.createHash('sha256');

    // Sort files by path for consistent hashing
    const sortedFiles = files.sort((a, b) =>
      a.relativePath.localeCompare(b.relativePath),
    );

    for (const file of sortedFiles) {
      const content = await fs.readFile(file.fullPath);
      hash.update(file.relativePath);
      hash.update(content);
    }

    return `sha256-${hash.digest('base64')}`;
  }

  /**
   * Upload package to registry
   * @param {object} packageInfo - Package information
   * @param {object} metadata - Plugin metadata
   * @param {object} _options - Upload _options
   * @returns {Promise<object>} Upload result
   */
  async uploadToRegistry(packageInfo, metadata, _options) {
    // In a real implementation, this would make HTTP requests to the registry API
    // For now, we'll simulate the upload process

    const uploadUrl = `${this._options.registryUrl}/api/plugins/${metadata.name}/versions/${metadata.version}`;

    // Simulate upload delay
    await new Promise((resolve) => setTimeout(resolve, 1000));

    return {
      uploadUrl,
      downloadUrl: `${this._options.registryUrl}/packages/${metadata.name}/${packageInfo.name}`,
      publishedAt: new Date().toISOString(),
      integrity: packageInfo.integrity,
      size: packageInfo.size,
    };
  }

  /**
   * Update local registry with published plugin
   * @param {string} registryPath - Local registry file path
   * @param {object} metadata - Plugin metadata
   * @param {object} publishResult - Publishing result
   * @returns {Promise<void>}
   */
  async updateLocalRegistry(registryPath, metadata, publishResult) {
    let registry;

    try {
      const registryContent = await fs.readFile(registryPath, 'utf-8');
      registry = JSON.parse(registryContent);
    } catch (error) {
      // Create new registry if file doesn't exist
      registry = createEmptyRegistry();
    }

    // Add or update plugin entry
    if (!registry.plugins[metadata.name]) {
      registry.plugins[metadata.name] = {
        metadata,
        versions: {},
        latest: metadata.version,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
    }

    const pluginEntry = registry.plugins[metadata.name];

    // Add new version
    pluginEntry.versions[metadata.version] = {
      version: metadata.version,
      publishedAt: publishResult.publishedAt,
      downloadUrl: publishResult.downloadUrl,
      integrity: publishResult.integrity,
      size: publishResult.size,
    };

    // Update latest version if this is newer
    if (
      !pluginEntry.latest ||
      VersionUtils.compareVersions(metadata.version, pluginEntry.latest) > 0
    ) {
      pluginEntry.latest = metadata.version;
    }

    // Update timestamps
    pluginEntry.updatedAt = new Date().toISOString();
    registry.updatedAt = new Date().toISOString();

    // Validate registry before saving
    const validation = validatePluginRegistry(registry);
    if (!validation.valid) {
      throw new Error(
        `Registry validation failed: ${validation.errors.map((e) => e.message).join(', ')}`,
      );
    }

    // Save updated registry
    await fs.writeFile(registryPath, JSON.stringify(registry, null, 2));
  }
}

/**
 * Plugin publishing utilities
 */
const PublishingUtils = {
  /**
   * Generate GitHub Action workflow for automated publishing
   * @param {object} _options - Workflow _options
   * @returns {string} GitHub Action YAML
   */
  generateGitHubAction(_options = {}) {
    return `name: Publish Plugin

on:
  release:
    types: [published]
  workflow_dispatch:
    inputs:
      version:
        description: 'Version to publish'
        required: true
        default: 'latest'

jobs:
  publish:
    runs-on: ubuntu-latest
    
    steps:
    - name: Checkout code
      uses: actions/checkout@v3
      
    - name: Setup Node.js
      uses: actions/setup-node@v3
      with:
        node-version: '18'
        
    - name: Install dependencies
      run: npm ci
      
    - name: Run tests
      run: npm test
      
    - name: Publish plugin
      run: |
        npx rag-pipeline publish \\
          --registry-url \${{ secrets.REGISTRY_URL || 'https://registry.rag-pipeline.dev' }} \\
          --auth-token \${{ secrets.REGISTRY_TOKEN }} \\
          --version \${{ github.event.inputs.version || github.event.release.tag_name }}
      env:
        NODE_ENV: production
`;
  },

  /**
   * Generate plugin publishing checklist
   * @param {object} metadata - Plugin metadata
   * @returns {Array<string>} Checklist items
   */
  generatePublishingChecklist(_metadata) {
    return [
      '📋 Plugin metadata is complete and valid',
      '🧪 All tests are passing',
      '📚 Documentation is up to date',
      '🔖 Version number follows semantic versioning',
      '📄 LICENSE file is present',
      '📖 README.md includes usage examples',
      '🏷️  Keywords are relevant and descriptive',
      '🔗 Repository URL is accessible',
      '🏠 Homepage URL is valid (if provided)',
      '📦 Package size is reasonable (< 10MB recommended)',
      '🔒 No sensitive information in code',
      '✅ Plugin works with latest rag-pipeline-utils version',
    ];
  },

  /**
   * Validate plugin before publishing
   * @param {string} pluginPath - Plugin directory path
   * @returns {Promise<{ready: boolean, issues: Array<string>}>}
   */
  async validateForPublishing(pluginPath) {
    const publisher = new PluginPublisher({ dryRun: true });
    const result = await publisher.publishPlugin(pluginPath);

    if (result.success) {
      return { ready: true, issues: [] };
    } else {
      return { ready: false, issues: [result.error] };
    }
  },
};

// Export default publisher instance
const pluginPublisher = new PluginPublisher();

// Default export

module.exports = {
  PluginPublisher,
  PublishingUtils,
  pluginPublisher,
};
