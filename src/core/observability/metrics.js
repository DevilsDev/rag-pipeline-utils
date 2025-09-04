// src/core/observability/metrics.js
const MetricType = {
  COUNTER: "counter",
  HISTOGRAM: "histogram",
  GAUGE: "gauge",
};

/** Counter */
class Counter {
  constructor(name, description = "", labels = {}) {
    this._type = MetricType.COUNTER;
    this.name = name;
    this.description = description;
    this.labels = labels || {};
    this.value = 0;
  }
  inc(n = 1) {
    if (n < 0)
      throw new Error("Counter can only be incremented by non-negative values");
    this.value += n;
  }
  reset() {
    this.value = 0;
  }
  toJSON() {
    return {
      name: this.name,
      description: this.description,
      type: this._type,
      value: this.value,
      labels: this.labels,
      timestamp: new Date().toISOString(),
    };
  }
}

/** Gauge */
class Gauge {
  constructor(name, description = "", labels = {}) {
    this._type = MetricType.GAUGE;
    this.name = name;
    this.description = description;
    this.labels = labels || {};
    this.value = 0;
  }
  set(v) {
    this.value = v;
  }
  inc(n = 1) {
    this.value += n;
  }
  dec(n = 1) {
    this.value -= n;
  }
  reset() {
    this.value = 0;
  }
  toJSON() {
    return {
      name: this.name,
      description: this.description,
      type: this._type,
      value: this.value,
      labels: this.labels,
      timestamp: new Date().toISOString(),
    };
  }
}

/** Histogram with cumulative bucketCounts and raw observations for stats/percentiles */
class Histogram {
  constructor(
    name,
    description = "",
    labels = {},
    buckets = [1, 5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000, 10000],
  ) {
    this._type = MetricType.HISTOGRAM;
    this.name = name;
    this.description = description;
    this.labels = labels || {};
    this.buckets = [...buckets].sort((a, b) => a - b);
    this.bucketCounts = Array(this.buckets.length + 1).fill(0); // cumulative, last = +Inf
    this.sum = 0;
    this.count = 0;
    this.min = Infinity;
    this.max = -Infinity;
    this._obs = [];
  }

  observe(v) {
    if (typeof v !== "number" || Number.isNaN(v)) return;
    this._obs.push(v);
    this.sum += v;
    this.count += 1;
    if (v < this.min) this.min = v;
    if (v > this.max) this.max = v;

    // find first bucket index where v <= bucket
    let idx = this.buckets.findIndex((b) => v <= b);
    if (idx === -1) idx = this.buckets.length; // +Inf

    // cumulative: increment from idx to end
    for (let i = idx; i < this.bucketCounts.length; i++)
      this.bucketCounts[i] += 1;
  }

  getPercentiles(percentiles = [50, 95, 99]) {
    if (this._obs.length === 0)
      return Object.fromEntries(percentiles.map((p) => [p, 0]));
    const arr = [...this._obs].sort((a, b) => a - b);
    const n = arr.length;
    const out = {};
    for (const p of percentiles) {
      // nearest-rank method
      let rank = Math.ceil((p / 100) * n);
      if (rank < 1) rank = 1;
      if (rank > n) rank = n;
      out[p] = arr[rank - 1];
    }
    return out;
  }

  getStatistics() {
    if (this.count === 0) {
      return {
        mean: 0,
        stdDev: 0,
        min: Infinity,
        max: -Infinity,
        count: 0,
        sum: 0,
      };
    }
    const mean = this.sum / this.count;
    // population std dev
    const variance =
      this._obs.reduce((acc, x) => acc + Math.pow(x - mean, 2), 0) / this.count;
    const stdDev = Math.sqrt(variance);
    return {
      mean,
      stdDev,
      min: this.min,
      max: this.max,
      count: this.count,
      sum: this.sum,
    };
  }

  reset() {
    this.bucketCounts.fill(0);
    this.sum = 0;
    this.count = 0;
    this.min = Infinity;
    this.max = -Infinity;
    this._obs = [];
  }
  export() {
    // Map bucket value -> cumulative count
    const bucketsObj = {};
    for (let i = 0; i < this.buckets.length; i++)
      bucketsObj[this.buckets[i]] = this.bucketCounts[i];
    bucketsObj["+Inf"] = this.bucketCounts[this.bucketCounts.length - 1];
    const stats = this.getStatistics();
    return { buckets: bucketsObj, ...stats };
  }
  toJSON() {
    return {
      name: this.name,
      description: this.description,
      type: this._type,
      count: this.count,
      sum: this.sum,
      buckets: this.buckets,
      bucketCounts: this.bucketCounts,
      labels: this.labels,
      timestamp: new Date().toISOString(),
    };
  }
}

