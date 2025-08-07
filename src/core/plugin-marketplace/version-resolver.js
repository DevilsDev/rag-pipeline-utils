/**
 * Plugin Version Resolution System
 * Handles semantic versioning, version ranges, and fallback logic
 */

const semver = require('semver');

/**
 * Version resolution strategies
 */
const VERSION_STRATEGIES = {
  EXACT: 'exact',           // Exact version match (1.0.0)
  RANGE: 'range',           // Version range (^1.0.0, ~1.0.0, >=1.0.0)
  LATEST: 'latest',         // Latest stable version
  BETA: 'beta',             // Latest beta version
  ALPHA: 'alpha',           // Latest alpha version
  TAG: 'tag'                // Specific tag (latest, beta, alpha)
};

/**
 * Plugin version resolver
 */
class PluginVersionResolver {
  constructor(registry = null) {
    this.registry = registry;
  }

  /**
   * Set the plugin registry
   * @param {object} registry - Plugin registry data
   */
  setRegistry(registry) {
    this.registry = registry;
  }

  /**
   * Resolve plugin version from specification
   * @param {string} pluginName - Plugin name
   * @param {string|object} versionSpec - Version specification
   * @returns {Promise<{version: string, strategy: string, downloadUrl?: string}>}
   */
  async resolveVersion(pluginName, versionSpec) {
    if (!this.registry) {
      throw new Error('Plugin registry not available');
    }

    const pluginEntry = this.registry.plugins[pluginName];
    if (!pluginEntry) {
      throw new Error(`Plugin '${pluginName}' not found in registry`);
    }

    // Handle different version specification formats
    const spec = this.parseVersionSpec(versionSpec);
    
    switch (spec.strategy) {
      case VERSION_STRATEGIES.EXACT:
        return this.resolveExactVersion(pluginEntry, spec.version);
        
      case VERSION_STRATEGIES.RANGE:
        return this.resolveVersionRange(pluginEntry, spec.range);
        
      case VERSION_STRATEGIES.LATEST:
        return this.resolveLatestVersion(pluginEntry);
        
      case VERSION_STRATEGIES.BETA:
        return this.resolveBetaVersion(pluginEntry);
        
      case VERSION_STRATEGIES.ALPHA:
        return this.resolveAlphaVersion(pluginEntry);
        
      case VERSION_STRATEGIES.TAG:
        return this.resolveTagVersion(pluginEntry, spec.tag);
        
      default:
        throw new Error(`Unknown version strategy: ${spec.strategy}`);
    }
  }

  /**
   * Parse version specification into strategy and parameters
   * @param {string|object} versionSpec - Version specification
   * @returns {object} Parsed specification
   */
  parseVersionSpec(versionSpec) {
    // Handle object format: { version: "1.0.0", strategy: "exact" }
    if (typeof versionSpec === 'object' && versionSpec !== null) {
      return {
        strategy: versionSpec.strategy || VERSION_STRATEGIES.EXACT,
        version: versionSpec.version,
        range: versionSpec.range,
        tag: versionSpec.tag
      };
    }

    // Handle string format
    const spec = String(versionSpec).trim();

    // Tag versions (latest, beta, alpha)
    if (['latest', 'beta', 'alpha'].includes(spec)) {
      return {
        strategy: VERSION_STRATEGIES.TAG,
        tag: spec
      };
    }

    // Exact version (1.0.0)
    if (semver.valid(spec)) {
      return {
        strategy: VERSION_STRATEGIES.EXACT,
        version: spec
      };
    }

    // Version range (^1.0.0, ~1.0.0, >=1.0.0, etc.)
    if (semver.validRange(spec)) {
      return {
        strategy: VERSION_STRATEGIES.RANGE,
        range: spec
      };
    }

    // Default to latest if unparseable
    return {
      strategy: VERSION_STRATEGIES.LATEST
    };
  }

  /**
   * Resolve exact version
   * @param {object} pluginEntry - Plugin registry entry
   * @param {string} version - Exact version
   * @returns {object} Resolution result
   */
  resolveExactVersion(pluginEntry, version) {
    const versionData = pluginEntry.versions[version];
    if (!versionData) {
      throw new Error(`Version '${version}' not found for plugin`);
    }

    if (versionData.deprecated) {
      console.warn(`Warning: Version '${version}' is deprecated. ${versionData.deprecationMessage || ''}`);
    }

    return {
      version,
      strategy: VERSION_STRATEGIES.EXACT,
      downloadUrl: versionData.downloadUrl,
      integrity: versionData.integrity,
      size: versionData.size,
      publishedAt: versionData.publishedAt,
      deprecated: versionData.deprecated
    };
  }

