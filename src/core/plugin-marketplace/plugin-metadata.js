/**
 * Plugin Metadata Export System
 * Requires all plugins to export standardized metadata for marketplace compatibility
 */

const { validatePluginMetadata, PLUGIN_NAMING  } = require('./plugin-registry-format.js');
const { VersionUtils  } = require('./version-resolver.js');

/**
 * Plugin metadata extractor and validator
 */
class PluginMetadataExtractor {
  constructor() {
    this.requiredFields = ['name', 'version', 'type', 'description', 'author'];
    this.optionalFields = ['homepage', 'repository', 'keywords', 'license', 'engines', 'dependencies', 'peerDependencies', 'config', 'examples', 'tags'];
  }

  /**
   * Extract metadata from plugin module
   * @param {object} pluginModule - Plugin module or class
   * @param {string} pluginType - Plugin type (loader, embedder, etc.)
   * @returns {object} Extracted metadata
   */
  extractMetadata(pluginModule, pluginType) {
    // Try different metadata export patterns
    let metadata = null;

    // Pattern 1: Static metadata property
    if (pluginModule.metadata) {
      metadata = pluginModule.metadata;
    }
    // Pattern 2: getMetadata() method
    else if (typeof pluginModule.getMetadata === 'function') {
      metadata = pluginModule.getMetadata();
    }
    // Pattern 3: Class constructor with static metadata
    else if (typeof pluginModule === 'function' && pluginModule.prototype && pluginModule.constructor.metadata) {
      metadata = pluginModule.constructor.metadata;
    }
    // Pattern 4: Default export with metadata
    else if (pluginModule.default && pluginModule.default.metadata) {
      metadata = pluginModule.default.metadata;
    }
    // Pattern 5: Package.json style metadata
    else if (pluginModule.package) {
      metadata = this.convertPackageJsonMetadata(pluginModule.package, pluginType);
    }

    if (!metadata) {
      throw new Error('Plugin does not export required metadata. Please add a \'metadata\' property or \'getMetadata()\' method.');
    }

    // Ensure type is set correctly
    if (!metadata.type) {
      metadata.type = pluginType;
    } else if (metadata.type !== pluginType) {
      throw new Error(`Plugin metadata type '${metadata.type}' does not match expected type '${pluginType}'`);
    }

    return this.validateAndNormalizeMetadata(metadata);
  }

  /**
   * Convert package.json style metadata to plugin metadata format
   * @param {object} packageData - Package.json data
   * @param {string} pluginType - Plugin type
   * @returns {object} Plugin metadata
   */
  convertPackageJsonMetadata(packageData, pluginType) {
    return {
      name: packageData.name,
      version: packageData.version,
      type: pluginType,
      description: packageData.description,
      author: typeof packageData.author === 'string' ? packageData.author : packageData.author?.name,
      homepage: packageData.homepage,
      repository: packageData.repository,
      keywords: packageData.keywords,
      license: packageData.license,
      engines: packageData.engines,
      dependencies: packageData.dependencies,
      peerDependencies: packageData.peerDependencies
    };
  }

  /**
   * Validate and normalize plugin metadata
   * @param {object} metadata - Raw metadata
   * @returns {object} Validated and normalized metadata
   */
  validateAndNormalizeMetadata(metadata) {
    // Validate required fields
    for (const field of this.requiredFields) {
      if (!metadata[field]) {
        throw new Error(`Plugin metadata missing required field: ${field}`);
      }
    }

    // Validate plugin name
    const nameValidation = PLUGIN_NAMING.validateName(metadata.name);
    if (!nameValidation.valid) {
      throw new Error(`Invalid plugin name: ${nameValidation.reason}`);
    }

    // Validate version format
    if (!VersionUtils.parseVersion(metadata.version)) {
      throw new Error(`Invalid version format: ${metadata.version}`);
    }

    // Validate using schema
    const schemaValidation = validatePluginMetadata(metadata);
    if (!schemaValidation.valid) {
      const errors = schemaValidation.errors.map(err => `${err.instancePath}: ${err.message}`).join(', ');
      throw new Error(`Plugin metadata validation failed: ${errors}`);
    }

    // Normalize and set defaults
    const normalized = {
      ...metadata,
      keywords: metadata.keywords || [],
      tags: metadata.tags || [],
      engines: metadata.engines || {},
      dependencies: metadata.dependencies || {},
      peerDependencies: metadata.peerDependencies || {},
      config: metadata.config || {},
      examples: metadata.examples || []
    };

    // Add automatic tags based on plugin characteristics
    normalized.tags = this.addAutomaticTags(normalized);

    return normalized;
  }

