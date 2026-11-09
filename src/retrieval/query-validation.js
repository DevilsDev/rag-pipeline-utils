'use strict';

/**
 * One check for the query inputs of a store, shared so every store accepts
 * and rejects the same values.
 *
 * @param {*} topK - Requested number of results; undefined or null means the default
 * @param {number} fallback - The default
 * @param {string} who - Store name for error messages
 * @returns {number} A positive integer
 * @throws {Error} When topK is not a positive whole number
 */
function validTopK(topK, fallback, who) {
  if (topK === undefined || topK === null) return fallback;
  const n = typeof topK === 'string' && topK.trim() ? Number(topK) : topK;
  if (typeof n !== 'number' || !Number.isInteger(n) || n < 1) {
    throw new Error(`${who}: topK must be a positive whole number (got ${topK})`);
  }
  return n;
}

/**
 * @param {*} vector - Query vector
 * @param {string} who - Store name for error messages
 * @throws {Error} When the vector has a NaN or infinite entry
 */
function assertFiniteVector(vector, who) {
  for (let i = 0; i < vector.length; i++) {
    if (!Number.isFinite(vector[i])) {
      throw new Error(
        `${who}: queryVector must contain only finite numbers (entry ${i} is ${vector[i]})`,
      );
    }
  }
}

module.exports = { validTopK, assertFiniteVector };
