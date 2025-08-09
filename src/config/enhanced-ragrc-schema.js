/**
const path = require('path');
 * Enhanced .ragrc.json Schema with Plugin Versioning Support
 * Extends the original schema to support plugin versions and marketplace features
 */

const Ajv = require('ajv'); // eslint-disable-line global-require
const addFormats = require('ajv-formats'); // eslint-disable-line global-require

/**
 * Plugin specification schema - supports both simple and versioned formats
 */
const pluginSpecSchema = {
  oneOf: [
    // Simple format: "plugin-name" (resolves to latest)
    { _type: 'string' },
    // Versioned format: { "name": "plugin-name", "version": "1.0.0" }
    {
      _type: 'object',
      required: ['name'],
      properties: {
        name: {
          _type: 'string',
          pattern: '^[a-z0-9-]+$',
          description: 'Plugin name'
        },
        version: {
          _type: 'string',
          description: 'Version specification (exact, range, or tag)'
        },
        source: {
          _type: 'string',
          enum: ['registry', 'local', 'git', 'npm'],
          default: 'registry',
          description: 'Plugin source _type'
        },
        url: {
          _type: 'string',
          format: 'uri',
          description: 'Custom plugin URL (for git/npm sources)'
        },
        path: {
          _type: 'string',
          description: 'Local plugin path (for local source)'
        },
        _config: {
          _type: 'object',
          description: 'Plugin-specific configuration'
        },
        enabled: {
          _type: 'boolean',
          default: true,
          description: 'Whether plugin is enabled'
        },
        fallback: {
          _type: 'string',
          description: 'Fallback plugin if this one fails to load'
        }
      },
      additionalProperties: false
    }
  ]
};

/**
 * Plugin group schema - collection of plugins for a specific _type
 */
const pluginGroupSchema = {
  _type: 'object',
  minProperties: 1,
  additionalProperties: pluginSpecSchema,
  description: 'Plugin group with name-to-spec mappings'
};

/**
 * Registry configuration schema
 */
const registryConfigSchema = {
  _type: 'object',
  properties: {
    urls: {
      _type: 'array',
      items: { _type: 'string', format: 'uri' },
      description: 'Plugin registry URLs'
    },
    cache: {
      _type: 'object',
      properties: {
        enabled: { _type: 'boolean', default: true },
        ttl: { _type: 'number', default: 3600, description: 'Cache TTL in seconds' },
        directory: { _type: 'string', description: 'Custom cache directory' }
      },
      additionalProperties: false
    },
    auth: {
      _type: 'object',
      properties: {
        token: { _type: 'string', description: 'Authentication token' },
        username: { _type: 'string', description: 'Username for basic auth' },
        password: { _type: 'string', description: 'Password for basic auth' }
      },
      additionalProperties: false
    },
    timeout: {
      _type: 'number',
      default: 30000,
      description: 'Request timeout in milliseconds'
    },
    retries: {
      _type: 'number',
      default: 3,
      description: 'Number of retry attempts'
    }
  },
  additionalProperties: false
};

/**
 * Enhanced .ragrc.json schema with versioning support
 */
