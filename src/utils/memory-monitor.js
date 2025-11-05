"use strict";

/**
 * Enhanced Memory Monitor
 *
 * Advanced memory monitoring with leak detection, historical tracking,
 * GC optimization, and actionable insights for long-running processes.
 *
 * Features:
 * - Real-time memory usage tracking
 * - Memory leak detection with trend analysis
 * - Historical memory tracking with snapshots
 * - GC optimization recommendations
 * - Performance overhead measurement (<5%)
 * - Actionable memory metrics
 * - Integration with existing backpressure systems
 *
 * @module utils/memory-monitor
 * @since 2.3.0
 */

const { EventEmitter } = require("events");
const { performance } = require("perf_hooks");

/**
 * Default configuration for memory monitoring
 */
const DEFAULT_CONFIG = {
  // Memory limits
  maxMemoryMB: 512,
  warningThreshold: 0.75, // 75% of max memory
  criticalThreshold: 0.9, // 90% of max memory

  // Sampling and history
  samplingInterval: 5000, // Sample every 5 seconds
  historySize: 100, // Keep last 100 samples
  snapshotInterval: 60000, // Snapshot every minute

  // Leak detection
  leakDetectionEnabled: true,
  leakThreshold: 5, // 5 consecutive increases = leak
  leakRateThreshold: 0.05, // 5% growth per sample = leak

  // GC hints
  gcHintsEnabled: true,
  gcThreshold: 0.85, // Suggest GC at 85%
  autoGC: false, // Auto-trigger GC (requires --expose-gc)

  // Performance
  enableDetailedMetrics: true,
  trackPerformanceOverhead: true,
};

/**
 * Memory snapshot for historical tracking
 */
class MemorySnapshot {
  constructor(usage, timestamp = Date.now()) {
    this.timestamp = timestamp;
    this.heapUsed = usage.heapUsed;
    this.heapTotal = usage.heapTotal;
    this.external = usage.external;
    this.rss = usage.rss;
    this.arrayBuffers = usage.arrayBuffers || 0;
  }

  toJSON() {
    return {
      timestamp: this.timestamp,
      heapUsedMB: Math.round(this.heapUsed / 1024 / 1024),
      heapTotalMB: Math.round(this.heapTotal / 1024 / 1024),
      externalMB: Math.round(this.external / 1024 / 1024),
      rssMB: Math.round(this.rss / 1024 / 1024),
    };
  }
}

/**
 * Memory leak detector
 */
class MemoryLeakDetector {
  constructor(options = {}) {
    this.leakThreshold = options.leakThreshold || 5;
    this.leakRateThreshold = options.leakRateThreshold || 0.05;
    this.consecutiveIncreases = 0;
    this.lastHeapUsed = 0;
    this.leakDetected = false;
    this.leakHistory = [];
  }

  /**
   * Analyze memory trend for leaks
   *
   * @param {number} currentHeapUsed - Current heap usage in bytes
   * @returns {Object} Leak analysis result
   */
  analyze(currentHeapUsed) {
    if (this.lastHeapUsed === 0) {
      this.lastHeapUsed = currentHeapUsed;
      return {
        leakDetected: false,
        consecutiveIncreases: 0,
        increase: 0,
        increaseRate: 0,
        confidence: 0,
      };
    }

    const increase = currentHeapUsed - this.lastHeapUsed;
    const increaseRate = increase / this.lastHeapUsed;

    if (increase > 0 && increaseRate > this.leakRateThreshold) {
      this.consecutiveIncreases++;

      // Record leak event
      this.leakHistory.push({
        timestamp: Date.now(),
        heapUsed: currentHeapUsed,
        increase,
        increaseRate: increaseRate * 100,
      });

      // Keep only recent history
      if (this.leakHistory.length > 50) {
        this.leakHistory.shift();
      }

      // Detect leak
      if (this.consecutiveIncreases >= this.leakThreshold) {
        this.leakDetected = true;
      }
    } else {
      this.consecutiveIncreases = Math.max(0, this.consecutiveIncreases - 1);
      if (this.consecutiveIncreases === 0) {
        this.leakDetected = false;
      }
    }

    this.lastHeapUsed = currentHeapUsed;

    return {
      leakDetected: this.leakDetected,
      consecutiveIncreases: this.consecutiveIncreases,
      leakThreshold: this.leakThreshold,
      increase,
      increaseRate: increaseRate * 100,
      confidence: Math.min(
        100,
        (this.consecutiveIncreases / this.leakThreshold) * 100,
      ),
    };
  }

