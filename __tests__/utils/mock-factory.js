/**
 * Centralized Mock Factory for Test Suite Stabilization
 * Batch 3: Mocks & CLI/Config - Contract alignment and centralization
 */

class MockFactory {
  /**
   * Create OpenAI LLM mock with current contract (generate method, not ask)
   */
  static createOpenAILLMMock(options = {}) {
    return {
      name: "openai-llm",
      type: "llm", // Fixed: was _type, now type
      generate: jest.fn().mockResolvedValue({
        text: options.mockResponse || "Mock LLM response",
        usage: { tokens: 150 },
        model: "gpt-3.5-turbo",
      }),
      // Legacy ask method for backward compatibility
      ask: jest
        .fn()
        .mockResolvedValue(options.mockResponse || "Mock LLM response"),
      stream: jest.fn().mockImplementation(async function* () {
        const tokens = (options.mockResponse || "Mock response").split(" ");
        for (const token of tokens) {
          yield { token, done: false };
        }
        yield { token: "", done: true };
      }),
    };
  }

  /**
   * Create Pinecone Retriever mock with current contract (retrieve method, not search)
   */
  static createPineconeRetrieverMock(options = {}) {
    return {
      name: "pinecone-retriever",
      type: "retriever", // Fixed: was _type, now type
      retrieve: jest.fn().mockResolvedValue({
        results: options.mockResults || [
          { id: "1", score: 0.95, metadata: { text: "Mock result 1" } },
          { id: "2", score: 0.87, metadata: { text: "Mock result 2" } },
        ],
        total: options.mockResults?.length || 2,
      }),
      // Legacy search method for backward compatibility
      search: jest.fn().mockResolvedValue(options.mockResults || []),
    };
  }

  /**
   * Create Reranker mock with complete contract
   */
  static createRerankerMock(options = {}) {
    return {
      name: "reranker",
      type: "reranker", // Fixed: was _type, now type
      rerank: jest.fn().mockResolvedValue({
        results: options.mockResults || [
          { id: "1", score: 0.98, text: "Reranked result 1" },
          { id: "2", score: 0.89, text: "Reranked result 2" },
        ],
      }),
    };
  }

  /**
   * Create Plugin Registry mock with proper contract validation
   */
  static createPluginRegistryMock(options = {}) {
    return {
      register: jest.fn().mockResolvedValue(true),
      get: jest.fn().mockImplementation((name) => {
        if (name === "openai-llm") return this.createOpenAILLMMock();
        if (name === "pinecone-retriever")
          return this.createPineconeRetrieverMock();
        if (name === "reranker") return this.createRerankerMock();
        return null;
      }),
      list: jest.fn().mockResolvedValue([
        { name: "openai-llm", type: "llm", version: "1.0.0" },
        { name: "pinecone-retriever", type: "retriever", version: "1.0.0" },
        { name: "reranker", type: "reranker", version: "1.0.0" },
      ]),
      validateContract: jest.fn().mockResolvedValue({
        valid: true,
        errors: [],
      }),
    };
  }

  /**
   * Create CLI Config mock with proper schema defaults
   */
  static createConfigMock(options = {}) {
    const defaultConfig = {
      plugins: [],
      pipeline: {
        stages: ["load", "embed", "store"],
        parallel: false,
      },
      llm: {
        provider: "openai",
        model: "gpt-3.5-turbo",
        temperature: 0.7,
      },
      retriever: {
        provider: "pinecone",
        topK: 5,
      },
      ...options.overrides,
    };

    return {
      load: jest.fn().mockResolvedValue(defaultConfig),
      validate: jest.fn().mockResolvedValue({
        valid: true,
        config: defaultConfig,
        errors: [],
      }),
      save: jest.fn().mockResolvedValue(true),
    };
  }

  /**
   * Create enhanced CLI mock with proper command structure
   */
  static createCLIMock(options = {}) {
    return {
      executeCommand: jest.fn().mockResolvedValue({
        success: true,
        output: options.mockOutput || "Command executed successfully",
        exitCode: 0,
      }),
      parseArgs: jest.fn().mockReturnValue({
        command: options.command || "query",
        options: options.options || {},
        flags: options.flags || [],
      }),
      showHelp: jest.fn().mockReturnValue("Mock help text"),
      validateCommand: jest.fn().mockReturnValue({
        valid: true,
        errors: [],
      }),
    };
  }
}

module.exports = MockFactory;
