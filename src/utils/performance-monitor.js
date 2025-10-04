/**
 * @fileoverview Enterprise Performance Monitoring System
 * Provides comprehensive performance tracking, metrics collection, and observability
 *
 * @author DevilsDev Team
 * @since 2.1.8
 */

const { logger } = require("./structured-logger.js");

/**
 * @typedef {Object} PerformanceMetric
 * @property {string} name - Metric name
 * @property {number} value - Metric value
 * @property {string} unit - Metric unit (ms, bytes, count, etc.)
 * @property {Date} timestamp - When metric was recorded
 * @property {Object} tags - Additional metric tags
 */

/**
 * @typedef {Object} TimerMetric
 * @property {string} name - Timer name
 * @property {number} startTime - Start timestamp
 * @property {number} [endTime] - End timestamp
 * @property {number} [duration] - Duration in milliseconds
 * @property {Object} [tags] - Additional tags
 */

/**
 * Enterprise performance monitoring with metrics aggregation
 */
class PerformanceMonitor {
  constructor(options = {}) {
    this.serviceName = options.serviceName || "rag-pipeline-utils";
    this.enableMemoryTracking = options.enableMemoryTracking !== false;
    this.enableCpuTracking = options.enableCpuTracking !== false;
    this.metricsRetentionMs = options.metricsRetentionMs || 24 * 60 * 60 * 1000; // 24 hours
    this.aggregationInterval = options.aggregationInterval || 60000; // 1 minute

    // Metrics storage
    this.metrics = new Map(); // name -> array of metrics
    this.timers = new Map(); // timerId -> timer data
    this.counters = new Map(); // name -> counter value
    this.gauges = new Map(); // name -> gauge value
    this.histograms = new Map(); // name -> array of values

    // Performance tracking
    this.systemMetrics = {
      memoryUsage: [],
      cpuUsage: [],
      eventLoopLag: [],
    };

    // Start background monitoring
    this.startSystemMonitoring();

    this.logger = logger.child({
      component: "performance-monitor",
      service: this.serviceName,
    });

    this.logger.info("Performance monitoring initialized", {
      memoryTracking: this.enableMemoryTracking,
      cpuTracking: this.enableCpuTracking,
      retentionMs: this.metricsRetentionMs,
    });
  }

  /**
   * Start system resource monitoring
   */
  startSystemMonitoring() {
    if (this.enableMemoryTracking) {
      this.memoryInterval = setInterval(() => {
        this.recordMemoryUsage();
      }, 30000); // Every 30 seconds
    }

    if (this.enableCpuTracking) {
      this.cpuInterval = setInterval(() => {
        this.recordCpuUsage();
      }, 30000); // Every 30 seconds
    }

    // Event loop lag monitoring
    this.eventLoopInterval = setInterval(() => {
      this.recordEventLoopLag();
    }, 10000); // Every 10 seconds

    // Cleanup old metrics
    this.cleanupInterval = setInterval(() => {
      this.cleanupOldMetrics();
    }, this.aggregationInterval);
  }

  /**
   * Stop system monitoring
   */
  stopSystemMonitoring() {
    if (this.memoryInterval) clearInterval(this.memoryInterval);
    if (this.cpuInterval) clearInterval(this.cpuInterval);
    if (this.eventLoopInterval) clearInterval(this.eventLoopInterval);
    if (this.cleanupInterval) clearInterval(this.cleanupInterval);
  }

  /**
   * Record memory usage metrics
   */
  recordMemoryUsage() {
    const memUsage = process.memoryUsage();
    const timestamp = Date.now();

    const memoryMetrics = {
      heapUsed: memUsage.heapUsed,
      heapTotal: memUsage.heapTotal,
      external: memUsage.external,
      rss: memUsage.rss,
    };

    this.systemMetrics.memoryUsage.push({
      timestamp,
      ...memoryMetrics,
    });

    // Update gauges
    for (const [key, value] of Object.entries(memoryMetrics)) {
      this.gauge(`memory.${key}`, value, { unit: "bytes" });
    }

    // Cleanup old memory metrics
    const cutoff = timestamp - this.metricsRetentionMs;
    this.systemMetrics.memoryUsage = this.systemMetrics.memoryUsage.filter(
      (m) => m.timestamp > cutoff,
    );
  }

  /**
   * Record CPU usage metrics
   */
  recordCpuUsage() {
    const cpuUsage = process.cpuUsage();
    const timestamp = Date.now();

    this.systemMetrics.cpuUsage.push({
      timestamp,
      user: cpuUsage.user,
      system: cpuUsage.system,
    });

    this.gauge("cpu.user", cpuUsage.user, { unit: "microseconds" });
    this.gauge("cpu.system", cpuUsage.system, { unit: "microseconds" });

    // Cleanup old CPU metrics
    const cutoff = timestamp - this.metricsRetentionMs;
    this.systemMetrics.cpuUsage = this.systemMetrics.cpuUsage.filter(
      (m) => m.timestamp > cutoff,
    );
  }

