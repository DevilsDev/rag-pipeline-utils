# Performance Optimization Guide

This comprehensive performance guide helps you optimize **@DevilsDev/rag-pipeline-utils** for maximum throughput, minimal latency, and efficient resource utilization. From embedding generation to vector retrieval and LLM inference, this guide covers optimization strategies for every component.

---

## 🚀 **Performance Overview**

### **Key Performance Metrics**

- **Throughput**: Documents processed per second
- **Latency**: Time from query to response
- **Memory Usage**: RAM consumption during processing
- **Token Efficiency**: Cost optimization for LLM usage
- **Concurrent Processing**: Parallel operation capabilities

### **Performance Monitoring**

```bash
# Enable performance monitoring
rag-pipeline query "test" --benchmark --stats

# Comprehensive performance analysis
rag-pipeline benchmark --comprehensive --output perf-report.json

# Real-time monitoring
rag-pipeline monitor --metrics throughput,latency,memory --interval 5s
```

---

## 📊 **Component-Specific Optimization**

### **1. Embedding Performance**

**Batch Processing Optimization**:
```javascript
import { createRagPipeline } from '@DevilsDev/rag-pipeline-utils';

const pipeline = createRagPipeline({
  embedder: {
    name: 'openai',
    config: {
      batchSize: 100,           // Process 100 texts at once
      maxConcurrency: 5,        // 5 parallel API calls
      timeout: 30000,           // 30 second timeout
      retryAttempts: 3,         // Retry failed requests
      cacheEnabled: true,       // Cache embeddings
      cacheSize: 10000         // Cache up to 10k embeddings
    }
  }
});
```

**Parallel Embedding Strategy**:
```javascript
// Custom parallel embedding implementation
class OptimizedEmbedder extends BaseEmbedder {
  constructor(options = {}) {
    super();
    this.concurrencyLimit = options.concurrency || 5;
    this.batchSize = options.batchSize || 50;
    this.cache = new LRUCache({ max: options.cacheSize || 5000 });
  }

  async embedBatch(texts, options = {}) {
    // Filter cached texts
    const uncachedTexts = texts.filter(text => !this.cache.has(text));
    
    if (uncachedTexts.length === 0) {
      return texts.map(text => this.cache.get(text));
    }

    // Create batches for parallel processing
    const batches = this.createBatches(uncachedTexts, this.batchSize);
    
    // Process batches with concurrency limit
    const results = await this.processBatchesParallel(batches, {
      concurrency: this.concurrencyLimit,
      retryOnFailure: true
    });

    // Cache results
    results.forEach((embedding, index) => {
      this.cache.set(uncachedTexts[index], embedding);
    });

    return texts.map(text => this.cache.get(text));
  }

  async processBatchesParallel(batches, options) {
    const semaphore = new Semaphore(options.concurrency);
    
    return Promise.all(
      batches.map(async (batch) => {
        await semaphore.acquire();
        try {
          return await this.processBatch(batch);
        } finally {
          semaphore.release();
        }
      })
    );
  }
}
```

**Embedding Benchmarks**:
```bash
# Benchmark different embedding strategies
rag-pipeline benchmark embedder \
  --texts 1000 \
  --batch-sizes 10,50,100,200 \
  --concurrency-levels 1,3,5,10 \
  --output embedding-benchmark.json
```

### **2. Vector Retrieval Optimization**

**Index Configuration**:
```javascript
const pipeline = createRagPipeline({
  retriever: {
    name: 'pinecone',
    config: {
      indexType: 'approximateSearch',  // Faster but less precise
      dimensions: 1536,
      metric: 'cosine',
      pods: 1,
      replicas: 1,
      podType: 'p1.x1',              // Optimize for your workload
      
      // Query optimization
      topK: 5,                       // Limit results
      includeMetadata: false,        // Reduce payload size
      includeValues: false,          // Reduce payload size
      
      // Connection pooling
      maxConnections: 10,
      keepAlive: true,
      timeout: 5000
    }
  }
});
```

**Query Optimization**:
```javascript
// Optimized retrieval with filtering
async function optimizedRetrieve(query, options = {}) {
  const queryVector = await this.embedder.embed(query);
  
  return await this.retriever.retrieve(queryVector, {
    topK: options.topK || 5,
    filter: options.filter,           // Pre-filter to reduce search space
    includeMetadata: options.includeMetadata || false,
    namespace: options.namespace,     // Use namespaces for isolation
    
    // Performance optimizations
    approximateSearch: true,          // Trade accuracy for speed
    searchTimeout: 2000,             // 2 second timeout
    maxRetries: 2
  });
}
```

