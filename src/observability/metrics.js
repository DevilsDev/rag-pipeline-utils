/**
 * Observability Metrics
 *
 * Enterprise-grade metrics collection and monitoring for RAG pipelines.
 * Provides Counter, Histogram, and PipelineMetrics classes for comprehensive observability.
 */

const EventEmitter = require("events"); // eslint-disable-line global-require

/**
 * Counter metric for tracking cumulative values
 */
class Counter extends EventEmitter {
  constructor(name, description = "", labels = []) {
    super();

    this.name = name;
    this.description = description;
    this.labels = labels;
    this.value = 0;
    this.labeledValues = new Map();
    this.created = Date.now();
  }

  /**
   * Increment counter by specified amount
   */
  inc(amount = 1, labelValues = {}) {
    if (amount < 0) {
      throw new Error(
        "Counter can only be incremented by non-negative amounts",
      );
    }

    if (Object.keys(labelValues).length === 0) {
      this.value += amount;
    } else {
      const labelKey = this._getLabelKey(labelValues);
      const current = this.labeledValues.get(labelKey) || 0;
      this.labeledValues.set(labelKey, current + amount);
    }

    this.emit("increment", { amount, labelValues, timestamp: Date.now() });
  }

  /**
   * Get current counter value
   */
  get(labelValues = {}) {
    if (Object.keys(labelValues).length === 0) {
      return this.value;
    }

    const labelKey = this._getLabelKey(labelValues);
    return this.labeledValues.get(labelKey) || 0;
  }

  /**
   * Reset counter to zero
   */
  reset(labelValues = {}) {
    if (Object.keys(labelValues).length === 0) {
      this.value = 0;
    } else {
      const labelKey = this._getLabelKey(labelValues);
      this.labeledValues.set(labelKey, 0);
    }

    this.emit("reset", { labelValues, timestamp: Date.now() });
  }

  /**
   * Get all labeled values
   */
  getAllValues() {
    const result = { _unlabeled: this.value };

    for (const [labelKey, value] of this.labeledValues) {
      result[labelKey] = value;
    }

    return result;
  }

  /**
   * Generate label key from label values
   */
  _getLabelKey(labelValues) {
    const sortedKeys = Object.keys(labelValues).sort();
    return sortedKeys.map((key) => `${key}=${labelValues[key]}`).join(",");
  }

  /**
   * Export metric data
   */
  export() {
    return {
      name: this.name,
      description: this.description,
      type: "counter",
      value: this.value,
      labeledValues: Object.fromEntries(this.labeledValues),
      created: this.created,
      timestamp: Date.now(),
    };
  }
}

/**
 * Histogram metric for tracking distributions of values
 */
class Histogram extends EventEmitter {
  constructor(name, description = "", buckets = [0.1, 0.5, 1, 2.5, 5, 10]) {
    super();

    this.name = name;
    this.description = description;
    this.buckets = [...buckets].sort((a, b) => a - b);
    this.bucketCounts = new Map();
    this.sum = 0;
    this.count = 0;
    this.labeledMetrics = new Map();
    this.created = Date.now();

    // Initialize bucket counts
    for (const bucket of this.buckets) {
      this.bucketCounts.set(bucket, 0);
    }
    this.bucketCounts.set("+Inf", 0);
  }

  /**
   * Observe a value
   */
  observe(value, labelValues = {}) {
    if (typeof value !== "number" || isNaN(value)) {
      throw new Error("Histogram can only observe numeric values");
    }

    if (Object.keys(labelValues).length === 0) {
      this._observeUnlabeled(value);
    } else {
      this._observeLabeled(value, labelValues);
    }

    this.emit("observe", { value, labelValues, timestamp: Date.now() });
  }

  /**
   * Observe unlabeled value
   */
  _observeUnlabeled(value) {
    this.sum += value;
    this.count++;

    // Update bucket counts
    for (const bucket of this.buckets) {
      if (value <= bucket) {
        this.bucketCounts.set(bucket, this.bucketCounts.get(bucket) + 1);
      }
    }
    this.bucketCounts.set("+Inf", this.bucketCounts.get("+Inf") + 1);
  }