  /**
   * Add automatic tags based on plugin characteristics
   * @param {object} metadata - Plugin metadata
   * @returns {Array<string>} Updated tags
   */
  addAutomaticTags(metadata) {
    const tags = new Set(metadata.tags || []);

    // Add type-based tag
    tags.add(metadata.type);

    // Add version stability tags
    const version = VersionUtils.parseVersion(metadata.version);
    if (version.isPrerelease) {
      if (version.prerelease[0] === 'alpha') {
        tags.add('alpha');
      } else if (version.prerelease[0] === 'beta') {
        tags.add('beta');
      } else {
        tags.add('prerelease');
      }
    } else {
      tags.add('stable');
    }

    // Add dependency-based tags
    if (Object.keys(metadata.dependencies).length === 0) {
      tags.add('zero-dependencies');
    }

    // Add feature tags based on config schema
    if (metadata.config && Object.keys(metadata.config).length > 0) {
      tags.add('configurable');
    }

    // Add example tags
    if (metadata.examples && metadata.examples.length > 0) {
      tags.add('documented');
    }

    return Array.from(tags);
  }

  /**
   * Generate plugin manifest for publishing
   * @param {object} metadata - Plugin metadata
   * @param {object} options - Generation options
   * @returns {object} Plugin manifest
   */
  generateManifest(metadata, options = {}) {
    const manifest = {
      ...metadata,
      publishedAt: new Date().toISOString(),
      integrity: options.integrity,
      size: options.size,
      downloadUrl: options.downloadUrl
    };

    // Add build information if available
    if (options.buildInfo) {
      manifest.build = {
        timestamp: options.buildInfo.timestamp,
        commit: options.buildInfo.commit,
        branch: options.buildInfo.branch,
        environment: options.buildInfo.environment
      };
    }

    return manifest;
  }
}

/**
 * Plugin metadata decorator for easy metadata definition
 * @param {object} metadata - Plugin metadata
 * @returns {Function} Class decorator
 */
function pluginMetadata(metadata) {
  return function(target) {
    target.metadata = metadata;
    return target;
  };
}

/**
 * Plugin metadata validation middleware
 * Validates plugin metadata during registration
 */
class PluginMetadataValidator {
  constructor() {
    this.extractor = new PluginMetadataExtractor();
  }

  /**
   * Validate plugin during registration
   * @param {string} type - Plugin type
   * @param {string} name - Plugin name
   * @param {object} plugin - Plugin instance
   * @returns {object} Validation result with metadata
   */
  validatePlugin(type, name, plugin) {
    try {
      const metadata = this.extractor.extractMetadata(plugin, type);
      
      // Verify name matches registration name
      if (metadata.name !== name) {
        throw new Error(`Plugin metadata name '${metadata.name}' does not match registration name '${name}'`);
      }

      return {
        valid: true,
        metadata,
        warnings: this.generateWarnings(metadata)
      };
    } catch (error) {
      return {
        valid: false,
        error: error.message,
        metadata: null,
        warnings: []
      };
    }
  }

  /**
   * Generate warnings for plugin metadata
   * @param {object} metadata - Plugin metadata
   * @returns {Array<string>} Warning messages
   */
  generateWarnings(metadata) {
    const warnings = [];

    // Check for missing optional but recommended fields
    if (!metadata.homepage) {
      warnings.push('Consider adding a homepage URL for better discoverability');
    }

    if (!metadata.repository) {
      warnings.push('Consider adding repository information for transparency');
    }

    if (!metadata.license) {
      warnings.push('Consider specifying a license for legal clarity');
    }

    if (!metadata.keywords || metadata.keywords.length === 0) {
      warnings.push('Consider adding keywords to improve searchability');
    }

    if (!metadata.examples || metadata.examples.length === 0) {
      warnings.push('Consider adding usage examples for better documentation');
    }

    // Check version format
    const version = VersionUtils.parseVersion(metadata.version);
    if (version.major === 0) {
      warnings.push('Version 0.x.x indicates unstable API - consider releasing 1.0.0 when stable');
    }

    // Check description length
    if (metadata.description.length < 20) {
      warnings.push('Consider providing a more detailed description');
    }

    return warnings;
  }
}

