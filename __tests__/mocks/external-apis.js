/**
 * Mock implementations for external APIs to reduce test flakiness
 * Addresses P2 risk: Test Flakiness from anti-pattern review
 */

const crypto = require("crypto");

/**
 * Mock OpenAI API responses
 */
class MockOpenAI {
  constructor() {
    this.apiKey = "mock-api-key";
    this.baseURL = "https://api.openai.com/v1";
  }

  embeddings = {
    create: jest
      .fn()
      .mockImplementation(
        async ({ input, model = "text-embedding-ada-002" }) => {
          // Simulate API delay
          await new Promise((resolve) => setTimeout(resolve, 100));

          const inputs = Array.isArray(input) ? input : [input];
          const embeddings = inputs.map(() =>
            Array.from({ length: 1536 }, () => Math.random() * 2 - 1),
          );

          return {
            object: "list",
            data: embeddings.map((embedding, index) => ({
              object: "embedding",
              embedding,
              index,
            })),
            model,
            usage: {
              prompt_tokens: inputs.join(" ").split(" ").length,
              total_tokens: inputs.join(" ").split(" ").length,
            },
          };
        },
      ),
  };

  chat = {
    completions: {
      create: jest
        .fn()
        .mockImplementation(
          async ({ messages, model = "gpt-3.5-turbo", stream = false }) => {
            await new Promise((resolve) => setTimeout(resolve, 200));

            const response = {
              id: `chatcmpl-${crypto.randomUUID()}`,
              object: "chat.completion",
              created: Math.floor(Date.now() / 1000),
              model,
              choices: [
                {
                  index: 0,
                  message: {
                    role: "assistant",
                    content: `Mock response to: ${messages[messages.length - 1]?.content || "Hello"}`,
                  },
                  finish_reason: "stop",
                },
              ],
              usage: {
                prompt_tokens: 20,
                completion_tokens: 10,
                total_tokens: 30,
              },
            };

            if (stream) {
              // Mock streaming response
              return {
                async *[Symbol.asyncIterator]() {
                  const words = response.choices[0].message.content.split(" ");
                  for (const word of words) {
                    yield {
                      choices: [
                        {
                          delta: { content: word + " " },
                          index: 0,
                          finish_reason: null,
                        },
                      ],
                    };
                    await new Promise((resolve) => setTimeout(resolve, 50));
                  }
                  yield {
                    choices: [
                      {
                        delta: {},
                        index: 0,
                        finish_reason: "stop",
                      },
                    ],
                  };
                },
              };
            }

            return response;
          },
        ),
    },
  };
}

/**
 * Mock Azure OpenAI API responses
 */
class MockAzureOpenAI extends MockOpenAI {
  constructor() {
    super();
    this.baseURL = "https://mock-resource.openai.azure.com";
    this.apiVersion = "2023-12-01-preview";
  }
}

/**
 * Mock Pinecone vector database
 */
class MockPinecone {
  constructor() {
    this.vectors = new Map();
  }

  index(indexName) {
    return {
      upsert: jest.fn().mockImplementation(async ({ vectors }) => {
        vectors.forEach((vector) => {
          this.vectors.set(vector.id, vector);
        });
        return { upsertedCount: vectors.length };
      }),

      query: jest
        .fn()
        .mockImplementation(async ({ vector, topK = 10, filter = {} }) => {
          await new Promise((resolve) => setTimeout(resolve, 150));

          // Simple mock similarity calculation
          const results = Array.from(this.vectors.values())
            .map((stored) => ({
              id: stored.id,
              score: Math.random() * 0.5 + 0.5, // Mock similarity score
              values: stored.values,
              metadata: stored.metadata,
            }))
            .sort((a, b) => b.score - a.score)
            .slice(0, topK);

          return {
            matches: results,
            namespace: "",
          };
        }),

      delete: jest.fn().mockImplementation(async ({ ids }) => {
        ids.forEach((id) => this.vectors.delete(id));
        return {};
      }),
    };
  }
}

/**
 * Mock Chroma vector database
 */
