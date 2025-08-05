/**
 * Integration tests for observability infrastructure
 * Tests complete observability pipeline with instrumented pipeline
 */

import { createRagPipeline } from '../../src/core/create-pipeline.js';
import { createInstrumentedPipeline } from '../../src/core/observability/instrumented-pipeline.js';
import { eventLogger } from '../../src/core/observability/event-logger.js';
import { pipelineTracer } from '../../src/core/observability/tracing.js';
import { pipelineMetrics } from '../../src/core/observability/metrics.js';
import { PluginRegistry } from '../../src/core/plugin-registry.js';

// Mock plugins for testing
const mockLoader = {
  load: jest.fn().mockResolvedValue(['chunk1', 'chunk2', 'chunk3'])
};

const mockEmbedder = {
  embed: jest.fn().mockImplementation(async (chunks) => {
    // Simulate embedding delay
    await new Promise(resolve => setTimeout(resolve, 50));
    return chunks.map((chunk, i) => ({
      chunk,
      vector: new Array(768).fill(0).map(() => Math.random())
    }));
  })
};

const mockRetriever = {
  store: jest.fn().mockResolvedValue(undefined),
  retrieve: jest.fn().mockImplementation(async (query) => {
    // Simulate retrieval delay
    await new Promise(resolve => setTimeout(resolve, 30));
    return [
      { chunk: 'relevant chunk 1', score: 0.9 },
      { chunk: 'relevant chunk 2', score: 0.8 }
    ];
  })
};

const mockLLM = {
  generate: jest.fn().mockImplementation(async (prompt) => {
    // Simulate LLM delay
    await new Promise(resolve => setTimeout(resolve, 100));
    return `Generated response for: ${prompt.substring(0, 50)}...`;
  })
};