  /**
   * Record event loop lag
   */
  recordEventLoopLag() {
    const start = process.hrtime.bigint();
    setImmediate(() => {
      const lag = Number(process.hrtime.bigint() - start) / 1000000; // Convert to ms
      const timestamp = Date.now();

      this.systemMetrics.eventLoopLag.push({
        timestamp,
        lag,
      });

      this.gauge("eventloop.lag", lag, { unit: "ms" });

      // Cleanup old lag metrics
      const cutoff = timestamp - this.metricsRetentionMs;
      this.systemMetrics.eventLoopLag = this.systemMetrics.eventLoopLag.filter(
        (m) => m.timestamp > cutoff,
      );
    });
  }

  /**
   * Start a timer for measuring duration
   * @param {string} name - Timer name
   * @param {Object} [tags={}] - Additional tags
   * @returns {string} Timer ID
   */
  startTimer(name, tags = {}) {
    const timerId = `${name}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    this.timers.set(timerId, {
      name,
      startTime: performance.now(),
      tags,
    });

    return timerId;
  }

  /**
   * End a timer and record the duration
   * @param {string} timerId - Timer ID from startTimer
   * @returns {number} Duration in milliseconds
   */
  endTimer(timerId) {
    const timer = this.timers.get(timerId);
    if (!timer) {
      this.logger.warn("Timer not found", { timerId });
      return 0;
    }

    const endTime = performance.now();
    const duration = endTime - timer.startTime;

    timer.endTime = endTime;
    timer.duration = duration;

    // Record as histogram
    this.histogram(timer.name, duration, { ...timer.tags, unit: "ms" });

    // Remove timer from active timers
    this.timers.delete(timerId);

    this.logger.debug("Timer completed", {
      name: timer.name,
      duration,
      tags: timer.tags,
    });

    return duration;
  }

  /**
   * Measure execution time of a function
   * @param {string} name - Metric name
   * @param {Function} fn - Function to measure
   * @param {Object} [tags={}] - Additional tags
   * @returns {Promise<any>} Function result
   */
  async time(name, fn, tags = {}) {
    const timerId = this.startTimer(name, tags);

    try {
      const result = await fn();
      const duration = this.endTimer(timerId);

      this.logger.debug("Function execution timed", {
        name,
        duration,
        success: true,
        tags,
      });

      return result;
    } catch (error) {
      const duration = this.endTimer(timerId);

      this.logger.warn("Function execution failed", {
        name,
        duration,
        success: false,
        error: error.message,
        tags,
      });

      throw error;
    }
  }

  /**
   * Increment a counter
   * @param {string} name - Counter name
   * @param {number} [value=1] - Increment value
   * @param {Object} [tags={}] - Additional tags
   */
  counter(name, value = 1, tags = {}) {
    const current = this.counters.get(name) || 0;
    this.counters.set(name, current + value);

    this.recordMetric({
      name,
      value: current + value,
      unit: "count",
      timestamp: new Date(),
      tags: { ...tags, type: "counter" },
    });
  }

  /**
   * Set a gauge value
   * @param {string} name - Gauge name
   * @param {number} value - Gauge value
   * @param {Object} [tags={}] - Additional tags
   */
  gauge(name, value, tags = {}) {
    this.gauges.set(name, value);

    this.recordMetric({
      name,
      value,
      unit: tags.unit || "value",
      timestamp: new Date(),
      tags: { ...tags, type: "gauge" },
    });
  }

  /**
   * Record a histogram value
   * @param {string} name - Histogram name
   * @param {number} value - Value to record
   * @param {Object} [tags={}] - Additional tags
   */
  histogram(name, value, tags = {}) {
    if (!this.histograms.has(name)) {
      this.histograms.set(name, []);
    }

    const values = this.histograms.get(name);
    values.push({ value, timestamp: Date.now() });

    // Keep only recent values
    const cutoff = Date.now() - this.metricsRetentionMs;
    this.histograms.set(
      name,
      values.filter((v) => v.timestamp > cutoff),
    );

    this.recordMetric({
      name,
      value,
      unit: tags.unit || "value",
      timestamp: new Date(),
      tags: { ...tags, type: "histogram" },
    });
  }

  /**
   * Record a generic metric
   * @param {PerformanceMetric} metric - Metric to record
   */
  recordMetric(metric) {
    if (!this.metrics.has(metric.name)) {
      this.metrics.set(metric.name, []);
    }

    const metricArray = this.metrics.get(metric.name);
    metricArray.push(metric);

    // Emit to logger for observability
    this.logger.debug("Metric recorded", {
      metricName: metric.name,
      value: metric.value,
      unit: metric.unit,
      tags: metric.tags,
    });
  }

  /**
   * Get statistics for a histogram
   * @param {string} name - Histogram name
   * @returns {Object} Statistics
   */
  getHistogramStats(name) {
    const histogram = this.histograms.get(name);
    if (!histogram || histogram.length === 0) {
      return null;
    }

    const values = histogram.map((h) => h.value).sort((a, b) => a - b);
    const count = values.length;
    const sum = values.reduce((a, b) => a + b, 0);
    const mean = sum / count;

    const p50 = values[Math.floor(count * 0.5)];
    const p95 = values[Math.floor(count * 0.95)];
    const p99 = values[Math.floor(count * 0.99)];

    return {
      count,
      sum,
      mean,
      min: values[0],
      max: values[count - 1],
      p50,
      p95,
      p99,
    };
  }

  /**
   * Get current system metrics
   * @returns {Object} System metrics
   */
  getSystemMetrics() {
    const latest = {
      memory:
        this.systemMetrics.memoryUsage[
          this.systemMetrics.memoryUsage.length - 1
        ],
      cpu: this.systemMetrics.cpuUsage[this.systemMetrics.cpuUsage.length - 1],
      eventLoop:
        this.systemMetrics.eventLoopLag[
          this.systemMetrics.eventLoopLag.length - 1
        ],
    };

    return {
      current: latest,
      history: {
        memory: this.systemMetrics.memoryUsage.slice(-60), // Last 60 readings
        cpu: this.systemMetrics.cpuUsage.slice(-60),
        eventLoop: this.systemMetrics.eventLoopLag.slice(-60),
      },
    };
  }

  /**
   * Get all metrics summary
   * @returns {Object} Metrics summary
   */
  getMetricsSummary() {
    const summary = {
      counters: Object.fromEntries(this.counters),
      gauges: Object.fromEntries(this.gauges),
      histograms: {},
      system: this.getSystemMetrics(),
      activeTimers: this.timers.size,
    };

    // Add histogram statistics
    for (const [name] of this.histograms) {
      summary.histograms[name] = this.getHistogramStats(name);
    }

    return summary;
  }

  /**
   * Export metrics in Prometheus format
   * @returns {string} Prometheus formatted metrics
   */
  exportPrometheusMetrics() {
    const lines = [];
    const timestamp = Date.now();

    // Counters
    for (const [name, value] of this.counters) {
      lines.push(`# TYPE ${name} counter`);
      lines.push(`${name} ${value} ${timestamp}`);
    }

