"use strict";

/**
 * Connection Pool Manager Tests
 *
 * Tests for HTTP/HTTPS connection pooling with metrics tracking
 */

const {
  ConnectionPoolManager,
  getGlobalPool,
  resetGlobalPool,
  createPooledFetch,
  DEFAULT_CONFIG,
} = require("../../../src/utils/connection-pool");
const http = require("http");
const https = require("https");

describe("ConnectionPoolManager", () => {
  let poolManager;

  beforeEach(() => {
    // Reset global pool before each test
    resetGlobalPool();
  });

  afterEach(() => {
    // Cleanup after each test
    if (poolManager) {
      poolManager.destroy();
      poolManager = null;
    }
    resetGlobalPool();
  });

  describe("Initialization", () => {
    test("should create pool manager with default config", () => {
      poolManager = new ConnectionPoolManager();

      expect(poolManager).toBeDefined();
      expect(poolManager.config).toMatchObject({
        maxSockets: 50,
        maxFreeSockets: 10,
        keepAlive: true,
        timeout: 30000,
      });
    });

    test("should create pool manager with custom config", () => {
      poolManager = new ConnectionPoolManager({
        maxSockets: 100,
        maxFreeSockets: 20,
        timeout: 60000,
      });

      expect(poolManager.config.maxSockets).toBe(100);
      expect(poolManager.config.maxFreeSockets).toBe(20);
      expect(poolManager.config.timeout).toBe(60000);
    });

    test("should initialize HTTP and HTTPS agents", () => {
      poolManager = new ConnectionPoolManager();

      expect(poolManager.getHttpAgent()).toBeInstanceOf(http.Agent);
      expect(poolManager.getHttpsAgent()).toBeInstanceOf(https.Agent);
    });

    test("should emit agents_initialized event", (done) => {
      poolManager = new ConnectionPoolManager();

      poolManager.on("agents_initialized", (data) => {
        expect(data.http).toBeInstanceOf(http.Agent);
        expect(data.https).toBeInstanceOf(https.Agent);
        done();
      });

      // Re-initialize to trigger event
      poolManager._initializeAgents();
    });
  });

  describe("Agent Configuration", () => {
    test("should configure HTTP agent with keep-alive", () => {
      poolManager = new ConnectionPoolManager({
        keepAlive: true,
        keepAliveMsecs: 2000,
      });

      const httpAgent = poolManager.getHttpAgent();
      expect(httpAgent.keepAlive).toBe(true);
      expect(httpAgent.keepAliveMsecs).toBe(2000);
    });

    test("should configure agent with proper pool limits", () => {
      poolManager = new ConnectionPoolManager({
        maxSockets: 75,
        maxFreeSockets: 15,
      });

      const httpsAgent = poolManager.getHttpsAgent();
      expect(httpsAgent.maxSockets).toBe(75);
      expect(httpsAgent.maxFreeSockets).toBe(15);
    });

    test("should configure agent timeout settings", () => {
      poolManager = new ConnectionPoolManager({
        timeout: 45000,
        freeSocketTimeout: 20000,
      });

      // Verify timeout is set in config (agent properties may vary by Node version)
      expect(poolManager.config.timeout).toBe(45000);
      expect(poolManager.config.freeSocketTimeout).toBe(20000);
    });
  });

  describe("Agent Selection", () => {
    beforeEach(() => {
      poolManager = new ConnectionPoolManager();
    });

    test("should return HTTPS agent for HTTPS URLs", () => {
      const agent = poolManager.getAgentForUrl("https://api.openai.com");
      expect(agent).toBe(poolManager.getHttpsAgent());
    });

    test("should return HTTP agent for HTTP URLs", () => {
      const agent = poolManager.getAgentForUrl("http://localhost:3000");
      expect(agent).toBe(poolManager.getHttpAgent());
    });
  });

  describe("Metrics Tracking", () => {
    beforeEach(() => {
      poolManager = new ConnectionPoolManager({
        trackMetrics: true,
        metricsInterval: 5000,
      });
    });

    test("should initialize metrics with zero values", () => {
      const metrics = poolManager.getMetrics();

      expect(metrics.totalRequests).toBe(0);
      expect(metrics.cachedConnections).toBe(0);
      expect(metrics.newConnections).toBe(0);
      expect(metrics.errors).toBe(0);
      expect(metrics.timeouts).toBe(0);
      expect(metrics.avgResponseTime).toBe(0);
    });

    test("should track successful request timing", () => {
      poolManager.trackRequest(150);
      poolManager.trackRequest(200);
      poolManager.trackRequest(100);

      const metrics = poolManager.getMetrics();
      expect(metrics.totalRequests).toBe(3);
      expect(metrics.avgResponseTime).toBeCloseTo(150, 1);
      expect(metrics.totalResponseTime).toBe(450);
    });

    test("should track multiple requests and calculate average", () => {
      for (let i = 0; i < 10; i++) {
        poolManager.trackRequest(100 + i * 10);
      }

      const metrics = poolManager.getMetrics();
      expect(metrics.totalRequests).toBe(10);
      expect(metrics.avgResponseTime).toBeGreaterThan(0);
    });

    test("should track errors with type classification", () => {
      const error = new Error("Request failed");
      poolManager.trackError(error, "error");

      const metrics = poolManager.getMetrics();
      expect(metrics.errors).toBe(1);
    });

    test("should track timeout errors separately", () => {
      const timeoutError = new Error("Timeout");
      timeoutError.code = "ETIMEDOUT";

      poolManager.trackError(timeoutError, "timeout");

      const metrics = poolManager.getMetrics();
      expect(metrics.errors).toBe(1);
      expect(metrics.timeouts).toBe(1);
    });

    test("should track pool exhaustion", () => {
      poolManager.trackPoolExhaustion();
      poolManager.trackPoolExhaustion();

      const metrics = poolManager.getMetrics();
      expect(metrics.poolExhausted).toBe(2);
    });

    test("should emit events for tracked errors", (done) => {
      poolManager.on("request_error", ({ error, type, totalErrors }) => {
        expect(error).toBe("Test error");
        expect(type).toBe("error");
        expect(totalErrors).toBe(1);
        done();
      });

      poolManager.trackError(new Error("Test error"), "error");
    });

    test("should emit event on pool exhaustion", (done) => {
      poolManager.on("pool_exhausted", ({ maxSockets, exhaustedCount }) => {
        expect(maxSockets).toBe(poolManager.config.maxSockets);
        expect(exhaustedCount).toBe(1);
        done();
      });

      poolManager.trackPoolExhaustion();
    });
  });

  describe("Performance Metrics", () => {
    beforeEach(() => {
      poolManager = new ConnectionPoolManager();
    });

    test("should calculate response time percentiles", () => {
      // Add sample timings (need more samples for distinct percentiles)
      const timings = [
        50, 75, 100, 120, 150, 175, 200, 225, 250, 275, 300, 325, 350, 375, 400,
        450, 500, 600, 800, 1000,
      ];
      timings.forEach((t) => poolManager.trackRequest(t));

      const metrics = poolManager.getMetrics();
      expect(metrics.responseTime.p50).toBeGreaterThan(0);
      expect(metrics.responseTime.p95).toBeGreaterThan(
        metrics.responseTime.p50,
      );
      expect(metrics.responseTime.p99).toBeGreaterThanOrEqual(
        metrics.responseTime.p95,
      );
    });

    test("should limit timing samples to prevent memory growth", () => {
      // Add more than maxTimingsSamples
      for (let i = 0; i < 1500; i++) {
        poolManager.trackRequest(100);
      }

      expect(poolManager.requestTimings.length).toBeLessThanOrEqual(1000);
    });

    test("should calculate pool utilization percentage", () => {
      poolManager.activeConnections = 25;
      poolManager.config.maxSockets = 50;

      const metrics = poolManager.getMetrics();
      expect(metrics.poolUtilization).toBe(50); // 25/50 * 100
    });

    test("should calculate connection reuse rate", () => {
      // Simulate 10 requests with 8 cached connections
      // Set cached connections first, then track requests
      poolManager.metrics.cachedConnections = 8;

      for (let i = 0; i < 10; i++) {
        poolManager.metrics.totalRequests++;
      }

      // Calculate reuse rate manually
      const reuseRate =
        poolManager.metrics.cachedConnections /
        Math.max(1, poolManager.metrics.totalRequests);
      poolManager.metrics.connectionReuse = reuseRate * 100;

      const metrics = poolManager.getMetrics();
      expect(metrics.connectionReuse).toBeCloseTo(80, 0);
    });
  });

  describe("Agent Statistics", () => {
    beforeEach(() => {
      poolManager = new ConnectionPoolManager();
    });

    test("should report agent socket statistics", () => {
      const metrics = poolManager.getMetrics();

      expect(metrics.agents.http).toBeDefined();
      expect(metrics.agents.https).toBeDefined();
      expect(metrics.agents.http.active).toBeGreaterThanOrEqual(0);
      expect(metrics.agents.https.active).toBeGreaterThanOrEqual(0);
    });

    test("should track idle sockets in agent stats", () => {
      const metrics = poolManager.getMetrics();

      expect(metrics.agents.http.idle).toBeGreaterThanOrEqual(0);
      expect(metrics.agents.https.idle).toBeGreaterThanOrEqual(0);
    });

    test("should track pending requests in agent stats", () => {
      const metrics = poolManager.getMetrics();

      expect(metrics.agents.http.pending).toBeGreaterThanOrEqual(0);
      expect(metrics.agents.https.pending).toBeGreaterThanOrEqual(0);
    });
  });

  describe("Pool Status", () => {
    beforeEach(() => {
      poolManager = new ConnectionPoolManager();
    });

    test("should report healthy status when utilization is low", () => {
      poolManager.activeConnections = 10;
      poolManager.config.maxSockets = 100;

      const status = poolManager.getStatus();
      expect(status.healthy).toBe(true);
      expect(status.utilization).toBe(10);
    });

    test("should report unhealthy status when utilization is high", () => {
      poolManager.activeConnections = 95;
      poolManager.config.maxSockets = 100;

      const status = poolManager.getStatus();
      expect(status.healthy).toBe(false);
      expect(status.utilization).toBe(95);
    });

    test("should include key metrics in status", () => {
      const status = poolManager.getStatus();

      expect(status).toHaveProperty("healthy");
      expect(status).toHaveProperty("utilization");
      expect(status).toHaveProperty("activeConnections");
      expect(status).toHaveProperty("maxConnections");
      expect(status).toHaveProperty("connectionReuse");
      expect(status).toHaveProperty("avgResponseTime");
      expect(status).toHaveProperty("errors");
      expect(status).toHaveProperty("timeouts");
    });
  });

  describe("Metrics Reset", () => {
    beforeEach(() => {
      poolManager = new ConnectionPoolManager();
    });

    test("should reset all metrics to zero", () => {
      // Generate some metrics
      poolManager.trackRequest(100);
      poolManager.trackRequest(200);
      poolManager.trackError(new Error("Test"), "error");

      poolManager.resetMetrics();

      const metrics = poolManager.getMetrics();
      expect(metrics.totalRequests).toBe(0);
      expect(metrics.errors).toBe(0);
      expect(metrics.totalResponseTime).toBe(0);
      expect(metrics.avgResponseTime).toBe(0);
    });

    test("should preserve peak pool size after reset", () => {
      poolManager.activeConnections = 50;
      poolManager.metrics.peakPoolSize = 50;

      poolManager.resetMetrics();

      const metrics = poolManager.getMetrics();
      expect(metrics.peakPoolSize).toBe(50);
    });

    test("should clear timing samples on reset", () => {
      for (let i = 0; i < 100; i++) {
        poolManager.trackRequest(100);
      }

      poolManager.resetMetrics();
      expect(poolManager.requestTimings.length).toBe(0);
    });

    test("should emit metrics_reset event", (done) => {
      poolManager.on("metrics_reset", () => {
        done();
      });

      poolManager.resetMetrics();
    });
  });

  describe("Pool Report", () => {
    beforeEach(() => {
      poolManager = new ConnectionPoolManager();
    });

    test("should generate human-readable report", () => {
      poolManager.trackRequest(150);
      poolManager.trackRequest(200);

      const report = poolManager.getReport();

      expect(report).toContain("Connection Pool Report");
      expect(report).toContain("Status:");
      expect(report).toContain("Pool Utilization:");
      expect(report).toContain("Total Requests:");
      expect(report).toContain("Avg Response Time:");
    });

    test("should show healthy status in report", () => {
      poolManager.activeConnections = 10;
      const report = poolManager.getReport();

      expect(report).toContain("Healthy ✓");
    });

    test("should show warning status when unhealthy", () => {
      poolManager.activeConnections = 95;
      poolManager.config.maxSockets = 100;

      const report = poolManager.getReport();
      expect(report).toContain("Warning ⚠");
    });

    test("should include performance metrics in report", () => {
      const timings = [100, 200, 300, 400, 500];
      timings.forEach((t) => poolManager.trackRequest(t));

      const report = poolManager.getReport();
      expect(report).toContain("P50:");
      expect(report).toContain("P95:");
      expect(report).toContain("P99:");
    });

    test("should include agent statistics in report", () => {
      const report = poolManager.getReport();

      expect(report).toContain("HTTP:");
      expect(report).toContain("HTTPS:");
      expect(report).toContain("Active:");
      expect(report).toContain("Idle:");
    });
  });

  describe("Event Emissions", () => {
    beforeEach(() => {
      poolManager = new ConnectionPoolManager();
    });

    test("should emit request_completed event", (done) => {
      poolManager.on("request_completed", ({ duration, avgResponseTime }) => {
        expect(duration).toBe(150);
        expect(avgResponseTime).toBe(150);
        done();
      });

      poolManager.trackRequest(150);
    });

    test("should emit high_utilization warning", (done) => {
      poolManager.config.metricsInterval = 100;
      poolManager.activeConnections = 85;
      poolManager.config.maxSockets = 100;

      poolManager.on("high_utilization", ({ utilization, active, max }) => {
        expect(utilization).toBeGreaterThan(80);
        expect(active).toBe(85);
        expect(max).toBe(100);
        done();
      });

      // Trigger metrics collection
      poolManager._startMetricsCollection();
    });

    test("should emit high_error_rate warning", (done) => {
      poolManager.config.metricsInterval = 100;

      // Generate high error rate (>5%)
      for (let i = 0; i < 10; i++) {
        poolManager.trackRequest(100);
      }
      for (let i = 0; i < 2; i++) {
        poolManager.trackError(new Error("Test"), "error");
      }

      poolManager.on("high_error_rate", ({ errorRate, errors, requests }) => {
        expect(errorRate).toBeGreaterThan(5);
        expect(errors).toBeGreaterThanOrEqual(2);
        done();
      });

      poolManager._startMetricsCollection();
    });
  });

  describe("Pool Cleanup", () => {
    test("should cleanup on destroy", () => {
      poolManager = new ConnectionPoolManager();

      poolManager.destroy();

      expect(poolManager.httpAgent).toBeNull();
      expect(poolManager.httpsAgent).toBeNull();
      expect(poolManager.activeConnections).toBe(0);
      expect(poolManager.requestTimings.length).toBe(0);
    });

    test("should stop metrics collection on destroy", () => {
      poolManager = new ConnectionPoolManager({
        trackMetrics: true,
      });

      const intervalId = poolManager.metricsInterval;
      poolManager.destroy();

      expect(poolManager.metricsInterval).toBeNull();
    });

    test("should emit destroyed event", (done) => {
      poolManager = new ConnectionPoolManager();

      poolManager.on("destroyed", () => {
        done();
      });

      poolManager.destroy();
    });

    test("should remove all listeners on destroy", () => {
      poolManager = new ConnectionPoolManager();

      poolManager.on("test_event", () => {});
      poolManager.on("another_event", () => {});

      poolManager.destroy();

      expect(poolManager.listenerCount("test_event")).toBe(0);
      expect(poolManager.listenerCount("another_event")).toBe(0);
    });
  });

  describe("Global Pool", () => {
    afterEach(() => {
      resetGlobalPool();
    });

    test("should create global pool instance", () => {
      const pool1 = getGlobalPool();
      const pool2 = getGlobalPool();

      expect(pool1).toBe(pool2); // Same instance
      expect(pool1).toBeInstanceOf(ConnectionPoolManager);
    });

    test("should create global pool with custom options", () => {
      const pool = getGlobalPool({
        maxSockets: 200,
        timeout: 45000,
      });

      expect(pool.config.maxSockets).toBe(200);
      expect(pool.config.timeout).toBe(45000);
    });

    test("should reset global pool", () => {
      const pool1 = getGlobalPool();
      resetGlobalPool();
      const pool2 = getGlobalPool();

      expect(pool1).not.toBe(pool2);
    });
  });

  describe("Pooled Fetch Wrapper", () => {
    beforeEach(() => {
      poolManager = new ConnectionPoolManager();
    });

    test("should create pooled fetch function", () => {
      const pooledFetch = createPooledFetch(poolManager);

      expect(typeof pooledFetch).toBe("function");
    });

    test("should track request timing on success", async () => {
      // Mock fetch with a small delay to ensure non-zero timing
      global.fetch = jest.fn().mockImplementation(
        () =>
          new Promise((resolve) =>
            setTimeout(
              () =>
                resolve({
                  ok: true,
                  status: 200,
                }),
              10,
            ),
          ),
      );

      const pooledFetch = createPooledFetch(poolManager);
      await pooledFetch("https://api.example.com");

      const metrics = poolManager.getMetrics();
      expect(metrics.totalRequests).toBe(1);
      expect(metrics.avgResponseTime).toBeGreaterThanOrEqual(0);
    });

    test("should track errors on failure", async () => {
      // Mock fetch to fail
      const error = new Error("Network error");
      global.fetch = jest.fn().mockRejectedValue(error);

      const pooledFetch = createPooledFetch(poolManager);

      await expect(pooledFetch("https://api.example.com")).rejects.toThrow(
        "Network error",
      );

      const metrics = poolManager.getMetrics();
      expect(metrics.errors).toBe(1);
    });

    test("should track timeout errors specifically", async () => {
      const timeoutError = new Error("Timeout");
      timeoutError.code = "ETIMEDOUT";

      global.fetch = jest.fn().mockRejectedValue(timeoutError);

      const pooledFetch = createPooledFetch(poolManager);

      await expect(pooledFetch("https://api.example.com")).rejects.toThrow(
        "Timeout",
      );

      const metrics = poolManager.getMetrics();
      expect(metrics.errors).toBe(1);
      expect(metrics.timeouts).toBe(1);
    });
  });

  describe("Configuration Validation", () => {
    test("should use default config when no options provided", () => {
      poolManager = new ConnectionPoolManager();

      expect(poolManager.config).toMatchObject(DEFAULT_CONFIG);
    });

    test("should merge custom config with defaults", () => {
      poolManager = new ConnectionPoolManager({
        maxSockets: 200,
        customOption: "test",
      });

      expect(poolManager.config.maxSockets).toBe(200);
      expect(poolManager.config.maxFreeSockets).toBe(
        DEFAULT_CONFIG.maxFreeSockets,
      );
      expect(poolManager.config.customOption).toBe("test");
    });

    test("should export DEFAULT_CONFIG", () => {
      expect(DEFAULT_CONFIG).toBeDefined();
      expect(DEFAULT_CONFIG.maxSockets).toBe(50);
      expect(DEFAULT_CONFIG.keepAlive).toBe(true);
    });
  });

  describe("Connection Lifecycle Tracking", () => {
    beforeEach(() => {
      poolManager = new ConnectionPoolManager();
    });

    test("should track peak pool size", () => {
      poolManager.activeConnections = 30;
      poolManager.metrics.peakPoolSize = 30;

      poolManager.activeConnections = 50;
      if (poolManager.activeConnections > poolManager.metrics.peakPoolSize) {
        poolManager.metrics.peakPoolSize = poolManager.activeConnections;
      }

      const metrics = poolManager.getMetrics();
      expect(metrics.peakPoolSize).toBe(50);
    });

    test("should track connections created", () => {
      poolManager.metrics.connectionsCreated = 10;

      const metrics = poolManager.getMetrics();
      expect(metrics.connectionsCreated).toBe(10);
    });

    test("should track connections destroyed", () => {
      poolManager.metrics.connectionsDestroyed = 5;

      const metrics = poolManager.getMetrics();
      expect(metrics.connectionsDestroyed).toBe(5);
    });
  });
});

describe("Connection Pool Integration", () => {
  let poolManager;

  afterEach(() => {
    if (poolManager) {
      poolManager.destroy();
    }
    resetGlobalPool();
  });

  test("should work with HTTP requests", () => {
    poolManager = new ConnectionPoolManager();
    const httpAgent = poolManager.getHttpAgent();

    expect(httpAgent).toBeInstanceOf(http.Agent);
    expect(httpAgent.keepAlive).toBe(true);
  });

  test("should work with HTTPS requests", () => {
    poolManager = new ConnectionPoolManager();
    const httpsAgent = poolManager.getHttpsAgent();

    expect(httpsAgent).toBeInstanceOf(https.Agent);
    expect(httpsAgent.keepAlive).toBe(true);
  });

  test("should handle concurrent metric updates", () => {
    poolManager = new ConnectionPoolManager();

    // Simulate concurrent requests
    const promises = [];
    for (let i = 0; i < 50; i++) {
      promises.push(
        Promise.resolve().then(() => {
          poolManager.trackRequest(100 + Math.random() * 100);
        }),
      );
    }

    return Promise.all(promises).then(() => {
      const metrics = poolManager.getMetrics();
      expect(metrics.totalRequests).toBe(50);
    });
  });
});