  /**
   * Get leak trend analysis
   */
  getTrend() {
    if (this.leakHistory.length < 2) {
      return { trend: "unknown", averageGrowthRate: 0 };
    }

    const recentHistory = this.leakHistory.slice(-10);
    const avgGrowthRate =
      recentHistory.reduce((sum, h) => sum + h.increaseRate, 0) /
      recentHistory.length;

    return {
      trend:
        avgGrowthRate > this.leakRateThreshold * 100 ? "increasing" : "stable",
      averageGrowthRate: avgGrowthRate,
      sampleCount: recentHistory.length,
    };
  }

  /**
   * Reset leak detector
   */
  reset() {
    this.consecutiveIncreases = 0;
    this.lastHeapUsed = 0;
    this.leakDetected = false;
    this.leakHistory = [];
  }
}

/**
 * GC optimizer
 */
class GCOptimizer {
  constructor(options = {}) {
    this.gcThreshold = options.gcThreshold || 0.85;
    this.autoGC = options.autoGC || false;
    this.gcHistory = [];
    this.lastGCTime = 0;
    this.minGCInterval = 30000; // Minimum 30s between GCs
  }

  /**
   * Analyze if GC should be triggered
   *
   * @param {number} memoryRatio - Current memory usage ratio
   * @param {Object} usage - Memory usage object
   * @returns {Object} GC recommendation
   */
  analyze(memoryRatio, usage) {
    const now = Date.now();
    const timeSinceLastGC = now - this.lastGCTime;

    const shouldTriggerGC =
      memoryRatio > this.gcThreshold && timeSinceLastGC > this.minGCInterval;

    const recommendation = {
      shouldTriggerGC,
      reason: null,
      canAutoGC: global.gc !== undefined,
      timeSinceLastGC,
    };

    if (shouldTriggerGC) {
      recommendation.reason = `Memory usage at ${(memoryRatio * 100).toFixed(1)}% (threshold: ${(this.gcThreshold * 100).toFixed(1)}%)`;

      if (this.autoGC && global.gc) {
        this.triggerGC();
        recommendation.gcTriggered = true;
      }
    }

    return recommendation;
  }

  /**
   * Trigger garbage collection
   */
  triggerGC() {
    if (!global.gc) {
      return { triggered: false, reason: "GC not exposed" };
    }

    const before = process.memoryUsage();
    const startTime = performance.now();

    try {
      global.gc();

      const after = process.memoryUsage();
      const duration = performance.now() - startTime;
      const freed = before.heapUsed - after.heapUsed;

      this.lastGCTime = Date.now();

      this.gcHistory.push({
        timestamp: this.lastGCTime,
        duration,
        freedMB: Math.round(freed / 1024 / 1024),
        heapBefore: Math.round(before.heapUsed / 1024 / 1024),
        heapAfter: Math.round(after.heapUsed / 1024 / 1024),
      });

      // Keep only recent history
      if (this.gcHistory.length > 50) {
        this.gcHistory.shift();
      }

      return {
        triggered: true,
        duration,
        freedMB: Math.round(freed / 1024 / 1024),
      };
    } catch (error) {
      return { triggered: false, error: error.message };
    }
  }

  /**
   * Get GC statistics
   */
  getStats() {
    if (this.gcHistory.length === 0) {
      return { gcCount: 0 };
    }

    const avgDuration =
      this.gcHistory.reduce((sum, gc) => sum + gc.duration, 0) /
      this.gcHistory.length;
    const totalFreed = this.gcHistory.reduce((sum, gc) => sum + gc.freedMB, 0);

    return {
      gcCount: this.gcHistory.length,
      avgDuration: avgDuration.toFixed(2),
      totalFreedMB: totalFreed,
      avgFreedMB: (totalFreed / this.gcHistory.length).toFixed(2),
      lastGC: this.gcHistory[this.gcHistory.length - 1],
    };
  }
}

/**
 * Enhanced Memory Monitor Class
 */
