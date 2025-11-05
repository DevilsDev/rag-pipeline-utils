"use strict";

/**
 * Enhanced Memory Monitor Tests
 *
 * Tests for memory monitoring, leak detection, GC optimization,
 * and performance overhead measurement.
 */

const {
  EnhancedMemoryMonitor,
  MemoryLeakDetector,
  GCOptimizer,
  MemorySnapshot,
  createMemoryMonitor,
  DEFAULT_CONFIG,
} = require("../../../src/utils/memory-monitor");

describe("EnhancedMemoryMonitor", () => {
  let monitor;

  beforeEach(() => {
    monitor = new EnhancedMemoryMonitor({
      maxMemoryMB: 512,
      samplingInterval: 100,
      snapshotInterval: 500,
      leakDetectionEnabled: true,
      gcHintsEnabled: true,
    });
  });

  afterEach(() => {
    if (monitor && monitor.monitoring) {
      monitor.stop();
    }
  });

  describe("Initialization", () => {
    test("should create monitor with default config", () => {
      expect(monitor).toBeDefined();
      expect(monitor.config.maxMemoryMB).toBe(512);
      expect(monitor.monitoring).toBe(false);
    });

    test("should create monitor with custom config", () => {
      const custom = new EnhancedMemoryMonitor({
        maxMemoryMB: 1024,
        samplingInterval: 1000,
      });

      expect(custom.config.maxMemoryMB).toBe(1024);
      expect(custom.config.samplingInterval).toBe(1000);
    });

    test("should initialize components", () => {
      expect(monitor.leakDetector).toBeDefined();
      expect(monitor.gcOptimizer).toBeDefined();
      expect(monitor.history).toEqual([]);
      expect(monitor.snapshots).toEqual([]);
    });
  });

  describe("Monitoring Start/Stop", () => {
    test("should start monitoring", (done) => {
      monitor.on("start", () => {
        expect(monitor.monitoring).toBe(true);
        done();
      });

      monitor.start();
    });

    test("should stop monitoring", () => {
      monitor.start();
      monitor.stop();

      expect(monitor.monitoring).toBe(false);
    });

    test("should not start if already monitoring", () => {
      monitor.start();
      const interval1 = monitor.samplingInterval;

      monitor.start();
      const interval2 = monitor.samplingInterval;

      expect(interval1).toBe(interval2);
    });
  });

  describe("Memory Sampling", () => {
    test("should collect memory samples", (done) => {
      monitor.on("sample", (data) => {
        expect(data.usage).toBeDefined();
        expect(data.ratio).toBeGreaterThanOrEqual(0);
        expect(data.timestamp).toBeGreaterThan(0);
        monitor.stop();
        done();
      });

      monitor.start();
    });

    test("should maintain history", async () => {
      monitor.start();

      // Wait for a few samples
      await new Promise((resolve) => setTimeout(resolve, 250));

      monitor.stop();

      expect(monitor.history.length).toBeGreaterThan(0);
    });

    test("should trim history to max size", async () => {
      monitor.config.historySize = 5;
      monitor.start();

      // Wait for more samples than history size
      await new Promise((resolve) => setTimeout(resolve, 800));

      monitor.stop();

      expect(monitor.history.length).toBeLessThanOrEqual(5);
    });
  });

  describe("Memory Snapshots", () => {
    test("should take snapshots", (done) => {
      monitor.on("snapshot", (snapshot) => {
        expect(snapshot).toBeInstanceOf(MemorySnapshot);
        expect(snapshot.timestamp).toBeGreaterThan(0);
        expect(snapshot.heapUsed).toBeGreaterThanOrEqual(0);
        monitor.stop();
        done();
      });

      monitor.start();
    });

    test("should store snapshots", async () => {
      monitor.start();

      // Wait for snapshots
      await new Promise((resolve) => setTimeout(resolve, 1200));

      monitor.stop();

      expect(monitor.snapshots.length).toBeGreaterThan(0);
    });

    test("should serialize snapshots to JSON", () => {
      const usage = {
        heapUsed: 100 * 1024 * 1024,
        heapTotal: 200 * 1024 * 1024,
        external: 10 * 1024 * 1024,
        rss: 150 * 1024 * 1024,
      };

      const snapshot = new MemorySnapshot(usage);
      const json = snapshot.toJSON();

      expect(json.heapUsedMB).toBe(100);
      expect(json.heapTotalMB).toBe(200);
    });
  });

  describe("Threshold Monitoring", () => {
    test("should emit warning on high memory", (done) => {
      // Mock high memory usage
      const originalGetMemoryUsage = monitor._getMemoryUsage;
      monitor._getMemoryUsage = () => ({
        heapUsed: 400 * 1024 * 1024, // 400MB (78% of 512MB)
        heapTotal: 500 * 1024 * 1024,
        external: 0,
        rss: 0,
      });

      monitor.config.warningThreshold = 0.75;

      monitor.on("warning", (data) => {
        expect(data.ratio).toBeGreaterThan(0.75);
        monitor._getMemoryUsage = originalGetMemoryUsage;
        monitor.stop();
        done();
      });

      monitor.start();
    });

    test("should emit critical on very high memory", (done) => {
      // Mock critical memory usage
      const originalGetMemoryUsage = monitor._getMemoryUsage;
      monitor._getMemoryUsage = () => ({
        heapUsed: 480 * 1024 * 1024, // 480MB (94% of 512MB)
        heapTotal: 500 * 1024 * 1024,
        external: 0,
        rss: 0,
      });

      monitor.config.criticalThreshold = 0.9;

      monitor.on("critical", (data) => {
        expect(data.ratio).toBeGreaterThan(0.9);
        monitor._getMemoryUsage = originalGetMemoryUsage;
        monitor.stop();
        done();
      });

      monitor.start();
    });
  });

  describe("Metrics", () => {
    test("should get current metrics", () => {
      const metrics = monitor.getMetrics();

      expect(metrics.current).toBeDefined();
      expect(metrics.thresholds).toBeDefined();
      expect(metrics.status).toBeDefined();
      expect(metrics.stats).toBeDefined();
      expect(metrics.overhead).toBeDefined();
    });

    test("should track sample count", async () => {
      monitor.start();

      await new Promise((resolve) => setTimeout(resolve, 250));

      monitor.stop();

      const metrics = monitor.getMetrics();
      expect(metrics.stats.totalSamples).toBeGreaterThan(0);
    });

    test("should calculate memory percentage", () => {
      const metrics = monitor.getMetrics();

      expect(metrics.current.percentage).toBeGreaterThanOrEqual(0);
      expect(metrics.current.percentage).toBeLessThanOrEqual(100);
    });
  });

  describe("Performance Overhead", () => {
    test("should track overhead", async () => {
      monitor.start();

      await new Promise((resolve) => setTimeout(resolve, 300));

      monitor.stop();

      const metrics = monitor.getMetrics();
      expect(parseFloat(metrics.overhead.avgMs)).toBeGreaterThan(0);
    });

    test("should keep overhead under 5%", async () => {
      monitor.start();

      await new Promise((resolve) => setTimeout(resolve, 500));

      monitor.stop();

      const metrics = monitor.getMetrics();
      const overheadPercent = parseFloat(metrics.overhead.percentage);

      expect(overheadPercent).toBeLessThan(5);
    });
  });

  describe("History and Snapshots", () => {
    test("should get history", async () => {
      monitor.start();

      await new Promise((resolve) => setTimeout(resolve, 250));

      monitor.stop();

      const history = monitor.getHistory();
      expect(Array.isArray(history)).toBe(true);
      expect(history.length).toBeGreaterThan(0);
    });

    test("should get snapshots", async () => {
      monitor.start();

      await new Promise((resolve) => setTimeout(resolve, 600));

      monitor.stop();

      const snapshots = monitor.getSnapshots();
      expect(Array.isArray(snapshots)).toBe(true);
      expect(snapshots.length).toBeGreaterThan(0);
    });
  });

  describe("Recommendations", () => {
    test("should generate recommendations", () => {
      const recommendations = monitor.getRecommendations();

      expect(Array.isArray(recommendations)).toBe(true);
    });

    test("should recommend on high memory", () => {
      // Mock high memory
      const originalGetMemoryUsage = monitor._getMemoryUsage;
      monitor._getMemoryUsage = () => ({
        heapUsed: 480 * 1024 * 1024,
        heapTotal: 500 * 1024 * 1024,
        external: 0,
        rss: 0,
      });

      const recommendations = monitor.getRecommendations();

      expect(recommendations.length).toBeGreaterThan(0);
      expect(recommendations.some((r) => r.category === "memory")).toBe(true);

      monitor._getMemoryUsage = originalGetMemoryUsage;
    });
  });

  describe("Report Generation", () => {
    test("should generate report", () => {
      const report = monitor.getReport();

      expect(typeof report).toBe("string");
      expect(report).toContain("MEMORY MONITOR REPORT");
      expect(report).toContain("Current Memory Usage");
    });

    test("should include statistics in report", async () => {
      monitor.start();

      await new Promise((resolve) => setTimeout(resolve, 200));

      monitor.stop();

      const report = monitor.getReport();

      expect(report).toContain("Statistics");
      expect(report).toContain("Total Samples");
    });
  });

  describe("Reset", () => {
    test("should reset monitor state", async () => {
      monitor.start();

      await new Promise((resolve) => setTimeout(resolve, 250));

      monitor.stop();

      monitor.reset();

      expect(monitor.history.length).toBe(0);
      expect(monitor.snapshots.length).toBe(0);
      expect(monitor.metrics.totalSamples).toBe(0);
    });

    test("should emit reset event", (done) => {
      monitor.on("reset", () => {
        done();
      });

      monitor.reset();
    });
  });
});