  /**
   * Resolve version from range
   * @param {object} pluginEntry - Plugin registry entry
   * @param {string} range - Version range
   * @returns {object} Resolution result
   */
  resolveVersionRange(pluginEntry, range) {
    const availableVersions = Object.keys(pluginEntry.versions)
      .filter(v => semver.valid(v))
      .sort(semver.rcompare); // Sort descending

    const matchingVersion = availableVersions.find(v => semver.satisfies(v, range));
    
    if (!matchingVersion) {
      throw new Error(`No version satisfies range '${range}'`);
    }

    const versionData = pluginEntry.versions[matchingVersion];
    
    if (versionData.deprecated) {
      console.warn(`Warning: Resolved version '${matchingVersion}' is deprecated. ${versionData.deprecationMessage || ''}`);
    }

    return {
      version: matchingVersion,
      strategy: VERSION_STRATEGIES.RANGE,
      range,
      downloadUrl: versionData.downloadUrl,
      integrity: versionData.integrity,
      size: versionData.size,
      publishedAt: versionData.publishedAt,
      deprecated: versionData.deprecated
    };
  }

  /**
   * Resolve latest stable version
   * @param {object} pluginEntry - Plugin registry entry
   * @returns {object} Resolution result
   */
  resolveLatestVersion(pluginEntry) {
    const latestVersion = pluginEntry.latest;
    if (!latestVersion) {
      throw new Error('No latest version available');
    }

    return this.resolveExactVersion(pluginEntry, latestVersion);
  }

  /**
   * Resolve latest beta version
   * @param {object} pluginEntry - Plugin registry entry
   * @returns {object} Resolution result
   */
  resolveBetaVersion(pluginEntry) {
    const betaVersion = pluginEntry.beta;
    if (!betaVersion) {
      // Fallback to latest stable
      console.warn('No beta version available, falling back to latest stable');
      return this.resolveLatestVersion(pluginEntry);
    }

    return this.resolveExactVersion(pluginEntry, betaVersion);
  }

  /**
   * Resolve latest alpha version
   * @param {object} pluginEntry - Plugin registry entry
   * @returns {object} Resolution result
   */
  resolveAlphaVersion(pluginEntry) {
    const alphaVersion = pluginEntry.alpha;
    if (!alphaVersion) {
      // Fallback to beta, then latest
      if (pluginEntry.beta) {
        console.warn('No alpha version available, falling back to beta');
        return this.resolveBetaVersion(pluginEntry);
      } else {
        console.warn('No alpha version available, falling back to latest stable');
        return this.resolveLatestVersion(pluginEntry);
      }
    }

    return this.resolveExactVersion(pluginEntry, alphaVersion);
  }

  /**
   * Resolve version by tag
   * @param {object} pluginEntry - Plugin registry entry
   * @param {string} tag - Version tag
   * @returns {object} Resolution result
   */
  resolveTagVersion(pluginEntry, tag) {
    switch (tag) {
      case 'latest':
        return this.resolveLatestVersion(pluginEntry);
      case 'beta':
        return this.resolveBetaVersion(pluginEntry);
      case 'alpha':
        return this.resolveAlphaVersion(pluginEntry);
      default:
        throw new Error(`Unknown version tag: ${tag}`);
    }
  }

  /**
   * Get all available versions for a plugin
   * @param {string} pluginName - Plugin name
   * @returns {Array<{version: string, publishedAt: string, deprecated: boolean}>}
   */
  getAvailableVersions(pluginName) {
    if (!this.registry) {
      throw new Error('Plugin registry not available');
    }

    const pluginEntry = this.registry.plugins[pluginName];
    if (!pluginEntry) {
      throw new Error(`Plugin '${pluginName}' not found in registry`);
    }

    return Object.entries(pluginEntry.versions)
      .map(([version, data]) => ({
        version,
        publishedAt: data.publishedAt,
        deprecated: data.deprecated || false,
        size: data.size
      }))
      .sort((a, b) => semver.rcompare(a.version, b.version));
  }

