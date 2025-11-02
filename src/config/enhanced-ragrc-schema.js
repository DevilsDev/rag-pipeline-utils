/**
 * Enhanced .ragrc.json Schema with Plugin Versioning Support
 * Single source of truth for configuration validation
 */

const Ajv = require("ajv"); // eslint-disable-line global-require
const addFormats = require("ajv-formats"); // eslint-disable-line global-require
const { normalizeConfig } = require("./normalize-config");

/**
 * Plugin specification schema - supports both simple and versioned formats
 */
const pluginSpecSchema = {
  oneOf: [
    // Simple format: "plugin-name" (resolves to latest)
    { type: "string" },
    // Versioned format: { "name": "plugin-name", "version": "1.0.0" }
    {
      type: "object",
      required: ["name"],
      properties: {
        name: {
          type: "string",
          pattern: "^[a-z0-9-]+$",
          description: "Plugin name",
        },
        version: {
          type: "string",
          description: "Version specification (exact, range, or tag)",
        },
        source: {
          type: "string",
          enum: ["registry", "local", "git", "npm"],
          default: "registry",
          description: "Plugin source type",
        },
        url: {
          type: "string",
          format: "uri",
          description: "Custom plugin URL (for git/npm sources)",
        },
        path: {
          type: "string",
          description: "Local plugin path (for local source)",
        },
        config: {
          type: "object",
          description: "Plugin-specific configuration",
        },
        enabled: {
          type: "boolean",
          default: true,
          description: "Whether plugin is enabled",
        },
        fallback: {
          type: "string",
          description: "Fallback plugin if this one fails to load",
        },
      },
      additionalProperties: false,
    },
  ],
};

/**
 * Plugin group schema - collection of plugins for a specific _type
 */
const pluginGroupSchema = {
  type: "object",
  minProperties: 1,
  additionalProperties: pluginSpecSchema,
  description: "Plugin group with name-to-spec mappings",
};

/**
 * Registry configuration schema
 */
const registryConfigSchema = {
  type: "object",
  properties: {
    urls: {
      type: "array",
      items: { type: "string", format: "uri" },
      description: "Plugin registry URLs",
    },
    cache: {
      type: "object",
      properties: {
        enabled: { type: "boolean", default: true },
        ttl: {
          type: "number",
          default: 3600,
          description: "Cache TTL in seconds",
        },
        directory: { type: "string", description: "Custom cache directory" },
      },
      additionalProperties: false,
    },
    auth: {
      type: "object",
      properties: {
        token: { type: "string", description: "Authentication token" },
        username: { type: "string", description: "Username for basic auth" },
        password: { type: "string", description: "Password for basic auth" },
      },
      additionalProperties: false,
    },
    timeout: {
      type: "number",
      default: 30000,
      description: "Request timeout in milliseconds",
    },
    retries: {
      type: "number",
      default: 3,
      description: "Number of retry attempts",
    },
  },
  additionalProperties: false,
};

/**
 * Enhanced .ragrc.json schema with versioning support
 */
