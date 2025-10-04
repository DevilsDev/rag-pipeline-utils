/**
 * Test suite for external API mocking to reduce test flakiness
 * Addresses P2 risk: Test Flakiness from anti-pattern review
 */

const {
  MockOpenAI,
  MockAzureOpenAI,
  MockPinecone,
  MockChroma,
  MockHttpClient,
  NetworkSimulator,
  TestMockUtils,
} = require("../mocks/external-apis");

describe("External API Mocking", () => {
  describe("MockOpenAI", () => {
    let mockOpenAI;

    beforeEach(() => {
      mockOpenAI = new MockOpenAI();
    });

    test("should generate consistent embeddings", async () => {
      const input = ["test text", "another test"];
      const result = await mockOpenAI.embeddings.create({ input });

      expect(result.object).toBe("list");
      expect(result.data).toHaveLength(2);
      expect(result.data[0].embedding).toHaveLength(1536);
      expect(result.data[0].object).toBe("embedding");
      expect(result.usage.prompt_tokens).toBeGreaterThan(0);
    });

    test("should handle chat completions", async () => {
      const messages = [{ role: "user", content: "Hello" }];
      const result = await mockOpenAI.chat.completions.create({ messages });

      expect(result.object).toBe("chat.completion");
      expect(result.choices[0].message.role).toBe("assistant");
      expect(result.choices[0].message.content).toContain("Mock response");
      expect(result.usage.total_tokens).toBeGreaterThan(0);
    });

    test("should handle streaming completions", async () => {
      const messages = [{ role: "user", content: "Stream test" }];
      const stream = await mockOpenAI.chat.completions.create({
        messages,
        stream: true,
      });

      const chunks = [];
      for await (const chunk of stream) {
        chunks.push(chunk);
      }

      expect(chunks.length).toBeGreaterThan(1);
      expect(chunks[chunks.length - 1].choices[0].finish_reason).toBe("stop");
    });
  });

  describe("MockPinecone", () => {
    let mockPinecone;
    let index;

    beforeEach(() => {
      mockPinecone = new MockPinecone();
      index = mockPinecone.index("test-index");
    });

    test("should upsert vectors", async () => {
      const vectors = [
        {
          id: "vec1",
          values: Array.from({ length: 1536 }, () => Math.random()),
          metadata: { text: "test document" },
        },
      ];

      const result = await index.upsert({ vectors });
      expect(result.upsertedCount).toBe(1);
    });

    test("should query vectors with similarity scores", async () => {
      // First upsert some vectors
      const vectors = [
        {
          id: "vec1",
          values: Array.from({ length: 1536 }, () => Math.random()),
          metadata: { text: "document 1" },
        },
        {
          id: "vec2",
          values: Array.from({ length: 1536 }, () => Math.random()),
          metadata: { text: "document 2" },
        },
      ];
      await index.upsert({ vectors });

      const queryVector = Array.from({ length: 1536 }, () => Math.random());
      const result = await index.query({ vector: queryVector, topK: 5 });

      expect(result.matches).toHaveLength(2);
      expect(result.matches[0].score).toBeGreaterThanOrEqual(0.5);
      expect(result.matches[0].id).toBeDefined();
    });
  });

  describe("MockChroma", () => {
    let mockChroma;
    let collection;

    beforeEach(() => {
      mockChroma = new MockChroma();
      collection = mockChroma.getOrCreateCollection({
        name: "test-collection",
      });
    });

    test("should add documents to collection", async () => {
      const ids = ["doc1", "doc2"];
      const documents = ["First document", "Second document"];
      const embeddings = [
        Array.from({ length: 384 }, () => Math.random()),
        Array.from({ length: 384 }, () => Math.random()),
      ];
      const metadatas = [{ source: "test1" }, { source: "test2" }];

      await collection.add({ ids, documents, embeddings, metadatas });

      // Verify the mock was called
      expect(collection.add).toHaveBeenCalledWith({
        ids,
        documents,
        embeddings,
        metadatas,
      });
    });

    test("should query collection with distance scores", async () => {
      // Add some documents first
      const ids = ["doc1", "doc2"];
      const documents = ["First document", "Second document"];
      const embeddings = [
        Array.from({ length: 384 }, () => Math.random()),
        Array.from({ length: 384 }, () => Math.random()),
      ];
      const metadatas = [{ source: "test1" }, { source: "test2" }];

      await collection.add({ ids, documents, embeddings, metadatas });

      const queryEmbeddings = [
        Array.from({ length: 384 }, () => Math.random()),
      ];
      const result = await collection.query({ queryEmbeddings, nResults: 5 });

      expect(result.ids[0]).toHaveLength(2);
      expect(result.distances[0]).toHaveLength(2);
      expect(result.documents[0]).toHaveLength(2);
      expect(result.metadatas[0]).toHaveLength(2);
    });
  });

  describe("NetworkSimulator", () => {
    test("should simulate network latency", async () => {
      // Use real timers for this test since we need actual delays
      jest.useRealTimers();

      const start = Date.now();
      await NetworkSimulator.simulateLatency(100, 200);
      const elapsed = Date.now() - start;

      expect(elapsed).toBeGreaterThanOrEqual(100);
      expect(elapsed).toBeLessThan(300); // Allow some buffer

      // Restore fake timers
      jest.useFakeTimers({
        advanceTimers: true,
        doNotFake: ["nextTick", "setImmediate"],
        legacyFakeTimers: false,
      });
    });

    test("should simulate network failures", () => {
      // Test with 100% failure rate
      expect(() => {
        NetworkSimulator.simulateFailure(1.0);
      }).toThrow("Simulated network failure");

      // Test with 0% failure rate (should not throw)
      expect(() => {
        NetworkSimulator.simulateFailure(0.0);
      }).not.toThrow();
    });

    test("should simulate timeouts", async () => {
      const timeoutPromise = NetworkSimulator.simulateTimeout(100);

      await expect(timeoutPromise).rejects.toThrow("Request timeout");
    });
  });

  describe("TestMockUtils", () => {
    test("should create deterministic embeddings", () => {
      const text = "test input";
      const embedding1 = TestMockUtils.createDeterministicEmbedding(text);
      const embedding2 = TestMockUtils.createDeterministicEmbedding(text);

      expect(embedding1).toEqual(embedding2);
      expect(embedding1).toHaveLength(1536);
      expect(embedding1.every((val) => val >= -1 && val <= 1)).toBe(true);
    });

    test("should create mock API responses", async () => {
      const mockData = { message: "success" };
      const response = await TestMockUtils.mockApiResponse(mockData, 200, 50);

      expect(response.status).toBe(200);
      expect(response.data).toEqual(mockData);
      expect(response.headers["content-type"]).toBe("application/json");
    });

    test("should create mock streams", async () => {
      const chunks = ["chunk1", "chunk2", "chunk3"];
      const stream = TestMockUtils.createMockStream(chunks, 10);

      const received = [];
      for await (const chunk of stream) {
        received.push(chunk);
      }

      expect(received).toEqual(chunks);
    });
  });

  describe("Integration with Jest Mocks", () => {
    test("should integrate with Jest mock functions", () => {
      const mockOpenAI = new MockOpenAI();

      // Verify Jest mocks are properly set up
      expect(jest.isMockFunction(mockOpenAI.embeddings.create)).toBe(true);
      expect(jest.isMockFunction(mockOpenAI.chat.completions.create)).toBe(
        true,
      );
    });

    test("should allow custom mock implementations", async () => {
      const mockOpenAI = new MockOpenAI();

      // Override default mock behavior
      mockOpenAI.embeddings.create.mockImplementationOnce(async () => ({
        data: [{ embedding: [1, 2, 3], index: 0 }],
        usage: { total_tokens: 5 },
      }));

      const result = await mockOpenAI.embeddings.create({ input: "test" });
      expect(result.data[0].embedding).toEqual([1, 2, 3]);
    });

    test("should track mock function calls", async () => {
      const mockPinecone = new MockPinecone();
      const index = mockPinecone.index("test");

      await index.upsert({ vectors: [{ id: "test", values: [1, 2, 3] }] });

      expect(index.upsert).toHaveBeenCalledTimes(1);
      expect(index.upsert).toHaveBeenCalledWith({
        vectors: [{ id: "test", values: [1, 2, 3] }],
      });
    });
  });

  describe("Error Handling", () => {
    test("should handle API rate limiting", async () => {
      const mockOpenAI = new MockOpenAI();

      // Mock rate limit error
      mockOpenAI.embeddings.create.mockRejectedValueOnce(
        new Error("Rate limit exceeded"),
      );

      await expect(
        mockOpenAI.embeddings.create({ input: "test" }),
      ).rejects.toThrow("Rate limit exceeded");
    });

    test("should handle network timeouts", async () => {
      const mockHttpClient = new MockHttpClient();

      // Don't set a mock response to simulate timeout
      await expect(
        mockHttpClient.get("https://api.example.com/timeout"),
      ).rejects.toThrow("No mock response configured");
    });
  });
});
