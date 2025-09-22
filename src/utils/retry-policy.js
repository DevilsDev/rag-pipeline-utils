/**
 * @fileoverview Enterprise Retry Policy System
 * Provides exponential backoff, circuit breaker patterns, and retry budgets
 *
 * @author DevilsDev Team
 * @since 2.1.8
 */

const { logger } = require('./structured-logger.js');

/**
 * Retry policy with exponential backoff and circuit breaker
 */
class RetryPolicy {
  constructor(options = {}) {
    this.maxRetries = options.maxRetries || 3;
    this.baseDelay = options.baseDelay || 1000;
    this.maxDelay = options.maxDelay || 30000;
    this.multiplier = options.multiplier || 2;
    this.jitter = options.jitter || 0.1;
    this.timeout = options.timeout || 60000;

    // Circuit breaker configuration
    this.circuitBreaker = {
      enabled: options.circuitBreaker?.enabled !== false,
      failureThreshold: options.circuitBreaker?.failureThreshold || 5,
      resetTimeout: options.circuitBreaker?.resetTimeout || 60000,
      state: 'CLOSED', // CLOSED, OPEN, HALF_OPEN
      failures: 0,
      lastFailureTime: null,
    };

    // Retry budget configuration
    this.retryBudget = {
      enabled: options.retryBudget?.enabled !== false,
      maxRetriesPerMinute: options.retryBudget?.maxRetriesPerMinute || 60,
      windowSize: options.retryBudget?.windowSize || 60000,
      retries: [],
    };

    // Strategy for determining retryable errors
    this.retryCondition =
      options.retryCondition || this.defaultRetryCondition.bind(this);
    this.onRetry = options.onRetry || this.defaultOnRetry.bind(this);
    this.onFailure = options.onFailure || this.defaultOnFailure.bind(this);

    // Sleep function (injectable for testing)
    this.sleep =
      options.sleep ||
      ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  }

  /**
   * Default retry condition - retry on network/timeout errors
   * @param {Error} error - Error to evaluate
   * @returns {boolean} Whether error is retryable
   */
  defaultRetryCondition(error) {
    // Retry on common transient errors
    const retryableCodes = [
      'ECONNRESET',
      'ENOTFOUND',
      'ECONNREFUSED',
      'ETIMEDOUT',
    ];
    const retryableMessages = ['timeout', 'network', 'connection', 'temporary'];

    if (error.code && retryableCodes.includes(error.code)) {
      return true;
    }

    const message = error.message.toLowerCase();
    return retryableMessages.some((keyword) => message.includes(keyword));
  }

  /**
   * Default retry callback
   * @param {Error} error - Error that caused retry
   * @param {number} attempt - Current attempt number
   * @param {number} delay - Delay before next attempt
   */
  defaultOnRetry(error, attempt, delay) {
    logger.warn('Retrying operation', {
      component: 'retry-policy',
      attempt,
      delay,
      error: error.message,
      errorCode: error.code,
    });
  }

  /**
   * Default failure callback
   * @param {Error} error - Final error after all retries
   * @param {number} attempts - Total attempts made
   */
  defaultOnFailure(error, attempts) {
    logger.error('Operation failed after all retries', {
      component: 'retry-policy',
      attempts,
      error: error.message,
      errorCode: error.code,
    });
  }

  /**
   * Check circuit breaker state
   * @returns {boolean} Whether circuit is open (requests should fail fast)
   */
  isCircuitOpen() {
    if (!this.circuitBreaker.enabled) {
      return false;
    }

    const { state, failures, failureThreshold, resetTimeout, lastFailureTime } =
      this.circuitBreaker;

    if (state === 'OPEN') {
      // Check if we should transition to HALF_OPEN
      if (Date.now() - lastFailureTime >= resetTimeout) {
        this.circuitBreaker.state = 'HALF_OPEN';
        logger.info('Circuit breaker transitioning to HALF_OPEN', {
          component: 'circuit-breaker',
          previousFailures: failures,
        });
        return false;
      }
      return true;
    }

    return failures >= failureThreshold;
  }