  /**
   * Observe labeled value
   */
  _observeLabeled(value, labelValues) {
    const labelKey = this._getLabelKey(labelValues);

    if (!this.labeledMetrics.has(labelKey)) {
      this.labeledMetrics.set(labelKey, {
        sum: 0,
        count: 0,
        bucketCounts: new Map(),
      });

      // Initialize buckets for this label combination
      const metric = this.labeledMetrics.get(labelKey);
      for (const bucket of this.buckets) {
        metric.bucketCounts.set(bucket, 0);
      }
      metric.bucketCounts.set("+Inf", 0);
    }

    const metric = this.labeledMetrics.get(labelKey);
    metric.sum += value;
    metric.count++;

    // Update bucket counts
    for (const bucket of this.buckets) {
      if (value <= bucket) {
        metric.bucketCounts.set(bucket, metric.bucketCounts.get(bucket) + 1);
      }
    }
    metric.bucketCounts.set("+Inf", metric.bucketCounts.get("+Inf") + 1);
  }

  /**
   * Get histogram statistics
   */
  getStats(labelValues = {}) {
    if (Object.keys(labelValues).length === 0) {
      return {
        count: this.count,
        sum: this.sum,
        average: this.count > 0 ? this.sum / this.count : 0,
        buckets: Object.fromEntries(this.bucketCounts),
      };
    }

    const labelKey = this._getLabelKey(labelValues);
    const metric = this.labeledMetrics.get(labelKey);

    if (!metric) {
      return {
        count: 0,
        sum: 0,
        average: 0,
        buckets: {},
      };
    }

    return {
      count: metric.count,
      sum: metric.sum,
      average: metric.count > 0 ? metric.sum / metric.count : 0,
      buckets: Object.fromEntries(metric.bucketCounts),
    };
  }

  /**
   * Calculate percentiles
   */
  getPercentiles(percentiles = [50, 90, 95, 99], labelValues = {}) {
    const stats = this.getStats(labelValues);
    const result = {};

    if (stats.count === 0) {
      for (const p of percentiles) {
        result[`p${p}`] = 0;
      }
      return result;
    }

    for (const percentile of percentiles) {
      const targetCount = Math.ceil((percentile / 100) * stats.count);
      let cumulativeCount = 0;

      for (const [bucket, count] of Object.entries(stats.buckets)) {
        cumulativeCount += count;
        if (cumulativeCount >= targetCount) {
          result[`p${percentile}`] =
            bucket === "+Inf" ? Infinity : parseFloat(bucket);
          break;
        }
      }
    }

    return result;
  }

  /**
   * Generate label key from label values
   */
  _getLabelKey(labelValues) {
    const sortedKeys = Object.keys(labelValues).sort();
    return sortedKeys.map((key) => `${key}=${labelValues[key]}`).join(",");
  }

  /**
   * Reset histogram
   */
  reset(labelValues = {}) {
    if (Object.keys(labelValues).length === 0) {
      this.sum = 0;
      this.count = 0;
      for (const bucket of this.buckets) {
        this.bucketCounts.set(bucket, 0);
      }
      this.bucketCounts.set("+Inf", 0);
    } else {
      const labelKey = this._getLabelKey(labelValues);
      this.labeledMetrics.delete(labelKey);
    }

    this.emit("reset", { labelValues, timestamp: Date.now() });
  }

  /**
   * Export metric data
   */
  export() {
    const labeledData = {};
    for (const [labelKey, metric] of this.labeledMetrics) {
      labeledData[labelKey] = {
        count: metric.count,
        sum: metric.sum,
        buckets: Object.fromEntries(metric.bucketCounts),
      };
    }

    return {
      name: this.name,
      description: this.description,
      type: "histogram",
      buckets: this.buckets,
      count: this.count,
      sum: this.sum,
      bucketCounts: Object.fromEntries(this.bucketCounts),
      labeledMetrics: labeledData,
      created: this.created,
      timestamp: Date.now(),
    };
  }
}

/**
 * Pipeline-specific metrics collector
 */
class PipelineMetrics extends EventEmitter {
  constructor(pipelineId, options = {}) {
    super();

    this.pipelineId = pipelineId;
    this.options = {
      enableDetailedMetrics: options.enableDetailedMetrics !== false,
      enablePerformanceMetrics: options.enablePerformanceMetrics !== false,
      enableErrorMetrics: options.enableErrorMetrics !== false,
      retentionPeriod: options.retentionPeriod || 24 * 60 * 60 * 1000, // 24 hours
      ...options,
    };

    this.metrics = new Map();
    this.startTime = Date.now();
    this.executionHistory = [];

    this.initializeMetrics();
  }