describe('Observability Integration', () => {
  let registry;
  let basePipeline;
  let instrumentedPipeline;

  beforeEach(async () => {
    // Clear all observability data
    eventLogger.clearHistory();
    pipelineTracer.clearCompletedSpans();
    pipelineMetrics.clearMetrics();

    // Create fresh plugin registry
    registry = new PluginRegistry();
    registry.register('loader', 'test-loader', mockLoader);
    registry.register('embedder', 'test-embedder', mockEmbedder);
    registry.register('retriever', 'test-retriever', mockRetriever);
    registry.register('llm', 'test-llm', mockLLM);

    // Create base pipeline
    const plugins = {
      loader: 'test-loader',
      embedder: 'test-embedder',
      retriever: 'test-retriever',
      llm: 'test-llm'
    };

    basePipeline = createRagPipeline(plugins, {}, registry);

    // Create instrumented pipeline
    instrumentedPipeline = createInstrumentedPipeline(basePipeline, {
      enableTracing: true,
      enableMetrics: true,
      enableEventLogging: true,
      verboseLogging: true
    });
  });

  afterEach(() => {
    if (instrumentedPipeline.cleanup) {
      instrumentedPipeline.cleanup();
    }
  });

  describe('Complete Pipeline Observability', () => {
    it('should capture observability data during ingest operation', async () => {
      const testDocPath = 'test-document.txt';

      // Perform ingest operation
      await instrumentedPipeline.ingest(testDocPath);

      // Verify event logging
      const events = eventLogger.getEventHistory();
      expect(events.length).toBeGreaterThan(0);

      // Should have stage start/end events
      const stageEvents = events.filter(e => e.eventType.includes('stage'));
      expect(stageEvents.length).toBeGreaterThanOrEqual(2); // At least start and end

      // Should have plugin events
      const pluginEvents = events.filter(e => e.eventType.includes('plugin'));
      expect(pluginEvents.length).toBeGreaterThan(0);

      // Verify tracing
      const completedSpans = pipelineTracer.getCompletedSpans();
      expect(completedSpans.length).toBeGreaterThan(0);

      // Should have pipeline stage span
      const stageSpans = completedSpans.filter(span => span.name.startsWith('pipeline.'));
      expect(stageSpans.length).toBeGreaterThanOrEqual(1);

      // Verify metrics
      const metrics = pipelineMetrics.getSummary();
      expect(metrics.operations.total).toBeGreaterThan(0);

      // Should have embedding metrics
      if (metrics.embedding.totalOperations > 0) {
        expect(metrics.embedding.avgDuration.mean).toBeGreaterThan(0);
      }
    });

    it('should capture observability data during query operation', async () => {
      const testQuery = 'What is the main topic of the document?';

      // Perform query operation
      const result = await instrumentedPipeline.query(testQuery);

      expect(result).toBeDefined();
      expect(typeof result).toBe('string');

      // Verify event logging
      const events = eventLogger.getEventHistory();
      expect(events.length).toBeGreaterThan(0);

      // Should have query stage events
      const queryEvents = events.filter(e => 
        e.eventType.includes('stage') && e.metadata.stage === 'query'
      );
      expect(queryEvents.length).toBeGreaterThanOrEqual(2); // Start and end

      // Verify tracing
      const completedSpans = pipelineTracer.getCompletedSpans();
      const querySpans = completedSpans.filter(span => 
        span.name === 'pipeline.query'
      );
      expect(querySpans.length).toBeGreaterThanOrEqual(1);

      // Verify metrics
      const metrics = pipelineMetrics.getSummary();
      expect(metrics.operations.total).toBeGreaterThan(0);

      // Should have LLM metrics
      if (metrics.llm.totalOperations > 0) {
        expect(metrics.llm.avgDuration.mean).toBeGreaterThan(0);
        expect(metrics.llm.avgInputTokens.mean).toBeGreaterThan(0);
      }
    });

    it('should handle plugin errors with observability', async () => {
      // Make embedder throw an error
      mockEmbedder.embed.mockRejectedValueOnce(new Error('Embedding service unavailable'));

      // Attempt ingest operation
      await expect(instrumentedPipeline.ingest('test-doc.txt')).rejects.toThrow();

      // Verify error was logged
      const events = eventLogger.getEventHistory();
      const errorEvents = events.filter(e => e.eventType.includes('error'));
      expect(errorEvents.length).toBeGreaterThan(0);

      const pluginErrorEvents = errorEvents.filter(e => 
        e.eventType.includes('plugin') && e.metadata.pluginType === 'embedder'
      );
      expect(pluginErrorEvents.length).toBeGreaterThanOrEqual(1);

      // Verify error was traced
      const completedSpans = pipelineTracer.getCompletedSpans();
      const errorSpans = completedSpans.filter(span => span.status.code === 'ERROR');
      expect(errorSpans.length).toBeGreaterThan(0);

      // Verify error metrics
      const metrics = pipelineMetrics.getSummary();
      expect(metrics.errors.total).toBeGreaterThan(0);
      expect(metrics.errors.byType.plugin).toBeGreaterThan(0);
    });
  });

  describe('Observability Statistics and Export', () => {
    beforeEach(async () => {
      // Generate some observability data
      await instrumentedPipeline.ingest('test-doc.txt');
      await instrumentedPipeline.query('Test query');
    });

    it('should provide comprehensive observability statistics', () => {
      const stats = instrumentedPipeline.getObservabilityStats();

      expect(stats).toHaveProperty('enabled');
      expect(stats).toHaveProperty('session');
      expect(stats).toHaveProperty('metrics');
      expect(stats).toHaveProperty('tracing');

      // Session stats
      expect(stats.session.totalEvents).toBeGreaterThan(0);
      expect(stats.session.sessionId).toBeDefined();

      // Metrics stats
      expect(stats.metrics.operations.total).toBeGreaterThan(0);

      // Tracing stats
      expect(stats.tracing.totalSpans).toBeGreaterThan(0);
      expect(stats.tracing.completedSpans).toBeGreaterThan(0);
    });

    it('should export complete observability data', () => {
      const exportedData = instrumentedPipeline.exportObservabilityData();

      expect(exportedData).toHaveProperty('timestamp');
      expect(exportedData).toHaveProperty('sessionId');
      expect(exportedData).toHaveProperty('events');
      expect(exportedData).toHaveProperty('metrics');
      expect(exportedData).toHaveProperty('traces');

      // Events should be present
      expect(Array.isArray(exportedData.events)).toBe(true);
      expect(exportedData.events.length).toBeGreaterThan(0);

      // Metrics should be present
      expect(exportedData.metrics).toHaveProperty('summary');
      expect(exportedData.metrics).toHaveProperty('rawMetrics');

      // Traces should be present
      expect(Array.isArray(exportedData.traces)).toBe(true);
      expect(exportedData.traces.length).toBeGreaterThan(0);
    });

    it('should support filtered data export', () => {
      const filteredData = instrumentedPipeline.exportObservabilityData({
        includeEvents: true,
        includeMetrics: false,
        includeTraces: true,
        eventFilters: { severity: 'ERROR' },
        traceFilters: { namePattern: /plugin/ }
      });

      expect(filteredData).toHaveProperty('events');
      expect(filteredData).not.toHaveProperty('metrics');
      expect(filteredData).toHaveProperty('traces');

      // Events should be filtered (may be empty if no errors)
      expect(Array.isArray(filteredData.events)).toBe(true);

      // Traces should be filtered to plugin traces only
      if (filteredData.traces.length > 0) {
        filteredData.traces.forEach(trace => {
          expect(trace.name).toMatch(/plugin/);
        });
      }
    });
  });

  describe('Memory Monitoring', () => {
    it('should monitor memory usage during operations', async () => {
      // Perform operations to generate memory usage
      await instrumentedPipeline.ingest('test-doc.txt');
      await instrumentedPipeline.query('Test query');

      // Wait for memory monitoring interval
      await new Promise(resolve => setTimeout(resolve, 100));

      const metrics = pipelineMetrics.getSummary();
      
      // Should have recorded memory usage
      expect(metrics.memory).toBeDefined();
      expect(typeof metrics.memory.heapUsed).toBe('number');
      expect(typeof metrics.memory.heapTotal).toBe('number');
      expect(typeof metrics.memory.usagePercentage).toBe('number');
    });
  });

  describe('Configuration and Capabilities', () => {
    it('should report observability configuration', () => {
      const config = instrumentedPipeline.getConfig();

      expect(config).toHaveProperty('observability');
      expect(config.observability).toHaveProperty('enabled');
      expect(config.observability).toHaveProperty('sessionId');
      expect(config.observability).toHaveProperty('capabilities');

      const capabilities = config.observability.capabilities;
      expect(capabilities.eventLogging).toBe(true);
      expect(capabilities.tracing).toBe(true);
      expect(capabilities.metrics).toBe(true);
    });

    it('should respect disabled observability features', () => {
      const limitedPipeline = createInstrumentedPipeline(basePipeline, {
        enableTracing: false,
        enableMetrics: true,
        enableEventLogging: false
      });

      const config = limitedPipeline.getConfig();
      const capabilities = config.observability.capabilities;

      expect(capabilities.eventLogging).toBe(false);
      expect(capabilities.tracing).toBe(false);
      expect(capabilities.metrics).toBe(true);
    });
  });

  describe('Data Cleanup', () => {
    it('should clear observability data', async () => {
      // Generate some data
      await instrumentedPipeline.ingest('test-doc.txt');

      // Verify data exists
      expect(eventLogger.getEventHistory().length).toBeGreaterThan(0);
      expect(pipelineTracer.getCompletedSpans().length).toBeGreaterThan(0);
      expect(pipelineMetrics.getSummary().operations.total).toBeGreaterThan(0);

      // Clear data
      instrumentedPipeline.clearObservabilityData();

      // Verify data is cleared
      expect(eventLogger.getEventHistory().length).toBe(0);
      expect(pipelineTracer.getCompletedSpans().length).toBe(0);
      expect(pipelineMetrics.getSummary().operations.total).toBe(0);
    });
  });

  describe('Performance Impact', () => {
    it('should have minimal performance impact', async () => {
      // Measure baseline performance
      const baselineStart = Date.now();
      await basePipeline.query('Test query for baseline');
      const baselineTime = Date.now() - baselineStart;

      // Measure instrumented performance
      const instrumentedStart = Date.now();
      await instrumentedPipeline.query('Test query for instrumented');
      const instrumentedTime = Date.now() - instrumentedStart;

      // Observability overhead should be reasonable (less than 50% overhead)
      const overhead = (instrumentedTime - baselineTime) / baselineTime;
      expect(overhead).toBeLessThan(0.5);
    });
  });
});

