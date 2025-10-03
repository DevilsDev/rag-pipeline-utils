#!/usr/bin/env node
/**
 * Complete RAG Pipeline Example - OpenAI + Pinecone Integration
 *
 * This example demonstrates:
 * - Document loading and chunking
 * - OpenAI embeddings generation
 * - Pinecone vector storage
 * - Semantic search and retrieval
 * - Context-aware answer generation
 */

require("dotenv").config();
const { pluginRegistry, logger } = require("@devilsdev/rag-pipeline-utils");

// Check if running in mock mode
const USE_MOCK = process.env.USE_MOCK_MODE === "true";

// =============================================================================
// Plugin Implementations
// =============================================================================

/**
 * OpenAI Embedder Plugin
 * Generates vector embeddings using OpenAI's embedding models
 */
class OpenAIEmbedder {
  constructor(options = {}) {
    this.model = options.model || "text-embedding-3-small";
    this.apiKey = options.apiKey || process.env.OPENAI_API_KEY;

    if (!USE_MOCK && !this.apiKey) {
      throw new Error(
        "OPENAI_API_KEY is required. Set it in .env or use USE_MOCK_MODE=true",
      );
    }

    // Initialize OpenAI client only if not in mock mode
    if (!USE_MOCK) {
      const { OpenAI } = require("openai");
      this.client = new OpenAI({ apiKey: this.apiKey });
    }
  }

  async embed(text, options = {}) {
    if (USE_MOCK) {
      // Return mock embedding (1536 dimensions for text-embedding-3-small)
      return Array(1536)
        .fill(0)
        .map(() => Math.random() * 2 - 1);
    }

    try {
      const response = await this.client.embeddings.create({
        model: this.model,
        input: text,
      });

      return response.data[0].embedding;
    } catch (error) {
      logger.error("OpenAI embedding failed", { error: error.message });
      throw error;
    }
  }
}

/**
 * Pinecone Retriever Plugin
 * Stores and retrieves vectors from Pinecone vector database
 */
class PineconeRetriever {
  constructor(options = {}) {
    this.apiKey = options.apiKey || process.env.PINECONE_API_KEY;
    this.environment = options.environment || process.env.PINECONE_ENVIRONMENT;
    this.indexName =
      options.indexName ||
      process.env.PINECONE_INDEX_NAME ||
      "rag-pipeline-demo";

    if (!USE_MOCK && !this.apiKey) {
      throw new Error(
        "PINECONE_API_KEY is required. Set it in .env or use USE_MOCK_MODE=true",
      );
    }

    this.vectors = new Map(); // Mock storage for vectors

    // Initialize Pinecone client only if not in mock mode
    if (!USE_MOCK) {
      const { Pinecone } = require("@pinecone-database/pinecone");
      this.client = new Pinecone({ apiKey: this.apiKey });
      this.initPromise = this.initialize();
    }
  }

  async initialize() {
    if (USE_MOCK) return;

    try {
      this.index = this.client.index(this.indexName);
      logger.info("Connected to Pinecone index", { indexName: this.indexName });
    } catch (error) {
      logger.error("Pinecone initialization failed", { error: error.message });
      throw error;
    }
  }

  async upsert(vectors) {
    if (USE_MOCK) {
      // Store in mock storage
      vectors.forEach((v) => this.vectors.set(v.id, v));
      logger.info("Mock: Stored vectors", { count: vectors.length });
      return;
    }

    await this.initPromise;

    try {
      await this.index.upsert(vectors);
      logger.info("Upserted vectors to Pinecone", { count: vectors.length });
    } catch (error) {
      logger.error("Pinecone upsert failed", { error: error.message });
      throw error;
    }
  }

  async retrieve(query, options = {}) {
    const topK = options.topK || 3;
    const minScore = options.minScore || 0.0;

    if (USE_MOCK) {
      // Return mock results
      const results = Array.from(this.vectors.values())
        .slice(0, topK)
        .map((v) => ({
          id: v.id,
          score: 0.85 + Math.random() * 0.15, // Mock similarity score
          metadata: v.metadata,
        }));

      logger.info("Mock: Retrieved vectors", { count: results.length });
      return results;
    }

    await this.initPromise;

    try {
      const response = await this.index.query({
        vector: query.embedding,
        topK,
        includeMetadata: true,
      });

      const results = response.matches
        .filter((match) => match.score >= minScore)
        .map((match) => ({
          id: match.id,
          score: match.score,
          metadata: match.metadata,
        }));

      logger.info("Retrieved vectors from Pinecone", { count: results.length });
      return results;
    } catch (error) {
      logger.error("Pinecone query failed", { error: error.message });
      throw error;
    }
  }
}

/**
 * OpenAI LLM Plugin
 * Generates text using OpenAI's language models
 */
class OpenAILLM {
  constructor(options = {}) {
    this.model = options.model || "gpt-3.5-turbo";
    this.temperature = options.temperature || 0.7;
    this.maxTokens = options.maxTokens || 500;
    this.apiKey = options.apiKey || process.env.OPENAI_API_KEY;

    if (!USE_MOCK && !this.apiKey) {
      throw new Error(
        "OPENAI_API_KEY is required. Set it in .env or use USE_MOCK_MODE=true",
      );
    }

    // Initialize OpenAI client only if not in mock mode
    if (!USE_MOCK) {
      const { OpenAI } = require("openai");
      this.client = new OpenAI({ apiKey: this.apiKey });
    }
  }

