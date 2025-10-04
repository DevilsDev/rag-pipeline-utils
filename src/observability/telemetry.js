/**
 * @fileoverview OpenTelemetry integration for distributed tracing and metrics collection.
 * Provides comprehensive observability for the RAG pipeline with performance monitoring.
 *
 * @author DevilsDev Team
 * @since 2.1.0
 * @version 2.1.0
 */

const { NodeSDK } = require("@opentelemetry/auto-instrumentations-node");
const {
  getNodeAutoInstrumentations,
} = require("@opentelemetry/auto-instrumentations-node");
const { Resource } = require("@opentelemetry/resources");
const {
  SemanticResourceAttributes,
} = require("@opentelemetry/semantic-conventions");
const { NodeTracerProvider } = require("@opentelemetry/sdk-node");
const { JaegerExporter } = require("@opentelemetry/exporter-jaeger");
const { PrometheusExporter } = require("@opentelemetry/exporter-prometheus");
const {
  MeterProvider,
  PeriodicExportingMetricReader,
} = require("@opentelemetry/sdk-metrics");
const {
  BatchSpanProcessor,
  SimpleSpanProcessor,
} = require("@opentelemetry/sdk-trace-base");
const {
  trace,
  metrics,
  context,
  SpanStatusCode,
} = require("@opentelemetry/api");
const logger = require("../utils/structured-logger");

/**
 * OpenTelemetry telemetry service for comprehensive observability.
 *
 * Features:
 * - Distributed tracing across RAG pipeline components
 * - Custom metrics for performance monitoring
 * - Automatic instrumentation for HTTP, database, and filesystem
 * - Jaeger integration for trace visualization
 * - Prometheus integration for metrics collection
 * - Context propagation for correlation tracking
 *
 * @class TelemetryService
 */
class TelemetryService {
  constructor(options = {}) {
    this.config = {
      // Service Configuration
      serviceName: options.serviceName || "@devilsdev/rag-pipeline-utils",
      serviceVersion: options.serviceVersion || "2.1.0",
      environment: options.environment || process.env.NODE_ENV || "development",

      // Tracing Configuration
      tracing: {
        enabled: options.tracing?.enabled !== false,
        jaegerEndpoint:
          options.tracing?.jaegerEndpoint ||
          "http://localhost:14268/api/traces",
        samplingRate: options.tracing?.samplingRate || 1.0, // 100% sampling in dev
        exporterType: options.tracing?.exporterType || "jaeger", // jaeger, console, otlp
        batchTimeout: options.tracing?.batchTimeout || 5000,
        maxExportBatchSize: options.tracing?.maxExportBatchSize || 512,
      },

      // Metrics Configuration
      metrics: {
        enabled: options.metrics?.enabled !== false,
        prometheusEndpoint: options.metrics?.prometheusEndpoint || "/metrics",
        port: options.metrics?.port || 9090,
        collectInterval: options.metrics?.collectInterval || 10000, // 10 seconds
        exportInterval: options.metrics?.exportInterval || 30000, // 30 seconds
      },

      // Instrumentation Configuration
      instrumentation: {
        http: options.instrumentation?.http !== false,
        fs: options.instrumentation?.fs !== false,
        dns: options.instrumentation?.dns !== false,
        net: options.instrumentation?.net !== false,
        express: options.instrumentation?.express !== false,
        ...options.instrumentation,
      },

      // Resource Configuration
      resource: {
        "service.name": options.serviceName || "@devilsdev/rag-pipeline-utils",
        "service.version": options.serviceVersion || "2.1.0",
        "service.environment":
          options.environment || process.env.NODE_ENV || "development",
        "service.instance.id": process.env.HOSTNAME || require("os").hostname(),
        ...options.resource,
      },

      ...options,
    };

    this.tracer = null;
    this.meter = null;
    this.sdk = null;
    this.isInitialized = false;
    this.customMetrics = new Map();
  }

