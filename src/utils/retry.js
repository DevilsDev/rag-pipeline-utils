/**
 * Version: 0.1.0
 * Path: /src/utils/retry.js
 * Description: Generic retry wrapper with exponential backoff for async operations
 * Author: Ali Kahwaji
 */

import { logger } from './logger.js';

/**
 * Retry wrapper for async functions with exponential backoff
 *
 * @param {Function} fn - The async function to retry
 * @param {Object} options
 * @param {number} [options.retries=3] - Number of retry attempts
 * @param {number} [options.initialDelay=300] - Initial delay in ms
 * @param {string} [options.label] - Optional label for logging context
 * @returns {Promise<*>} - The resolved result of the function
 * @throws {Error} - The final error if all retries fail
 */
export async function withRetry(fn, { retries = 3, initialDelay = 300, label = 'operation' } = {}) {
  let attempt = 0;
  let delay = initialDelay;

  while (attempt <= retries) {
    try {
      if (attempt > 0) {
        logger.warn({ attempt, label }, `Retrying ${label} (attempt ${attempt})`);
      }
      return await fn();
    } catch (err) {
      attempt++;
      if (attempt > retries) {
        logger.error({ label, error: err.message }, `Failed ${label} after ${retries} retries`);
        throw err;
      }
      await new Promise(resolve => setTimeout(resolve, delay));
      delay *= 2; // Exponential backoff
    }
  }
}

