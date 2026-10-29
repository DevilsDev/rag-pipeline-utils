'use strict';

/**
 * Builds the cache identity a built-in component reports through
 * getCacheKey(role): every setting that changes its output, so two
 * configurations never share cached results.
 */

const crypto = require('crypto');

const digest = (value) =>
  crypto
    .createHash('sha256')
    .update(String(value ?? ''))
    .digest('hex')
    .slice(0, 16);

/**
 * @param {string} kind - e.g. 'openai'
 * @param {Object} fields - Settings that change the output
 * @returns {string}
 */
function componentCacheKey(kind, fields) {
  const parts = Object.keys(fields)
    .sort()
    .map((name) => {
      const value = fields[name];
      // Long free text (system prompts) is hashed to keep keys short.
      const text =
        typeof value === 'string' && value.length > 64
          ? `#${digest(value)}`
          : value;
      return `${name}=${text === undefined ? '' : text}`;
    });
  return `${kind}|${parts.join('|')}`;
}

module.exports = { componentCacheKey, digest };