**Vector Store Benchmarks**:
```bash
# Compare vector store performance
rag-pipeline benchmark retriever \
  --stores pinecone,chroma,weaviate \
  --queries 500 \
  --concurrent 10 \
  --metrics latency,throughput,accuracy
```

### **3. LLM Generation Optimization**

**Model Selection Strategy**:
```javascript
// Choose optimal model for use case
const modelConfigs = {
  'fast-responses': {
    name: 'openai-gpt-3.5-turbo',
    config: {
      maxTokens: 500,
      temperature: 0.3,
      topP: 0.9,
      frequencyPenalty: 0.1
    }
  },
  'high-quality': {
    name: 'openai-gpt-4',
    config: {
      maxTokens: 1500,
      temperature: 0.7,
      topP: 0.95
    }
  },
  'cost-optimized': {
    name: 'openai-gpt-3.5-turbo',
    config: {
      maxTokens: 300,
      temperature: 0.1,
      stop: ['\n\n', '###']
    }
  }
};
```

**Streaming Optimization**:
```javascript
// Implement streaming for better perceived performance
async function* optimizedGenerate(prompt, options = {}) {
  const stream = await this.llm.generateStream(prompt, {
    ...options,
    bufferSize: 10,           // Buffer tokens for smoother streaming
    flushInterval: 50,        // Flush every 50ms
    earlyStop: true          // Stop on complete sentences
  });

  let buffer = '';
  for await (const token of stream) {
    buffer += token;
    
    // Flush on sentence boundaries for better UX
    if (buffer.match(/[.!?]\s/)) {
      yield buffer;
      buffer = '';
    }
  }
  
  if (buffer) yield buffer;
}
```

**Token Usage Optimization**:
```javascript
// Optimize prompts for token efficiency
class TokenOptimizer {
  constructor(tokenizer) {
    this.tokenizer = tokenizer;
    this.maxContextTokens = 4096;
    this.maxResponseTokens = 1000;
  }

  optimizePrompt(context, query) {
    const basePrompt = `Context: {context}\n\nQuestion: ${query}\n\nAnswer:`;
    const baseTokens = this.tokenizer.encode(basePrompt.replace('{context}', '')).length;
    const availableTokens = this.maxContextTokens - baseTokens - this.maxResponseTokens;
    
    // Truncate context to fit token limit
    const optimizedContext = this.truncateContext(context, availableTokens);
    
    return basePrompt.replace('{context}', optimizedContext);
  }

  truncateContext(context, maxTokens) {
    const sentences = context.split(/[.!?]+/);
    let truncated = '';
    let tokenCount = 0;
    
    for (const sentence of sentences) {
      const sentenceTokens = this.tokenizer.encode(sentence).length;
      if (tokenCount + sentenceTokens > maxTokens) break;
      
      truncated += sentence + '.';
      tokenCount += sentenceTokens;
    }
    
    return truncated;
  }
}
```

---

## 🔄 **Pipeline-Level Optimization**

### **Streaming Architecture**

```javascript
// Implement full pipeline streaming
class StreamingPipeline {
  constructor(config) {
    this.config = config;
    this.bufferSize = config.bufferSize || 1000;
    this.concurrency = config.concurrency || 3;
  }

  async* processStream(documents) {
    const documentStream = this.createDocumentStream(documents);
    const chunkStream = this.createChunkStream(documentStream);
    const embeddingStream = this.createEmbeddingStream(chunkStream);
    
    for await (const batch of embeddingStream) {
      // Process embeddings in parallel
      const results = await Promise.allSettled(
        batch.map(item => this.processEmbedding(item))
      );
      
      yield results.filter(r => r.status === 'fulfilled').map(r => r.value);
    }
  }

  async* createChunkStream(documentStream) {
    let buffer = [];
    
    for await (const document of documentStream) {
      const chunks = await this.chunkDocument(document);
      buffer.push(...chunks);
      
      if (buffer.length >= this.bufferSize) {
        yield buffer.splice(0, this.bufferSize);
      }
    }
    
    if (buffer.length > 0) yield buffer;
  }
}
```

### **Memory Management**