const enhancedRagrcSchema = {
  type: "object",
  required: ["plugins"],
  properties: {
    // Plugin specifications
    plugins: {
      type: "object",
      required: ["loader", "embedder", "retriever", "llm"],
      properties: {
        loader: pluginGroupSchema,
        embedder: pluginGroupSchema,
        retriever: pluginGroupSchema,
        llm: pluginGroupSchema,
        reranker: pluginGroupSchema,
      },
      additionalProperties: false,
    },

    // Registry configuration
    registry: registryConfigSchema,

    // Pipeline configuration
    pipeline: {
      type: "object",
      properties: {
        stages: {
          type: "array",
          items: {
            type: "string",
            enum: ["loader", "embedder", "retriever", "llm", "reranker"],
          },
          default: ["loader", "embedder", "retriever", "llm"],
          description: "Pipeline execution stages",
        },
        middleware: {
          type: "array",
          items: {
            type: "object",
            required: ["name"],
            properties: {
              name: { type: "string" },
              _config: { type: "object" },
              enabled: { type: "boolean", default: true },
            },
          },
          description: "Pipeline middleware configuration",
        },
        retries: {
          type: "object",
          properties: {
            enabled: { type: "boolean", default: true },
            maxAttempts: { type: "number", default: 3 },
            backoff: {
              type: "string",
              enum: ["linear", "exponential"],
              default: "exponential",
            },
          },
        },
        timeout: {
          type: "number",
          description: "Pipeline timeout in milliseconds",
        },
      },
      additionalProperties: false,
    },

    // Performance configuration
    performance: {
      type: "object",
      properties: {
        parallel: {
          type: "object",
          properties: {
            enabled: { type: "boolean", default: false },
            maxConcurrency: { type: "number", default: 3 },
            batchSize: { type: "number", default: 10 },
          },
        },
        streaming: {
          type: "object",
          properties: {
            enabled: { type: "boolean", default: false },
            maxMemoryMB: { type: "number", default: 512 },
            bufferSize: { type: "number", default: 100 },
          },
        },
        caching: {
          type: "object",
          properties: {
            enabled: { type: "boolean", default: false },
            ttl: { type: "number", default: 3600 },
            maxSize: { type: "number", default: 1000 },
          },
        },
      },
      additionalProperties: false,
    },

    // Observability configuration
    observability: {
      type: "object",
      properties: {
        logging: {
          type: "object",
          properties: {
            level: {
              type: "string",
              enum: ["debug", "info", "warn", "error"],
              default: "info",
            },
            structured: { type: "boolean", default: true },
            events: { type: "boolean", default: false },
          },
        },
        tracing: {
          type: "object",
          properties: {
            enabled: { type: "boolean", default: false },
            exportUrl: { type: "string", format: "uri" },
            sampleRate: { type: "number", minimum: 0, maximum: 1, default: 1 },
          },
        },
        metrics: {
          type: "object",
          properties: {
            enabled: { type: "boolean", default: false },
            exportUrl: { type: "string", format: "uri" },
            interval: { type: "number", default: 60000 },
          },
        },
      },
      additionalProperties: false,
    },

    // Environment-specific overrides
    environments: {
      type: "object",
      additionalProperties: {
        type: "object",
        description: "Environment-specific configuration overrides",
      },
    },

    // Metadata
    metadata: {
      type: "object",
      properties: {
        name: { type: "string", description: "Project name" },
        version: { type: "string", description: "Project version" },
        description: { type: "string", description: "Project description" },
        author: { type: "string", description: "Project author" },
        tags: {
          type: "array",
          items: { type: "string" },
          description: "Project tags",
        },
      },
      additionalProperties: false,
    },

    // Legacy support
    namespace: {
      type: "string",
      description: "Legacy namespace field (deprecated)",
    },
  },
  additionalProperties: false,
};

/**
 * Backward compatibility schema (original format)
 */
const legacyRagrcSchema = {
  type: "object",
  required: ["loader", "embedder", "retriever", "llm", "namespace", "pipeline"],
  properties: {
    loader: {
      type: "object",
      minProperties: 1,
      additionalProperties: { type: "string" },
    },
    embedder: {
      type: "object",
      minProperties: 1,
      additionalProperties: { type: "string" },
    },
    retriever: {
      type: "object",
      minProperties: 1,
      additionalProperties: { type: "string" },
    },
    llm: {
      type: "object",
      minProperties: 1,
      additionalProperties: { type: "string" },
    },
    reranker: {
      type: "object",
      additionalProperties: { type: "string" },
    },
    namespace: { type: "string", minLength: 1 },
    pipeline: {
      type: "array",
      items: {
        type: "string",
        enum: ["loader", "embedder", "retriever"],
      },
      minItems: 1,
      uniqueItems: true,
    },
  },
  additionalProperties: false,
};

/**
 * Build the canonical .ragrc.json schema
 * @returns {object} JSON Schema object
 */
function buildRagrcJsonSchema() {
  return enhancedRagrcSchema;
}

/**
 * Validate .ragrc.json configuration (single source of truth)
 * @param {object} config - Configuration to validate
 * @returns {{ valid: boolean, errors?: any[], normalized?: object }}
 */