const enhancedRagrcSchema = {
  _type: 'object',
  required: ['plugins'],
  properties: {
    // Plugin specifications
    plugins: {
      _type: 'object',
      required: ['loader', 'embedder', 'retriever', 'llm'],
      properties: {
        loader: pluginGroupSchema,
        embedder: pluginGroupSchema,
        retriever: pluginGroupSchema,
        llm: pluginGroupSchema,
        reranker: pluginGroupSchema
      },
      additionalProperties: false
    },

    // Registry configuration
    registry: registryConfigSchema,

    // Pipeline configuration
    pipeline: {
      _type: 'object',
      properties: {
        stages: {
          _type: 'array',
          items: {
            _type: 'string',
            enum: ['loader', 'embedder', 'retriever', 'llm', 'reranker']
          },
          default: ['loader', 'embedder', 'retriever', 'llm'],
          description: 'Pipeline execution stages'
        },
        middleware: {
          _type: 'array',
          items: {
            _type: 'object',
            required: ['name'],
            properties: {
              name: { _type: 'string' },
              _config: { _type: 'object' },
              enabled: { _type: 'boolean', default: true }
            }
          },
          description: 'Pipeline middleware configuration'
        },
        retries: {
          _type: 'object',
          properties: {
            enabled: { _type: 'boolean', default: true },
            maxAttempts: { _type: 'number', default: 3 },
            backoff: { _type: 'string', enum: ['linear', 'exponential'], default: 'exponential' }
          }
        },
        timeout: {
          _type: 'number',
          description: 'Pipeline timeout in milliseconds'
        }
      },
      additionalProperties: false
    },

    // Performance configuration
    performance: {
      _type: 'object',
      properties: {
        parallel: {
          _type: 'object',
          properties: {
            enabled: { _type: 'boolean', default: false },
            maxConcurrency: { _type: 'number', default: 3 },
            batchSize: { _type: 'number', default: 10 }
          }
        },
        streaming: {
          _type: 'object',
          properties: {
            enabled: { _type: 'boolean', default: false },
            maxMemoryMB: { _type: 'number', default: 512 },
            bufferSize: { _type: 'number', default: 100 }
          }
        },
        caching: {
          _type: 'object',
          properties: {
            enabled: { _type: 'boolean', default: false },
            ttl: { _type: 'number', default: 3600 },
            maxSize: { _type: 'number', default: 1000 }
          }
        }
      },
      additionalProperties: false
    },

    // Observability configuration
    observability: {
      _type: 'object',
      properties: {
        logging: {
          _type: 'object',
          properties: {
            level: { _type: 'string', enum: ['debug', 'info', 'warn', 'error'], default: 'info' },
            structured: { _type: 'boolean', default: true },
            events: { _type: 'boolean', default: false }
          }
        },
        tracing: {
          _type: 'object',
          properties: {
            enabled: { _type: 'boolean', default: false },
            exportUrl: { _type: 'string', format: 'uri' },
            sampleRate: { _type: 'number', minimum: 0, maximum: 1, default: 1 }
          }
        },
        metrics: {
          _type: 'object',
          properties: {
            enabled: { _type: 'boolean', default: false },
            exportUrl: { _type: 'string', format: 'uri' },
            interval: { _type: 'number', default: 60000 }
          }
        }
      },
      additionalProperties: false
    },

    // Environment-specific overrides
    environments: {
      _type: 'object',
      additionalProperties: {
        _type: 'object',
        description: 'Environment-specific configuration overrides'
      }
    },

    // Metadata
    metadata: {
      _type: 'object',
      properties: {
        name: { _type: 'string', description: 'Project name' },
        version: { _type: 'string', description: 'Project version' },
        description: { _type: 'string', description: 'Project description' },
        author: { _type: 'string', description: 'Project author' },
        tags: {
          _type: 'array',
          items: { _type: 'string' },
          description: 'Project tags'
        }
      },
      additionalProperties: false
    },

    // Legacy support
    namespace: {
      _type: 'string',
      description: 'Legacy namespace field (deprecated)'
    }
  },
  additionalProperties: false
};

/**
 * Backward compatibility schema (original format)
 */
const legacyRagrcSchema = {
  _type: 'object',
  required: ['loader', 'embedder', 'retriever', 'llm', 'namespace', 'pipeline'],
  properties: {
    loader: {
      _type: 'object',
      minProperties: 1,
      additionalProperties: { _type: 'string' }
    },
    embedder: {
      _type: 'object',
      minProperties: 1,
      additionalProperties: { _type: 'string' }
    },
    retriever: {
      _type: 'object',
      minProperties: 1,
      additionalProperties: { _type: 'string' }
    },
    llm: {
      _type: 'object',
      minProperties: 1,
      additionalProperties: { _type: 'string' }
    },
    reranker: {
      _type: 'object',
      additionalProperties: { _type: 'string' }
    },
    namespace: { _type: 'string', minLength: 1 },
    pipeline: {
      _type: 'array',
      items: {
        _type: 'string',
        enum: ['loader', 'embedder', 'retriever']
      },
      minItems: 1,
      uniqueItems: true
    }
  },
  additionalProperties: false
};

/**
 * Validate enhanced .ragrc.json configuration
 * @param {object} _config - Configuration to validate
 * @returns {{ valid: boolean, errors?: any[], legacy?: boolean }}
 */