/** Metrics registry (simple) */
class MetricsRegistry {
  constructor() {
    this._metrics = new Map(); // name -> metric instance
  }
  register(metric) {
    if (this._metrics.has(metric.name)) {
      throw new Error(
        `Metric with name "${metric.name}" is already registered`,
      );
    }
    this._metrics.set(metric.name, metric);
  }
  getMetric(name) {
    return this._metrics.get(name);
  }
  getAllMetrics() {
    return Array.from(this._metrics.values());
  }
  clear() {
    this._metrics.clear();
  }
  getOrCreateCounter(name, description, labels = {}) {
    if (this._metrics.has(name)) {
      return this._metrics.get(name);
    }
    const counter = new Counter(name, description, labels);
    this.register(counter);
    return counter;
  }
  getOrCreateHistogram(name, description, labels = {}, buckets) {
    if (this._metrics.has(name)) {
      return this._metrics.get(name);
    }
    const histogram = new Histogram(name, description, labels, buckets);
    this.register(histogram);
    return histogram;
  }
  getOrCreateGauge(name, description, labels = {}) {
    if (this._metrics.has(name)) {
      return this._metrics.get(name);
    }
    const gauge = new Gauge(name, description, labels);
    this.register(gauge);
    return gauge;
  }
  exportMetrics() {
    return JSON.stringify({
      timestamp: new Date().toISOString(),
      metrics: this.getAllMetrics().map((m) => m.toJSON()),
    });
  }
}

/** Pipeline-level convenience aggregator used by tests */
class PipelineMetrics {
  constructor() {
    this.counters = {
      operationsTotal: new Counter("operations_total", "Total operations"),
      operationsSuccessful: new Counter(
        "operations_successful",
        "Successful operations",
      ),
      operationsFailed: new Counter("operations_failed", "Failed operations"),
      operationsActive: new Counter("operations_active", "Active operations"),
    };
    this.errorsByType = { plugin: 0, stage: 0 };
    this.errorsByPlugin = {};
    this.backpressureSamples = [];
    this.backpressureApplied = 0;
    this.backpressureReleased = 0;
    this.memory = { heapUsed: 0, heapTotal: 0, usagePercentage: 0 };

    // Additional metrics for test compatibility
    this.embedding = {
      operations: 0,
      totalDuration: 0,
      totalTokens: 0,
      totalBatches: 0,
      durations: [],
    };
    this.retrieval = {
      operations: 0,
      totalDuration: 0,
      totalResults: 0,
      durations: [],
    };
    this.llm = {
      operations: 0,
      totalDuration: 0,
      totalInputTokens: 0,
      totalOutputTokens: 0,
      streamingOps: 0,
      durations: [],
      inputTokens: [],
      outputTokens: [],
    };
    this.concurrency = { maxConcurrency: 0, concurrencyValues: [] };
  }

  recordEmbedding(provider, duration, tokens, batches) {
    this.embedding.operations++;
    this.embedding.totalDuration += duration;
    this.embedding.totalTokens += tokens;
    this.embedding.totalBatches += batches;
    this.embedding.durations.push(duration);
  }

  recordRetrieval(provider, duration, results) {
    this.retrieval.operations++;
    this.retrieval.totalDuration += duration;
    this.retrieval.totalResults += results;
    this.retrieval.durations.push(duration);
  }

  recordLLM(provider, duration, inputTokens, outputTokens, streaming) {
    this.llm.operations++;
    this.llm.totalDuration += duration;
    this.llm.totalInputTokens += inputTokens;
    this.llm.totalOutputTokens += outputTokens;
    if (streaming) this.llm.streamingOps++;
    this.llm.durations.push(duration);
    this.llm.inputTokens.push(inputTokens);
    this.llm.outputTokens.push(outputTokens);
  }

  recordMemoryUsage() {
    const memUsage = process.memoryUsage();
    this.memory.heapUsed = memUsage.heapUsed;
    this.memory.heapTotal = memUsage.heapTotal;
    this.memory.usagePercentage = Math.round(
      (memUsage.heapUsed / memUsage.heapTotal) * 100,
    );
  }

  recordError(type, component, provider, error) {
    if (type && type in this.errorsByType) this.errorsByType[type]++;
    if (component)
      this.errorsByPlugin[component] =
        (this.errorsByPlugin[component] || 0) + 1;
  }

  recordOperationStart(type, component, provider) {
    this.counters.operationsTotal.inc(1);
    this.counters.operationsActive.inc(1);
  }

  recordOperationEnd(type, component, provider, duration, status) {
    this.counters.operationsActive.value = Math.max(
      0,
      this.counters.operationsActive.value - 1,
    );
    if (status === "error" || status === "failed")
      this.counters.operationsFailed.inc(1);
    else this.counters.operationsSuccessful.inc(1);
  }

