/**
 * Standardized Mock Management
 * Provides consistent mock patterns across all test suites
 */

class StandardizedMocks {
  static createPipelineMock() {
    return {
      ingest: jest
        .fn()
        .mockResolvedValue({ success: true, documentsProcessed: 5 }),
      query: jest.fn().mockResolvedValue({
        success: true,
        results: [{ content: "test result", score: 0.95 }],
      }),
      getMetrics: jest.fn().mockReturnValue({
        totalDocuments: 5,
        averageProcessingTime: 100,
      }),
    };
  }

  static createRegistryMock() {
    const mockRegistry = {
      get: jest.fn(),
      register: jest.fn(),
      list: jest.fn().mockReturnValue(["default"]),
    };

    // Setup default plugin returns
    mockRegistry.get.mockImplementation((type, name) => {
      const plugins = {
        loader: {
          load: jest.fn().mockResolvedValue([{ content: "test doc" }]),
        },
        embedder: { embed: jest.fn().mockResolvedValue([0.1, 0.2, 0.3]) },
        retriever: {
          retrieve: jest.fn().mockResolvedValue([{ content: "result" }]),
        },
        llm: { generate: jest.fn().mockResolvedValue("test response") },
        reranker: {
          rerank: jest.fn().mockResolvedValue([{ content: "ranked" }]),
        },
      };
      return plugins[type] || {};
    });

    return mockRegistry;
  }

  static createPerformanceBenchmarkMock() {
    return jest.fn().mockImplementation(() => ({
      start: jest.fn(),
      end: jest.fn(),
      getMetrics: jest.fn().mockReturnValue({
        duration: 100,
        memoryUsage: 50,
        throughput: 10,
      }),
      reset: jest.fn(),
    }));
  }

  static createAIMockSuite() {
    return {
      multiModalProcessor: {
        processText: jest.fn().mockResolvedValue({ processed: true }),
        processImage: jest.fn().mockResolvedValue({ processed: true }),
        processAudio: jest.fn().mockResolvedValue({ processed: true }),
      },
      federatedLearning: {
        trainModel: jest.fn().mockResolvedValue({ success: true }),
        aggregateWeights: jest.fn().mockResolvedValue({ weights: [] }),
      },
    };
  }

  static createSecurityMocks() {
    return {
      sanitizer: {
        sanitize: jest.fn().mockImplementation((data) => {
          if (typeof data === "string") {
            return data.replace(/sk-[a-zA-Z0-9]+/g, "sk-***REDACTED***");
          }
          return data;
        }),
      },
      validator: {
        validate: jest.fn().mockReturnValue({ valid: true, errors: [] }),
      },
    };
  }

  static setupTestSuite(testType) {
    const mocks = {
      registry: this.createRegistryMock(),
      pipeline: this.createPipelineMock(),
      PerformanceBenchmark: this.createPerformanceBenchmarkMock(),
    };

    switch (testType) {
      case "ai":
        Object.assign(mocks, this.createAIMockSuite());
        break;
      case "security":
        Object.assign(mocks, this.createSecurityMocks());
        break;
      case "performance":
        // Additional performance-specific mocks
        mocks.performanceMonitor = {
          track: jest.fn(),
          getReport: jest.fn().mockReturnValue({ metrics: {} }),
        };
        break;
    }

    return mocks;
  }

  static resetAllMocks(mocks) {
    Object.values(mocks).forEach((mock) => {
      if (mock && typeof mock.mockReset === "function") {
        mock.mockReset();
      } else if (mock && typeof mock === "object") {
        Object.values(mock).forEach((nestedMock) => {
          if (nestedMock && typeof nestedMock.mockReset === "function") {
            nestedMock.mockReset();
          }
        });
      }
    });
  }
}

module.exports = { StandardizedMocks };
