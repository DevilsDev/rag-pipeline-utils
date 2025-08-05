/**
 * Unit tests for metrics collection system
 * Tests counters, histograms, gauges, and pipeline metrics
 */

import { 
  Counter, 
  Histogram, 
  Gauge, 
  MetricsRegistry, 
  PipelineMetrics, 
  pipelineMetrics 
} from '../../../src/core/observability/metrics.js';

describe('Counter', () => {
  let counter;

  beforeEach(() => {
    counter = new Counter('test_counter', 'Test counter description');
  });

  describe('constructor', () => {
    it('should initialize with name and description', () => {
      expect(counter.name).toBe('test_counter');
      expect(counter.description).toBe('Test counter description');
      expect(counter.value).toBe(0);
      expect(counter.labels).toEqual({});
    });

    it('should initialize with labels', () => {
      const labeledCounter = new Counter('labeled_counter', 'Description', { type: 'test' });
      expect(labeledCounter.labels).toEqual({ type: 'test' });
    });
  });

  describe('inc', () => {
    it('should increment by 1 by default', () => {
      counter.inc();
      expect(counter.value).toBe(1);
      
      counter.inc();
      expect(counter.value).toBe(2);
    });

    it('should increment by specified amount', () => {
      counter.inc(5);
      expect(counter.value).toBe(5);
      
      counter.inc(3);
      expect(counter.value).toBe(8);
    });

    it('should not allow negative increments', () => {
      expect(() => counter.inc(-1)).toThrow('Counter can only be incremented by non-negative values');
    });
  });

  describe('reset', () => {
    it('should reset value to 0', () => {
      counter.inc(10);
      expect(counter.value).toBe(10);
      
      counter.reset();
      expect(counter.value).toBe(0);
    });
  });

  describe('toJSON', () => {
    it('should serialize counter data', () => {
      counter.inc(5);
      const json = counter.toJSON();
      
      expect(json).toEqual({
        name: 'test_counter',
        description: 'Test counter description',
        type: 'counter',
        value: 5,
        labels: {},
        timestamp: expect.any(String)
      });
    });
  });
});

describe('Histogram', () => {
  let histogram;

  beforeEach(() => {
    histogram = new Histogram('test_histogram', 'Test histogram description');
  });

  describe('constructor', () => {
    it('should initialize with default buckets', () => {
      expect(histogram.name).toBe('test_histogram');
      expect(histogram.buckets).toEqual([1, 5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000, 10000]);
      expect(histogram.bucketCounts).toHaveLength(histogram.buckets.length + 1); // +1 for +Inf
      expect(histogram.sum).toBe(0);
      expect(histogram.count).toBe(0);
    });

    it('should accept custom buckets', () => {
      const customHistogram = new Histogram('custom', 'Description', {}, [10, 100, 1000]);
      expect(customHistogram.buckets).toEqual([10, 100, 1000]);
      expect(customHistogram.bucketCounts).toHaveLength(4);
    });
  });

  describe('observe', () => {
    it('should record observations in correct buckets', () => {
      histogram.observe(15);
      histogram.observe(150);
      histogram.observe(1500);
      
      expect(histogram.count).toBe(3);
      expect(histogram.sum).toBe(1665);
      
      // Check bucket counts (15 goes into 25 bucket, 150 into 250, 1500 into 2500)
      const bucketIndex25 = histogram.buckets.indexOf(25);
      const bucketIndex250 = histogram.buckets.indexOf(250);
      const bucketIndex2500 = histogram.buckets.indexOf(2500);
      
      expect(histogram.bucketCounts[bucketIndex25]).toBe(1);
      expect(histogram.bucketCounts[bucketIndex250]).toBe(2); // Cumulative
      expect(histogram.bucketCounts[bucketIndex2500]).toBe(3); // Cumulative
    });

    it('should handle values larger than all buckets', () => {
      histogram.observe(50000);
      
      expect(histogram.count).toBe(1);
      expect(histogram.sum).toBe(50000);
      
      // Should go into the +Inf bucket (last bucket)
      expect(histogram.bucketCounts[histogram.bucketCounts.length - 1]).toBe(1);
    });

    it('should calculate percentiles', () => {
      // Add many observations
      for (let i = 1; i <= 100; i++) {
        histogram.observe(i);
      }
      
      const percentiles = histogram.getPercentiles([50, 95, 99]);
      
      expect(percentiles[50]).toBeCloseTo(50, 0);
      expect(percentiles[95]).toBeCloseTo(95, 0);
      expect(percentiles[99]).toBeCloseTo(99, 0);
    });
  });

  describe('getStatistics', () => {
    it('should calculate mean and standard deviation', () => {
      histogram.observe(10);
      histogram.observe(20);
      histogram.observe(30);
      
      const stats = histogram.getStatistics();
      
      expect(stats.mean).toBe(20);
      expect(stats.count).toBe(3);
      expect(stats.sum).toBe(60);
      expect(stats.min).toBe(10);
      expect(stats.max).toBe(30);
      expect(stats.stdDev).toBeCloseTo(8.16, 1);
    });

    it('should handle single observation', () => {
      histogram.observe(42);
      
      const stats = histogram.getStatistics();
      expect(stats.mean).toBe(42);
      expect(stats.stdDev).toBe(0);
      expect(stats.min).toBe(42);
      expect(stats.max).toBe(42);
    });

    it('should handle no observations', () => {
      const stats = histogram.getStatistics();
      expect(stats.mean).toBe(0);
      expect(stats.count).toBe(0);
      expect(stats.min).toBe(Infinity);
      expect(stats.max).toBe(-Infinity);
    });
  });
});

