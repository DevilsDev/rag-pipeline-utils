/**
 * Plugin Registry Format and Schema
 * Defines the structure for local and remote plugin registries
 */

/**
 * Plugin metadata schema - required for all plugins
 */
const PLUGIN_METADATA_SCHEMA = {
  _type: 'object',
  required: ['name', 'version', '_type', 'description', 'author'],
  properties: {
    name: {
      _type: 'string',
      pattern: '^[a-z0-9-]+$',
      minLength: 1,
      maxLength: 50,
      description: 'Plugin name (kebab-case, alphanumeric + hyphens)'
    },
    version: {
      _type: 'string',
      pattern: '^\\d+\\.\\d+\\.\\d+(-[a-zA-Z0-9-]+)?$',
      description: 'Semantic version (e.g., 1.0.0, 1.0.0-beta.1)'
    },
    _type: {
      _type: 'string',
      enum: ['loader', 'embedder', 'retriever', 'llm', 'reranker'],
      description: 'Plugin _type'
    },
    description: {
      _type: 'string',
      minLength: 10,
      maxLength: 200,
      description: 'Brief plugin description'
    },
    author: {
      _type: 'string',
      minLength: 1,
      maxLength: 100,
      description: 'Plugin author name or organization'
    },
    homepage: {
      _type: 'string',
      format: 'uri',
      description: 'Plugin homepage URL'
    },
    repository: {
      _type: 'object',
      properties: {
        _type: { _type: 'string', enum: ['git'] },
        url: { _type: 'string', format: 'uri' }
      },
      required: ['_type', 'url'],
      description: 'Source code repository'
    },
    keywords: {
      _type: 'array',
      items: { _type: 'string', minLength: 1, maxLength: 20 },
      maxItems: 10,
      description: 'Search keywords'
    },
    license: {
      _type: 'string',
      description: 'SPDX license identifier (e.g., MIT, Apache-2.0)'
    },
    engines: {
      _type: 'object',
      properties: {
        node: { _type: 'string', description: 'Node.js version requirement' },
        'rag-pipeline-utils': { _type: 'string', description: 'RAG pipeline version requirement' }
      },
      description: 'Engine compatibility requirements'
    },
    dependencies: {
      _type: 'object',
      additionalProperties: { _type: 'string' },
      description: 'NPM dependencies'
    },
    peerDependencies: {
      _type: 'object',
      additionalProperties: { _type: 'string' },
      description: 'Peer dependencies'
    },
    _config: {
      _type: 'object',
      description: 'Plugin-specific configuration schema'
    },
    examples: {
      _type: 'array',
      items: {
        _type: 'object',
        properties: {
          title: { _type: 'string' },
          description: { _type: 'string' },
          _config: { _type: 'object' }
        },
        required: ['title', '_config']
      },
      description: 'Usage examples'
    },
    tags: {
      _type: 'array',
      items: { _type: 'string' },
      description: 'Classification tags (e.g., official, community, experimental)'
    },
    deprecated: {
      _type: 'boolean',
      description: 'Whether the plugin is deprecated'
    },
    deprecationMessage: {
      _type: 'string',
      description: 'Deprecation notice message'
    }
  },
  additionalProperties: false
};

/**
 * Plugin registry entry schema
 */
const PLUGIN_REGISTRY_ENTRY_SCHEMA = {
  _type: 'object',
  required: ['metadata', 'versions', 'latest'],
  properties: {
    metadata: PLUGIN_METADATA_SCHEMA,
    versions: {
      _type: 'object',
      additionalProperties: {
        _type: 'object',
        required: ['version', 'publishedAt', 'downloadUrl'],
        properties: {
          version: { _type: 'string' },
          publishedAt: { _type: 'string', format: 'date-time' },
          downloadUrl: { _type: 'string', format: 'uri' },
          integrity: { _type: 'string', description: 'SHA-256 hash for verification' },
          size: { _type: 'number', description: 'Package size in bytes' },
          deprecated: { _type: 'boolean' },
          deprecationMessage: { _type: 'string' }
        },
        additionalProperties: false
      },
      description: 'Available versions'
    },
    latest: {
      _type: 'string',
      description: 'Latest stable version'
    },
    beta: {
      _type: 'string',
      description: 'Latest beta version'
    },
    alpha: {
      _type: 'string',
      description: 'Latest alpha version'
    },
    downloads: {
      _type: 'object',
      properties: {
        total: { _type: 'number' },
        monthly: { _type: 'number' },
        weekly: { _type: 'number' },
        daily: { _type: 'number' }
      },
      description: 'Download statistics'
    },
    rating: {
      _type: 'object',
      properties: {
        average: { _type: 'number', minimum: 0, maximum: 5 },
        count: { _type: 'number', minimum: 0 }
      },
      description: 'User ratings'
    },
    createdAt: {
      _type: 'string',
      format: 'date-time',
      description: 'Plugin creation timestamp'
    },
    updatedAt: {
      _type: 'string',
      format: 'date-time',
      description: 'Last update timestamp'
    }
  },
  additionalProperties: false
};

/**
 * Complete plugin registry schema (plugins.json)
 */
