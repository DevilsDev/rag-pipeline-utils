/**
const path = require('path');
 * Instrumented pipeline wrapper with observability features
 * Integrates event logging, tracing, and metrics collection
 */

const { eventLogger, EventTypes, EventSeverity } = require('./event-logger.js');
// eslint-disable-line global-require
const { pipelineTracer } = require('./tracing.js');
// eslint-disable-line global-require
const { pipelineMetrics } = require('./metrics.js');
// eslint-disable-line global-require

/**
 * Instrumented pipeline wrapper that adds observability to any pipeline
 */
class InstrumentedPipeline {
  constructor(pipeline, _options = {}) {
    this.pipeline = pipeline;
    this._options = {
      enableTracing: _options.enableTracing !== false,
      enableMetrics: _options.enableMetrics !== false,
      enableEventLogging: _options.enableEventLogging !== false,
      verboseLogging: _options.verboseLogging || false,
      ..._options,
    };

    // Start memory monitoring
    if (this._options.enableMetrics) {
      this.startMemoryMonitoring();
    }
  }

  /**
   * Start periodic memory monitoring
   */
  startMemoryMonitoring() {
    this.memoryInterval = setInterval(() => {
      pipelineMetrics.recordMemoryUsage();
    }, 5000); // Every 5 seconds
  }

  /**
   * Stop memory monitoring
   */
  stopMemoryMonitoring() {
    if (this.memoryInterval) {
      clearInterval(this.memoryInterval);
      this.memoryInterval = null;
    }
  }

  /**
   * Instrument plugin execution
   * @param {string} pluginType - Type of plugin
   * @param {string} pluginName - Name of plugin
   * @param {Function} pluginFn - Plugin function
   * @param {any} input - Plugin input
   * @returns {Promise<any>} Plugin result
   */
  async instrumentPlugin(pluginType, pluginName, pluginFn, input) {
    const startTime = Date.now();

    // Event logging
    if (this._options.enableEventLogging) {
      eventLogger.logPluginStart(pluginType, pluginName, input);
    }

    // Metrics
    if (this._options.enableMetrics) {
      pipelineMetrics.recordOperationStart('plugin', pluginType, pluginName);
    }

    try {
      let result;

      // Tracing
      if (this._options.enableTracing) {
        result = await pipelineTracer.tracePlugin(
          pluginType,
          pluginName,
          pluginFn,
          input,
        );
      } else {
        result = await pluginFn(input);
      }

      const duration = Date.now() - startTime;

      // Event logging
      if (this._options.enableEventLogging) {
        eventLogger.logPluginEnd(pluginType, pluginName, duration, {
          success: true,
        });
      }

      // Metrics
      if (this._options.enableMetrics) {
        pipelineMetrics.recordOperationEnd(
          'plugin',
          pluginType,
          pluginName,
          duration,
          'success',
        );
        this.recordPluginSpecificMetrics(
          pluginType,
          pluginName,
          duration,
          input,
          result,
        );
      }

      return result;
    } catch (error) {
      const duration = Date.now() - startTime;

      // Event logging
      if (this._options.enableEventLogging) {
        eventLogger.logPluginError(pluginType, pluginName, error, duration);
      }

      // Metrics
      if (this._options.enableMetrics) {
        pipelineMetrics.recordOperationEnd(
          'plugin',
          pluginType,
          pluginName,
          duration,
          'error',
        );
        pipelineMetrics.recordError('plugin', pluginType, pluginName, error);
      }

      throw error;
    }
  }

  /**
   * Record plugin-specific metrics
   * @param {string} pluginType - Plugin _type
   * @param {string} pluginName - Plugin name
   * @param {number} duration - Duration in ms
   * @param {any} input - Plugin input
   * @param {any} result - Plugin result
   */
  recordPluginSpecificMetrics(pluginType, pluginName, duration, input, result) {
    switch (pluginType) {
      case 'embedder': {
        const tokenCount = this.estimateTokenCount(input);
        const batchSize = Array.isArray(input) ? input.length : 1;
        pipelineMetrics.recordEmbedding(
          pluginName,
          duration,
          tokenCount,
          batchSize,
        );
        break;
      }

      case 'retriever': {
        const resultCount = Array.isArray(result) ? result.length : 1;
        pipelineMetrics.recordRetrieval(pluginName, duration, resultCount);
        break;
      }

      case 'llm': {
        const inputTokens = this.estimateTokenCount(input);
        const outputTokens = this.estimateTokenCount(result);
        const streaming = this.isStreamingResult(result);
        pipelineMetrics.recordLLM(
          pluginName,
          duration,
          inputTokens,
          outputTokens,
          streaming,
        );
        break;
      }
    }
  }