describe('Gauge', () => {
  let gauge;

  beforeEach(() => {
    gauge = new Gauge('test_gauge', 'Test gauge description');
  });

  describe('constructor', () => {
    it('should initialize with zero value', () => {
      expect(gauge.name).toBe('test_gauge');
      expect(gauge.value).toBe(0);
    });
  });

  describe('set', () => {
    it('should set gauge value', () => {
      gauge.set(42);
      expect(gauge.value).toBe(42);
      
      gauge.set(-10);
      expect(gauge.value).toBe(-10);
    });
  });

  describe('inc and dec', () => {
    it('should increment and decrement', () => {
      gauge.inc(5);
      expect(gauge.value).toBe(5);
      
      gauge.dec(2);
      expect(gauge.value).toBe(3);
      
      gauge.inc(); // Default increment by 1
      expect(gauge.value).toBe(4);
      
      gauge.dec(); // Default decrement by 1
      expect(gauge.value).toBe(3);
    });
  });
});

describe('MetricsRegistry', () => {
  let registry;

  beforeEach(() => {
    registry = new MetricsRegistry();
  });

  describe('register', () => {
    it('should register metrics', () => {
      const counter = new Counter('test_counter', 'Description');
      registry.register(counter);
      
      expect(registry.getMetric('test_counter')).toBe(counter);
    });

    it('should prevent duplicate registration', () => {
      const counter1 = new Counter('duplicate', 'Description 1');
      const counter2 = new Counter('duplicate', 'Description 2');
      
      registry.register(counter1);
      expect(() => registry.register(counter2))
        .toThrow('Metric with name "duplicate" is already registered');
    });
  });

  describe('getOrCreate', () => {
    it('should create counter if not exists', () => {
      const counter = registry.getOrCreateCounter('new_counter', 'Description');
      
      expect(counter).toBeInstanceOf(Counter);
      expect(counter.name).toBe('new_counter');
      expect(registry.getMetric('new_counter')).toBe(counter);
    });

    it('should return existing counter', () => {
      const counter1 = registry.getOrCreateCounter('existing', 'Description');
      const counter2 = registry.getOrCreateCounter('existing', 'Description');
      
      expect(counter1).toBe(counter2);
    });

    it('should create histogram if not exists', () => {
      const histogram = registry.getOrCreateHistogram('new_histogram', 'Description');
      
      expect(histogram).toBeInstanceOf(Histogram);
      expect(histogram.name).toBe('new_histogram');
    });

    it('should create gauge if not exists', () => {
      const gauge = registry.getOrCreateGauge('new_gauge', 'Description');
      
      expect(gauge).toBeInstanceOf(Gauge);
      expect(gauge.name).toBe('new_gauge');
    });
  });

  describe('getAllMetrics', () => {
    it('should return all registered metrics', () => {
      const counter = new Counter('counter', 'Counter');
      const histogram = new Histogram('histogram', 'Histogram');
      const gauge = new Gauge('gauge', 'Gauge');
      
      registry.register(counter);
      registry.register(histogram);
      registry.register(gauge);
      
      const metrics = registry.getAllMetrics();
      expect(metrics).toHaveLength(3);
      expect(metrics).toContain(counter);
      expect(metrics).toContain(histogram);
      expect(metrics).toContain(gauge);
    });
  });

  describe('clear', () => {
    it('should clear all metrics', () => {
      registry.register(new Counter('test', 'Test'));
      expect(registry.getAllMetrics()).toHaveLength(1);
      
      registry.clear();
      expect(registry.getAllMetrics()).toHaveLength(0);
    });
  });

  describe('exportMetrics', () => {
    it('should export all metrics as JSON', () => {
      const counter = new Counter('counter', 'Counter');
      counter.inc(5);
      
      const histogram = new Histogram('histogram', 'Histogram');
      histogram.observe(100);
      
      registry.register(counter);
      registry.register(histogram);
      
      const exported = registry.exportMetrics();
      const data = JSON.parse(exported);
      
      expect(data.timestamp).toBeDefined();
      expect(data.metrics).toHaveLength(2);
      expect(data.metrics[0].name).toBe('counter');
      expect(data.metrics[0].value).toBe(5);
      expect(data.metrics[1].name).toBe('histogram');
      expect(data.metrics[1].count).toBe(1);
    });
  });
});