  /**
   * Initialize the telemetry service with tracing and metrics.
   *
   * @returns {Promise<void>} Initialization promise
   */
  async initialize() {
    if (this.isInitialized) {
      logger.warn("Telemetry service already initialized");
      return;
    }

    try {
      logger.info("Initializing OpenTelemetry telemetry service", {
        serviceName: this.config.serviceName,
        environment: this.config.environment,
        tracingEnabled: this.config.tracing.enabled,
        metricsEnabled: this.config.metrics.enabled,
      });

      // Initialize resource
      const resource = new Resource(this.config.resource);

      // Initialize tracing if enabled
      if (this.config.tracing.enabled) {
        await this.initializeTracing(resource);
      }

      // Initialize metrics if enabled
      if (this.config.metrics.enabled) {
        await this.initializeMetrics(resource);
      }

      // Initialize SDK with auto-instrumentations
      await this.initializeSDK();

      // Create custom metrics
      this.createCustomMetrics();

      this.isInitialized = true;

      logger.info("OpenTelemetry telemetry service initialized successfully", {
        tracingEnabled: this.config.tracing.enabled,
        metricsEnabled: this.config.metrics.enabled,
        instrumentations: Object.keys(this.config.instrumentation).filter(
          (key) => this.config.instrumentation[key],
        ),
      });
    } catch (error) {
      logger.error("Failed to initialize telemetry service", {
        error: error.message,
        stack: error.stack,
      });
      throw error;
    }
  }

  /**
   * Initialize distributed tracing.
   *
   * @private
   * @param {Resource} resource - OpenTelemetry resource
   */
  async initializeTracing(resource) {
    logger.debug("Initializing OpenTelemetry tracing");

    // Create tracer provider
    const tracerProvider = new NodeTracerProvider({
      resource,
      sampler: this.createSampler(),
    });

    // Configure exporter
    const exporter = this.createTraceExporter();
    const spanProcessor = new BatchSpanProcessor(exporter, {
      scheduledDelayMillis: this.config.tracing.batchTimeout,
      maxExportBatchSize: this.config.tracing.maxExportBatchSize,
    });

    tracerProvider.addSpanProcessor(spanProcessor);
    tracerProvider.register();

    // Get tracer instance
    this.tracer = trace.getTracer(
      this.config.serviceName,
      this.config.serviceVersion,
    );

    logger.debug("OpenTelemetry tracing initialized", {
      exporterType: this.config.tracing.exporterType,
      samplingRate: this.config.tracing.samplingRate,
    });
  }

  /**
   * Initialize metrics collection.
   *
   * @private
   * @param {Resource} resource - OpenTelemetry resource
   */
  async initializeMetrics(resource) {
    logger.debug("Initializing OpenTelemetry metrics");

    // Create Prometheus exporter
    const prometheusExporter = new PrometheusExporter({
      endpoint: this.config.metrics.prometheusEndpoint,
      port: this.config.metrics.port,
    });

    // Create metrics reader
    const metricReader = new PeriodicExportingMetricReader({
      exporter: prometheusExporter,
      exportIntervalMillis: this.config.metrics.exportInterval,
    });

    // Create meter provider
    const meterProvider = new MeterProvider({
      resource,
      readers: [metricReader],
    });

    metrics.setGlobalMeterProvider(meterProvider);

    // Get meter instance
    this.meter = metrics.getMeter(
      this.config.serviceName,
      this.config.serviceVersion,
    );

    logger.debug("OpenTelemetry metrics initialized", {
      prometheusPort: this.config.metrics.port,
      exportInterval: this.config.metrics.exportInterval,
    });
  }

  /**
   * Initialize OpenTelemetry SDK with auto-instrumentations.
   *
   * @private
   */
  async initializeSDK() {
    if (!this.config.tracing.enabled) {
      return;
    }

    logger.debug("Initializing OpenTelemetry SDK");

    const instrumentations = this.getEnabledInstrumentations();

    this.sdk = new NodeSDK({
      instrumentations,
      resource: new Resource(this.config.resource),
    });

    this.sdk.start();

    logger.debug("OpenTelemetry SDK initialized with instrumentations", {
      count: instrumentations.length,
    });
  }

  /**
   * Create trace sampler based on configuration.
   *
   * @private
   * @returns {Sampler} Configured sampler
   */
  createSampler() {
    const {
      TraceIdRatioBasedSampler,
      AlwaysOnSampler,
      AlwaysOffSampler,
    } = require("@opentelemetry/sdk-trace-base");

    if (this.config.tracing.samplingRate >= 1.0) {
      return new AlwaysOnSampler();
    } else if (this.config.tracing.samplingRate <= 0.0) {
      return new AlwaysOffSampler();
    } else {
      return new TraceIdRatioBasedSampler(this.config.tracing.samplingRate);
    }
  }