  /**
   * Estimate token count from text
   * @param {any} text - Text to estimate
   * @returns {number} Estimated token count
   */
  estimateTokenCount(text) {
    if (typeof text === 'string') {
      return Math.ceil(text.length / 4); // Rough approximation
    } else if (Array.isArray(text)) {
      return text.reduce((sum, item) => sum + this.estimateTokenCount(item), 0);
    } else if (text && typeof text === 'object') {
      return this.estimateTokenCount(JSON.stringify(text));
    }
    return 0;
  }

  /**
   * Check if result is from streaming
   * @param {any} result - Result to check
   * @returns {boolean} True if streaming result
   */
  isStreamingResult(result) {
    return result && typeof result === 'object' && result.streaming === true;
  }

  /**
   * Instrumented ingest method
   * @param {string} docPath - Document path
   * @returns {Promise<void>}
   */
  async ingest(docPath) {
    if (this._options.enableEventLogging) {
      eventLogger.logStageStart('ingest', { docPath });
    }

    const startTime = Date.now();

    try {
      let result;

      if (this._options.enableTracing) {
        result = await pipelineTracer.traceStage(
          'ingest',
          async () => {
            return await this.pipeline.ingest(docPath);
          },
          { docPath },
        );
      } else {
        result = await this.pipeline.ingest(docPath);
      }

      const duration = Date.now() - startTime;

      if (this._options.enableEventLogging) {
        eventLogger.logStageEnd('ingest', duration, { docPath, success: true });
      }

      return result;
    } catch (error) {
      const duration = Date.now() - startTime;

      if (this._options.enableEventLogging) {
        eventLogger.logEvent(
          EventTypes.STAGE_ERROR,
          EventSeverity.ERROR,
          { stage: 'ingest', duration, docPath, error: error.message },
          `Ingest stage failed: ${error.message}`,
        );
      }

      throw error;
    }
  }

  /**
   * Instrumented query method
   * @param {string} prompt - Query prompt
   * @returns {Promise<string>}
   */
  async query(prompt) {
    if (this._options.enableEventLogging) {
      eventLogger.logStageStart('query', { prompt: prompt.substring(0, 100) });
    }

    const startTime = Date.now();

    try {
      let result;

      if (this._options.enableTracing) {
        result = await pipelineTracer.traceStage(
          'query',
          async () => {
            return await this.pipeline.query(prompt);
          },
          { promptLength: prompt.length },
        );
      } else {
        result = await this.pipeline.query(prompt);
      }

      const duration = Date.now() - startTime;

      if (this._options.enableEventLogging) {
        eventLogger.logStageEnd('query', duration, {
          promptLength: prompt.length,
          responseLength: result.length,
          success: true,
        });
      }

      return result;
    } catch (error) {
      const duration = Date.now() - startTime;

      if (this._options.enableEventLogging) {
        eventLogger.logEvent(
          EventTypes.STAGE_ERROR,
          EventSeverity.ERROR,
          {
            stage: 'query',
            duration,
            promptLength: prompt.length,
            error: error.message,
          },
          `Query stage failed: ${error.message}`,
        );
      }

      throw error;
    }
  }

  /**
   * Instrumented streaming query method
   * @param {string} prompt - Query prompt
   * @returns {AsyncGenerator<string>}
   */
  async *queryStream(prompt) {
    if (this._options.enableEventLogging) {
      eventLogger.logStageStart('query_stream', {
        prompt: prompt.substring(0, 100),
      });
    }

    const startTime = Date.now();
    let tokenCount = 0;

    try {
      if (this._options.enableTracing) {
        const span = pipelineTracer.startSpan('pipeline.query_stream');
        span.setAttributes({
          'pipeline.stage': 'query_stream',
          'query.prompt_length': prompt.length,
        });

        try {
          for await (const token of this.pipeline.queryStream(prompt)) {
            tokenCount++;
            yield token;
          }

          span.setAttributes({
            'query.tokens_generated': tokenCount,
            'query.success': true,
          });
        } finally {
          span.end();
        }
      } else {
        for await (const token of this.pipeline.queryStream(prompt)) {
          tokenCount++;
          yield token;
        }
      }

      const duration = Date.now() - startTime;

      if (this._options.enableEventLogging) {
        eventLogger.logStageEnd('query_stream', duration, {
          promptLength: prompt.length,
          tokensGenerated: tokenCount,
          success: true,
        });
      }
    } catch (error) {
      const duration = Date.now() - startTime;

      if (this._options.enableEventLogging) {
        eventLogger.logEvent(
          EventTypes.STAGE_ERROR,
          EventSeverity.ERROR,
          {
            stage: 'query_stream',
            duration,
            promptLength: prompt.length,
            tokensGenerated: tokenCount,
            error: error.message,
          },
          `Streaming query stage failed: ${error.message}`,
        );
      }

      throw error;
    }
  }