  /**
   * Record circuit breaker success
   */
  recordCircuitSuccess() {
    if (!this.circuitBreaker.enabled) return;

    if (this.circuitBreaker.state === 'HALF_OPEN') {
      this.circuitBreaker.state = 'CLOSED';
      this.circuitBreaker.failures = 0;
      logger.info('Circuit breaker closed after successful operation', {
        component: 'circuit-breaker',
      });
    }
  }

  /**
   * Record circuit breaker failure
   */
  recordCircuitFailure() {
    if (!this.circuitBreaker.enabled) return;

    this.circuitBreaker.failures++;
    this.circuitBreaker.lastFailureTime = Date.now();

    if (this.circuitBreaker.failures >= this.circuitBreaker.failureThreshold) {
      this.circuitBreaker.state = 'OPEN';
      logger.warn('Circuit breaker opened due to excessive failures', {
        component: 'circuit-breaker',
        failures: this.circuitBreaker.failures,
        threshold: this.circuitBreaker.failureThreshold,
      });
    }
  }

  /**
   * Check retry budget availability
   * @returns {boolean} Whether retry budget allows retry
   */
  checkRetryBudget() {
    if (!this.retryBudget.enabled) {
      return true;
    }

    const now = Date.now();
    const windowStart = now - this.retryBudget.windowSize;

    // Clean old retries outside window
    this.retryBudget.retries = this.retryBudget.retries.filter(
      (time) => time > windowStart,
    );

    // Check if we're under budget
    const retriesInWindow = this.retryBudget.retries.length;
    const budgetAvailable =
      retriesInWindow < this.retryBudget.maxRetriesPerMinute;

    if (!budgetAvailable) {
      logger.warn('Retry budget exhausted', {
        component: 'retry-budget',
        retriesInWindow,
        maxRetries: this.retryBudget.maxRetriesPerMinute,
        windowSize: this.retryBudget.windowSize,
      });
    }

    return budgetAvailable;
  }

  /**
   * Record retry attempt in budget
   */
  recordRetryAttempt() {
    if (this.retryBudget.enabled) {
      this.retryBudget.retries.push(Date.now());
    }
  }

  /**
   * Calculate delay for retry attempt with jitter
   * @param {number} attempt - Current attempt number (0-based)
   * @returns {number} Delay in milliseconds
   */
  calculateDelay(attempt) {
    const exponentialDelay =
      this.baseDelay * Math.pow(this.multiplier, attempt);
    const maxDelay = Math.min(exponentialDelay, this.maxDelay);

    // Add jitter to prevent thundering herd
    const jitterRange = maxDelay * this.jitter;
    const jitter = (Math.random() * 2 - 1) * jitterRange;

    return Math.max(0, Math.floor(maxDelay + jitter));
  }

  /**
   * Execute operation with retry logic
   * @param {Function} operation - Operation to execute
   * @param {object} context - Additional context for logging
   * @returns {Promise} Operation result
   */
  async execute(operation, context = {}) {
    // Check circuit breaker
    if (this.isCircuitOpen()) {
      const error = new Error('Circuit breaker is open - failing fast');
      error.code = 'CIRCUIT_OPEN';
      throw error;
    }

    let lastError;
    let attempt = 0;

    const startTime = Date.now();
    const operationTimeout = setTimeout(() => {
      const timeoutError = new Error(
        `Operation timeout after ${this.timeout}ms`,
      );
      timeoutError.code = 'OPERATION_TIMEOUT';
      throw timeoutError;
    }, this.timeout);

    try {
      while (attempt <= this.maxRetries) {
        try {
          const result = await operation();

          // Record success for circuit breaker
          this.recordCircuitSuccess();

          logger.debug('Operation succeeded', {
            component: 'retry-policy',
            attempt,
            duration: Date.now() - startTime,
            ...context,
          });

          return result;
        } catch (error) {
          lastError = error;
          attempt++;

          // Check if error is retryable
          if (!this.retryCondition(error)) {
            logger.debug('Error is not retryable, failing immediately', {
              component: 'retry-policy',
              error: error.message,
              errorCode: error.code,
              ...context,
            });
            break;
          }

          // Check if we have retries left
          if (attempt > this.maxRetries) {
            break;
          }

          // Check retry budget
          if (!this.checkRetryBudget()) {
            const budgetError = new Error('Retry budget exhausted');
            budgetError.code = 'RETRY_BUDGET_EXHAUSTED';
            throw budgetError;
          }

          // Record retry attempt
          this.recordRetryAttempt();

          // Calculate delay and wait
          const delay = this.calculateDelay(attempt - 1);
          this.onRetry(error, attempt, delay);

          await this.sleep(delay);
        }
      }

      // Record failure for circuit breaker
      this.recordCircuitFailure();

      // Call failure callback
      this.onFailure(lastError, attempt);

      // Enhance error with retry information
      const enhancedError = new Error(
        `Operation failed after ${attempt} attempts: ${lastError.message}`,
      );
      enhancedError.originalError = lastError;
      enhancedError.attempts = attempt;
      enhancedError.code = lastError.code || 'RETRY_EXHAUSTED';

      throw enhancedError;
    } finally {
      clearTimeout(operationTimeout);
    }
  }