  recordConcurrency(maxConcurrency, avgConcurrency) {
    this.concurrency.maxConcurrency = Math.max(
      this.concurrency.maxConcurrency,
      maxConcurrency,
    );
    this.concurrency.concurrencyValues.push(avgConcurrency);
  }

  recordBackpressure(action, bufferSize, threshold) {
    if (action === "applied") this.backpressureApplied++;
    if (action === "released") this.backpressureReleased++;
    if (typeof bufferSize === "number")
      this.backpressureSamples.push(bufferSize);
  }

  getSummary() {
    const backpressureMean = this.backpressureSamples.length
      ? this.backpressureSamples.reduce((a, b) => a + b, 0) /
        this.backpressureSamples.length
      : 0;

    const concurrencyMean = this.concurrency.concurrencyValues.length
      ? this.concurrency.concurrencyValues.reduce((a, b) => a + b, 0) /
        this.concurrency.concurrencyValues.length
      : 0;

    return {
      embedding: {
        totalOperations: this.embedding.operations,
        totalDuration: this.embedding.totalDuration,
        totalTokens: this.embedding.totalTokens,
        totalBatches: this.embedding.totalBatches,
        avgDuration: {
          mean: this.embedding.operations
            ? this.embedding.totalDuration / this.embedding.operations
            : 0,
        },
      },
      retrieval: {
        totalOperations: this.retrieval.operations,
        totalResults: this.retrieval.totalResults,
        avgDuration: {
          mean: this.retrieval.operations
            ? this.retrieval.totalDuration / this.retrieval.operations
            : 0,
        },
      },
      llm: {
        totalOperations: this.llm.operations,
        streamingOperations: this.llm.streamingOps,
        avgDuration: {
          mean: this.llm.operations
            ? this.llm.totalDuration / this.llm.operations
            : 0,
        },
        avgInputTokens: {
          mean: this.llm.operations
            ? this.llm.totalInputTokens / this.llm.operations
            : 0,
        },
        avgOutputTokens: {
          mean: this.llm.operations
            ? this.llm.totalOutputTokens / this.llm.operations
            : 0,
        },
      },
      memory: this.memory,
      errors: {
        total: Object.values(this.errorsByType).reduce((a, b) => a + b, 0),
        byType: this.errorsByType,
        byPlugin: this.errorsByPlugin,
      },
      operations: {
        total: this.counters.operationsTotal.value,
        successful: this.counters.operationsSuccessful.value,
        failed: this.counters.operationsFailed.value,
      },
      concurrency: {
        maxConcurrency: this.concurrency.maxConcurrency,
        avgConcurrency: { mean: Number(concurrencyMean.toFixed(1)) },
      },
      backpressure: {
        totalEvents: this.backpressureApplied + this.backpressureReleased,
        appliedEvents: this.backpressureApplied,
        releasedEvents: this.backpressureReleased,
        avgBufferSize: { mean: Number(backpressureMean.toFixed(1)) },
      },
    };
  }

  exportMetrics() {
    return {
      timestamp: new Date().toISOString(),
      summary: this.getSummary(),
      rawMetrics: {
        counters: this.counters,
        embedding: this.embedding,
        retrieval: this.retrieval,
        llm: this.llm,
        memory: this.memory,
        errors: { byType: this.errorsByType, byPlugin: this.errorsByPlugin },
        concurrency: this.concurrency,
        backpressure: {
          samples: this.backpressureSamples,
          applied: this.backpressureApplied,
          released: this.backpressureReleased,
        },
      },
    };
  }

  clearMetrics() {
    this.counters.operationsTotal.reset();
    this.counters.operationsSuccessful.reset();
    this.counters.operationsFailed.reset();
    this.counters.operationsActive.reset();
    this.errorsByType = { plugin: 0, stage: 0 };
    this.errorsByPlugin = {};
    this.backpressureSamples = [];
    this.backpressureApplied = 0;
    this.backpressureReleased = 0;
    this.memory = { heapUsed: 0, heapTotal: 0, usagePercentage: 0 };
    this.embedding = {
      operations: 0,
      totalDuration: 0,
      totalTokens: 0,
      totalBatches: 0,
      durations: [],
    };
    this.retrieval = {
      operations: 0,
      totalDuration: 0,
      totalResults: 0,
      durations: [],
    };
    this.llm = {
      operations: 0,
      totalDuration: 0,
      totalInputTokens: 0,
      totalOutputTokens: 0,
      streamingOps: 0,
      durations: [],
      inputTokens: [],
      outputTokens: [],
    };
    this.concurrency = { maxConcurrency: 0, concurrencyValues: [] };
  }
}

const pipelineMetrics = new PipelineMetrics();

module.exports = {
  Counter,
  Histogram,
  Gauge,
  PipelineMetrics,
  MetricsRegistry,
  pipelineMetrics,
};