class MockChroma {
  constructor() {
    this.collections = new Map();
  }

  getOrCreateCollection({ name }) {
    if (!this.collections.has(name)) {
      this.collections.set(name, {
        name,
        documents: [],
        embeddings: [],
        metadatas: [],
        ids: [],
      });
    }

    const collection = this.collections.get(name);

    return {
      add: jest
        .fn()
        .mockImplementation(
          async ({ ids, embeddings, documents, metadatas }) => {
            await new Promise((resolve) => setTimeout(resolve, 100));

            collection.ids.push(...ids);
            collection.embeddings.push(...embeddings);
            collection.documents.push(...documents);
            collection.metadatas.push(...metadatas);

            return {};
          },
        ),

      query: jest
        .fn()
        .mockImplementation(async ({ queryEmbeddings, nResults = 10 }) => {
          await new Promise((resolve) => setTimeout(resolve, 120));

          const results = collection.ids
            .map((id, index) => ({
              id,
              distance: Math.random() * 0.5,
              document: collection.documents[index],
              metadata: collection.metadatas[index],
            }))
            .sort((a, b) => a.distance - b.distance)
            .slice(0, nResults);

          return {
            ids: [results.map((r) => r.id)],
            distances: [results.map((r) => r.distance)],
            documents: [results.map((r) => r.document)],
            metadatas: [results.map((r) => r.metadata)],
          };
        }),
    };
  }
}

/**
 * Mock HTTP client for external API calls
 */
class MockHttpClient {
  constructor() {
    this.responses = new Map();
  }

  setMockResponse(url, response, delay = 100) {
    this.responses.set(url, { response, delay });
  }

  async get(url, config = {}) {
    const mock = this.responses.get(url);
    if (mock) {
      await new Promise((resolve) => setTimeout(resolve, mock.delay));
      return mock.response;
    }

    throw new Error(`No mock response configured for URL: ${url}`);
  }

  async post(url, data, config = {}) {
    return this.get(url, config);
  }

  async put(url, data, config = {}) {
    return this.get(url, config);
  }

  async delete(url, config = {}) {
    return this.get(url, config);
  }
}

/**
 * Network simulation utilities
 */
class NetworkSimulator {
  static simulateLatency(min = 50, max = 200) {
    const delay = Math.floor(Math.random() * (max - min + 1)) + min;
    return new Promise((resolve) => setTimeout(resolve, delay));
  }

  static simulateFailure(probability = 0.1) {
    if (Math.random() < probability) {
      throw new Error("Simulated network failure");
    }
  }

  static simulateTimeout(timeoutMs = 5000) {
    return new Promise((_, reject) => {
      setTimeout(() => reject(new Error("Request timeout")), timeoutMs);
    });
  }
}

/**
 * Test utilities for mocking external dependencies
 */
class TestMockUtils {
  static createDeterministicEmbedding(text, dimensions = 1536) {
    // Create deterministic embedding based on text hash
    const hash = crypto.createHash("sha256").update(text).digest();
    const embedding = [];

    for (let i = 0; i < dimensions; i++) {
      const byte = hash[i % hash.length];
      embedding.push((byte / 255) * 2 - 1); // Normalize to [-1, 1]
    }

    return embedding;
  }

  static mockApiResponse(data, status = 200, delay = 100) {
    return new Promise((resolve) => {
      setTimeout(() => {
        resolve({
          status,
          data,
          headers: {
            "content-type": "application/json",
            "x-ratelimit-remaining": "999",
          },
        });
      }, delay);
    });
  }

  static createMockStream(chunks, chunkDelay = 50) {
    let index = 0;

    return {
      async *[Symbol.asyncIterator]() {
        while (index < chunks.length) {
          await new Promise((resolve) => setTimeout(resolve, chunkDelay));
          yield chunks[index++];
        }
      },
    };
  }
}

module.exports = {
  MockOpenAI,
  MockAzureOpenAI,
  MockPinecone,
  MockChroma,
  MockHttpClient,
  NetworkSimulator,
  TestMockUtils,
};
