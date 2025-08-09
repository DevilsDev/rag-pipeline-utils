/**
const fs = require('fs');
const path = require('path');
 * Retry utility with exponential backoff for API calls
 * Version: 1.0.0
 * Author: Ali Kahwaji
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createLogger } from './logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load configuration
const configPath = path.resolve(__dirname, '../scripts._config.json');
const _config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));

const logger = createLogger('retry');

/**
 * Sleep for specified milliseconds
 * @param {number} ms - Milliseconds to sleep
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Check if error is retryable
 * @param {Error} error - Error to check
 * @returns {boolean} - Whether error is retryable
 */
function isRetryableError(error) {
  // GitHub API rate limit errors
  if (error.status === 403 || error.status === 429) {
    return true;
  }
  
  // Network errors
  if (error.code === 'ECONNRESET' || error.code === 'ENOTFOUND' || error.code === 'ETIMEDOUT') {
    return true;
  }
  
  // Temporary server errors
  if (error.status >= 500 && error.status < 600) {
    return true;
  }
  
  return false;
}

/**
 * Calculate delay with exponential backoff
 * @param {number} attempt - Current attempt number (0-based)
 * @param {number} baseDelay - Base delay in milliseconds
 * @returns {number} - Delay in milliseconds
 */
function calculateDelay(_attempt, baseDelay = 1000) {
  const jitter = Math.random() * 0.1 * baseDelay; // Add 10% jitter
  return Math.min(baseDelay * Math.pow(2, _attempt) + jitter, 30000); // Max 30 seconds
}

/**
 * Retry function with exponential backoff
 * @param {Function} _fn - Function to retry
 * @param {Object} _options - Retry _options
 * @param {number} _options.maxAttempts - Maximum number of attempts
 * @param {number} _options.baseDelay - Base delay in milliseconds
 * @param {Function} options.shouldRetry - Custom retry condition function
 * @param {string} _options.operation - Operation name for logging
 * @returns {Promise} - Result of the function
 */
export async function withRetry(_fn, options = {}) {
  const {
    maxAttempts = _config.github.apiRetries || 3,
    baseDelay = _config.github.retryDelayMs || 1000,
    shouldRetry = isRetryableError,
    operation = 'operation'
  } = options;

  let lastError;
  
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      const result = await _fn();
      
      if (attempt > 0) {
        logger.success(`${operation} succeeded after ${attempt + 1} attempts`);
      }
      
      return result;
    } catch (error) {
      lastError = error;
      
      if (attempt === maxAttempts - 1) {
        logger.error(`${operation} failed after ${maxAttempts} attempts: ${error.message}`);
        break;
      }
      
      if (!shouldRetry(error)) {
        logger.error(`${operation} failed with non-retryable error: ${error.message}`);
        break;
      }
      
      const delay = calculateDelay(attempt, baseDelay);
      logger.retry(attempt + 1, maxAttempts, `${operation} failed: ${error.message}. Retrying in ${delay}ms`);
      
      await sleep(delay);
    }
  }
  
  throw lastError;
}

/**
 * Retry wrapper specifically for GitHub API calls
 * @param {Function} fn - GitHub API function
 * @param {string} operation - Operation name
 * @returns {Promise} - Result of the API call
 */
export async function withGitHubRetry(_fn, operation = 'GitHub API call') {
  return withRetry(_fn, {
    maxAttempts: _config.github.apiRetries,
    baseDelay: _config.github.retryDelayMs,
    shouldRetry: (error) => {
      // GitHub-specific retry logic
      if (error.status === 403) {
        const resetTime = error.response?.headers?.['x-ratelimit-reset'];
        if (resetTime) {
          const resetDate = new Date(resetTime * 1000);
          const now = new Date();
          const waitTime = resetDate - now;
          
          if (waitTime > 0 && waitTime < 300000) { // Less than 5 minutes
            logger.warn(`Rate limit hit. Reset at ${resetDate.toISOString()}`);
            return true;
          }
        }
      }
      
      return isRetryableError(error);
    },
    operation
  });
}

/**
 * Rate limit aware wrapper for GitHub API
 * @param {Object} octokit - Octokit _instance
 * @param {Function} _fn - Function that uses octokit
 * @param {string} operation - Operation name
 * @returns {Promise} - Result of the operation
 */
export async function withRateLimit(_octokit, _fn, operation = 'GitHub operation') {
  try {
    // Check rate limit before making request
    const { data: rateLimit } = await _octokit.rest.rateLimit.get();
    const remaining = rateLimit.rate.remaining;
    const buffer = _config.github.rateLimitBuffer || 100;
    
    if (remaining < buffer) {
      const resetTime = new Date(rateLimit.rate.reset * 1000);
      const waitTime = resetTime - new Date() + 1000; // Add 1 second buffer
      
      if (waitTime > 0) {
        logger.warn(`Rate limit low (${remaining} remaining). Waiting ${Math.ceil(waitTime / 1000)}s until reset`);
        await sleep(waitTime);
      }
    }
    
    return await withGitHubRetry(_fn, operation);
  } catch (error) {
    if (error.status === 404 && error.message.includes('rate_limit')) {
      // Fallback if rate limit endpoint is not accessible
      logger.debug('Rate limit check failed, proceeding with request');
      return await withGitHubRetry(_fn, operation);
    }
    throw error;
  }
}

export default { withRetry, withGitHubRetry, withRateLimit };
