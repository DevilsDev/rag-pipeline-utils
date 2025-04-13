/**
 * Version: 0.1.0
 * Path: /src/config/validate-schema.js
 * Description: JSON schema validation for `.ragrc.json` config using AJV
 * Author: Ali Kahwaji
 */

import Ajv from 'ajv';

// Define allowed config structure
const schema = {
  type: 'object',
  properties: {
    loader: { type: 'string' },
    embedder: { type: 'string' },
    retriever: { type: 'string' },
    llm: { type: 'string' },
    chunk: {
      type: 'object',
      properties: {
        strategy: { type: 'string' },
        size: { type: 'number' }
      },
      required: ['strategy', 'size'],
      additionalProperties: false
    }
  },
  required: ['loader', 'embedder', 'retriever', 'llm'],
  additionalProperties: false
};

const ajv = new Ajv();
const validateSchema = ajv.compile(schema);

/**
 * Validates a given config object against the `.ragrc.json` schema.
 * Throws if the schema is invalid.
 *
 * @param {object} config - Configuration object
 * @throws {Error} - Validation errors, if any
 */
export function validate(config) {
  const valid = validateSchema(config);
  if (!valid) {
    const messages = validateSchema.errors.map(e => `${e.instancePath} ${e.message}`).join(', ');
    throw new Error(`Invalid config: ${messages}`);
  }
}