function validateRagrc(config) {
  let errors = [];

  // Input validation before normalization
  if (!config || typeof config !== "object") {
    return {
      valid: false,
      errors: [{ message: "Configuration must be a non-null object" }],
      normalized: undefined,
    };
  }

  // Check for obviously invalid plugin configurations
  const pluginTypes = ["loader", "embedder", "retriever", "llm", "reranker"];
  for (const type of pluginTypes) {
    if (config.hasOwnProperty(type)) {
      const value = config[type];
      // Plugin configs should be objects or strings, not primitives like true, 123, null
      if (
        value !== null &&
        typeof value !== "string" &&
        typeof value !== "object"
      ) {
        errors.push({
          message: `${type} must be an object or string, got ${typeof value}`,
        });
      }
    }
  }

  // Pipeline should be array or object if specified (object format will be normalized)
  if (
    config.hasOwnProperty("pipeline") &&
    !Array.isArray(config.pipeline) &&
    (typeof config.pipeline !== "object" || config.pipeline === null)
  ) {
    errors.push({ message: "pipeline must be an array or object" });
  }

  // Only return early for critical errors that prevent normalization
  const criticalErrors = errors.filter(
    (e) =>
      e.message.includes("Configuration must be a non-null object") ||
      e.message.includes("pipeline must be an array or object"),
  );

  if (criticalErrors.length > 0) {
    return {
      valid: false,
      errors: criticalErrors,
      normalized: undefined,
    };
  }

  // Try normalization
  let normalized;
  try {
    normalized = normalizeConfig(config);
  } catch (e) {
    return {
      valid: false,
      errors: [{ message: e.message }],
      normalized: undefined,
    };
  }

  // Post-normalization validation
  if (!normalized || typeof normalized !== "object") {
    errors.push({ message: "Normalized config invalid" });
  }
  if (typeof normalized.namespace !== "string") {
    errors.push({ message: "namespace must be string" });
  }
  if (!Array.isArray(normalized.pipeline)) {
    errors.push({ message: "pipeline must be array" });
  }

  // Validate pipeline entries have valid names
  if (Array.isArray(normalized.pipeline)) {
    for (const entry of normalized.pipeline) {
      if (!entry || typeof entry !== "object") {
        errors.push({ message: "Pipeline entry must be object" });
      } else if (typeof entry.name !== "string") {
        errors.push({
          message: `Pipeline entry name must be string, got ${typeof entry.name}`,
        });
      } else if (typeof entry.stage !== "string") {
        errors.push({
          message: `Pipeline entry stage must be string, got ${typeof entry.stage}`,
        });
      }
    }
  }

  // Check for normalization warnings (invalid entries that were filtered out)
  if (normalized._warnings && Array.isArray(normalized._warnings)) {
    for (const warning of normalized._warnings) {
      errors.push({ message: warning });
    }
  }

  return {
    valid: errors.length === 0,
    errors: errors.length ? errors : undefined,
    normalized,
  };
}

/**
 * Legacy function for backward compatibility
 * @deprecated Use validateRagrc instead
 */
function validateEnhancedRagrcSchema(config) {
  const result = validateRagrc(config);
  return {
    valid: result.valid,
    errors: result.errors,
    legacy: false,
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
      llm: {},
    },
  };

  // Convert plugin specifications
  for (const [_type, plugins] of Object.entries(legacyConfig)) {
    if (
      ["loader", "embedder", "retriever", "llm", "reranker"].includes(_type)
    ) {
      enhanced.plugins[_type] = {};
      for (const [name, spec] of Object.entries(plugins)) {
        enhanced.plugins[_type][name] = typeof spec === "string" ? spec : spec;
      }
    }
  }

  // Convert pipeline configuration
  if (legacyConfig.pipeline) {
    enhanced.pipeline = {
      stages: legacyConfig.pipeline,
    };
  }

  // Add namespace as metadata
  if (legacyConfig.namespace) {
    enhanced.metadata = {
      name: legacyConfig.namespace,
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
  if (typeof spec === "string") {
    return {
      name: spec,
      version: "latest",
      source: "registry",
      enabled: true,
    };
  }

  return {
    name: spec.name,
    version: spec.version || "latest",
    source: spec.source || "registry",
    url: spec.url,
    path: spec.path,
    _config: spec._config || {},
    enabled: spec.enabled !== false,
    fallback: spec.fallback,
  };
}

/**
 * Extract plugin dependencies from configuration
 * @param {object} _config - Enhanced configuration
 * @returns {Array<{type: string, name: string, spec: object}>}
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
        spec: normalizedSpec,
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
  const requiredTypes = ["loader", "embedder", "retriever", "llm"];
  for (const _type of requiredTypes) {
    if (
      !config.plugins?.[_type] ||
      Object.keys(config.plugins[_type]).length === 0
    ) {
      issues.push(`Missing required plugin type: ${_type}`);
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
      const fallbackExists = dependencies.some(
        (d) => d._type === dep._type && d.name === dep.spec.fallback,
      );
      if (!fallbackExists) {
        issues.push(
          `Fallback plugin '${dep.spec.fallback}' not found for ${dep._type}:${dep.name}`,
        );
      }
    }
  }

  return {
    valid: issues.length === 0,
    issues,
  };
}

// Default export

module.exports = {
  validateRagrc,
  normalizeConfig,
  buildRagrcJsonSchema,
  validateEnhancedRagrcSchema, // Legacy compatibility
  convertLegacyConfig,
  normalizePluginSpec,
  extractPluginDependencies,
  validateConfigConsistency,
  enhancedRagrcSchema,
  legacyRagrcSchema,
};