  /**
   * Check if a version satisfies requirements
   * @param {string} version - Version to check
   * @param {string} requirement - Version requirement
   * @returns {boolean} Whether version satisfies requirement
   */
  satisfiesRequirement(version, requirement) {
    if (!semver.valid(version)) {
      return false;
    }

    if (!semver.validRange(requirement)) {
      return version === requirement;
    }

    return semver.satisfies(version, requirement);
  }

  /**
   * Find compatible versions for multiple plugins
   * @param {object} pluginSpecs - Plugin specifications { pluginName: versionSpec }
   * @returns {Promise<object>} Resolved versions { pluginName: resolution }
   */
  async resolveMultipleVersions(pluginSpecs) {
    const resolutions = {};
    const errors = [];

    for (const [pluginName, versionSpec] of Object.entries(pluginSpecs)) {
      try {
        resolutions[pluginName] = await this.resolveVersion(pluginName, versionSpec);
      } catch (error) {
        errors.push({ pluginName, error: error.message });
      }
    }

    if (errors.length > 0) {
      const errorMessage = errors
        .map(({ pluginName, error }) => `${pluginName}: ${error}`)
        .join(', ');
      throw new Error(`Version resolution failed: ${errorMessage}`);
    }

    return resolutions;
  }

  /**
   * Validate version compatibility
   * @param {object} resolutions - Resolved plugin versions
   * @param {object} requirements - Engine requirements
   * @returns {{ compatible: boolean, issues: Array<string> }}
   */
  validateCompatibility(resolutions, requirements = {}) {
    const issues = [];

    for (const [pluginName, resolution] of Object.entries(resolutions)) {
      const pluginEntry = this.registry.plugins[pluginName];
      const versionData = pluginEntry.versions[resolution.version];
      
      if (versionData.deprecated) {
        issues.push(`Plugin '${pluginName}@${resolution.version}' is deprecated`);
      }

      // Check engine compatibility
      if (pluginEntry.metadata.engines) {
        const engines = pluginEntry.metadata.engines;
        
        if (engines.node && requirements.node) {
          if (!semver.satisfies(requirements.node, engines.node)) {
            issues.push(`Plugin '${pluginName}' requires Node.js ${engines.node}, but ${requirements.node} is available`);
          }
        }

        if (engines['rag-pipeline-utils'] && requirements['rag-pipeline-utils']) {
          if (!semver.satisfies(requirements['rag-pipeline-utils'], engines['rag-pipeline-utils'])) {
            issues.push(`Plugin '${pluginName}' requires rag-pipeline-utils ${engines['rag-pipeline-utils']}, but ${requirements['rag-pipeline-utils']} is available`);
          }
        }
      }
    }

    return {
      compatible: issues.length === 0,
      issues
    };
  }
}

/**
 * Create default version resolver
 * @param {object} registry - Plugin registry
 * @returns {PluginVersionResolver} Version resolver instance
 */
function createVersionResolver(registry = null) {
  return new PluginVersionResolver(registry);
}

/**
 * Utility functions for version handling
 */
const VersionUtils = {
  /**
   * Parse version string into components
   * @param {string} version - Version string
   * @returns {object} Version components
   */
  parseVersion(version) {
    const parsed = semver.parse(version);
    if (!parsed) {
      throw new Error(`Invalid version: ${version}`);
    }

    return {
      major: parsed.major,
      minor: parsed.minor,
      patch: parsed.patch,
      prerelease: parsed.prerelease,
      build: parsed.build,
      version: parsed.version,
      isPrerelease: parsed.prerelease.length > 0
    };
  },

  /**
   * Compare two versions
   * @param {string} version1 - First version
   * @param {string} version2 - Second version
   * @returns {number} -1, 0, or 1
   */
  compareVersions(version1, version2) {
    return semver.compare(version1, version2);
  },

  /**
   * Get next version for different release types
   * @param {string} currentVersion - Current version
   * @param {string} releaseType - Release type (major, minor, patch, prerelease)
   * @returns {string} Next version
   */
  getNextVersion(currentVersion, releaseType) {
    return semver.inc(currentVersion, releaseType);
  },

  /**
   * Check if version is stable (no prerelease)
   * @param {string} version - Version to check
   * @returns {boolean} Whether version is stable
   */
  isStableVersion(version) {
    const parsed = semver.parse(version);
    return parsed && parsed.prerelease.length === 0;
  }
};


// Default export



module.exports = {
  PluginVersionResolver,
  createVersionResolver,
  VERSION_STRATEGIES,
  VersionUtils
};