class EnhancedMemoryMonitor extends EventEmitter {
  constructor(options = {}) {
    super();

    this.config = {
      ...DEFAULT_CONFIG,
      ...options,
    };

    // State
    this.monitoring = false;
    this.samplingInterval = null;
    this.snapshotInterval = null;

    // History
    this.history = [];
    this.snapshots = [];

    // Components
    this.leakDetector = new MemoryLeakDetector({
      leakThreshold: this.config.leakThreshold,
      leakRateThreshold: this.config.leakRateThreshold,
    });

    this.gcOptimizer = new GCOptimizer({
      gcThreshold: this.config.gcThreshold,
      autoGC: this.config.autoGC,
    });

    // Metrics
    this.metrics = {
      totalSamples: 0,
      totalSnapshots: 0,
      warningCount: 0,
      criticalCount: 0,
      leakDetections: 0,
      gcSuggestions: 0,
      gcTriggers: 0,
      overheadMs: 0,
    };

    // Performance overhead tracking
    this.overheadSamples = [];
  }

  /**
   * Start monitoring
   */
  start() {
    if (this.monitoring) {
      return;
    }

    this.monitoring = true;
    this.emit("start");

    // Start sampling
    this.samplingInterval = setInterval(() => {
      this._sample();
    }, this.config.samplingInterval);

    // Start snapshots
    if (this.config.snapshotInterval > 0) {
      this.snapshotInterval = setInterval(() => {
        this._takeSnapshot();
      }, this.config.snapshotInterval);
    }

    // Don't keep process alive
    if (this.samplingInterval.unref) {
      this.samplingInterval.unref();
    }
    if (this.snapshotInterval && this.snapshotInterval.unref) {
      this.snapshotInterval.unref();
    }

    // Take initial snapshot
    this._takeSnapshot();
  }

  /**
   * Stop monitoring
   */
  stop() {
    if (!this.monitoring) {
      return;
    }

    this.monitoring = false;

    if (this.samplingInterval) {
      clearInterval(this.samplingInterval);
      this.samplingInterval = null;
    }

    if (this.snapshotInterval) {
      clearInterval(this.snapshotInterval);
      this.snapshotInterval = null;
    }

    this.emit("stop");
  }

  /**
   * Take a memory sample
   * @private
   */
  _sample() {
    const startTime = performance.now();

    try {
      const usage = this._getMemoryUsage();
      const maxMemoryBytes = this.config.maxMemoryMB * 1024 * 1024;
      const ratio = usage.heapUsed / maxMemoryBytes;

      // Add to history
      this.history.push({
        timestamp: Date.now(),
        ...usage,
        ratio,
      });

      // Trim history
      if (this.history.length > this.config.historySize) {
        this.history.shift();
      }

      this.metrics.totalSamples++;

      // Check thresholds
      if (ratio > this.config.criticalThreshold) {
        this.metrics.criticalCount++;
        this.emit("critical", {
          ratio,
          heapUsedMB: Math.round(usage.heapUsed / 1024 / 1024),
          maxMemoryMB: this.config.maxMemoryMB,
        });
      } else if (ratio > this.config.warningThreshold) {
        this.metrics.warningCount++;
        this.emit("warning", {
          ratio,
          heapUsedMB: Math.round(usage.heapUsed / 1024 / 1024),
          maxMemoryMB: this.config.maxMemoryMB,
        });
      }

      // Leak detection
      if (this.config.leakDetectionEnabled) {
        const leakAnalysis = this.leakDetector.analyze(usage.heapUsed);

        if (leakAnalysis.leakDetected && this.metrics.leakDetections === 0) {
          this.metrics.leakDetections++;
          this.emit("leak_detected", {
            ...leakAnalysis,
            heapUsedMB: Math.round(usage.heapUsed / 1024 / 1024),
            trend: this.leakDetector.getTrend(),
          });
        }
      }

      // GC optimization
      if (this.config.gcHintsEnabled) {
        const gcAnalysis = this.gcOptimizer.analyze(ratio, usage);

        if (gcAnalysis.shouldTriggerGC) {
          this.metrics.gcSuggestions++;

          if (gcAnalysis.gcTriggered) {
            this.metrics.gcTriggers++;
            this.emit("gc_triggered", gcAnalysis);
          } else {
            this.emit("gc_suggested", gcAnalysis);
          }
        }
      }

      // Track overhead
      const overhead = performance.now() - startTime;
      this.overheadSamples.push(overhead);
      if (this.overheadSamples.length > 100) {
        this.overheadSamples.shift();
      }
      this.metrics.overheadMs =
        this.overheadSamples.reduce((a, b) => a + b, 0) /
        this.overheadSamples.length;

      this.emit("sample", {
        usage,
        ratio,
        timestamp: Date.now(),
      });
    } catch (error) {
      this.emit("error", error);
    }
  }