describe("MemoryLeakDetector", () => {
  let detector;

  beforeEach(() => {
    detector = new MemoryLeakDetector({
      leakThreshold: 5,
      leakRateThreshold: 0.05,
    });
  });

  describe("Leak Detection", () => {
    test("should detect increasing memory trend", () => {
      let heapUsed = 100 * 1024 * 1024;

      // Simulate consistent increases
      for (let i = 0; i < 6; i++) {
        heapUsed += 10 * 1024 * 1024; // 10MB increase each time
        const result = detector.analyze(heapUsed);

        if (i >= 5) {
          expect(result.leakDetected).toBe(true);
        }
      }
    });

    test("should track consecutive increases", () => {
      let heapUsed = 100 * 1024 * 1024;

      const result1 = detector.analyze(heapUsed);
      expect(result1.consecutiveIncreases).toBe(0);

      heapUsed += 10 * 1024 * 1024;
      const result2 = detector.analyze(heapUsed);
      expect(result2.consecutiveIncreases).toBeGreaterThan(0);
    });

    test("should reset on memory decrease", () => {
      let heapUsed = 100 * 1024 * 1024;

      // Increase
      for (let i = 0; i < 3; i++) {
        heapUsed += 10 * 1024 * 1024;
        detector.analyze(heapUsed);
      }

      // Decrease
      heapUsed -= 20 * 1024 * 1024;
      const result = detector.analyze(heapUsed);

      expect(result.consecutiveIncreases).toBeLessThan(3);
    });

    test("should calculate confidence", () => {
      let heapUsed = 100 * 1024 * 1024;

      for (let i = 0; i < 3; i++) {
        heapUsed += 10 * 1024 * 1024;
        const result = detector.analyze(heapUsed);
        expect(result.confidence).toBeGreaterThanOrEqual(0);
        expect(result.confidence).toBeLessThanOrEqual(100);
      }
    });
  });

  describe("Trend Analysis", () => {
    test("should get trend analysis", () => {
      let heapUsed = 100 * 1024 * 1024;

      for (let i = 0; i < 5; i++) {
        heapUsed += 10 * 1024 * 1024;
        detector.analyze(heapUsed);
      }

      const trend = detector.getTrend();
      expect(trend.trend).toBeDefined();
      expect(trend.averageGrowthRate).toBeGreaterThanOrEqual(0);
    });
  });

  describe("Reset", () => {
    test("should reset detector state", () => {
      let heapUsed = 100 * 1024 * 1024;

      for (let i = 0; i < 3; i++) {
        heapUsed += 10 * 1024 * 1024;
        detector.analyze(heapUsed);
      }

      detector.reset();

      expect(detector.consecutiveIncreases).toBe(0);
      expect(detector.leakDetected).toBe(false);
      expect(detector.leakHistory.length).toBe(0);
    });
  });
});

