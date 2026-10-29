// src/core/observability/metrics.js
const MetricType = {
  COUNTER: 'counter',
  HISTOGRAM: 'histogram',
  GAUGE: 'gauge',
};

/** Monotonic counter that only goes up until reset. */
class Counter {
  /**
   * @param {string} name - Metric name
   * @param {string} [description=''] - Human-readable description
   * @param {Object<string, string>} [labels={}] - Static labels attached to the metric
   */
  constructor(name, description = '', labels = {}) {
    this._type = MetricType.COUNTER;
    this.name = name;
    this.description = description;
    this.labels = labels || {};
    this.value = 0;
  }
  /**
   * Add to the counter.
   * @param {number} [n=1] - Amount to add
   * @returns {void}
   * @throws {Error} If n is negative
   */
  inc(n = 1) {
    if (n < 0)
      throw new Error('Counter can only be incremented by non-negative values');
    this.value += n;
  }
  /**
   * Set the value back to 0.
   * @returns {void}
   */
  reset() {
    this.value = 0;
  }
  /**
   * Snapshot of the metric with the current time as timestamp.
   * @returns {{name: string, description: string, type: string, value: number, labels: Object<string, string>, timestamp: string}}
   */
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

/** Gauge holding a value that can be set, raised or lowered. */
class Gauge {
  /**
   * @param {string} name - Metric name
   * @param {string} [description=''] - Human-readable description
   * @param {Object<string, string>} [labels={}] - Static labels attached to the metric
   */
  constructor(name, description = '', labels = {}) {
    this._type = MetricType.GAUGE;
    this.name = name;
    this.description = description;
    this.labels = labels || {};
    this.value = 0;
  }
  /**
   * Set the value.
   * @param {number} v - New value
   * @returns {void}
   */
  set(v) {
    this.value = v;
  }
  /**
   * Add to the value.
   * @param {number} [n=1] - Amount to add
   * @returns {void}
   */
  inc(n = 1) {
    this.value += n;
  }
  /**
   * Subtract from the value.
   * @param {number} [n=1] - Amount to subtract
   * @returns {void}
   */
  dec(n = 1) {
    this.value -= n;
  }
  /**
   * Set the value back to 0.
   * @returns {void}
   */
  reset() {
    this.value = 0;
  }
  /**
   * Snapshot of the metric with the current time as timestamp.
   * @returns {{name: string, description: string, type: string, value: number, labels: Object<string, string>, timestamp: string}}
   */
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

/**
 * Histogram with cumulative bucket counts. It also keeps every observed value
 * in memory to compute percentiles and standard deviation.
 */
class Histogram {
  /**
   * @param {string} name - Metric name
   * @param {string} [description=''] - Human-readable description
   * @param {Object<string, string>} [labels={}] - Static labels attached to the metric
   * @param {number[]} [buckets] - Bucket upper bounds, sorted ascending on construction. A +Inf bucket is added.
   */
  constructor(
    name,
    description = '',
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

  /**
   * Record a value. Non-numbers and NaN are ignored.
   * @param {number} v - Observed value
   * @returns {void}
   */
  observe(v) {
    if (typeof v !== 'number' || Number.isNaN(v)) return;
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

  /**
   * Percentiles of the observed values by the nearest-rank method. Returns 0
   * for each percentile when nothing has been observed.
   * @param {number[]} [percentiles=[50, 95, 99]] - Percentiles to compute, 0-100
   * @returns {Object<number, number>} Value for each requested percentile
   */
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

  /**
   * Mean, population standard deviation, min, max, count and sum of the
   * observed values. With no observations, min and max are null.
   * @returns {{mean: number, stdDev: number, min: number|null, max: number|null, count: number, sum: number}}
   */
  getStatistics() {
    if (this.count === 0) {
      return {
        mean: 0,
        stdDev: 0,
        min: null,
        max: null,
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

  /**
   * Clear all bucket counts, statistics and stored observations.
   * @returns {void}
   */
  reset() {
    this.bucketCounts.fill(0);
    this.sum = 0;
    this.count = 0;
    this.min = Infinity;
    this.max = -Infinity;
    this._obs = [];
  }
  /**
   * Cumulative count per bucket bound (plus '+Inf') together with getStatistics().
   * @returns {{buckets: Object<string, number>, mean: number, stdDev: number, min: number, max: number, count: number, sum: number}}
   */
  export() {
    // Map bucket value -> cumulative count
    const bucketsObj = {};
    for (let i = 0; i < this.buckets.length; i++)
      bucketsObj[this.buckets[i]] = this.bucketCounts[i];
    bucketsObj['+Inf'] = this.bucketCounts[this.bucketCounts.length - 1];
    const stats = this.getStatistics();
    return { buckets: bucketsObj, ...stats };
  }
  /**
   * Snapshot of the histogram with the current time as timestamp. Does not
   * include min, max or percentiles.
   * @returns {{name: string, description: string, type: string, count: number, sum: number, buckets: number[], bucketCounts: number[], labels: Object<string, string>, timestamp: string}}
   */
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

/** Registry of Counter, Histogram and Gauge instances keyed by name. */
/** The registered metric, checked to be of the requested class. */
function existingOfType(registry, name, Type) {
  const metric = registry._metrics.get(name);
  if (!(metric instanceof Type)) {
    const actual =
      metric && metric.constructor ? metric.constructor.name : typeof metric;
    throw new TypeError(
      `Metric "${name}" is registered as a ${actual}, not a ${Type.name}`,
    );
  }
  return metric;
}

class MetricsRegistry {
  constructor() {
    this._metrics = new Map(); // name -> metric instance
  }
  /**
   * Add a metric under its name.
   * @param {Counter|Histogram|Gauge} metric - Metric to register
   * @returns {void}
   * @throws {Error} If a metric with the same name is already registered
   */
  register(metric) {
    if (this._metrics.has(metric.name)) {
      throw new Error(
        `Metric with name "${metric.name}" is already registered`,
      );
    }
    this._metrics.set(metric.name, metric);
  }
  /**
   * Look up a metric by name.
   * @param {string} name - Metric name
   * @returns {Counter|Histogram|Gauge|undefined} The metric, or undefined if not registered
   */
  getMetric(name) {
    return this._metrics.get(name);
  }
  /**
   * All registered metrics in registration order.
   * @returns {Array<Counter|Histogram|Gauge>}
   */
  getAllMetrics() {
    return Array.from(this._metrics.values());
  }
  /**
   * Remove every registered metric.
   * @returns {void}
   */
  clear() {
    this._metrics.clear();
  }
  /**
   * Return the metric registered under name, or create and register a Counter.
   * Throws a TypeError when the name belongs to a metric of another type.
   * @param {string} name - Metric name
   * @param {string} [description] - Description for a new counter
   * @param {Object<string, string>} [labels={}] - Labels for a new counter
   * @returns {Counter}
   */
  getOrCreateCounter(name, description, labels = {}) {
    if (this._metrics.has(name)) {
      return existingOfType(this, name, Counter);
    }
    const counter = new Counter(name, description, labels);
    this.register(counter);
    return counter;
  }
  /**
   * Return the metric registered under name, or create and register a
   * Histogram. Throws a TypeError when the name belongs to a metric of
   * another type.
   * @param {string} name - Metric name
   * @param {string} [description] - Description for a new histogram
   * @param {Object<string, string>} [labels={}] - Labels for a new histogram
   * @param {number[]} [buckets] - Bucket bounds for a new histogram
   * @returns {Histogram}
   */
  getOrCreateHistogram(name, description, labels = {}, buckets) {
    if (this._metrics.has(name)) {
      return existingOfType(this, name, Histogram);
    }
    const histogram = new Histogram(name, description, labels, buckets);
    this.register(histogram);
    return histogram;
  }
  /**
   * Return the metric registered under name, or create and register a Gauge.
   * Throws a TypeError when the name belongs to a metric of another type.
   * @param {string} name - Metric name
   * @param {string} [description] - Description for a new gauge
   * @param {Object<string, string>} [labels={}] - Labels for a new gauge
   * @returns {Gauge}
   */
  getOrCreateGauge(name, description, labels = {}) {
    if (this._metrics.has(name)) {
      return existingOfType(this, name, Gauge);
    }
    const gauge = new Gauge(name, description, labels);
    this.register(gauge);
    return gauge;
  }
  /**
   * Serialize all metrics (their toJSON output) with a timestamp.
   * @returns {string} JSON string with timestamp and metrics fields
   */
  exportMetrics() {
    return JSON.stringify({
      timestamp: new Date().toISOString(),
      metrics: this.getAllMetrics().map((m) => m.toJSON()),
    });
  }
}

/**
 * In-memory totals for pipeline operations: embedding, retrieval and LLM
 * calls, errors, operation counts, concurrency, backpressure and heap usage.
 */
class PipelineMetrics {
  constructor() {
    this.counters = {
      operationsTotal: new Counter('operations_total', 'Total operations'),
      operationsSuccessful: new Counter(
        'operations_successful',
        'Successful operations',
      ),
      operationsFailed: new Counter('operations_failed', 'Failed operations'),
      // A gauge: it goes down when an operation ends
      operationsActive: new Gauge('operations_active', 'Active operations'),
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

  /**
   * Record one embedding call.
   * @param {string} provider - Provider name (unused)
   * @param {number} duration - Duration in milliseconds
   * @param {number} tokens - Tokens embedded
   * @param {number} batches - Batches sent
   * @returns {void}
   */
  recordEmbedding(provider, duration, tokens, batches) {
    this.embedding.operations++;
    this.embedding.totalDuration += duration;
    this.embedding.totalTokens += tokens;
    this.embedding.totalBatches += batches;
    this.embedding.durations.push(duration);
  }

  /**
   * Record one retrieval call.
   * @param {string} provider - Provider name (unused)
   * @param {number} duration - Duration in milliseconds
   * @param {number} results - Number of results returned
   * @returns {void}
   */
  recordRetrieval(provider, duration, results) {
    this.retrieval.operations++;
    this.retrieval.totalDuration += duration;
    this.retrieval.totalResults += results;
    this.retrieval.durations.push(duration);
  }

  /**
   * Record one LLM call.
   * @param {string} provider - Provider name (unused)
   * @param {number} duration - Duration in milliseconds
   * @param {number} inputTokens - Prompt tokens
   * @param {number} outputTokens - Completion tokens
   * @param {boolean} [streaming] - Whether the call streamed its output
   * @returns {void}
   */
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

  /**
   * Store heapUsed and heapTotal from process.memoryUsage() and the used
   * percentage, rounded.
   * @returns {void}
   */
  recordMemoryUsage() {
    const memUsage = process.memoryUsage();
    this.memory.heapUsed = memUsage.heapUsed;
    this.memory.heapTotal = memUsage.heapTotal;
    this.memory.usagePercentage = Math.round(
      (memUsage.heapUsed / memUsage.heapTotal) * 100,
    );
  }

  /**
   * Count an error by type and by component.
   * @param {string} type - Error type, such as 'plugin', 'stage' or 'llm'
   * @param {string} [component] - Plugin or component name
   * @param {string} [provider] - Provider name (unused)
   * @param {Error} [error] - The error (unused)
   * @returns {void}
   */
  recordError(type, component, provider, error) {
    if (type) this.errorsByType[type] = (this.errorsByType[type] || 0) + 1;
    if (component)
      this.errorsByPlugin[component] =
        (this.errorsByPlugin[component] || 0) + 1;
  }

  /**
   * Count an operation as started and active.
   * @param {string} [type] - Operation type (unused)
   * @param {string} [component] - Component name (unused)
   * @param {string} [provider] - Provider name (unused)
   * @returns {void}
   */
  recordOperationStart(type, component, provider) {
    this.counters.operationsTotal.inc(1);
    this.counters.operationsActive.inc(1);
  }

  /**
   * Mark an active operation as finished. A status of 'error' or 'failed'
   * counts as failed; any other status counts as successful.
   * @param {string} [type] - Operation type (unused)
   * @param {string} [component] - Component name (unused)
   * @param {string} [provider] - Provider name (unused)
   * @param {number} [duration] - Duration in milliseconds (unused)
   * @param {string} [status] - Outcome of the operation
   * @returns {void}
   */
  recordOperationEnd(type, component, provider, duration, status) {
    if (this.counters.operationsActive.value > 0) {
      this.counters.operationsActive.dec(1);
    }
    if (status === 'error' || status === 'failed')
      this.counters.operationsFailed.inc(1);
    else this.counters.operationsSuccessful.inc(1);
  }

  /**
   * Record a concurrency sample. Keeps the highest max seen and every average.
   * @param {number} maxConcurrency - Peak concurrency in the sample
   * @param {number} avgConcurrency - Average concurrency in the sample
   * @returns {void}
   */
  recordConcurrency(maxConcurrency, avgConcurrency) {
    this.concurrency.maxConcurrency = Math.max(
      this.concurrency.maxConcurrency,
      maxConcurrency,
    );
    this.concurrency.concurrencyValues.push(avgConcurrency);
  }

  /**
   * Count a backpressure event and keep the buffer size as a sample.
   * @param {string} action - 'applied' or 'released'; other values are not counted
   * @param {number} [bufferSize] - Buffer size at the time of the event
   * @param {number} [threshold] - Backpressure threshold (unused)
   * @returns {void}
   */
  recordBackpressure(action, bufferSize, threshold) {
    if (action === 'applied') this.backpressureApplied++;
    if (action === 'released') this.backpressureReleased++;
    if (typeof bufferSize === 'number')
      this.backpressureSamples.push(bufferSize);
  }

  /**
   * Totals and averages for every recorded category. Averages are 0 when
   * nothing was recorded.
   * @returns Summary grouped by embedding, retrieval, llm, memory, errors, operations, concurrency and backpressure
   */
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

  /**
   * getSummary() plus the raw recorded values, with a timestamp.
   * @returns Object with timestamp, summary and rawMetrics
   */
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

  /**
   * Reset every counter, total and sample to its initial value.
   * @returns {void}
   */
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

/** Shared PipelineMetrics instance. */
const pipelineMetrics = new PipelineMetrics();

module.exports = {
  Counter,
  Histogram,
  Gauge,
  PipelineMetrics,
  MetricsRegistry,
  pipelineMetrics,
};