  /**
   * Take a memory snapshot
   * @private
   */
  _takeSnapshot() {
    try {
      const usage = this._getMemoryUsage();
      const snapshot = new MemorySnapshot(usage);

      this.snapshots.push(snapshot);

      // Trim snapshots
      if (this.snapshots.length > 100) {
        this.snapshots.shift();
      }

      this.metrics.totalSnapshots++;

      this.emit("snapshot", snapshot);
    } catch (error) {
      this.emit("error", error);
    }
  }

  /**
   * Get current memory usage
   * @private
   */
  _getMemoryUsage() {
    if (typeof process.memoryUsage === "function") {
      return process.memoryUsage();
    }

    // Fallback for environments without process.memoryUsage
    return {
      heapUsed: 0,
      heapTotal: 0,
      external: 0,
      rss: 0,
      arrayBuffers: 0,
    };
  }

  /**
   * Get current memory metrics
   */
  getMetrics() {
    const usage = this._getMemoryUsage();
    const maxMemoryBytes = this.config.maxMemoryMB * 1024 * 1024;
    const ratio = usage.heapUsed / maxMemoryBytes;

    return {
      // Current usage
      current: {
        heapUsedMB: Math.round(usage.heapUsed / 1024 / 1024),
        heapTotalMB: Math.round(usage.heapTotal / 1024 / 1024),
        externalMB: Math.round(usage.external / 1024 / 1024),
        rssMB: Math.round(usage.rss / 1024 / 1024),
        ratio: ratio,
        percentage: Math.round(ratio * 100),
      },

      // Thresholds
      thresholds: {
        warning: this.config.warningThreshold,
        critical: this.config.criticalThreshold,
        maxMemoryMB: this.config.maxMemoryMB,
      },

      // Status
      status:
        ratio > this.config.criticalThreshold
          ? "critical"
          : ratio > this.config.warningThreshold
            ? "warning"
            : "normal",

      // Statistics
      stats: {
        ...this.metrics,
        historySize: this.history.length,
        snapshotCount: this.snapshots.length,
      },

      // Leak detection
      leak: this.config.leakDetectionEnabled
        ? {
            detected: this.leakDetector.leakDetected,
            consecutiveIncreases: this.leakDetector.consecutiveIncreases,
            confidence: Math.min(
              100,
              (this.leakDetector.consecutiveIncreases /
                this.leakDetector.leakThreshold) *
                100,
            ),
            trend: this.leakDetector.getTrend(),
          }
        : null,

      // GC stats
      gc: this.config.gcHintsEnabled ? this.gcOptimizer.getStats() : null,

      // Performance overhead
      overhead: {
        avgMs: this.metrics.overheadMs.toFixed(3),
        percentage: (
          (this.metrics.overheadMs / this.config.samplingInterval) *
          100
        ).toFixed(2),
      },
    };
  }

  /**
   * Get memory history
   */
  getHistory() {
    return this.history.map((h) => ({
      timestamp: h.timestamp,
      heapUsedMB: Math.round(h.heapUsed / 1024 / 1024),
      heapTotalMB: Math.round(h.heapTotal / 1024 / 1024),
      ratio: h.ratio,
    }));
  }

  /**
   * Get memory snapshots
   */
  getSnapshots() {
    return this.snapshots.map((s) => s.toJSON());
  }

  /**
   * Get actionable recommendations
   */
  getRecommendations() {
    const metrics = this.getMetrics();
    const recommendations = [];

    // High memory usage
    if (metrics.status === "critical") {
      recommendations.push({
        priority: "high",
        category: "memory",
        message: `Critical memory usage: ${metrics.current.percentage}%`,
        action:
          "Reduce batch sizes, implement streaming, or increase memory limit",
      });
    } else if (metrics.status === "warning") {
      recommendations.push({
        priority: "medium",
        category: "memory",
        message: `High memory usage: ${metrics.current.percentage}%`,
        action: "Monitor closely and consider optimizations",
      });
    }

    // Memory leak
    if (metrics.leak && metrics.leak.detected) {
      recommendations.push({
        priority: "high",
        category: "leak",
        message: `Memory leak detected with ${metrics.leak.confidence.toFixed(0)}% confidence`,
        action:
          "Investigate increasing memory trend. Check for unclosed resources, event listeners, or circular references",
        details: metrics.leak.trend,
      });
    }

    // GC optimization
    if (metrics.gc && metrics.current.ratio > this.config.gcThreshold) {
      recommendations.push({
        priority: "medium",
        category: "gc",
        message: `GC recommended at ${metrics.current.percentage}% memory usage`,
        action: global.gc
          ? "Trigger manual GC or enable autoGC"
          : "Run with --expose-gc flag to enable manual GC",
      });
    }

    // Performance overhead
    if (parseFloat(metrics.overhead.percentage) > 5) {
      recommendations.push({
        priority: "low",
        category: "performance",
        message: `Monitoring overhead at ${metrics.overhead.percentage}%`,
        action:
          "Consider increasing samplingInterval or disabling detailed metrics",
      });
    }

    return recommendations;
  }

