/**
 * Test helper utilities for enhanced test suite
 * Provides common utilities for streaming, mocking, and validation
 */

class StreamingTestHelper {
  /**
   * Collect all tokens from an async stream
   */
  static async collectStreamTokens(stream) {
    const tokens = [];
    try {
      for await (const chunk of stream) {
        tokens.push(chunk);
      }
    } catch (error) {
      tokens.push({ error: error.message, done: true });
    }
    return tokens;
  }

  /**
   * Create a mock stream with specified tokens and delays
   */
  static createMockStream(tokens, delay = 10) {
    return async function* () {
      for (let i = 0; i < tokens.length; i++) {
        await new Promise((resolve) => setTimeout(resolve, delay));
        yield {
          token: tokens[i],
          done: i === tokens.length - 1,
          index: i,
        };
      }
    };
  }

  /**
   * Simulate stream interruption for testing error handling
   */
  static async simulateStreamInterruption(stream, interruptAfter = 2) {
    const tokens = [];
    const iterator = stream[Symbol.asyncIterator]();

    try {
      for (let i = 0; i < interruptAfter; i++) {
        const { value, done } = await iterator.next();
        tokens.push(value);
        if (done) break;
      }

      // Simulate interruption
      if (iterator.return) {
        await iterator.return();
      }
    } catch (error) {
      tokens.push({ error: error.message });
    }

    return tokens;
  }

  /**
   * Measure streaming performance metrics
   */
  static async measureStreamPerformance(stream) {
    const startTime = Date.now();
    let tokenCount = 0;
    let totalBytes = 0;

    for await (const chunk of stream) {
      tokenCount++;
      totalBytes += JSON.stringify(chunk).length;
    }

    const endTime = Date.now();
    const duration = endTime - startTime;

    return {
      duration,
      tokenCount,
      totalBytes,
      tokensPerSecond: tokenCount / (duration / 1000),
      bytesPerSecond: totalBytes / (duration / 1000),
    };
  }
}

class MockFactory {
  /**
   * Create a mock LLM with configurable behavior
   */
  static createMockLLM(options = {}) {
    const {
      shouldFail = false,
      failAfterTokens = 0,
      responseDelay = 10,
      tokenDelay = 5,
    } = options;

    return {
      async generate(prompt, opts = {}) {
        if (shouldFail && failAfterTokens === 0) {
          throw new Error("Mock LLM failure");
        }

        await new Promise((resolve) => setTimeout(resolve, responseDelay));

        if (opts.stream) {
          return this.generateStream(prompt, {
            shouldFail,
            failAfterTokens,
            tokenDelay,
          });
        }

        return {
          text: `Mock response to: "${prompt}"`,
          usage: { promptTokens: 10, completionTokens: 20, totalTokens: 30 },
          model: "mock-llm",
        };
      },

      async *generateStream(prompt, streamOptions = {}) {
        const tokens = ["Mock", " response", " to:", ` "${prompt}"`];

        for (let i = 0; i < tokens.length; i++) {
          const token = tokens[i];

          if (
            streamOptions.failAfterTokens &&
            i >= streamOptions.failAfterTokens
          ) {
            throw new Error("Mock streaming failure after tokens");
          }

          // Remove delays in test environment for faster execution
          if (
            streamOptions.tokenDelay &&
            process.env.NODE_ENV !== "test" &&
            !process.env.CI
          ) {
            await new Promise((resolve) =>
              setTimeout(resolve, streamOptions.tokenDelay),
            );
          }

          yield token;
        }

        yield { token: "", done: true };
      },
    };
  }

  /**
   * Create a mock retriever with configurable data
   */
  static createMockRetriever(documents = []) {
    const store = [...documents];

    return {
      async store(vectors) {
        store.push(...vectors);
        return { stored: vectors.length };
      },

      async retrieve(queryVector, options = {}) {
        const { topK = 5, threshold = 0.0 } = options;

        return store
          .map((doc, index) => ({
            ...doc,
            score: Math.random() * 0.4 + 0.6, // 0.6-1.0 range
            index,
          }))
          .filter((doc) => doc.score >= threshold)
          .sort((a, b) => b.score - a.score)
          .slice(0, topK);
      },
    };
  }

  /**
   * Create a mock reranker with configurable scoring
   */
  static createMockReranker(options = {}) {
    const { shouldFail = false, scoringFunction = null } = options;

    return {
      async rerank(query, documents, opts = {}) {
        if (shouldFail) {
          throw new Error("Mock reranker failure");
        }

        const { topK = documents.length } = opts;

        return documents
          .map((doc, index) => ({
            ...doc,
            relevanceScore: scoringFunction
              ? scoringFunction(query, doc)
              : Math.random() * 0.5 + 0.5,
            originalIndex: index,
          }))
          .sort((a, b) => b.relevanceScore - a.relevanceScore)
          .slice(0, topK);
      },
    };
  }
}