describe('Observability with Parallel Processing', () => {
  let instrumentedPipeline;

  beforeEach(() => {
    const registry = new PluginRegistry();
    registry.register('loader', 'test-loader', mockLoader);
    registry.register('embedder', 'test-embedder', mockEmbedder);
    registry.register('retriever', 'test-retriever', mockRetriever);
    registry.register('llm', 'test-llm', mockLLM);

    const plugins = {
      loader: 'test-loader',
      embedder: 'test-embedder',
      retriever: 'test-retriever',
      llm: 'test-llm'
    };

    const basePipeline = createRagPipeline(plugins, {
      useParallelProcessing: true,
      performance: {
        maxConcurrency: 2,
        batchSize: 2
      }
    }, registry);

    instrumentedPipeline = createInstrumentedPipeline(basePipeline, {
      enableTracing: true,
      enableMetrics: true,
      enableEventLogging: true
    });

    // Clear observability data
    eventLogger.clearHistory();
    pipelineTracer.clearCompletedSpans();
    pipelineMetrics.clearMetrics();
  });

  it('should capture observability data for parallel operations', async () => {
    await instrumentedPipeline.ingest('test-doc.txt');

    // Should capture concurrency metrics
    const metrics = pipelineMetrics.getSummary();
    expect(metrics.concurrency).toBeDefined();

    // Should capture parallel plugin executions in traces
    const spans = pipelineTracer.getCompletedSpans();
    const pluginSpans = spans.filter(span => span.name.includes('plugin.'));
    expect(pluginSpans.length).toBeGreaterThan(0);

    // Should log parallel processing events
    const events = eventLogger.getEventHistory();
    const pluginEvents = events.filter(e => e.eventType.includes('plugin'));
    expect(pluginEvents.length).toBeGreaterThan(0);
  });
});
