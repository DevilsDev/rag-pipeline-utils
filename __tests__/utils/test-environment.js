/**
 * Deterministic Test Environment Setup
 * Ensures consistent test execution across all environments
 */

class TestEnvironment {
  static setup() {
    // Set deterministic environment variables
    process.env.NODE_ENV = "test";
    process.env.LOG_LEVEL = "error";
    process.env.DISABLE_TELEMETRY = "true";

    // Mock system-dependent values
    process.env.TZ = "UTC";

    // Disable network requests in tests
    process.env.DISABLE_NETWORK = "true";

    // Set consistent random seed for reproducible tests
    if (global.Math && global.Math.random) {
      const originalRandom = global.Math.random;
      let seed = 12345;
      global.Math.random = () => {
        seed = (seed * 9301 + 49297) % 233280;
        return seed / 233280;
      };

      // Store original for cleanup
      global.__originalRandom = originalRandom;
    }

    // Mock Date.now for consistent timestamps
    const originalDateNow = Date.now;
    Date.now = () => 1640995200000; // Fixed timestamp: 2022-01-01T00:00:00.000Z
    global.__originalDateNow = originalDateNow;

    // Mock process.memoryUsage for consistent memory reporting
    const originalMemoryUsage = process.memoryUsage;
    process.memoryUsage = () => ({
      heapUsed: 50 * 1024 * 1024, // 50MB
      heapTotal: 100 * 1024 * 1024, // 100MB
      external: 10 * 1024 * 1024, // 10MB
      rss: 150 * 1024 * 1024, // 150MB
      arrayBuffers: 5 * 1024 * 1024, // 5MB
    });
    global.__originalMemoryUsage = originalMemoryUsage;
  }

  static cleanup() {
    // Restore original functions
    if (global.__originalRandom) {
      global.Math.random = global.__originalRandom;
      delete global.__originalRandom;
    }

    if (global.__originalDateNow) {
      Date.now = global.__originalDateNow;
      delete global.__originalDateNow;
    }

    if (global.__originalMemoryUsage) {
      process.memoryUsage = global.__originalMemoryUsage;
      delete global.__originalMemoryUsage;
    }

    // Clear test-specific environment variables
    delete process.env.DISABLE_NETWORK;
    delete process.env.DISABLE_TELEMETRY;
    delete process.env.LOG_LEVEL;
  }

  static createIsolatedContext() {
    return {
      registry: new Map(),
      cache: new Map(),
      metrics: {},
      startTime: Date.now(),
    };
  }
}

module.exports = { TestEnvironment };