  async generate(prompt, options = {}) {
    if (USE_MOCK) {
      // Return mock answer
      return {
        text:
          "This is a mock answer generated without calling the OpenAI API. " +
          "In production, this would be a real answer based on the retrieved context. " +
          "Set USE_MOCK_MODE=false and provide valid API keys to see real results.",
        usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
      };
    }

    try {
      const response = await this.client.chat.completions.create({
        model: this.model,
        messages: [
          {
            role: "system",
            content:
              "You are a helpful assistant that answers questions based on the provided context.",
          },
          {
            role: "user",
            content: prompt,
          },
        ],
        temperature: this.temperature,
        max_tokens: this.maxTokens,
      });

      return {
        text: response.choices[0].message.content,
        usage: {
          promptTokens: response.usage.prompt_tokens,
          completionTokens: response.usage.completion_tokens,
          totalTokens: response.usage.total_tokens,
        },
      };
    } catch (error) {
      logger.error("OpenAI generation failed", { error: error.message });
      throw error;
    }
  }
}

// =============================================================================
// Main RAG Pipeline
// =============================================================================

async function main() {
  console.log("\n🚀 RAG Pipeline - OpenAI + Pinecone Integration");
  console.log("================================================\n");

  if (USE_MOCK) {
    console.log("⚠️  Running in MOCK MODE (no API calls)\n");
  }

  // Sample documents to ingest
  const documents = [
    {
      id: "doc-1",
      content:
        "Machine learning is a subset of artificial intelligence that enables computers to learn from data without being explicitly programmed. It focuses on developing algorithms that can identify patterns and make decisions.",
    },
    {
      id: "doc-2",
      content:
        "Deep learning is a specialized form of machine learning that uses neural networks with multiple layers. It has revolutionized fields like computer vision, natural language processing, and speech recognition.",
    },
    {
      id: "doc-3",
      content:
        "Neural networks are computing systems inspired by biological neural networks in animal brains. They consist of interconnected nodes (neurons) organized in layers that process and transmit information.",
    },
  ];

  try {
    // Step 1: Initialize plugins
    console.log("🔧 Initializing plugins...\n");

    const embedder = new OpenAIEmbedder();
    const retriever = new PineconeRetriever();
    const llm = new OpenAILLM();

    // Register plugins (optional, for plugin registry usage)
    pluginRegistry.register("embedder", "openai", embedder);
    pluginRegistry.register("retriever", "pinecone", retriever);
    pluginRegistry.register("llm", "openai", llm);

    // Step 2: Load and embed documents
    console.log("📄 Loading documents...");
    console.log(`   Loaded ${documents.length} documents\n`);

    console.log("🔢 Generating embeddings...");
    const embeddedDocs = await Promise.all(
      documents.map(async (doc) => ({
        ...doc,
        embedding: await embedder.embed(doc.content),
      })),
    );
    console.log(
      `   Generated embeddings for ${embeddedDocs.length} documents\n`,
    );

    // Step 3: Store in Pinecone
    console.log("💾 Storing in Pinecone...");
    const vectors = embeddedDocs.map((doc) => ({
      id: doc.id,
      values: doc.embedding,
      metadata: {
        content: doc.content,
      },
    }));

    await retriever.upsert(vectors);
    console.log(`   Stored ${vectors.length} vectors in Pinecone index\n`);

    // Step 4: Query the pipeline
    const query = "What is machine learning?";
    console.log(`🔍 Query: ${query}\n`);

    // Embed the query
    const queryEmbedding = await embedder.embed(query);

    // Retrieve relevant documents
    const results = await retriever.retrieve(
      { embedding: queryEmbedding },
      { topK: 3, minScore: 0.0 },
    );

    console.log(`📊 Retrieved ${results.length} relevant documents\n`);

    // Build context from retrieved documents
    const context = results
      .map((r, i) => `[${i + 1}] ${r.metadata.content}`)
      .join("\n\n");

    // Generate answer
    const prompt = `Answer the following question based on the provided context.

Context:
${context}

Question: ${query}

Answer:`;

    console.log("💡 Generating answer...\n");
    const answer = await llm.generate(prompt);

    console.log("Answer:");
    console.log("─".repeat(60));
    console.log(answer.text);
    console.log("─".repeat(60));

    if (!USE_MOCK) {
      console.log(
        `\n📈 Token usage: ${answer.usage.totalTokens} total (${answer.usage.promptTokens} prompt + ${answer.usage.completionTokens} completion)`,
      );
    }

    console.log("\n✅ Pipeline completed successfully!\n");
  } catch (error) {
    console.error("\n❌ Error:", error.message);
    console.error("\nTroubleshooting:");
    console.error("1. Check your .env file has valid API keys");
    console.error("2. Ensure Pinecone index exists and dimension is 1536");
    console.error("3. Verify network connection");
    console.error(
      "4. Try running in mock mode: USE_MOCK_MODE=true npm start\n",
    );
    process.exit(1);
  }
}

// Run the pipeline
if (require.main === module) {
  main();
}

module.exports = { OpenAIEmbedder, PineconeRetriever, OpenAILLM };
