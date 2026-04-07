"use strict";

/**
 * Metrics Aggregator
 *
 * Collects and aggregates metrics from various RAG pipeline sources
 * into a dashboard-ready format. Supports rolling windows, percentile
 * calculations, and time-series data for charting.
 */

const { EventEmitter } = require("events");

/**
 * @typedef {Object} MetricsAggregatorConfig
 * @property {number} windowSize - Rolling window in seconds (default: 60)
 * @property {number} sampleInterval - Milliseconds between samples (default: 1000)
 * @property {number} maxHistory - Maximum data points to keep (default: 3600)
 */
const DEFAULT_CONFIG = {
  windowSize: 60,
  sampleInterval: 1000,
  maxHistory: 3600,
};

/**
 * @typedef {Object} QueryData
 * @property {number} duration - Duration in milliseconds
 * @property {number} [tokens] - Token count
 * @property {number} [cost] - Cost in USD
 * @property {boolean} [success] - Whether the operation succeeded
 * @property {number} [timestamp] - Unix timestamp (defaults to Date.now())
 */

/**
 * @typedef {Object} ErrorData
 * @property {string} message - Error message
 * @property {string} [code] - Error code
 * @property {string} [source] - Error source component
 * @property {number} [timestamp] - Unix timestamp
 */

/**
 * Collects and aggregates pipeline metrics into dashboard-ready snapshots.
 * @extends EventEmitter
 */
class MetricsAggregator extends EventEmitter {
  /**
   * @param {Partial<MetricsAggregatorConfig>} options
   */
  constructor(options = {}) {
    super();
    this.config = { ...DEFAULT_CONFIG, ...options };
    this.startTime = Date.now();

    /** @type {{ queries: number, embeddings: number, retrievals: number, generations: number, errors: number }} */
    this.counters = {
      queries: 0,
      embeddings: 0,
      retrievals: 0,
      generations: 0,
      errors: 0,
    };

    /** @type {Array<{ value: number, timestamp: number }>} */
    this.latencies = [];

    /** @type {Array<{ value: number, timestamp: number }>} */
    this.costs = [];

    /** @type {Array<{ heapUsed: number, heapTotal: number, rss: number, timestamp: number }>} */
    this.memory = [];

    /** @type {Array<{ message: string, code: string, source: string, timestamp: number }>} */
    this.errors = [];

    /** @type {Array<{ type: string, timestamp: number, duration: number }>} */
    this.history = [];
  }

  /**
   * Record a query operation metric.
   * @param {QueryData} data
   */
  recordQuery(data) {
    this._recordOperation("queries", data);
  }

  /**
   * Record an embedding operation metric.
   * @param {QueryData} data
   */
  recordEmbedding(data) {
    this._recordOperation("embeddings", data);
  }

  /**
   * Record a retrieval operation metric.
   * @param {QueryData} data
   */
  recordRetrieval(data) {
    this._recordOperation("retrievals", data);
  }

  /**
   * Record a generation operation metric.
   * @param {QueryData} data
   */
  recordGeneration(data) {
    this._recordOperation("generations", data);
  }

  /**
   * Record an error event.
   * @param {ErrorData} data
   */
  recordError(data) {
    const timestamp = data.timestamp || Date.now();
    this.counters.errors += 1;

    const entry = {
      message: data.message || "Unknown error",
      code: data.code || "UNKNOWN",
      source: data.source || "unknown",
      timestamp,
    };
    this.errors.push(entry);
    this._trimArray(this.errors);

    this.history.push({ type: "error", timestamp, duration: 0 });
    this._trimArray(this.history);

    this.emit("metric", { type: "error", data: entry });
  }

  /**
   * Record a memory sample.
   * @param {{ heapUsed?: number, heapTotal?: number, rss?: number }} [data]
   */
  recordMemory(data) {
    const mem = data || process.memoryUsage();
    const entry = {
      heapUsed: mem.heapUsed || 0,
      heapTotal: mem.heapTotal || 0,
      rss: mem.rss || 0,
      timestamp: Date.now(),
    };
    this.memory.push(entry);
    this._trimArray(this.memory);

    this.emit("metric", { type: "memory", data: entry });
  }

  /**
   * Return a complete dashboard snapshot of current metrics.
   * @returns {Object} Dashboard-ready metrics snapshot
   */
  getSnapshot() {
    const now = Date.now();
    const windowMs = this.config.windowSize * 1000;

    const recentLatencies = this.latencies
      .filter((l) => now - l.timestamp <= windowMs)
      .map((l) => l.value);

    const latencyStats = this._computePercentiles(recentLatencies);

    const recentHistory = this.history.filter(
      (h) => now - h.timestamp <= windowMs,
    );
    const windowSec = this.config.windowSize || 1;

    const queriesInWindow = recentHistory.filter(
      (h) => h.type === "queries",
    ).length;
    const embeddingsInWindow = recentHistory.filter(
      (h) => h.type === "embeddings",
    ).length;

    const totalCost = this.costs.reduce((sum, c) => sum + c.value, 0);
    const last24hMs = 24 * 60 * 60 * 1000;
    const cost24h = this.costs
      .filter((c) => now - c.timestamp <= last24hMs)
      .reduce((sum, c) => sum + c.value, 0);
    const avgCostPerQuery =
      this.counters.queries > 0 ? totalCost / this.counters.queries : 0;

    const currentMem =
      this.memory.length > 0
        ? this.memory[this.memory.length - 1]
        : { heapUsed: 0, heapTotal: 0, rss: 0 };
    const peakMem = this.memory.reduce(
      (peak, m) => Math.max(peak, m.heapUsed),
      0,
    );
    const memTrend = this._computeMemoryTrend();

    const totalOps =
      this.counters.queries +
      this.counters.embeddings +
      this.counters.retrievals +
      this.counters.generations;

    return {
      counters: { ...this.counters },
      latency: latencyStats,
      throughput: {
        queriesPerSec: queriesInWindow / windowSec,
        embeddingsPerSec: embeddingsInWindow / windowSec,
      },
      cost: {
        total: totalCost,
        last24h: cost24h,
        avgPerQuery: avgCostPerQuery,
      },
      memory: {
        current: currentMem.heapUsed,
        peak: peakMem,
        trend: memTrend,
      },
      errorRate: this.counters.errors / (totalOps || 1),
      uptime: now - this.startTime,
      timestamp: now,
    };
  }