class TestDataGenerator {
  /**
   * Generate realistic test documents
   */
  static generateDocuments(count = 10, options = {}) {
    const { minLength = 50, maxLength = 500, includeMetadata = true } = options;

    const topics = [
      "AI",
      "machine learning",
      "data science",
      "programming",
      "technology",
    ];
    const documents = [];

    for (let i = 0; i < count; i++) {
      const topic = topics[i % topics.length];
      const targetLength =
        Math.floor(Math.random() * (maxLength - minLength)) + minLength;

      // Generate content of desired length
      let content = `This is a document about ${topic}. It contains relevant information for testing purposes. Document ${i} has unique content that can be used for retrieval and reranking tests.`;

      // Pad content to reach target length
      while (content.length < targetLength) {
        content += ` Additional content about ${topic} with more details and information for testing purposes.`;
      }
      content = content.substring(0, targetLength);

      const document = {
        id: `doc-${i}`,
        content,
      };

      if (includeMetadata) {
        document.metadata = {
          topic,
          length:
            targetLength < 200
              ? "short"
              : targetLength < 1000
                ? "medium"
                : "long",
          created: new Date(
            Date.now() - Math.random() * 86400000,
          ).toISOString(),
        };
      }

      documents.push(document);
    }

    return documents;
  }

  /**
   * Generate test tokens for streaming tests
   */
  static generateTokens(count) {
    return Array.from({ length: count }, (_, i) => `token_${i}`);
  }

  /**
   * Generate test vectors for embedding tests
   */
  static generateVectors(count = 10, dimensions = 1536) {
    return Array.from({ length: count }, (_, i) => ({
      id: `vector-${i}`,
      values: Array.from({ length: dimensions }, () => Math.random() - 0.5),
      metadata: { index: i, type: "test" },
    }));
  }

  /**
   * Generate a single test vector for embedding tests
   */
  static generateVector(dimensions = 1536) {
    return Array.from({ length: dimensions }, () => Math.random() - 0.5);
  }

  /**
   * Generate test queries with expected results
   */
  static generateTestQueries() {
    return [
      {
        query: "What is machine learning?",
        expectedTopics: ["AI", "machine learning"],
        expectedMinResults: 2,
      },
      {
        query: "Programming best practices",
        expectedTopics: ["programming", "technology"],
        expectedMinResults: 1,
      },
      {
        query: "Data analysis techniques",
        expectedTopics: ["data science"],
        expectedMinResults: 1,
      },
    ];
  }
}

class ValidationHelper {
  /**
   * Validate streaming response format
   */
  static validateStreamingResponse(tokens) {
    const errors = [];

    if (!Array.isArray(tokens)) {
      errors.push("Tokens must be an array");
      return errors;
    }

    if (tokens.length === 0) {
      errors.push("Stream must contain at least one token");
      return errors;
    }

    const lastToken = tokens[tokens.length - 1];
    if (!lastToken.done) {
      errors.push("Last token must have done: true");
    }

    // Check for required properties
    tokens.forEach((token, index) => {
      if (typeof token.token !== "string") {
        errors.push(`Token ${index} must have string token property`);
      }
      if (typeof token.done !== "boolean") {
        errors.push(`Token ${index} must have boolean done property`);
      }
    });

    return errors;
  }

  /**
   * Validate plugin contract compliance
   */
  static validatePluginContract(plugin, type) {
    const errors = [];
    const requiredMethods = {
      llm: ["generate"],
      retriever: ["store", "retrieve"],
      reranker: ["rerank"],
      embedder: ["embed"],
    };

    const methods = requiredMethods[type];
    if (!methods) {
      errors.push(`Unknown plugin type: ${type}`);
      return errors;
    }

    methods.forEach((method) => {
      if (typeof plugin[method] !== "function") {
        errors.push(`Plugin must implement ${method}() method`);
      }
    });

    return errors;
  }

