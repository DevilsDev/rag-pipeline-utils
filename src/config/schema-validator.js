/**
 * Configuration Schema Validator - Enterprise-grade config validation
 * Provides JSON Schema validation for all configuration files
 */

const Ajv = require('ajv');
const addFormats = require('ajv-formats');
const { logger } = require('../utils/logger');

class ConfigSchemaValidator {
  constructor() {
    this.ajv = new Ajv({ 
      allErrors: true, 
      verbose: true,
      strict: false 
    });
    addFormats(this.ajv);
    
    // Register custom formats
    this.ajv.addFormat('semver', /^\d+\.\d+\.\d+(-[\w.-]+)?(\+[\w.-]+)?$/);
    this.ajv.addFormat('log-level', /^(trace|debug|info|warn|error|fatal)$/);
    
    this.schemas = new Map();
    this._loadSchemas();
  }

  _loadSchemas() {
    // Core pipeline configuration schema
    const pipelineSchema = {
      type: 'object',
      properties: {
        version: { type: 'string', format: 'semver' },
        name: { type: 'string', minLength: 1 },
        description: { type: 'string' },
        pipeline: {
          type: 'object',
          properties: {
            steps: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  name: { type: 'string', minLength: 1 },
                  type: { 
                    type: 'string', 
                    enum: ['ingest', 'chunk', 'embed', 'store', 'query', 'evaluate'] 
                  },
                  config: { type: 'object' },
                  enabled: { type: 'boolean', default: true }
                },
                required: ['name', 'type'],
                additionalProperties: false
              },
              minItems: 1
            },
            concurrency: { type: 'integer', minimum: 1, maximum: 100, default: 5 },
            timeout: { type: 'integer', minimum: 1000, default: 30000 },
            retries: { type: 'integer', minimum: 0, maximum: 10, default: 3 }
          },
          required: ['steps'],
          additionalProperties: false
        },
        logging: {
          type: 'object',
          properties: {
            level: { type: 'string', format: 'log-level', default: 'info' },
            structured: { type: 'boolean', default: true },
            correlationId: { type: 'boolean', default: true }
          },
          additionalProperties: false
        }
      },
      required: ['version', 'name', 'pipeline'],
      additionalProperties: false
    };

    // AI/ML configuration schema
    const aiConfigSchema = {
      type: 'object',
      properties: {
        embeddings: {
          type: 'object',
          properties: {
            provider: { 
              type: 'string', 
              enum: ['openai', 'azure', 'huggingface', 'local'] 
            },
            model: { type: 'string', minLength: 1 },
            dimensions: { type: 'integer', minimum: 1, maximum: 4096 },
            batchSize: { type: 'integer', minimum: 1, maximum: 1000, default: 100 },
            timeout: { type: 'integer', minimum: 1000, default: 30000 }
          },
          required: ['provider', 'model'],
          additionalProperties: false
        },
        training: {
          type: 'object',
          properties: {
            batchSize: { type: 'integer', minimum: 1, maximum: 1024, default: 32 },
            learningRate: { type: 'number', minimum: 0.0001, maximum: 1, default: 0.001 },
            epochs: { type: 'integer', minimum: 1, maximum: 1000, default: 10 },
            validationSplit: { type: 'number', minimum: 0, maximum: 0.5, default: 0.2 }
          },
          additionalProperties: false
        },
        federation: {
          type: 'object',
          properties: {
            minParticipants: { type: 'integer', minimum: 2, maximum: 1000, default: 2 },
            maxParticipants: { type: 'integer', minimum: 2, maximum: 10000, default: 100 },
            roundDuration: { type: 'integer', minimum: 60000, default: 300000 },
            convergenceThreshold: { type: 'number', minimum: 0.0001, maximum: 1, default: 0.001 }
          },
          additionalProperties: false
        }
      },
      additionalProperties: false
    };

    // Security configuration schema
    const securitySchema = {
      type: 'object',
      properties: {
        authentication: {
          type: 'object',
          properties: {
            enabled: { type: 'boolean', default: true },
            provider: { 
              type: 'string', 
              enum: ['jwt', 'oauth2', 'api-key', 'none'] 
            },
            tokenExpiry: { type: 'integer', minimum: 300, default: 3600 }
          },
          required: ['enabled', 'provider'],
          additionalProperties: false
        },
        encryption: {
          type: 'object',
          properties: {
            algorithm: { 
              type: 'string', 
              enum: ['aes-256-gcm', 'aes-256-cbc', 'chacha20-poly1305'] 
            },
            keyRotation: { type: 'boolean', default: true },
            keyRotationInterval: { type: 'integer', minimum: 86400, default: 2592000 }
          },
          additionalProperties: false
        },
        audit: {
          type: 'object',
          properties: {
            enabled: { type: 'boolean', default: true },
            retention: { type: 'integer', minimum: 86400, default: 7776000 },
            sensitiveFields: {
              type: 'array',
              items: { type: 'string' },
              default: ['password', 'token', 'key', 'secret']
            }
          },
          additionalProperties: false
        }
      },
      additionalProperties: false
    };

    this.schemas.set('pipeline', pipelineSchema);
    this.schemas.set('ai', aiConfigSchema);
    this.schemas.set('security', securitySchema);
  }

  validate(config, schemaName) {
    const schema = this.schemas.get(schemaName);
    if (!schema) {
      throw new Error(`Unknown schema: ${schemaName}`);
    }

    const validate = this.ajv.compile(schema);
    const valid = validate(config);

    if (!valid) {
      const errors = validate.errors.map(error => ({
        path: error.instancePath || error.schemaPath,
        message: error.message,
        value: error.data,
        allowedValues: error.schema?.enum
      }));

      logger.error('Configuration validation failed', {
        schema: schemaName,
        errors,
        config: this._sanitizeConfig(config)
      });

      return {
        valid: false,
        errors
      };
    }

    logger.info('Configuration validation passed', {
      schema: schemaName,
      configKeys: Object.keys(config)
    });

    return {
      valid: true,
      errors: []
    };
  }

  validatePipeline(config) {
    return this.validate(config, 'pipeline');
  }

  validateAI(config) {
    return this.validate(config, 'ai');
  }

  validateSecurity(config) {
    return this.validate(config, 'security');
  }

  addSchema(name, schema) {
    this.schemas.set(name, schema);
    logger.info('Custom schema registered', { schemaName: name });
  }

  getSchema(name) {
    return this.schemas.get(name);
  }

  listSchemas() {
    return Array.from(this.schemas.keys());
  }

  _sanitizeConfig(config) {
    // Remove sensitive fields from logs
    const sensitiveFields = ['password', 'token', 'key', 'secret', 'apiKey'];
    const sanitized = JSON.parse(JSON.stringify(config));
    
    const sanitizeObject = (obj) => {
      for (const [key, value] of Object.entries(obj)) {
        if (sensitiveFields.some(field => key.toLowerCase().includes(field))) {
          obj[key] = '[REDACTED]';
        } else if (typeof value === 'object' && value !== null) {
          sanitizeObject(value);
        }
      }
    };

    sanitizeObject(sanitized);
    return sanitized;
  }
}

// Create singleton instance
const validator = new ConfigSchemaValidator();

module.exports = {
  ConfigSchemaValidator,
  validator
};