  /**
   * Get retry policy metrics
   * @returns {object} Policy metrics
   */
  getMetrics() {
    return {
      circuitBreaker: {
        state: this.circuitBreaker.state,
        failures: this.circuitBreaker.failures,
        lastFailureTime: this.circuitBreaker.lastFailureTime,
      },
      retryBudget: {
        currentRetries: this.retryBudget.retries.length,
        maxRetries: this.retryBudget.maxRetriesPerMinute,
        windowSize: this.retryBudget.windowSize,
      },
      policy: {
        maxRetries: this.maxRetries,
        baseDelay: this.baseDelay,
        maxDelay: this.maxDelay,
        multiplier: this.multiplier,
        jitter: this.jitter,
      },
    };
  }

  /**
   * Reset retry policy state
   */
  reset() {
    this.circuitBreaker.state = 'CLOSED';
    this.circuitBreaker.failures = 0;
    this.circuitBreaker.lastFailureTime = null;
    this.retryBudget.retries = [];
  }
}

/**
 * Create retry policy instance
 * @param {object} options - Policy configuration
 * @returns {RetryPolicy} Retry policy instance
 */
function createRetryPolicy(options = {}) {
  return new RetryPolicy(options);
}

/**
 * Default retry policy for most operations
 */
const defaultPolicy = createRetryPolicy({
  maxRetries: 3,
  baseDelay: 1000,
  maxDelay: 10000,
  multiplier: 2,
  jitter: 0.1,
  circuitBreaker: {
    enabled: true,
    failureThreshold: 5,
    resetTimeout: 30000,
  },
  retryBudget: {
    enabled: true,
    maxRetriesPerMinute: 30,
  },
});

/**
 * Aggressive retry policy for critical operations
 */
const aggressivePolicy = createRetryPolicy({
  maxRetries: 5,
  baseDelay: 500,
  maxDelay: 30000,
  multiplier: 2.5,
  jitter: 0.2,
  circuitBreaker: {
    enabled: true,
    failureThreshold: 10,
    resetTimeout: 60000,
  },
  retryBudget: {
    enabled: true,
    maxRetriesPerMinute: 60,
  },
});

/**
 * Conservative retry policy for non-critical operations
 */
const conservativePolicy = createRetryPolicy({
  maxRetries: 2,
  baseDelay: 2000,
  maxDelay: 15000,
  multiplier: 1.5,
  jitter: 0.05,
  circuitBreaker: {
    enabled: true,
    failureThreshold: 3,
    resetTimeout: 45000,
  },
  retryBudget: {
    enabled: true,
    maxRetriesPerMinute: 15,
  },
});

module.exports = {
  RetryPolicy,
  createRetryPolicy,
  defaultPolicy,
  aggressivePolicy,
  conservativePolicy,
};

// CommonJS/ESM interop
module.exports.default = module.exports;