  /**
   * Create trace exporter based on configuration.
   *
   * @private
   * @returns {SpanExporter} Configured span exporter
   */
  createTraceExporter() {
    switch (this.config.tracing.exporterType) {
      case "jaeger":
        return new JaegerExporter({
          endpoint: this.config.tracing.jaegerEndpoint,
        });

      case "console": {
        const {
          ConsoleSpanExporter,
        } = require("@opentelemetry/sdk-trace-base");
        return new ConsoleSpanExporter();
      }

      case "otlp": {
        const {
          OTLPTraceExporter,
        } = require("@opentelemetry/exporter-trace-otlp-http");
        return new OTLPTraceExporter({
          url:
            this.config.tracing.otlpEndpoint ||
            "http://localhost:4318/v1/traces",
        });
      }

      default:
        throw new Error(
          `Unsupported trace exporter type: ${this.config.tracing.exporterType}`,
        );
    }
  }

  /**
   * Get enabled auto-instrumentations.
   *
   * @private
   * @returns {Array} Array of instrumentation instances
   */
  getEnabledInstrumentations() {
    const instrumentationConfig = {};

    // Configure enabled instrumentations
    Object.entries(this.config.instrumentation).forEach(([key, enabled]) => {
      if (enabled) {
        instrumentationConfig[key] = true;
      }
    });

    return getNodeAutoInstrumentations(instrumentationConfig);
  }

  /**
   * Create custom metrics for RAG pipeline monitoring.
   *
   * @private
   */
  createCustomMetrics() {
    if (!this.meter) {
      return;
    }

    logger.debug("Creating custom metrics for RAG pipeline");

    // DAG execution metrics
    this.customMetrics.set(
      "dag_execution_duration",
      this.meter.createHistogram("dag_execution_duration", {
        description: "Duration of DAG execution in milliseconds",
        unit: "ms",
      }),
    );

    this.customMetrics.set(
      "dag_node_execution_count",
      this.meter.createCounter("dag_node_execution_count", {
        description: "Number of DAG nodes executed",
      }),
    );

    this.customMetrics.set(
      "dag_execution_errors",
      this.meter.createCounter("dag_execution_errors", {
        description: "Number of DAG execution errors",
      }),
    );

    // Plugin metrics
    this.customMetrics.set(
      "plugin_execution_duration",
      this.meter.createHistogram("plugin_execution_duration", {
        description: "Duration of plugin execution in milliseconds",
        unit: "ms",
      }),
    );

    this.customMetrics.set(
      "plugin_sandbox_violations",
      this.meter.createCounter("plugin_sandbox_violations", {
        description: "Number of plugin sandbox security violations",
      }),
    );

    // RAG pipeline metrics
    this.customMetrics.set(
      "rag_query_duration",
      this.meter.createHistogram("rag_query_duration", {
        description: "Duration of RAG query processing in milliseconds",
        unit: "ms",
      }),
    );

    this.customMetrics.set(
      "rag_embedding_count",
      this.meter.createCounter("rag_embedding_count", {
        description: "Number of embeddings generated",
      }),
    );

    this.customMetrics.set(
      "rag_retrieval_accuracy",
      this.meter.createHistogram("rag_retrieval_accuracy", {
        description: "Accuracy score of document retrieval",
      }),
    );

    // System metrics
    this.customMetrics.set(
      "memory_usage",
      this.meter.createUpDownCounter("memory_usage", {
        description: "Current memory usage in bytes",
        unit: "bytes",
      }),
    );

    this.customMetrics.set(
      "active_connections",
      this.meter.createUpDownCounter("active_connections", {
        description: "Number of active connections",
      }),
    );

    logger.debug("Custom metrics created", {
      count: this.customMetrics.size,
      metrics: Array.from(this.customMetrics.keys()),
    });
  }

  /**
   * Create a span with automatic error handling and logging.
   *
   * @param {string} name - Span name
   * @param {Function} fn - Function to execute within span
   * @param {Object} attributes - Span attributes
   * @returns {Promise<any>} Function result
   */
  async withSpan(name, fn, attributes = {}) {
    if (!this.tracer || !this.config.tracing.enabled) {
      // If tracing is disabled, just execute the function
      return fn();
    }

    return this.tracer.startActiveSpan(name, { attributes }, async (span) => {
      try {
        const startTime = Date.now();
        const result = await fn(span);

        // Record success metrics
        span.setStatus({ code: SpanStatusCode.OK });
        span.setAttribute("execution.duration_ms", Date.now() - startTime);

        return result;
      } catch (error) {
        // Record error in span
        span.recordException(error);
        span.setStatus({
          code: SpanStatusCode.ERROR,
          message: error.message,
        });

        // Add error attributes
        span.setAttributes({
          "error.type": error.constructor.name,
          "error.message": error.message,
        });

        throw error;
      } finally {
        span.end();
      }
    });
  }

