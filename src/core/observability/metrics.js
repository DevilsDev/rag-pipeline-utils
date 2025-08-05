/**
 * Metrics collection system for RAG pipeline operations
 * Tracks performance metrics, resource usage, and operational statistics
 */

import { eventLogger } from './event-logger.js';

/**
 * Metric types
 */
export const MetricType = {
  COUNTER: 'counter',
  HISTOGRAM: 'histogram',
  GAUGE: 'gauge',
  SUMMARY: 'summary'
};

/**
 * Base metric class
 */
class BaseMetric {
  constructor(name, description, labels = [], type) {
    this.name = name;
    this.description = description;
    this.labels = labels;
    this.type = type;
    this.samples = new Map();
    this.createdAt = Date.now();
  }

  /**
   * Get label key for sample storage
   * @param {object} labelValues - Label values
   * @returns {string} Label key
   */
  getLabelKey(labelValues = {}) {
    const sortedLabels = this.labels.sort();
    return sortedLabels.map(label => `${label}=${labelValues[label] || ''}`).join(',');
  }

  /**
   * Get all samples
   * @returns {Map} All samples
   */
  getSamples() {
    return new Map(this.samples);
  }

  /**
   * Clear all samples
   */
  clear() {
    this.samples.clear();
  }

  /**
   * Export metric data
   * @returns {object} Metric export data
   */
  export() {
    const samples = [];
    for (const [labelKey, value] of this.samples) {
      const labelPairs = labelKey ? labelKey.split(',').map(pair => {
        const [key, val] = pair.split('=');
        return { [key]: val };
      }).reduce((acc, pair) => ({ ...acc, ...pair }), {}) : {};
      
      samples.push({
        labels: labelPairs,
        value: this.type === MetricType.HISTOGRAM ? value.export() : value,
        timestamp: Date.now()
      });
    }

    return {
      name: this.name,
      description: this.description,
      type: this.type,
      samples
    };
  }
}

/**
 * Counter metric - monotonically increasing value
 */
export class Counter extends BaseMetric {
  constructor(name, description, labels = []) {
    super(name, description, labels, MetricType.COUNTER);
  }

  /**
   * Increment counter
   * @param {number} value - Value to add (default: 1)
   * @param {object} labels - Label values
   */
  inc(value = 1, labels = {}) {
    const key = this.getLabelKey(labels);
    const current = this.samples.get(key) || 0;
    this.samples.set(key, current + value);
    
    eventLogger.logPerformanceMetric(this.name, current + value, 'count', labels);
  }

  /**
   * Get current counter value
   * @param {object} labels - Label values
   * @returns {number} Current value
   */
  get(labels = {}) {
    const key = this.getLabelKey(labels);
    return this.samples.get(key) || 0;
  }
}

/**
 * Histogram metric - tracks distribution of values
 */
export class Histogram extends BaseMetric {
  constructor(name, description, labels = [], buckets = [0.1, 0.5, 1, 2.5, 5, 10]) {
    super(name, description, labels, MetricType.HISTOGRAM);
    this.buckets = buckets.sort((a, b) => a - b);
  }

  /**
   * Observe a value
   * @param {number} value - Value to observe
   * @param {object} labels - Label values
   */
  observe(value, labels = {}) {
    const key = this.getLabelKey(labels);
    let histogram = this.samples.get(key);
    
    if (!histogram) {
      histogram = {
        count: 0,
        sum: 0,
        buckets: new Map(this.buckets.map(bucket => [bucket, 0])),
        values: []
      };
      this.samples.set(key, histogram);
    }

    histogram.count++;
    histogram.sum += value;
    histogram.values.push(value);

    // Update buckets
    for (const bucket of this.buckets) {
      if (value <= bucket) {
        histogram.buckets.set(bucket, histogram.buckets.get(bucket) + 1);
      }
    }

    eventLogger.logPerformanceMetric(this.name, value, 'ms', labels);
  }