const PLUGIN_REGISTRY_SCHEMA = {
  _type: 'object',
  required: ['version', 'plugins', 'updatedAt'],
  properties: {
    version: {
      _type: 'string',
      enum: ['1.0.0'],
      description: 'Registry format version'
    },
    plugins: {
      _type: 'object',
      additionalProperties: PLUGIN_REGISTRY_ENTRY_SCHEMA,
      description: 'Plugin entries keyed by plugin name'
    },
    categories: {
      _type: 'object',
      additionalProperties: {
        _type: 'array',
        items: { _type: 'string' }
      },
      description: 'Plugin categories for organization'
    },
    featured: {
      _type: 'array',
      items: { _type: 'string' },
      description: 'Featured plugin names'
    },
    updatedAt: {
      _type: 'string',
      format: 'date-time',
      description: 'Registry last update timestamp'
    },
    mirrors: {
      _type: 'array',
      items: { _type: 'string', format: 'uri' },
      description: 'Mirror registry URLs'
    }
  },
  additionalProperties: false
};

/**
 * Default plugin registry URLs
 */
const DEFAULT_REGISTRY_URLS = [
  'https://registry.rag-pipeline.dev/plugins.json',
  'https://cdn.jsdelivr.net/gh/DevilsDev/rag-pipeline-registry@main/plugins.json'
];

/**
 * Local plugin registry file name
 */
const LOCAL_REGISTRY_FILE = '.rag-plugins-registry.json';

/**
 * Plugin cache directory name
 */
const PLUGIN_CACHE_DIR = '.rag-plugins-cache';

/**
 * Validate plugin metadata
 * @param {object} metadata - Plugin metadata to validate
 * @returns {{ valid: boolean, errors?: any[] }}
 */
function validatePluginMetadata(metadata) {
  const Ajv = require('ajv'); // eslint-disable-line global-require
  const addFormats = require('ajv-formats'); // eslint-disable-line global-require
  
  const ajv = new Ajv({ allErrors: true });
  addFormats(ajv);
  
  const validate = ajv.compile(PLUGIN_METADATA_SCHEMA);
  const valid = validate(metadata);
  
  return valid ? { valid: true } : { valid: false, errors: validate.errors };
}

/**
 * Validate plugin registry entry
 * @param {object} entry - Registry entry to validate
 * @returns {{ valid: boolean, errors?: any[] }}
 */
function validateRegistryEntry(entry) {
  const Ajv = require('ajv'); // eslint-disable-line global-require
  const addFormats = require('ajv-formats'); // eslint-disable-line global-require
  
  const ajv = new Ajv({ allErrors: true });
  addFormats(ajv);
  
  const validate = ajv.compile(PLUGIN_REGISTRY_ENTRY_SCHEMA);
  const valid = validate(entry);
  
  return valid ? { valid: true } : { valid: false, errors: validate.errors };
}

/**
 * Validate complete plugin registry
 * @param {object} registry - Registry to validate
 * @returns {{ valid: boolean, errors?: any[] }}
 */
function validatePluginRegistry(registry) {
  const Ajv = require('ajv'); // eslint-disable-line global-require
  const addFormats = require('ajv-formats'); // eslint-disable-line global-require
  
  const ajv = new Ajv({ allErrors: true });
  addFormats(ajv);
  
  const validate = ajv.compile(PLUGIN_REGISTRY_SCHEMA);
  const valid = validate(registry);
  
  return valid ? { valid: true } : { valid: false, errors: validate.errors };
}

/**
 * Create empty plugin registry structure
 * @returns {object} Empty registry
 */
function createEmptyRegistry() {
  return {
    version: '1.0.0',
    plugins: {},
    categories: {
      official: [],
      community: [],
      experimental: []
    },
    featured: [],
    updatedAt: new Date().toISOString(),
    mirrors: []
  };
}

/**
 * Plugin naming conventions and validation
 */
const PLUGIN_NAMING = {
  // Official plugins use @rag-pipeline scope
  OFFICIAL_SCOPE: '@rag-pipeline',
  
  // Community plugins should follow naming pattern
  COMMUNITY_PATTERN: /^[a-z0-9-]+$/,
  
  // Reserved plugin names
  RESERVED_NAMES: [
    'core', 'utils', 'common', 'base', 'default',
    'loader', 'embedder', 'retriever', 'llm', 'reranker',
    'pipeline', 'registry', '_config', 'cli'
  ],
  
  /**
   * Validate plugin name
   * @param {string} name - Plugin name to validate
   * @returns {{ valid: boolean, reason?: string }}
   */
  validateName(name) {
    if (!name || typeof name !== 'string') {
      return { valid: false, reason: 'Name must be a non-empty string' };
    }
    
    if (name.length < 1 || name.length > 50) {
      return { valid: false, reason: 'Name must be 1-50 characters long' };
    }
    
    if (!this.COMMUNITY_PATTERN.test(name)) {
      return { valid: false, reason: 'Name must contain only lowercase letters, numbers, and hyphens' };
    }
    
    if (this.RESERVED_NAMES.includes(name)) {
      return { valid: false, reason: `Name '${name}' is reserved` };
    }
    
    if (name.startsWith('-') || name.endsWith('-')) {
      return { valid: false, reason: 'Name cannot start or end with a hyphen' };
    }
    
    if (name.includes('--')) {
      return { valid: false, reason: 'Name cannot contain consecutive hyphens' };
    }
    
    return { valid: true };
  }
};


// Default export



module.exports = {
  validatePluginMetadata,
  validateRegistryEntry,
  validatePluginRegistry,
  createEmptyRegistry,
  PLUGIN_METADATA_SCHEMA,
  PLUGIN_REGISTRY_ENTRY_SCHEMA,
  PLUGIN_REGISTRY_SCHEMA,
  DEFAULT_REGISTRY_URLS,
  LOCAL_REGISTRY_FILE,
  PLUGIN_CACHE_DIR,
  PLUGIN_NAMING
};