  /**
   * Record a custom metric value.
   *
   * @param {string} metricName - Name of the metric
   * @param {number} value - Metric value
   * @param {Object} attributes - Metric attributes
   */
  recordMetric(metricName, value, attributes = {}) {
    if (!this.meter || !this.config.metrics.enabled) {
      return;
    }

    const metric = this.customMetrics.get(metricName);
    if (!metric) {
      logger.warn("Unknown metric name", { metricName });
      return;
    }

    try {
      if (metric.add) {
        // Counter or UpDownCounter
        metric.add(value, attributes);
      } else if (metric.record) {
        // Histogram
        metric.record(value, attributes);
      }
    } catch (error) {
      logger.error("Failed to record metric", {
        metricName,
        value,
        attributes,
        error: error.message,
      });
    }
  }

  /**
   * Create a child span from the active span.
   *
   * @param {string} name - Span name
   * @param {Object} attributes - Span attributes
   * @returns {Span} Child span
   */
  createChildSpan(name, attributes = {}) {
    if (!this.tracer || !this.config.tracing.enabled) {
      return null;
    }

    return this.tracer.startSpan(name, {
      attributes,
      parent: trace.getActiveSpan(),
    });
  }

  /**
   * Add attributes to the current active span.
   *
   * @param {Object} attributes - Attributes to add
   */
  addSpanAttributes(attributes) {
    if (!this.config.tracing.enabled) {
      return;
    }

    const span = trace.getActiveSpan();
    if (span) {
      span.setAttributes(attributes);
    }
  }

  /**
   * Record an exception in the current span.
   *
   * @param {Error} error - Error to record
   * @param {Object} attributes - Additional attributes
   */
  recordException(error, attributes = {}) {
    if (!this.config.tracing.enabled) {
      return;
    }

    const span = trace.getActiveSpan();
    if (span) {
      span.recordException(error);
      span.setAttributes(attributes);
    }
  }

  /**
   * Get telemetry health status.
   *
   * @returns {Object} Health status
   */
  getHealth() {
    return {
      initialized: this.isInitialized,
      tracing: {
        enabled: this.config.tracing.enabled,
        provider: this.tracer ? "active" : "inactive",
      },
      metrics: {
        enabled: this.config.metrics.enabled,
        provider: this.meter ? "active" : "inactive",
        customMetrics: this.customMetrics.size,
      },
      sdk: {
        active: this.sdk ? true : false,
      },
    };
  }

  /**
   * Gracefully shutdown the telemetry service.
   *
   * @returns {Promise<void>} Shutdown promise
   */
  async shutdown() {
    if (!this.isInitialized) {
      return;
    }

    logger.info("Shutting down telemetry service");

    try {
      if (this.sdk) {
        await this.sdk.shutdown();
      }

      this.isInitialized = false;
      this.tracer = null;
      this.meter = null;
      this.sdk = null;
      this.customMetrics.clear();

      logger.info("Telemetry service shutdown completed");
    } catch (error) {
      logger.error("Error during telemetry shutdown", {
        error: error.message,
        stack: error.stack,
      });
      throw error;
    }
  }
}

/**
 * Singleton telemetry service instance.
 */
let telemetryInstance = null;

/**
 * Get or create the global telemetry service instance.
 *
 * @param {Object} options - Configuration options
 * @returns {TelemetryService} Telemetry service instance
 */
function getTelemetryService(options = {}) {
  if (!telemetryInstance) {
    telemetryInstance = new TelemetryService(options);
  }
  return telemetryInstance;
}

/**
 * Initialize the global telemetry service.
 *
 * @param {Object} options - Configuration options
 * @returns {Promise<TelemetryService>} Initialized telemetry service
 */
async function initializeTelemetry(options = {}) {
  const service = getTelemetryService(options);
  await service.initialize();
  return service;
}

/**
 * Convenience function to wrap a function with automatic tracing.
 *
 * @param {string} spanName - Name for the trace span
 * @param {Function} fn - Function to wrap
 * @param {Object} attributes - Span attributes
 * @returns {Function} Wrapped function
 */
function traceFunction(spanName, fn, attributes = {}) {
  return async (...args) => {
    const service = getTelemetryService();
    return service.withSpan(spanName, () => fn(...args), attributes);
  };
}

module.exports = {
  TelemetryService,
  getTelemetryService,
  initializeTelemetry,
  traceFunction,
};

module.exports.default = module.exports;