  /**
   * Return time-bucketed data for charting a given metric.
   * @param {'latency'|'throughput'|'cost'|'memory'|'errors'} metric
   * @param {number} [windowSeconds] - Time window in seconds (defaults to config.windowSize)
   * @returns {Array<{ bucket: number, value: number, label: string }>}
   */
  getTimeSeries(metric, windowSeconds) {
    const window = (windowSeconds || this.config.windowSize) * 1000;
    const now = Date.now();
    const bucketCount = 10;
    const bucketSize = window / bucketCount;
    const buckets = [];

    for (let i = 0; i < bucketCount; i++) {
      const bucketStart = now - window + i * bucketSize;
      const bucketEnd = bucketStart + bucketSize;
      const label = `-${Math.round((now - bucketEnd) / 1000)}s`;

      let value = 0;

      switch (metric) {
        case "latency": {
          const items = this.latencies.filter(
            (l) => l.timestamp >= bucketStart && l.timestamp < bucketEnd,
          );
          value =
            items.length > 0
              ? items.reduce((s, l) => s + l.value, 0) / items.length
              : 0;
          break;
        }
        case "throughput": {
          value =
            this.history.filter(
              (h) =>
                h.type === "queries" &&
                h.timestamp >= bucketStart &&
                h.timestamp < bucketEnd,
            ).length /
            (bucketSize / 1000);
          break;
        }
        case "cost": {
          value = this.costs
            .filter(
              (c) => c.timestamp >= bucketStart && c.timestamp < bucketEnd,
            )
            .reduce((s, c) => s + c.value, 0);
          break;
        }
        case "memory": {
          const items = this.memory.filter(
            (m) => m.timestamp >= bucketStart && m.timestamp < bucketEnd,
          );
          value = items.length > 0 ? items[items.length - 1].heapUsed : 0;
          break;
        }
        case "errors": {
          value = this.errors.filter(
            (e) => e.timestamp >= bucketStart && e.timestamp < bucketEnd,
          ).length;
          break;
        }
        default:
          break;
      }

      buckets.push({ bucket: bucketStart, value, label });
    }

    return buckets;
  }

  /**
   * Reset all counters, history, and collected metrics.
   */
  reset() {
    this.counters = {
      queries: 0,
      embeddings: 0,
      retrievals: 0,
      generations: 0,
      errors: 0,
    };
    this.latencies = [];
    this.costs = [];
    this.memory = [];
    this.errors = [];
    this.history = [];
    this.startTime = Date.now();

    this.emit("reset");
  }

  /**
   * Record a generic pipeline operation.
   * @param {string} type - Counter key (queries, embeddings, etc.)
   * @param {QueryData} data
   * @private
   */
  _recordOperation(type, data) {
    const timestamp = data.timestamp || Date.now();

    this.counters[type] = (this.counters[type] || 0) + 1;

    if (typeof data.duration === "number") {
      this.latencies.push({ value: data.duration, timestamp });
      this._trimArray(this.latencies);
    }

    if (typeof data.cost === "number") {
      this.costs.push({ value: data.cost, timestamp });
      this._trimArray(this.costs);
    }

    this.history.push({ type, timestamp, duration: data.duration || 0 });
    this._trimArray(this.history);

    this.emit("metric", { type, data: { ...data, timestamp } });
  }

  /**
   * Trim an array to maxHistory length, removing oldest entries.
   * @param {Array} arr
   * @private
   */
  _trimArray(arr) {
    while (arr.length > this.config.maxHistory) {
      arr.shift();
    }
  }

  /**
   * Compute percentile statistics from a sorted array of values.
   * @param {number[]} values
   * @returns {{ avg: number, p50: number, p95: number, p99: number, min: number, max: number }}
   * @private
   */
  _computePercentiles(values) {
    if (values.length === 0) {
      return { avg: 0, p50: 0, p95: 0, p99: 0, min: 0, max: 0 };
    }

    const sorted = [...values].sort((a, b) => a - b);
    const sum = sorted.reduce((s, v) => s + v, 0);

    return {
      avg: sum / sorted.length,
      p50: sorted[Math.floor(sorted.length * 0.5)],
      p95:
        sorted[Math.floor(sorted.length * 0.95)] || sorted[sorted.length - 1],
      p99:
        sorted[Math.floor(sorted.length * 0.99)] || sorted[sorted.length - 1],
      min: sorted[0],
      max: sorted[sorted.length - 1],
    };
  }

  /**
   * Compute memory usage trend (positive = increasing, negative = decreasing).
   * @returns {'increasing'|'decreasing'|'stable'}
   * @private
   */
  _computeMemoryTrend() {
    if (this.memory.length < 2) {
      return "stable";
    }

    const recent = this.memory.slice(-10);
    if (recent.length < 2) {
      return "stable";
    }

    const first = recent[0].heapUsed;
    const last = recent[recent.length - 1].heapUsed;
    const changePct = ((last - first) / (first || 1)) * 100;

    if (changePct > 5) return "increasing";
    if (changePct < -5) return "decreasing";
    return "stable";
  }
}

module.exports = { MetricsAggregator, DEFAULT_CONFIG };