  /**
   * Get histogram statistics
   * @param {object} labels - Label values
   * @returns {object} Histogram statistics
   */
  get(labels = {}) {
    const key = this.getLabelKey(labels);
    const histogram = this.samples.get(key);
    
    if (!histogram || histogram.count === 0) {
      return { count: 0, sum: 0, mean: 0, buckets: {} };
    }

    const values = histogram.values.sort((a, b) => a - b);
    const mean = histogram.sum / histogram.count;
    const median = values[Math.floor(values.length / 2)];
    const p95 = values[Math.floor(values.length * 0.95)];
    const p99 = values[Math.floor(values.length * 0.99)];

    return {
      count: histogram.count,
      sum: histogram.sum,
      mean,
      median,
      p95,
      p99,
      min: values[0],
      max: values[values.length - 1],
      buckets: Object.fromEntries(histogram.buckets)
    };
  }
}

/**
 * Gauge metric - current value that can go up or down
 */
export class Gauge extends BaseMetric {
  constructor(name, description, labels = []) {
    super(name, description, labels, MetricType.GAUGE);
  }

  /**
   * Set gauge value
   * @param {number} value - Value to set
   * @param {object} labels - Label values
   */
  set(value, labels = {}) {
    const key = this.getLabelKey(labels);
    this.samples.set(key, value);
    
    eventLogger.logPerformanceMetric(this.name, value, 'value', labels);
  }

  /**
   * Increment gauge value
   * @param {number} value - Value to add
   * @param {object} labels - Label values
   */
  inc(value = 1, labels = {}) {
    const key = this.getLabelKey(labels);
    const current = this.samples.get(key) || 0;
    this.set(current + value, labels);
  }

  /**
   * Decrement gauge value
   * @param {number} value - Value to subtract
   * @param {object} labels - Label values
   */
  dec(value = 1, labels = {}) {
    this.inc(-value, labels);
  }

  /**
   * Get current gauge value
   * @param {object} labels - Label values
   * @returns {number} Current value
   */
  get(labels = {}) {
    const key = this.getLabelKey(labels);
    return this.samples.get(key) || 0;
  }
}

/**
 * Metrics registry
 */
export class MetricsRegistry {
  constructor() {
    this.metrics = new Map();
    this.defaultLabels = new Map();
  }

  /**
   * Register a metric
   * @param {BaseMetric} metric - Metric to register
   */
  register(metric) {
    if (this.metrics.has(metric.name)) {
      throw new Error(`Metric ${metric.name} already registered`);
    }
    this.metrics.set(metric.name, metric);
  }

  /**
   * Get a metric by name
   * @param {string} name - Metric name
   * @returns {BaseMetric|null} Metric or null
   */
  get(name) {
    return this.metrics.get(name) || null;
  }

  /**
   * Create and register a counter
   * @param {string} name - Metric name
   * @param {string} description - Metric description
   * @param {string[]} labels - Label names
   * @returns {Counter} Counter metric
   */
  createCounter(name, description, labels = []) {
    const counter = new Counter(name, description, labels);
    this.register(counter);
    return counter;
  }

  /**
   * Create and register a histogram
   * @param {string} name - Metric name
   * @param {string} description - Metric description
   * @param {string[]} labels - Label names
   * @param {number[]} buckets - Histogram buckets
   * @returns {Histogram} Histogram metric
   */
  createHistogram(name, description, labels = [], buckets) {
    const histogram = new Histogram(name, description, labels, buckets);
    this.register(histogram);
    return histogram;
  }

  /**
   * Create and register a gauge
   * @param {string} name - Metric name
   * @param {string} description - Metric description
   * @param {string[]} labels - Label names
   * @returns {Gauge} Gauge metric
   */
  createGauge(name, description, labels = []) {
    const gauge = new Gauge(name, description, labels);
    this.register(gauge);
    return gauge;
  }

  /**
   * Set default labels for all metrics
   * @param {object} labels - Default labels
   */
  setDefaultLabels(labels) {
    Object.entries(labels).forEach(([key, value]) => {
      this.defaultLabels.set(key, value);
    });
  }

  /**
   * Get all metrics
   * @returns {Map} All registered metrics
   */
  getMetrics() {
    return new Map(this.metrics);
  }

  /**
   * Export all metrics
   * @returns {object[]} Array of exported metrics
   */
  exportMetrics() {
    return Array.from(this.metrics.values()).map(metric => metric.export());
  }

  /**
   * Clear all metrics
   */
  clearMetrics() {
    this.metrics.forEach(metric => metric.clear());
  }