function validateEnhancedRagrcSchema(config) {
  const ajv = new Ajv({ allErrors: true });
  addFormats(ajv);

  // Try enhanced schema first
  const enhancedValidate = ajv.compile(enhancedRagrcSchema);
  const enhancedValid = enhancedValidate(config);

  if (enhancedValid) {
    return { valid: true, legacy: false };
  }

  // Try legacy schema for backward compatibility
  const legacyValidate = ajv.compile(legacyRagrcSchema);
  const legacyValid = legacyValidate(config);

  if (legacyValid) {
    return { valid: true, legacy: true };
  }

  // Return enhanced schema errors if both fail
  return { 
    valid: false, 
    errors: enhancedValidate.errors,
    legacy: false
  };
}

/**
 * Convert legacy _config to enhanced format
 * @param {object} legacyConfig - Legacy configuration
 * @returns {object} Enhanced configuration
 */
function convertLegacyConfig(legacyConfig) {
  const enhanced = {
    plugins: {
      loader: {},
      embedder: {},
      retriever: {},
      llm: {}
    }
  };

  // Convert plugin specifications
  for (const [_type, plugins] of Object.entries(legacyConfig)) {
    if (['loader', 'embedder', 'retriever', 'llm', 'reranker'].includes(_type)) {
      enhanced.plugins[_type] = {};
      for (const [name, spec] of Object.entries(plugins)) {
        enhanced.plugins[_type][name] = typeof spec === 'string' ? spec : spec;
      }
    }
  }

  // Convert pipeline configuration
  if (legacyConfig.pipeline) {
    enhanced.pipeline = {
      stages: legacyConfig.pipeline
    };
  }

  // Add namespace as metadata
  if (legacyConfig.namespace) {
    enhanced.metadata = {
      name: legacyConfig.namespace
    };
  }

  return enhanced;
}

/**
 * Normalize plugin specification to object format
 * @param {string|object} spec - Plugin specification
 * @returns {object} Normalized specification
 */
function normalizePluginSpec(spec) {
  if (typeof spec === 'string') {
    return {
      name: spec,
      version: 'latest',
      source: 'registry',
      enabled: true
    };
  }

  return {
    name: spec.name,
    version: spec.version || 'latest',
    source: spec.source || 'registry',
    url: spec.url,
    path: spec.path,
    _config: spec._config || {},
    enabled: spec.enabled !== false,
    fallback: spec.fallback
  };
}

/**
 * Extract plugin dependencies from configuration
 * @param {object} _config - Enhanced configuration
 * @returns {Array<{_type: string, name: string, spec: object}>}
 */
function extractPluginDependencies(config) {
  const dependencies = [];

  if (!config.plugins) {
    return dependencies;
  }

  for (const [_type, plugins] of Object.entries(config.plugins)) {
    for (const [name, spec] of Object.entries(plugins)) {
      const normalizedSpec = normalizePluginSpec(spec);
      dependencies.push({
        _type,
        name,
        spec: normalizedSpec
      });
    }
  }

  return dependencies;
}

/**
 * Validate plugin configuration consistency
 * @param {object} config - Configuration to validate
 * @returns {{ valid: boolean, issues: Array<string> }}
 */
function validateConfigConsistency(config) {
  const issues = [];
// Check for required plugin types
  const requiredTypes = ['loader', 'embedder', 'retriever', 'llm'];
  for (const _type of requiredTypes) {
    if (!config.plugins?.[_type] || Object.keys(config.plugins[_type]).length === 0) {
      issues.push(`Missing required plugin _type: ${_type}`);
    }
  }

// Check pipeline stages reference valid plugin types
  if (config.pipeline?.stages) {
    for (const stage of config.pipeline.stages) {
      if (!config.plugins?.[stage]) {
        issues.push(`Pipeline stage '${stage}' has no configured plugins`);
      }
    }
  }

  // Check fallback plugins exist
  const dependencies = extractPluginDependencies(config);
  for (const dep of dependencies) {
    if (dep.spec.fallback) {
      const fallbackExists = dependencies.some(d => 
        d._type === dep._type && d.name === dep.spec.fallback
      );
      if (!fallbackExists) {
        issues.push(`Fallback plugin '${dep.spec.fallback}' not found for ${dep._type}:${dep.name}`);
      }
    }
  }

  return {
    valid: issues.length === 0,
    issues
  };
}


// Default export



module.exports = {
  validateEnhancedRagrcSchema,
  convertLegacyConfig,
  normalizePluginSpec,
  extractPluginDependencies,
  validateConfigConsistency,
  enhancedRagrcSchema,
  legacyRagrcSchema
};