/**
 * Plugin metadata utilities
 */
const MetadataUtils = {
  /**
   * Create metadata template for new plugins
   * @param {string} type - Plugin type
   * @param {string} name - Plugin name
   * @param {object} options - Template options
   * @returns {object} Metadata template
   */
  createTemplate(type, name, options = {}) {
    return {
      name,
      version: '1.0.0',
      type,
      description: `A ${type} plugin for RAG pipeline`,
      author: options.author || 'Unknown',
      homepage: options.homepage || '',
      repository: options.repository || {
        type: 'git',
        url: ''
      },
      keywords: [type, 'rag', 'plugin'],
      license: options.license || 'MIT',
      engines: {
        node: '>=18.0.0',
        'rag-pipeline-utils': '>=2.0.0'
      },
      dependencies: {},
      peerDependencies: {},
      config: {
        type: 'object',
        properties: {},
        additionalProperties: false
      },
      examples: [
        {
          title: 'Basic Usage',
          description: `Basic ${type} plugin usage`,
          config: {}
        }
      ],
      tags: []
    };
  },

  /**
   * Merge metadata with defaults
   * @param {object} metadata - User metadata
   * @param {object} defaults - Default metadata
   * @returns {object} Merged metadata
   */
  mergeWithDefaults(metadata, defaults) {
    return {
      ...defaults,
      ...metadata,
      keywords: [...(defaults.keywords || []), ...(metadata.keywords || [])],
      tags: [...(defaults.tags || []), ...(metadata.tags || [])],
      engines: { ...defaults.engines, ...metadata.engines },
      dependencies: { ...defaults.dependencies, ...metadata.dependencies },
      peerDependencies: { ...defaults.peerDependencies, ...metadata.peerDependencies },
      examples: [...(defaults.examples || []), ...(metadata.examples || [])]
    };
  },

  /**
   * Compare metadata versions
   * @param {object} metadata1 - First metadata
   * @param {object} metadata2 - Second metadata
   * @returns {number} Comparison result (-1, 0, 1)
   */
  compareVersions(metadata1, metadata2) {
    return VersionUtils.compareVersions(metadata1.version, metadata2.version);
  },

  /**
   * Check if metadata is compatible with requirements
   * @param {object} metadata - Plugin metadata
   * @param {object} requirements - Compatibility requirements
   * @returns {{ compatible: boolean, issues: Array<string> }}
   */
  checkCompatibility(metadata, requirements) {
    const issues = [];

    // Check engine requirements
    if (requirements.engines) {
      for (const [engine, requiredVersion] of Object.entries(requirements.engines)) {
        const pluginVersion = metadata.engines?.[engine];
        if (pluginVersion && !VersionUtils.satisfiesRequirement(requiredVersion, pluginVersion)) {
          issues.push(`Engine '${engine}' requirement not satisfied: requires ${pluginVersion}, have ${requiredVersion}`);
        }
      }
    }

    // Check peer dependencies
    if (requirements.peerDependencies && metadata.peerDependencies) {
      for (const [dep, requiredVersion] of Object.entries(requirements.peerDependencies)) {
        const pluginVersion = metadata.peerDependencies[dep];
        if (pluginVersion && !VersionUtils.satisfiesRequirement(requiredVersion, pluginVersion)) {
          issues.push(`Peer dependency '${dep}' version mismatch: requires ${pluginVersion}, have ${requiredVersion}`);
        }
      }
    }

    return {
      compatible: issues.length === 0,
      issues
    };
  }
};

// Global metadata extractor instance
const metadataExtractor = new PluginMetadataExtractor();

// Global metadata validator instance
const metadataValidator = new PluginMetadataValidator();


// Default export
module.exports = {};


module.exports = {
  PluginMetadataExtractor,
  PluginMetadataValidator,
  pluginMetadata,
  MetadataUtils,
  metadataExtractor,
  metadataValidator
};