  /**
   * Remove a metric
   * @param {string} name - Metric name
   */
  unregister(name) {
    this.metrics.delete(name);
  }
}

/**
 * Pipeline metrics collector
 */
export class PipelineMetrics {
  constructor() {
    this.registry = new MetricsRegistry();
    this.initializeMetrics();
  }

  /**
   * Initialize standard pipeline metrics
   */
  initializeMetrics() {
    // Operation counters
    this.operationCounter = this.registry.createCounter(
      'pipeline_operations_total',
      'Total number of pipeline operations',
      ['operation', 'status', 'plugin_type', 'plugin_name']
    );

    // Duration histograms
    this.operationDuration = this.registry.createHistogram(
      'pipeline_operation_duration_seconds',
      'Duration of pipeline operations in seconds',
      ['operation', 'plugin_type', 'plugin_name'],
      [0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10]
    );

    // Embedding metrics
    this.embeddingDuration = this.registry.createHistogram(
      'embedding_duration_ms',
      'Time taken for embedding operations in milliseconds',
      ['plugin_name', 'batch_size'],
      [10, 50, 100, 250, 500, 1000, 2500, 5000, 10000]
    );

    this.embeddingTokens = this.registry.createHistogram(
      'embedding_tokens_processed',
      'Number of tokens processed in embedding operations',
      ['plugin_name'],
      [100, 500, 1000, 2500, 5000, 10000, 25000, 50000]
    );

    // Retrieval metrics
    this.retrievalDuration = this.registry.createHistogram(
      'retrieval_duration_ms',
      'Time taken for retrieval operations in milliseconds',
      ['plugin_name', 'result_count'],
      [1, 5, 10, 25, 50, 100, 250, 500, 1000]
    );

    this.retrievalResults = this.registry.createHistogram(
      'retrieval_results_count',
      'Number of results returned by retrieval operations',
      ['plugin_name'],
      [1, 5, 10, 20, 50, 100, 200]
    );

    // LLM metrics
    this.llmDuration = this.registry.createHistogram(
      'llm_duration_ms',
      'Time taken for LLM operations in milliseconds',
      ['plugin_name', 'streaming'],
      [100, 500, 1000, 2500, 5000, 10000, 25000, 50000]
    );

    this.llmTokensInput = this.registry.createHistogram(
      'llm_tokens_input',
      'Number of input tokens for LLM operations',
      ['plugin_name'],
      [100, 500, 1000, 2500, 5000, 10000, 25000, 50000]
    );

    this.llmTokensOutput = this.registry.createHistogram(
      'llm_tokens_output',
      'Number of output tokens for LLM operations',
      ['plugin_name'],
      [50, 100, 250, 500, 1000, 2500, 5000, 10000]
    );

    // Memory metrics
    this.memoryUsage = this.registry.createGauge(
      'memory_usage_bytes',
      'Current memory usage in bytes',
      ['type']
    );

    // Error metrics
    this.errorCounter = this.registry.createCounter(
      'pipeline_errors_total',
      'Total number of pipeline errors',
      ['operation', 'plugin_type', 'plugin_name', 'error_type']
    );

    // Concurrent operations
    this.concurrentOperations = this.registry.createGauge(
      'concurrent_operations',
      'Number of concurrent operations',
      ['operation_type']
    );

    // Backpressure metrics
    this.backpressureEvents = this.registry.createCounter(
      'backpressure_events_total',
      'Total number of backpressure events',
      ['action', 'reason']
    );
  }

  /**
   * Record operation start
   * @param {string} operation - Operation name
   * @param {string} pluginType - Plugin type
   * @param {string} pluginName - Plugin name
   */
  recordOperationStart(operation, _pluginType, _pluginName) {
    this.concurrentOperations.inc(1, { operation_type: operation });
  }

  /**
   * Record operation completion
   * @param {string} operation - Operation name
   * @param {string} pluginType - Plugin type
   * @param {string} pluginName - Plugin name
   * @param {number} duration - Duration in milliseconds
   * @param {string} status - Operation status (success/error)
   */
  recordOperationEnd(operation, pluginType, pluginName, duration, status = 'success') {
    this.operationCounter.inc(1, { operation, status, plugin_type: pluginType, plugin_name: pluginName });
    this.operationDuration.observe(duration / 1000, { operation, plugin_type: pluginType, plugin_name: pluginName });
    this.concurrentOperations.dec(1, { operation_type: operation });
  }

