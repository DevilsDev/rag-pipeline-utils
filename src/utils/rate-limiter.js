/**
 * Rate Limiter Utility
 * Protects against brute force attacks and abuse
 *
 * Features:
 * - Sliding window rate limiting
 * - Per-identifier tracking (IP, user, tenant)
 * - Automatic cleanup of expired entries
 * - Configurable thresholds and windows
 */

const crypto = require("crypto");

class RateLimiter {
  /**
   * Create a rate limiter instance
   * @param {Object} options - Configuration options
   * @param {number} options.maxAttempts - Maximum attempts allowed (default: 5)
   * @param {number} options.windowMs - Time window in milliseconds (default: 15 minutes)
   * @param {number} options.blockDurationMs - How long to block after exceeding limit (default: 1 hour)
   * @param {number} options.cleanupIntervalMs - How often to cleanup expired entries (default: 5 minutes)
   */
  constructor(options = {}) {
    this.maxAttempts = options.maxAttempts || 5;
    this.windowMs = options.windowMs || 15 * 60 * 1000; // 15 minutes
    this.blockDurationMs = options.blockDurationMs || 60 * 60 * 1000; // 1 hour
    this.cleanupIntervalMs = options.cleanupIntervalMs || 5 * 60 * 1000; // 5 minutes

    // Map of identifier -> { attempts: [], blockedUntil: timestamp }
    this.store = new Map();

    // Start automatic cleanup
    this._startCleanup();
  }

  /**
   * Check if a request should be allowed
   * @param {string} identifier - Unique identifier (IP, userId, tenantId, etc.)
   * @returns {Object} { allowed: boolean, remaining: number, resetAt: Date, blockedUntil: Date|null }
   */
  allowRequest(identifier) {
    const key = this._hashIdentifier(identifier);
    const now = Date.now();

    // Get or create record
    let record = this.store.get(key);
    if (!record) {
      record = { attempts: [], blockedUntil: null };
      this.store.set(key, record);
    }

    // Check if currently blocked
    if (record.blockedUntil && record.blockedUntil > now) {
      return {
        allowed: false,
        remaining: 0,
        resetAt: new Date(record.blockedUntil),
        blockedUntil: new Date(record.blockedUntil),
        retryAfter: Math.ceil((record.blockedUntil - now) / 1000), // seconds
      };
    }

    // Clear expired block
    if (record.blockedUntil && record.blockedUntil <= now) {
      record.blockedUntil = null;
    }

    // Remove expired attempts
    const windowStart = now - this.windowMs;
    record.attempts = record.attempts.filter(
      (timestamp) => timestamp > windowStart,
    );

    // Check if exceeded limit
    if (record.attempts.length >= this.maxAttempts) {
      // Block the identifier
      record.blockedUntil = now + this.blockDurationMs;
      return {
        allowed: false,
        remaining: 0,
        resetAt: new Date(record.blockedUntil),
        blockedUntil: new Date(record.blockedUntil),
        retryAfter: Math.ceil(this.blockDurationMs / 1000), // seconds
      };
    }

    // Allow request and record attempt
    record.attempts.push(now);

    return {
      allowed: true,
      remaining: this.maxAttempts - record.attempts.length,
      resetAt: new Date(now + this.windowMs),
      blockedUntil: null,
      retryAfter: 0,
    };
  }

  /**
   * Manually reset rate limit for an identifier
   * @param {string} identifier - Identifier to reset
   */
  reset(identifier) {
    const key = this._hashIdentifier(identifier);
    this.store.delete(key);
  }

  /**
   * Get current status for an identifier
   * @param {string} identifier - Identifier to check
   * @returns {Object} Current rate limit status
   */
  getStatus(identifier) {
    const key = this._hashIdentifier(identifier);
    const record = this.store.get(key);
    const now = Date.now();

    if (!record) {
      return {
        attempts: 0,
        remaining: this.maxAttempts,
        blocked: false,
        blockedUntil: null,
      };
    }

    // Remove expired attempts
    const windowStart = now - this.windowMs;
    const validAttempts = record.attempts.filter(
      (timestamp) => timestamp > windowStart,
    );

    const blocked = !!(record.blockedUntil && record.blockedUntil > now);

    return {
      attempts: validAttempts.length,
      remaining: Math.max(0, this.maxAttempts - validAttempts.length),
      blocked,
      blockedUntil: blocked ? new Date(record.blockedUntil) : null,
    };
  }

  /**
   * Clean up expired entries
   */
  cleanup() {
    const now = Date.now();
    const expiredKeys = [];

    for (const [key, record] of this.store.entries()) {
      // Check if block has expired and no recent attempts
      const blockExpired = !record.blockedUntil || record.blockedUntil < now;
      const windowStart = now - this.windowMs;
      const hasRecentAttempts = record.attempts.some(
        (timestamp) => timestamp > windowStart,
      );

      if (blockExpired && !hasRecentAttempts) {
        expiredKeys.push(key);
      }
    }

    // Delete expired entries
    expiredKeys.forEach((key) => this.store.delete(key));

    return {
      cleaned: expiredKeys.length,
      remaining: this.store.size,
    };
  }

  /**
   * Get statistics about rate limiter usage
   * @returns {Object} Statistics
   */
  getStats() {
    const now = Date.now();
    let totalAttempts = 0;
    let blockedIdentifiers = 0;
    let activeIdentifiers = 0;

    for (const record of this.store.values()) {
      const windowStart = now - this.windowMs;
      const validAttempts = record.attempts.filter(
        (timestamp) => timestamp > windowStart,
      );

      if (validAttempts.length > 0) {
        activeIdentifiers++;
        totalAttempts += validAttempts.length;
      }

      if (record.blockedUntil && record.blockedUntil > now) {
        blockedIdentifiers++;
      }
    }

    return {
      totalIdentifiers: this.store.size,
      activeIdentifiers,
      blockedIdentifiers,
      totalAttempts,
      averageAttemptsPerIdentifier:
        activeIdentifiers > 0 ? totalAttempts / activeIdentifiers : 0,
    };
  }

  /**
   * Stop the rate limiter and cleanup
   */
  destroy() {
    if (this._cleanupInterval) {
      clearInterval(this._cleanupInterval);
      this._cleanupInterval = null;
    }
    this.store.clear();
  }

  /**
   * Hash identifier for storage (privacy)
   * @private
   */
  _hashIdentifier(identifier) {
    return crypto.createHash("sha256").update(identifier).digest("hex");
  }

  /**
   * Start automatic cleanup timer
   * @private
   */
  _startCleanup() {
    this._cleanupInterval = setInterval(() => {
      this.cleanup();
    }, this.cleanupIntervalMs);

    // Don't prevent process exit
    if (this._cleanupInterval.unref) {
      this._cleanupInterval.unref();
    }
  }
}

module.exports = RateLimiter;
module.exports.default = module.exports;