```javascript
// Implement memory-efficient processing
class MemoryOptimizedPipeline {
  constructor(options = {}) {
    this.maxMemoryUsage = options.maxMemory || '2GB';
    this.gcThreshold = options.gcThreshold || 0.8;
    this.batchSize = options.batchSize || 100;
  }

  async processLargeDataset(documents) {
    const batches = this.createBatches(documents, this.batchSize);
    
    for (const batch of batches) {
      // Monitor memory usage
      const memoryUsage = process.memoryUsage();
      const memoryPercent = memoryUsage.heapUsed / memoryUsage.heapTotal;
      
      if (memoryPercent > this.gcThreshold) {
        // Force garbage collection
        if (global.gc) global.gc();
        
        // Reduce batch size if memory pressure continues
        if (memoryPercent > 0.9) {
          this.batchSize = Math.max(10, Math.floor(this.batchSize * 0.8));
        }
      }
      
      await this.processBatch(batch);
      
      // Clear batch references
      batch.length = 0;
    }
  }
}
```

### **Caching Strategy**

```javascript
// Multi-level caching implementation
class CacheManager {
  constructor(options = {}) {
    // L1: In-memory cache (fastest)
    this.l1Cache = new LRUCache({ 
      max: options.l1Size || 1000,
      ttl: options.l1TTL || 300000 // 5 minutes
    });
    
    // L2: Redis cache (shared across instances)
    this.l2Cache = new RedisCache({
      host: options.redisHost,
      ttl: options.l2TTL || 3600000 // 1 hour
    });
    
    // L3: Disk cache (persistent)
    this.l3Cache = new DiskCache({
      directory: options.cacheDir || './cache',
      maxSize: options.l3Size || '1GB'
    });
  }

  async get(key) {
    // Try L1 first
    let value = this.l1Cache.get(key);
    if (value) return value;
    
    // Try L2
    value = await this.l2Cache.get(key);
    if (value) {
      this.l1Cache.set(key, value);
      return value;
    }
    
    // Try L3
    value = await this.l3Cache.get(key);
    if (value) {
      this.l1Cache.set(key, value);
      this.l2Cache.set(key, value);
      return value;
    }
    
    return null;
  }

  async set(key, value) {
    this.l1Cache.set(key, value);
    await this.l2Cache.set(key, value);
    await this.l3Cache.set(key, value);
  }
}
```

---

## 📈 **Monitoring & Profiling**

### **Performance Metrics Collection**

```javascript
// Built-in performance monitoring
import { createPerformanceMonitor } from '@DevilsDev/rag-pipeline-utils';

const monitor = createPerformanceMonitor({
  metrics: ['throughput', 'latency', 'memory', 'tokens', 'errors'],
  interval: 1000,           // Collect every second
  retention: 3600,          // Keep 1 hour of data
  alerts: {
    highLatency: { threshold: 5000, action: 'log' },
    memoryUsage: { threshold: 0.9, action: 'gc' },
    errorRate: { threshold: 0.05, action: 'alert' }
  }
});

const pipeline = createRagPipeline({
  monitor,
  // ... other config
});

// Access performance data
const metrics = monitor.getMetrics();
console.log('Average latency:', metrics.latency.average);
console.log('Throughput:', metrics.throughput.current);
```

### **Profiling Tools**

```bash
# Profile memory usage
node --inspect --max-old-space-size=4096 rag-pipeline ingest ./large-dataset

# Profile CPU usage
rag-pipeline benchmark --profile-cpu --output cpu-profile.json

# Generate performance report
rag-pipeline analyze-performance \
  --input performance-logs.json \
  --output performance-report.html \
  --include-recommendations
```

### **Custom Metrics**

```javascript
// Define custom performance metrics
class CustomMetrics {
  constructor() {
    this.metrics = new Map();
    this.startTimes = new Map();
  }

  startTimer(operation) {
    this.startTimes.set(operation, Date.now());
  }

  endTimer(operation) {
    const startTime = this.startTimes.get(operation);
    if (startTime) {
      const duration = Date.now() - startTime;
      this.recordMetric(operation, duration);
      this.startTimes.delete(operation);
    }
  }

  recordMetric(name, value) {
    if (!this.metrics.has(name)) {
      this.metrics.set(name, []);
    }
    this.metrics.get(name).push({
      value,
      timestamp: Date.now()
    });
  }

  getStats(name) {
    const values = this.metrics.get(name) || [];
    if (values.length === 0) return null;
    
    const nums = values.map(v => v.value);
    return {
      count: nums.length,
      average: nums.reduce((a, b) => a + b, 0) / nums.length,
      min: Math.min(...nums),
      max: Math.max(...nums),
      p95: this.percentile(nums, 0.95),
      p99: this.percentile(nums, 0.99)
    };
  }
}
```

---

## ⚡ **Production Optimization**

### **Deployment Configuration**