  /**
   * Record embedding metrics
   * @param {string} pluginName - Plugin name
   * @param {number} duration - Duration in milliseconds
   * @param {number} tokenCount - Number of tokens processed
   * @param {number} batchSize - Batch size
   */
  recordEmbedding(pluginName, duration, tokenCount, batchSize = 1) {
    this.embeddingDuration.observe(duration, { plugin_name: pluginName, batch_size: batchSize.toString() });
    this.embeddingTokens.observe(tokenCount, { plugin_name: pluginName });
  }

  /**
   * Record retrieval metrics
   * @param {string} pluginName - Plugin name
   * @param {number} duration - Duration in milliseconds
   * @param {number} resultCount - Number of results returned
   */
  recordRetrieval(pluginName, duration, resultCount) {
    this.retrievalDuration.observe(duration, { plugin_name: pluginName, result_count: resultCount.toString() });
    this.retrievalResults.observe(resultCount, { plugin_name: pluginName });
  }

  /**
   * Record LLM metrics
   * @param {string} pluginName - Plugin name
   * @param {number} duration - Duration in milliseconds
   * @param {number} inputTokens - Input token count
   * @param {number} outputTokens - Output token count
   * @param {boolean} streaming - Whether streaming was used
   */
  recordLLM(pluginName, duration, inputTokens, outputTokens, streaming = false) {
    this.llmDuration.observe(duration, { plugin_name: pluginName, streaming: streaming.toString() });
    this.llmTokensInput.observe(inputTokens, { plugin_name: pluginName });
    this.llmTokensOutput.observe(outputTokens, { plugin_name: pluginName });
  }

  /**
   * Record memory usage
   */
  recordMemoryUsage() {
    const usage = process.memoryUsage();
    this.memoryUsage.set(usage.heapUsed, { type: 'heap_used' });
    this.memoryUsage.set(usage.heapTotal, { type: 'heap_total' });
    this.memoryUsage.set(usage.external, { type: 'external' });
    this.memoryUsage.set(usage.rss, { type: 'rss' });
  }

  /**
   * Record error
   * @param {string} operation - Operation name
   * @param {string} pluginType - Plugin type
   * @param {string} pluginName - Plugin name
   * @param {Error} error - Error object
   */
  recordError(operation, pluginType, pluginName, error) {
    this.errorCounter.inc(1, {
      operation,
      plugin_type: pluginType,
      plugin_name: pluginName,
      error_type: error.name
    });
  }

  /**
   * Record backpressure event
   * @param {string} action - Action (applied/relieved)
   * @param {string} reason - Reason (memory/buffer)
   */
  recordBackpressure(action, reason) {
    this.backpressureEvents.inc(1, { action, reason });
  }

  /**
   * Get metrics summary
   * @returns {object} Metrics summary
   */
  getSummary() {
    return {
      operations: {
        total: this.operationCounter.get(),
        concurrent: this.concurrentOperations.get(),
        avgDuration: this.operationDuration.get()
      },
      embedding: {
        avgDuration: this.embeddingDuration.get(),
        avgTokens: this.embeddingTokens.get()
      },
      retrieval: {
        avgDuration: this.retrievalDuration.get(),
        avgResults: this.retrievalResults.get()
      },
      llm: {
        avgDuration: this.llmDuration.get(),
        avgInputTokens: this.llmTokensInput.get(),
        avgOutputTokens: this.llmTokensOutput.get()
      },
      memory: {
        heapUsed: this.memoryUsage.get({ type: 'heap_used' }),
        heapTotal: this.memoryUsage.get({ type: 'heap_total' })
      },
      errors: this.errorCounter.get(),
      backpressure: this.backpressureEvents.get()
    };
  }

  /**
   * Export all metrics
   * @returns {object[]} Exported metrics
   */
  exportMetrics() {
    return this.registry.exportMetrics();
  }

  /**
   * Clear all metrics
   */
  clearMetrics() {
    this.registry.clearMetrics();
  }
}

// Global metrics instance
export const pipelineMetrics = new PipelineMetrics();
