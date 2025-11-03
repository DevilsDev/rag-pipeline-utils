/**
 * Rate Limiter Tests
 */

const RateLimiter = require("../../../src/utils/rate-limiter");

describe("RateLimiter", () => {
  let rateLimiter;

  beforeEach(() => {
    rateLimiter = new RateLimiter({
      maxAttempts: 3,
      windowMs: 1000, // 1 second for faster tests
      blockDurationMs: 2000, // 2 seconds
      cleanupIntervalMs: 10000, // 10 seconds (won't trigger in tests)
    });
  });

  afterEach(() => {
    if (rateLimiter) {
      rateLimiter.destroy();
    }
  });

  describe("allowRequest", () => {
    it("should allow requests within limit", () => {
      const result1 = rateLimiter.allowRequest("user1");
      expect(result1.allowed).toBe(true);
      expect(result1.remaining).toBe(2);

      const result2 = rateLimiter.allowRequest("user1");
      expect(result2.allowed).toBe(true);
      expect(result2.remaining).toBe(1);

      const result3 = rateLimiter.allowRequest("user1");
      expect(result3.allowed).toBe(true);
      expect(result3.remaining).toBe(0);
    });

    it("should block requests exceeding limit", () => {
      // Use up all attempts
      rateLimiter.allowRequest("user2");
      rateLimiter.allowRequest("user2");
      rateLimiter.allowRequest("user2");

      // Next request should be blocked
      const result = rateLimiter.allowRequest("user2");
      expect(result.allowed).toBe(false);
      expect(result.remaining).toBe(0);
      expect(result.blockedUntil).toBeInstanceOf(Date);
      expect(result.retryAfter).toBeGreaterThan(0);
    });

    it("should track different identifiers independently", () => {
      const result1 = rateLimiter.allowRequest("user1");
      const result2 = rateLimiter.allowRequest("user2");

      expect(result1.allowed).toBe(true);
      expect(result1.remaining).toBe(2);
      expect(result2.allowed).toBe(true);
      expect(result2.remaining).toBe(2);
    });

    it("should allow requests after manual reset", () => {
      // Use up all attempts
      rateLimiter.allowRequest("user3");
      rateLimiter.allowRequest("user3");
      rateLimiter.allowRequest("user3");

      // Block
      const blockedResult = rateLimiter.allowRequest("user3");
      expect(blockedResult.allowed).toBe(false);
      expect(blockedResult.retryAfter).toBeGreaterThan(0);

      // Manual reset (simulates expired block + window)
      rateLimiter.reset("user3");

      // Should be allowed again with fresh state
      const allowedResult = rateLimiter.allowRequest("user3");
      expect(allowedResult.allowed).toBe(true);
      // After one new request, should have 2 remaining
      expect(allowedResult.remaining).toBe(2);
    });
  });

  describe("reset", () => {
    it("should reset rate limit for identifier", () => {
      // Use up all attempts
      rateLimiter.allowRequest("user4");
      rateLimiter.allowRequest("user4");
      rateLimiter.allowRequest("user4");

      // Block
      const blockedResult = rateLimiter.allowRequest("user4");
      expect(blockedResult.allowed).toBe(false);

      // Reset
      rateLimiter.reset("user4");

      // Should be allowed again
      const allowedResult = rateLimiter.allowRequest("user4");
      expect(allowedResult.allowed).toBe(true);
      expect(allowedResult.remaining).toBe(2);
    });
  });

  describe("getStatus", () => {
    it("should return current status", () => {
      rateLimiter.allowRequest("user5");
      rateLimiter.allowRequest("user5");

      const status = rateLimiter.getStatus("user5");
      expect(status.attempts).toBe(2);
      expect(status.remaining).toBe(1);
      expect(status.blocked).toBe(false);
      expect(status.blockedUntil).toBeNull();
    });

    it("should show blocked status", () => {
      // Use up all attempts
      rateLimiter.allowRequest("user6");
      rateLimiter.allowRequest("user6");
      rateLimiter.allowRequest("user6");
      rateLimiter.allowRequest("user6"); // Trigger block

      const status = rateLimiter.getStatus("user6");
      expect(status.blocked).toBe(true);
      expect(status.blockedUntil).toBeInstanceOf(Date);
    });

    it("should return empty status for unknown identifier", () => {
      const status = rateLimiter.getStatus("unknown");
      expect(status.attempts).toBe(0);
      expect(status.remaining).toBe(3);
      expect(status.blocked).toBe(false);
    });
  });

  describe("cleanup", () => {
    it("should successfully call cleanup method", () => {
      // Create some attempts
      rateLimiter.allowRequest("user7");
      rateLimiter.allowRequest("user8");

      // Cleanup returns expected structure
      const cleanupResult = rateLimiter.cleanup();
      expect(cleanupResult).toHaveProperty("cleaned");
      expect(cleanupResult).toHaveProperty("remaining");
      expect(typeof cleanupResult.cleaned).toBe("number");
      expect(typeof cleanupResult.remaining).toBe("number");
    });

    it("should not remove active entries", () => {
      // Create some recent attempts
      const testLimiter = new RateLimiter({
        maxAttempts: 3,
        windowMs: 5000, // 5 second window
        blockDurationMs: 10000,
        cleanupIntervalMs: 60000,
      });

      try {
        testLimiter.allowRequest("activeUser");

        const statsBefore = testLimiter.getStats();
        expect(statsBefore.totalIdentifiers).toBe(1);

        // Cleanup immediately - entry should not be removed (still in window)
        const cleanupResult = testLimiter.cleanup();
        expect(cleanupResult.remaining).toBe(1);

        const statsAfter = testLimiter.getStats();
        expect(statsAfter.totalIdentifiers).toBe(1);
      } finally {
        testLimiter.destroy();
      }
    });
  });

  describe("getStats", () => {
    it("should return statistics", () => {
      rateLimiter.allowRequest("user9");
      rateLimiter.allowRequest("user9");
      rateLimiter.allowRequest("user10");

      const stats = rateLimiter.getStats();
      expect(stats.totalIdentifiers).toBe(2);
      expect(stats.activeIdentifiers).toBe(2);
      expect(stats.totalAttempts).toBe(3);
    });
  });

  describe("destroy", () => {
    it("should cleanup resources", () => {
      rateLimiter.allowRequest("user11");

      const stats1 = rateLimiter.getStats();
      expect(stats1.totalIdentifiers).toBe(1);

      rateLimiter.destroy();

      const stats2 = rateLimiter.getStats();
      expect(stats2.totalIdentifiers).toBe(0);
    });
  });
});