  /**
   * Initialize standard pipeline metrics
   */
  initializeMetrics() {
    // Execution counters
    this.metrics.set(
      "executions_total",
      new Counter(
        "pipeline_executions_total",
        "Total number of pipeline executions",
        ["status", "component"],
      ),
    );

    this.metrics.set(
      "documents_processed",
      new Counter(
        "pipeline_documents_processed_total",
        "Total number of documents processed",
        ["component", "source"],
      ),
    );

    this.metrics.set(
      "errors_total",
      new Counter("pipeline_errors_total", "Total number of errors", [
        "component",
        "error_type",
      ]),
    );

    // Duration histograms
    this.metrics.set(
      "execution_duration",
      new Histogram(
        "pipeline_execution_duration_seconds",
        "Pipeline execution duration in seconds",
        [0.1, 0.5, 1, 2, 5, 10, 30, 60],
      ),
    );

    this.metrics.set(
      "component_duration",
      new Histogram(
        "pipeline_component_duration_seconds",
        "Component execution duration in seconds",
        [0.01, 0.05, 0.1, 0.5, 1, 2, 5],
      ),
    );

    // Performance metrics
    if (this.options.enablePerformanceMetrics) {
      this.metrics.set(
        "memory_usage",
        new Histogram(
          "pipeline_memory_usage_bytes",
          "Memory usage during pipeline execution",
          [1e6, 10e6, 50e6, 100e6, 500e6, 1e9], // 1MB to 1GB
        ),
      );

      this.metrics.set(
        "throughput",
        new Histogram(
          "pipeline_throughput_docs_per_second",
          "Document processing throughput",
          [1, 5, 10, 50, 100, 500],
        ),
      );
    }
  }

  /**
   * Record pipeline execution start
   */
  recordExecutionStart(executionId, metadata = {}) {
    const execution = {
      id: executionId,
      startTime: Date.now(),
      endTime: null,
      status: "running",
      metadata,
      components: [],
      errors: [],
    };

    this.executionHistory.push(execution);
    this.emit("executionStarted", { executionId, execution });

    return execution;
  }

  /**
   * Record pipeline execution completion
   */
  recordExecutionEnd(executionId, status = "success", metadata = {}) {
    const execution = this.executionHistory.find((e) => e.id === executionId);
    if (!execution) {
      throw new Error(`Execution ${executionId} not found`);
    }

    execution.endTime = Date.now();
    execution.status = status;
    execution.metadata = { ...execution.metadata, ...metadata };

    const duration = (execution.endTime - execution.startTime) / 1000; // Convert to seconds

    // Update metrics
    this.metrics.get("executions_total").inc(1, { status });
    this.metrics.get("execution_duration").observe(duration);

    this.emit("executionCompleted", { executionId, execution, duration });

    return execution;
  }

  /**
   * Record component execution
   */
  recordComponentExecution(
    executionId,
    componentId,
    componentType,
    duration,
    status = "success",
    metadata = {},
  ) {
    const execution = this.executionHistory.find((e) => e.id === executionId);
    if (execution) {
      execution.components.push({
        id: componentId,
        type: componentType,
        duration,
        status,
        metadata,
        timestamp: Date.now(),
      });
    }

    // Update metrics
    this.metrics
      .get("executions_total")
      .inc(1, { status, component: componentType });
    this.metrics
      .get("component_duration")
      .observe(duration / 1000, { component: componentType });

    this.emit("componentExecuted", {
      executionId,
      componentId,
      componentType,
      duration,
      status,
    });
  }

  /**
   * Record document processing
   */
  recordDocumentProcessed(componentType, source = "unknown", count = 1) {
    this.metrics
      .get("documents_processed")
      .inc(count, { component: componentType, source });
    this.emit("documentsProcessed", { componentType, source, count });
  }

  /**
   * Record error
   */
  recordError(componentType, errorType, error, executionId = null) {
    this.metrics
      .get("errors_total")
      .inc(1, { component: componentType, error_type: errorType });

    if (executionId) {
      const execution = this.executionHistory.find((e) => e.id === executionId);
      if (execution) {
        execution.errors.push({
          componentType,
          errorType,
          message: error.message,
          timestamp: Date.now(),
        });
      }
    }

    this.emit("errorRecorded", {
      componentType,
      errorType,
      error,
      executionId,
    });
  }