    // Gauges
    for (const [name, value] of this.gauges) {
      lines.push(`# TYPE ${name} gauge`);
      lines.push(`${name} ${value} ${timestamp}`);
    }

    // Histograms
    for (const [name] of this.histograms) {
      const stats = this.getHistogramStats(name);
      if (stats) {
        lines.push(`# TYPE ${name} histogram`);
        lines.push(`${name}_count ${stats.count} ${timestamp}`);
        lines.push(`${name}_sum ${stats.sum} ${timestamp}`);
        lines.push(`${name}_bucket{le="50"} ${stats.p50} ${timestamp}`);
        lines.push(`${name}_bucket{le="95"} ${stats.p95} ${timestamp}`);
        lines.push(`${name}_bucket{le="99"} ${stats.p99} ${timestamp}`);
      }
    }

    return lines.join("\n");
  }

  /**
   * Clean up old metrics
   */
  cleanupOldMetrics() {
    const cutoff = Date.now() - this.metricsRetentionMs;

    // Clean up stored metrics
    for (const [name, metricArray] of this.metrics) {
      const filtered = metricArray.filter(
        (m) => m.timestamp.getTime() > cutoff,
      );
      if (filtered.length === 0) {
        this.metrics.delete(name);
      } else {
        this.metrics.set(name, filtered);
      }
    }

    // Clean up histograms
    for (const [name, values] of this.histograms) {
      const filtered = values.filter((v) => v.timestamp > cutoff);
      if (filtered.length === 0) {
        this.histograms.delete(name);
      } else {
        this.histograms.set(name, filtered);
      }
    }

    this.logger.debug("Old metrics cleaned up", {
      activeMetrics: this.metrics.size,
      activeHistograms: this.histograms.size,
      cutoffTime: new Date(cutoff).toISOString(),
    });
  }

  /**
   * Reset all metrics
   */
  reset() {
    this.metrics.clear();
    this.timers.clear();
    this.counters.clear();
    this.gauges.clear();
    this.histograms.clear();
    this.systemMetrics = {
      memoryUsage: [],
      cpuUsage: [],
      eventLoopLag: [],
    };

    this.logger.info("Performance metrics reset");
  }

  /**
   * Shutdown performance monitoring
   */
  shutdown() {
    this.stopSystemMonitoring();
    this.logger.info("Performance monitoring shutdown");
  }
}

/**
 * Create performance monitor instance
 * @param {Object} [options={}] - Monitor configuration
 * @returns {PerformanceMonitor} Monitor instance
 */
function createPerformanceMonitor(options = {}) {
  return new PerformanceMonitor(options);
}

// Default monitor instance
const defaultMonitor = createPerformanceMonitor({
  serviceName: "rag-pipeline-utils",
  enableMemoryTracking: true,
  enableCpuTracking: true,
});

module.exports = {
  PerformanceMonitor,
  createPerformanceMonitor,
  monitor: defaultMonitor,
};

// CommonJS/ESM interop
module.exports.default = module.exports;