```yaml
# Docker optimization
FROM node:18-alpine
WORKDIR /app

# Optimize Node.js for production
ENV NODE_ENV=production
ENV NODE_OPTIONS="--max-old-space-size=4096 --optimize-for-size"

# Install dependencies
COPY package*.json ./
RUN npm ci --only=production --no-audit

# Copy application
COPY . .

# Optimize startup
CMD ["node", "--experimental-worker", "index.js"]
```

### **Load Balancing**

```javascript
// Horizontal scaling with load balancing
class LoadBalancer {
  constructor(instances) {
    this.instances = instances;
    this.currentIndex = 0;
    this.healthChecks = new Map();
  }

  async getHealthyInstance() {
    const startIndex = this.currentIndex;
    
    do {
      const instance = this.instances[this.currentIndex];
      this.currentIndex = (this.currentIndex + 1) % this.instances.length;
      
      if (await this.isHealthy(instance)) {
        return instance;
      }
    } while (this.currentIndex !== startIndex);
    
    throw new Error('No healthy instances available');
  }

  async isHealthy(instance) {
    try {
      const response = await instance.healthCheck();
      return response.status === 'healthy';
    } catch (error) {
      return false;
    }
  }
}
```

### **Auto-scaling Configuration**

```javascript
// Auto-scaling based on load
class AutoScaler {
  constructor(options = {}) {
    this.minInstances = options.min || 1;
    this.maxInstances = options.max || 10;
    this.targetCPU = options.targetCPU || 0.7;
    this.scaleUpThreshold = options.scaleUpThreshold || 0.8;
    this.scaleDownThreshold = options.scaleDownThreshold || 0.3;
    this.instances = [];
  }

  async monitor() {
    const metrics = await this.collectMetrics();
    const avgCPU = metrics.cpu.average;
    const avgMemory = metrics.memory.average;
    
    if (avgCPU > this.scaleUpThreshold && this.instances.length < this.maxInstances) {
      await this.scaleUp();
    } else if (avgCPU < this.scaleDownThreshold && this.instances.length > this.minInstances) {
      await this.scaleDown();
    }
  }

  async scaleUp() {
    const newInstance = await this.createInstance();
    this.instances.push(newInstance);
    console.log(`Scaled up to ${this.instances.length} instances`);
  }

  async scaleDown() {
    const instance = this.instances.pop();
    await this.terminateInstance(instance);
    console.log(`Scaled down to ${this.instances.length} instances`);
  }
}
```

---

## 🎯 **Performance Best Practices**

### **1. Configuration Optimization**

```json
{
  "performance": {
    "embedder": {
      "batchSize": 100,
      "maxConcurrency": 5,
      "cacheEnabled": true,
      "timeout": 30000
    },
    "retriever": {
      "topK": 5,
      "approximateSearch": true,
      "connectionPoolSize": 10
    },
    "llm": {
      "maxTokens": 1000,
      "temperature": 0.3,
      "streaming": true
    },
    "pipeline": {
      "parallelProcessing": true,
      "memoryLimit": "2GB",
      "gcThreshold": 0.8
    }
  }
}
```

### **2. Resource Management**

- **Memory**: Use streaming for large datasets
- **CPU**: Leverage parallel processing
- **Network**: Implement connection pooling
- **Storage**: Use appropriate caching strategies

### **3. Monitoring Checklist**

- [ ] Track response latency (target: less than 2s)
- [ ] Monitor throughput (documents/second)
- [ ] Watch memory usage (keep under 80%)
- [ ] Monitor error rates (keep under 1%)
- [ ] Track token usage costs
- [ ] Set up alerting for anomalies

---

## 📊 **Performance Benchmarks**

### **Reference Performance**

| Component | Throughput | Latency (P95) | Memory Usage |
|-----------|------------|---------------|--------------|
| PDF Loader | 50 docs/sec | 200ms | 100MB |
| OpenAI Embedder | 1000 texts/sec | 500ms | 50MB |
| Pinecone Retriever | 500 queries/sec | 100ms | 25MB |
| GPT-4 Generation | 10 queries/sec | 3000ms | 75MB |

### **Optimization Targets**

- **Embedding**: >500 texts/second
- **Retrieval**: <200ms P95 latency
- **Generation**: <5s P95 latency
- **Memory**: <1GB for 10k documents
- **Error Rate**: <0.5%

---

*This performance guide provides comprehensive optimization strategies for @DevilsDev/rag-pipeline-utils. For troubleshooting performance issues, see the [Troubleshooting Guide](./Troubleshooting.md).*
