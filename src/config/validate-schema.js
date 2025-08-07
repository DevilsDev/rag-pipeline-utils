/**
 * Version: 1.3.0
 * Description: AJV-powered validators for .ragrc.json full config and plugin-only structure
 * Author: Ali Kahwaji
 * File: /src/config/validate-schema.js
 */

const Ajv = require('ajv');

/**
 * Full .ragrc.json schema (used in load-config.js)
 */
const ragrcSchema = {
  type: 'object',
  required: ['loader', 'embedder', 'retriever', 'llm', 'namespace', 'pipeline'],
  properties: {
    loader: {
      type: 'object',
      minProperties: 1,
      additionalProperties: { type: 'string' }
    },
    embedder: {
      type: 'object',
      minProperties: 1,
      additionalProperties: { type: 'string' }
    },
    retriever: {
      type: 'object',
      minProperties: 1,
      additionalProperties: { type: 'string' }
    },
    llm: {
      type: 'object',
      minProperties: 1,
      additionalProperties: { type: 'string' }
    },
    namespace: {
      type: 'string',
      minLength: 1
    },
    pipeline: {
      type: 'array',
      items: {
        type: 'string',
        enum: ['loader', 'embedder', 'retriever']
      },
      minItems: 1,
      uniqueItems: true
    }
  },
  additionalProperties: false
};

/**
 * Minimal plugin-only schema (used in load-plugin-config.js)
 */
const pluginSchema = {
  type: 'object',
  required: ['loader', 'embedder', 'retriever', 'llm'],
  properties: {
    loader: {
      type: 'object',
      minProperties: 1,
      additionalProperties: { type: 'string' }
    },
    embedder: {
      type: 'object',
      minProperties: 1,
      additionalProperties: { type: 'string' }
    },
    retriever: {
      type: 'object',
      minProperties: 1,
      additionalProperties: { type: 'string' }
    },
    llm: {
      type: 'object',
      minProperties: 1,
      additionalProperties: { type: 'string' }
    }
  },
  additionalProperties: true // allow namespace, pipeline, etc.
};

/**
 * Validates the full .ragrc.json config structure
 * @param {object} config
 * @returns {{ valid: boolean, errors?: any[] }}
 */
function validateRagrcSchema(config) {
  const ajv = new Ajv({ allErrors: true });
  const validate = ajv.compile(ragrcSchema);
  const valid = validate(config);
  return valid ? { valid: true } : { valid: false, errors: validate.errors };
}

/**
 * Validates a plugin-only structure (for runtime plugin loading)
 * @param {object} config
 * @returns {{ valid: boolean, errors?: any[] }}
 */
function validatePluginSchema(config) {
  const ajv = new Ajv({ allErrors: true });
  const validate = ajv.compile(pluginSchema);
  const valid = validate(config);
  return valid ? { valid: true } : { valid: false, errors: validate.errors };
}


module.exports = {
  validateRagrcSchema,
  validatePluginSchema
};