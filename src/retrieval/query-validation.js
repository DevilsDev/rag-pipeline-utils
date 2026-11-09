'use strict';

/**
 * One check for the query inputs of a store, shared so every store accepts
 * and rejects the same values.
 *
 * @param {*} topK - Requested number of results; undefined or null means the default
 * @param {number} fallback - The default
 * @param {string} who - Store name for error messages
 * @returns {number} A whole number, 0 or more (0 means no results)
 * @throws {Error} When topK is not a whole number of 0 or more
 */
function validTopK(topK, fallback, who) {
  if (topK === undefined || topK === null) return fallback;
  const n = typeof topK === 'string' && topK.trim() ? Number(topK) : topK;
  if (typeof n !== 'number' || !Number.isInteger(n) || n < 0) {
    throw new Error(`${who}: topK must be a whole number of 0 or more (got ${topK})`);
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