  /**
   * Instrumented streaming ingest method
   * @param {string} docPath - Document path
   * @returns {AsyncGenerator}
   */
  async *ingestStream(docPath) {
    if (!this.pipeline.ingestStream) {
      throw new Error('Pipeline does not support streaming ingest');
    }

    if (this._options.enableEventLogging) {
      eventLogger.logStageStart('ingest_stream', { docPath });
    }

    const startTime = Date.now();
    let chunksProcessed = 0;
    let chunksFailed = 0;

    try {
      for await (const update of this.pipeline.ingestStream(docPath)) {
        if (update._type === 'chunk_processed') {
          chunksProcessed++;
        } else if (update._type === 'chunk_failed') {
          chunksFailed++;
        }

        yield update;
      }

      const duration = Date.now() - startTime;

      if (this._options.enableEventLogging) {
        eventLogger.logStageEnd('ingest_stream', duration, {
          docPath,
          chunksProcessed,
          chunksFailed,
          success: true,
        });
      }
    } catch (error) {
      const duration = Date.now() - startTime;

      if (this._options.enableEventLogging) {
        eventLogger.logEvent(
          EventTypes.STAGE_ERROR,
          EventSeverity.ERROR,
          {
            stage: 'ingest_stream',
            duration,
            docPath,
            chunksProcessed,
            chunksFailed,
            error: error.message,
          },
          `Streaming ingest stage failed: ${error.message}`,
        );
      }

      throw error;
    }
  }

  /**
   * Get observability statistics
   * @returns {object} Observability statistics
   */
  getObservabilityStats() {
    const stats = {
      enabled: this._options,
      session: eventLogger.getSessionStats(),
    };

    if (this._options.enableMetrics) {
      stats.metrics = pipelineMetrics.getSummary();
    }

    if (this._options.enableTracing) {
      stats.tracing = pipelineTracer.getTraceStats();
    }

    return stats;
  }

  /**
   * Export observability data
   * @param {object} _options - Export _options
   * @returns {object} Exported data
   */
  exportObservabilityData(_options = {}) {
    const data = {
      timestamp: new Date().toISOString(),
      sessionId: eventLogger.sessionId,
    };

    if (this._options.enableEventLogging && _options.includeEvents !== false) {
      data.events = eventLogger.getEventHistory(_options.eventFilters || {});
    }

    if (this._options.enableMetrics && _options.includeMetrics !== false) {
      data.metrics = pipelineMetrics.exportMetrics();
    }

    if (this._options.enableTracing && _options.includeTraces !== false) {
      data.traces = pipelineTracer.exportSpans(_options.traceFilters || {});
    }

    return data;
  }

  /**
   * Clear all observability data
   */
  clearObservabilityData() {
    if (this._options.enableEventLogging) {
      eventLogger.clearHistory();
    }

    if (this._options.enableMetrics) {
      pipelineMetrics.clearMetrics();
    }

    if (this._options.enableTracing) {
      pipelineTracer.clearCompletedSpans();
    }
  }

  /**
   * Cleanup resources
   */
  cleanup() {
    this.stopMemoryMonitoring();
  }

  /**
   * Get pipeline configuration with observability settings
   * @returns {object} Pipeline configuration
   */
  getConfig() {
    const baseConfig = this.pipeline.getConfig ? this.pipeline.getConfig() : {};

    return {
      ...baseConfig,
      observability: {
        enabled: this._options,
        sessionId: eventLogger.sessionId,
        capabilities: {
          eventLogging: this._options.enableEventLogging,
          tracing: this._options.enableTracing,
          metrics: this._options.enableMetrics,
        },
      },
    };
  }
}

/**
 * Create instrumented pipeline wrapper
 * @param {object} pipeline - Base pipeline _instance
 * @param {object} _options - Observability _options
 * @returns {InstrumentedPipeline} Instrumented pipeline
 */
function createInstrumentedPipeline(_pipeline, options = {}) {
  return new InstrumentedPipeline(_pipeline, options);
}

// Default export

module.exports = {
  InstrumentedPipeline,
  createInstrumentedPipeline,
};