  /**
   * Validate DAG structure
   */
  static validateDAGStructure(dag) {
    const errors = [];

    if (dag.nodes.size === 0) {
      errors.push("DAG cannot be empty");
      return errors;
    }

    // Check for cycles using DFS
    const visited = new Set();
    const recursionStack = new Set();

    const hasCycle = (nodeId) => {
      if (recursionStack.has(nodeId)) {
        errors.push(`Cycle detected involving node: ${nodeId}`);
        return true;
      }

      if (visited.has(nodeId)) {
        return false;
      }

      visited.add(nodeId);
      recursionStack.add(nodeId);

      const node = dag.nodes.get(nodeId);
      if (node && node.outputs) {
        for (const output of node.outputs) {
          if (hasCycle(output.id)) {
            return true;
          }
        }
      }

      recursionStack.delete(nodeId);
      return false;
    };

    for (const nodeId of dag.nodes.keys()) {
      if (!visited.has(nodeId)) {
        hasCycle(nodeId);
      }
    }

    return errors;
  }
}

class PerformanceHelper {
  constructor(name) {
    this.name = name;
    this.startTime = null;
    this.endTime = null;
  }

  /**
   * Start the benchmark timer
   */
  start() {
    this.startTime = process.hrtime.bigint();
    return this;
  }

  /**
   * Stop the benchmark timer and return duration
   */
  stop() {
    this.endTime = process.hrtime.bigint();
    return this.getDuration();
  }

  /**
   * Get the duration in milliseconds
   */
  getDuration() {
    if (!this.startTime || !this.endTime) {
      return 0;
    }
    return Number(this.endTime - this.startTime) / 1000000;
  }

  /**
   * Measure execution time of async functions
   */
  static async measureExecutionTime(fn) {
    const startTime = process.hrtime.bigint();
    const result = await fn();
    const endTime = process.hrtime.bigint();

    return {
      result,
      duration: Number(endTime - startTime) / 1000000, // Convert to milliseconds
      timestamp: Date.now(),
    };
  }

  /**
   * Monitor memory usage during test execution
   */
  static monitorMemoryUsage(testFn) {
    return async (...args) => {
      const initialMemory = process.memoryUsage();
      const result = await testFn(...args);
      const finalMemory = process.memoryUsage();

      return {
        result,
        memoryDelta: {
          heapUsed: finalMemory.heapUsed - initialMemory.heapUsed,
          heapTotal: finalMemory.heapTotal - initialMemory.heapTotal,
          external: finalMemory.external - initialMemory.external,
        },
      };
    };
  }

  /**
   * Create a performance benchmark suite
   */
  static createBenchmark(name, iterations = 100) {
    const results = [];

    return {
      async run(testFn) {
        for (let i = 0; i < iterations; i++) {
          const measurement = await this.measureExecutionTime(testFn);
          results.push(measurement.duration);
        }

        return this.getStatistics();
      },

      getStatistics() {
        const sorted = results.sort((a, b) => a - b);
        const sum = results.reduce((a, b) => a + b, 0);

        return {
          name,
          iterations,
          min: sorted[0],
          max: sorted[sorted.length - 1],
          mean: sum / results.length,
          median: sorted[Math.floor(sorted.length / 2)],
          p95: sorted[Math.floor(sorted.length * 0.95)],
          p99: sorted[Math.floor(sorted.length * 0.99)],
        };
      },
    };
  }
}

class ErrorSimulator {
  /**
   * Create functions that fail in specific ways
   */
  static createFailingFunction(errorType, options = {}) {
    const { delay = 0, message = "Simulated error" } = options;

    return async (...args) => {
      if (delay > 0) {
        await new Promise((resolve) => setTimeout(resolve, delay));
      }

      switch (errorType) {
        case "timeout": {
          await new Promise(() => {}); // Never resolves
          break;
        }
        case "network": {
          const networkError = new Error(
            message || "Network connection failed",
          );
          networkError.code = "ECONNREFUSED";
          return networkError;
        }
        case "rate-limit": {
          const rateLimitError = new Error("Rate limit exceeded");
          rateLimitError.status = 429;
          throw rateLimitError;
        }
        case "auth": {
          const authError = new Error(message || "Authentication failed");
          authError.status = 401;
          return authError;
        }
        default:
          throw new Error(message);
      }
    };
  }

  /**
   * Create intermittent failure function
   */
  static createFlakyFunction(successRate = 0.7, options = {}) {
    let attempts = 0;

    return async (...args) => {
      attempts++;

      if (Math.random() > successRate) {
        throw new Error(`Flaky failure on attempt ${attempts}`);
      }

      return options.returnValue || `Success on attempt ${attempts}`;
    };
  }
}

// Create alias for backward compatibility
const PerformanceBenchmark = PerformanceHelper;

const TestHelpers = {
  StreamingTestHelper,
  MockFactory,
  TestDataGenerator,
  ValidationHelper,
  PerformanceHelper,
  PerformanceBenchmark,
  ErrorSimulator,
};

module.exports = TestHelpers;