describe("GCOptimizer", () => {
  let optimizer;

  beforeEach(() => {
    optimizer = new GCOptimizer({
      gcThreshold: 0.85,
      autoGC: false,
    });
  });

  describe("GC Analysis", () => {
    test("should recommend GC at threshold", () => {
      const result = optimizer.analyze(0.9, { heapUsed: 450 * 1024 * 1024 });

      expect(result.shouldTriggerGC).toBe(true);
      expect(result.reason).toBeDefined();
    });

    test("should not recommend GC below threshold", () => {
      const result = optimizer.analyze(0.7, { heapUsed: 350 * 1024 * 1024 });

      expect(result.shouldTriggerGC).toBe(false);
    });

    test("should respect minimum GC interval", () => {
      optimizer.lastGCTime = Date.now();

      const result = optimizer.analyze(0.9, { heapUsed: 450 * 1024 * 1024 });

      expect(result.shouldTriggerGC).toBe(false);
    });
  });

  describe("GC Statistics", () => {
    test("should get GC stats", () => {
      const stats = optimizer.getStats();

      expect(stats.gcCount).toBeDefined();
    });
  });
});

describe("Factory Functions", () => {
  test("should create monitor with factory", () => {
    const monitor = createMemoryMonitor({
      maxMemoryMB: 1024,
    });

    expect(monitor).toBeInstanceOf(EnhancedMemoryMonitor);
    expect(monitor.config.maxMemoryMB).toBe(1024);
  });

  test("should export DEFAULT_CONFIG", () => {
    expect(DEFAULT_CONFIG).toBeDefined();
    expect(DEFAULT_CONFIG.maxMemoryMB).toBe(512);
  });
});