  /**
   * Record performance metrics
   */
  recordPerformanceMetrics(memoryUsage, throughput) {
    if (this.options.enablePerformanceMetrics) {
      if (memoryUsage !== undefined) {
        this.metrics.get("memory_usage").observe(memoryUsage);
      }

      if (throughput !== undefined) {
        this.metrics.get("throughput").observe(throughput);
      }
    }

    this.emit("performanceRecorded", { memoryUsage, throughput });
  }

  /**
   * Get metric by name
   */
  getMetric(name) {
    return this.metrics.get(name);
  }

  /**
   * Get all metrics
   */
  getAllMetrics() {
    const result = {};
    for (const [name, metric] of this.metrics) {
      result[name] = metric.export();
    }
    return result;
  }

  /**
   * Get pipeline statistics
   */
  getStatistics() {
    const now = Date.now();
    const uptime = now - this.startTime;

    const totalExecutions = this.metrics.get("executions_total").get();
    const totalErrors = this.metrics.get("errors_total").get();
    const totalDocuments = this.metrics.get("documents_processed").get();

    const executionStats = this.metrics.get("execution_duration").getStats();
    const componentStats = this.metrics.get("component_duration").getStats();

    return {
      pipelineId: this.pipelineId,
      uptime,
      totalExecutions,
      totalErrors,
      totalDocuments,
      errorRate:
        totalExecutions > 0 ? (totalErrors / totalExecutions) * 100 : 0,
      averageExecutionTime: executionStats.average,
      averageComponentTime: componentStats.average,
      throughput: uptime > 0 ? totalDocuments / (uptime / 1000) : 0, // docs per second
      recentExecutions: this.executionHistory.slice(-10),
      timestamp: now,
    };
  }

  /**
   * Export all metrics data
   */
  exportMetrics(format = "json") {
    const data = {
      pipelineId: this.pipelineId,
      timestamp: Date.now(),
      uptime: Date.now() - this.startTime,
      metrics: this.getAllMetrics(),
      statistics: this.getStatistics(),
      executionHistory: this.executionHistory,
    };

    if (format === "prometheus") {
      return this._exportPrometheusFormat(data);
    }

    return data;
  }

  /**
   * Export metrics in Prometheus format
   */
  _exportPrometheusFormat(data) {
    const lines = [];

    for (const [name, metric] of Object.entries(data.metrics)) {
      lines.push(`# HELP ${metric.name} ${metric.description}`);
      lines.push(`# TYPE ${metric.name} ${metric.type}`);

      if (metric.type === "counter") {
        if (
          metric.labeledValues &&
          Object.keys(metric.labeledValues).length > 0
        ) {
          for (const [labels, value] of Object.entries(metric.labeledValues)) {
            lines.push(`${metric.name}{${labels}} ${value}`);
          }
        } else {
          lines.push(`${metric.name} ${metric.value}`);
        }
      } else if (metric.type === "histogram") {
        // Histogram buckets
        for (const [bucket, count] of Object.entries(metric.bucketCounts)) {
          const le = bucket === "+Inf" ? "+Inf" : bucket;
          lines.push(`${metric.name}_bucket{le="${le}"} ${count}`);
        }
        lines.push(`${metric.name}_sum ${metric.sum}`);
        lines.push(`${metric.name}_count ${metric.count}`);
      }

      lines.push("");
    }

    return lines.join("\n");
  }

  /**
   * Clean up old execution history
   */
  cleanup() {
    const cutoffTime = Date.now() - this.options.retentionPeriod;
    this.executionHistory = this.executionHistory.filter(
      (e) => e.startTime > cutoffTime,
    );

    this.emit("cleanup", {
      removedCount: this.executionHistory.length,
      retainedCount: this.executionHistory.length,
    });
  }

  /**
   * Reset all metrics
   */
  reset() {
    for (const metric of this.metrics.values()) {
      metric.reset();
    }

    this.executionHistory = [];
    this.startTime = Date.now();

    this.emit("reset", { timestamp: Date.now() });
  }
}

module.exports = {
  Counter,
  Histogram,
  PipelineMetrics,
};