describe('PipelineMetrics', () => {
  let metrics;

  beforeEach(() => {
    metrics = new PipelineMetrics();
  });

  describe('recordEmbedding', () => {
    it('should record embedding metrics', () => {
      metrics.recordEmbedding('openai', 150, 1000, 5);
      
      const summary = metrics.getSummary();
      expect(summary.embedding.totalOperations).toBe(1);
      expect(summary.embedding.totalDuration).toBe(150);
      expect(summary.embedding.totalTokens).toBe(1000);
      expect(summary.embedding.totalBatches).toBe(5);
      expect(summary.embedding.avgDuration.mean).toBe(150);
    });

    it('should aggregate multiple embeddings', () => {
      metrics.recordEmbedding('openai', 100, 500, 2);
      metrics.recordEmbedding('openai', 200, 1000, 3);
      
      const summary = metrics.getSummary();
      expect(summary.embedding.totalOperations).toBe(2);
      expect(summary.embedding.avgDuration.mean).toBe(150);
      expect(summary.embedding.totalTokens).toBe(1500);
    });
  });

  describe('recordRetrieval', () => {
    it('should record retrieval metrics', () => {
      metrics.recordRetrieval('vector-db', 75, 10);
      
      const summary = metrics.getSummary();
      expect(summary.retrieval.totalOperations).toBe(1);
      expect(summary.retrieval.avgDuration.mean).toBe(75);
      expect(summary.retrieval.totalResults).toBe(10);
    });
  });

  describe('recordLLM', () => {
    it('should record LLM metrics', () => {
      metrics.recordLLM('gpt-4', 2000, 100, 50, false);
      
      const summary = metrics.getSummary();
      expect(summary.llm.totalOperations).toBe(1);
      expect(summary.llm.avgDuration.mean).toBe(2000);
      expect(summary.llm.avgInputTokens.mean).toBe(100);
      expect(summary.llm.avgOutputTokens.mean).toBe(50);
      expect(summary.llm.streamingOperations).toBe(0);
    });

    it('should track streaming operations', () => {
      metrics.recordLLM('gpt-4', 1500, 100, 75, true);
      
      const summary = metrics.getSummary();
      expect(summary.llm.streamingOperations).toBe(1);
    });
  });

  describe('recordMemoryUsage', () => {
    it('should record memory metrics', () => {
      // Mock process.memoryUsage
      const originalMemoryUsage = process.memoryUsage;
      process.memoryUsage = jest.fn().mockReturnValue({
        heapUsed: 100 * 1024 * 1024, // 100MB
        heapTotal: 200 * 1024 * 1024, // 200MB
        external: 10 * 1024 * 1024, // 10MB
        rss: 250 * 1024 * 1024 // 250MB
      });
      
      metrics.recordMemoryUsage();
      
      const summary = metrics.getSummary();
      expect(summary.memory.heapUsed).toBe(100 * 1024 * 1024);
      expect(summary.memory.heapTotal).toBe(200 * 1024 * 1024);
      expect(summary.memory.usagePercentage).toBe(50);
      
      // Restore original function
      process.memoryUsage = originalMemoryUsage;
    });
  });

  describe('recordError', () => {
    it('should record error metrics', () => {
      const error = new Error('Test error');
      metrics.recordError('plugin', 'embedder', 'openai', error);
      
      const summary = metrics.getSummary();
      expect(summary.errors.total).toBe(1);
      expect(summary.errors.byType.plugin).toBe(1);
      expect(summary.errors.byPlugin.embedder).toBe(1);
    });

    it('should aggregate error counts', () => {
      metrics.recordError('plugin', 'embedder', 'openai', new Error('Error 1'));
      metrics.recordError('plugin', 'embedder', 'openai', new Error('Error 2'));
      metrics.recordError('stage', 'query', null, new Error('Stage error'));
      
      const summary = metrics.getSummary();
      expect(summary.errors.total).toBe(3);
      expect(summary.errors.byType.plugin).toBe(2);
      expect(summary.errors.byType.stage).toBe(1);
    });
  });

  describe('recordOperationStart and recordOperationEnd', () => {
    it('should track operation lifecycle', () => {
      metrics.recordOperationStart('plugin', 'embedder', 'openai');
      
      // Simulate some time passing
      setTimeout(() => {
        metrics.recordOperationEnd('plugin', 'embedder', 'openai', 100, 'success');
        
        const summary = metrics.getSummary();
        expect(summary.operations.total).toBe(1);
        expect(summary.operations.successful).toBe(1);
        expect(summary.operations.failed).toBe(0);
      }, 10);
    });

    it('should track failed operations', () => {
      metrics.recordOperationStart('plugin', 'llm', 'gpt-4');
      metrics.recordOperationEnd('plugin', 'llm', 'gpt-4', 500, 'error');
      
      const summary = metrics.getSummary();
      expect(summary.operations.total).toBe(1);
      expect(summary.operations.successful).toBe(0);
      expect(summary.operations.failed).toBe(1);
    });
  });

  describe('recordConcurrency', () => {
    it('should record concurrency metrics', () => {
      metrics.recordConcurrency(5, 3);
      
      const summary = metrics.getSummary();
      expect(summary.concurrency.maxConcurrency).toBe(5);
      expect(summary.concurrency.avgConcurrency.mean).toBe(3);
    });
  });

  describe('recordBackpressure', () => {
    it('should record backpressure events', () => {
      metrics.recordBackpressure('applied', 85, 90);
      metrics.recordBackpressure('released', 60, 70);
      
      const summary = metrics.getSummary();
      expect(summary.backpressure.totalEvents).toBe(2);
      expect(summary.backpressure.appliedEvents).toBe(1);
      expect(summary.backpressure.releasedEvents).toBe(1);
      expect(summary.backpressure.avgBufferSize.mean).toBe(72.5);
    });
  });

  describe('getSummary', () => {
    it('should return comprehensive metrics summary', () => {
      // Record various metrics
      metrics.recordEmbedding('openai', 100, 500, 2);
      metrics.recordRetrieval('vector-db', 50, 5);
      metrics.recordLLM('gpt-4', 1000, 100, 50, false);
      metrics.recordError('plugin', 'embedder', 'openai', new Error('Test'));
      
      const summary = metrics.getSummary();
      
      expect(summary).toHaveProperty('embedding');
      expect(summary).toHaveProperty('retrieval');
      expect(summary).toHaveProperty('llm');
      expect(summary).toHaveProperty('memory');
      expect(summary).toHaveProperty('errors');
      expect(summary).toHaveProperty('operations');
      expect(summary).toHaveProperty('concurrency');
      expect(summary).toHaveProperty('backpressure');
      
      expect(summary.embedding.totalOperations).toBe(1);
      expect(summary.retrieval.totalOperations).toBe(1);
      expect(summary.llm.totalOperations).toBe(1);
      expect(summary.errors.total).toBe(1);
    });
  });

  describe('exportMetrics', () => {
    it('should export all metrics', () => {
      metrics.recordEmbedding('openai', 100, 500, 2);
      
      const exported = metrics.exportMetrics();
      expect(exported.timestamp).toBeDefined();
      expect(exported.summary).toBeDefined();
      expect(exported.rawMetrics).toBeDefined();
    });
  });

  describe('clearMetrics', () => {
    it('should clear all metrics', () => {
      metrics.recordEmbedding('openai', 100, 500, 2);
      expect(metrics.getSummary().embedding.totalOperations).toBe(1);
      
      metrics.clearMetrics();
      expect(metrics.getSummary().embedding.totalOperations).toBe(0);
    });
  });
});

describe('global pipelineMetrics', () => {
  it('should be a PipelineMetrics instance', () => {
    expect(pipelineMetrics).toBeInstanceOf(PipelineMetrics);
  });

  it('should be ready to use', () => {
    expect(typeof pipelineMetrics.recordEmbedding).toBe('function');
    expect(typeof pipelineMetrics.recordRetrieval).toBe('function');
    expect(typeof pipelineMetrics.recordLLM).toBe('function');
    expect(typeof pipelineMetrics.getSummary).toBe('function');
  });
});