  /**
   * Get comprehensive report
   */
  getReport() {
    const metrics = this.getMetrics();
    const recommendations = this.getRecommendations();

    const report = [];

    report.push("=".repeat(60));
    report.push("ENHANCED MEMORY MONITOR REPORT");
    report.push("=".repeat(60));

    report.push("\nCurrent Memory Usage:");
    report.push(`  Heap Used:    ${metrics.current.heapUsedMB} MB`);
    report.push(`  Heap Total:   ${metrics.current.heapTotalMB} MB`);
    report.push(`  External:     ${metrics.current.externalMB} MB`);
    report.push(`  RSS:          ${metrics.current.rssMB} MB`);
    report.push(`  Usage:        ${metrics.current.percentage}%`);
    report.push(`  Status:       ${metrics.status.toUpperCase()}`);

    report.push("\nStatistics:");
    report.push(`  Total Samples:    ${metrics.stats.totalSamples}`);
    report.push(`  Snapshots:        ${metrics.stats.snapshotCount}`);
    report.push(`  Warnings:         ${metrics.stats.warningCount}`);
    report.push(`  Critical Events:  ${metrics.stats.criticalCount}`);

    if (metrics.leak) {
      report.push("\nLeak Detection:");
      report.push(
        `  Status:           ${metrics.leak.detected ? "LEAK DETECTED" : "No leak"}`,
      );
      report.push(`  Confidence:       ${metrics.leak.confidence.toFixed(0)}%`);
      report.push(`  Trend:            ${metrics.leak.trend.trend}`);
      if (metrics.leak.trend.averageGrowthRate > 0) {
        report.push(
          `  Avg Growth Rate:  ${metrics.leak.trend.averageGrowthRate.toFixed(2)}%`,
        );
      }
    }

    if (metrics.gc) {
      report.push("\nGarbage Collection:");
      report.push(`  GC Count:         ${metrics.gc.gcCount}`);
      report.push(`  Suggestions:      ${metrics.stats.gcSuggestions}`);
      report.push(`  Auto Triggers:    ${metrics.stats.gcTriggers}`);
      if (metrics.gc.gcCount > 0) {
        report.push(`  Avg Duration:     ${metrics.gc.avgDuration}ms`);
        report.push(`  Total Freed:      ${metrics.gc.totalFreedMB} MB`);
      }
    }

    report.push("\nPerformance Overhead:");
    report.push(`  Avg Overhead:     ${metrics.overhead.avgMs}ms per sample`);
    report.push(`  Percentage:       ${metrics.overhead.percentage}%`);

    if (recommendations.length > 0) {
      report.push("\nRecommendations:");
      recommendations.forEach((rec, i) => {
        report.push(
          `\n${i + 1}. [${rec.priority.toUpperCase()}] ${rec.category}`,
        );
        report.push(`   ${rec.message}`);
        report.push(`   Action: ${rec.action}`);
      });
    }

    report.push("\n" + "=".repeat(60));

    return report.join("\n");
  }

  /**
   * Reset monitor state
   */
  reset() {
    this.history = [];
    this.snapshots = [];
    this.leakDetector.reset();
    this.metrics = {
      totalSamples: 0,
      totalSnapshots: 0,
      warningCount: 0,
      criticalCount: 0,
      leakDetections: 0,
      gcSuggestions: 0,
      gcTriggers: 0,
      overheadMs: 0,
    };
    this.overheadSamples = [];

    this.emit("reset");
  }
}

/**
 * Create memory monitor with default configuration
 */
function createMemoryMonitor(options = {}) {
  return new EnhancedMemoryMonitor(options);
}

module.exports = {
  EnhancedMemoryMonitor,
  MemoryLeakDetector,
  GCOptimizer,
  MemorySnapshot,
  createMemoryMonitor,
  DEFAULT_CONFIG,
};
