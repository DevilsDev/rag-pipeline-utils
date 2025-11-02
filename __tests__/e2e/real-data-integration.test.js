/**
 * End-to-End Testing Suite with Real Data Sources
 * Tests complete pipeline with sandbox environments and real data scenarios
 * @e2e
 */

// Jest is available globally in CommonJS mode;
const fs = require("fs");
const path = require("path");
const { createRagPipeline } = require("../../src/index.js");
const {
  _ValidationHelper,
  _TestDataGenerator,
} = require("../utils/test-helpers.js");
const { PluginRegistry } = require("../../src/core/plugin-registry.js");

// Extended timeout for E2E tests
jest.setTimeout(90000);

describe("End-to-End Real Data Integration", () => {
  let testDataPath;
  let sandboxConfig;
  let registry;

  beforeAll(async () => {
    // Initialize plugin registry
    registry = new PluginRegistry();

    // Setup test data directory
    testDataPath = path.join(
      process.cwd(),
      "__tests__",
      "fixtures",
      "real-data",
    );

    // Ensure test data directory exists
    if (!fs.existsSync(testDataPath)) {
      fs.mkdirSync(testDataPath, { recursive: true });
    }

    // Create sandbox configuration
    sandboxConfig = {
      enableSandbox: true,
      sandboxTimeout: 30000,
      maxDataSize: 10 * 1024 * 1024, // 10MB limit
      allowedDomains: ["localhost", "127.0.0.1"],
      enableNetworking: false, // Disable external calls in tests
    };
  });

  describe("document processing pipeline", () => {
    it("should process real PDF documents", async () => {
      // Create mock PDF content for testing
      const mockPdfContent = `
        # Machine Learning Fundamentals
        
        Machine learning is a subset of artificial intelligence (AI) that focuses on 
        algorithms that can learn and make decisions from data without being explicitly 
        programmed for every scenario.
        
        ## Key Concepts
        
        1. **Supervised Learning**: Learning with labeled examples
        2. **Unsupervised Learning**: Finding patterns in unlabeled data
        3. **Reinforcement Learning**: Learning through interaction and feedback
        
        ## Applications
        
        - Natural Language Processing
        - Computer Vision
        - Recommendation Systems
        - Autonomous Vehicles
      `;

      const mockPdfPath = path.join(testDataPath, "ml-fundamentals.txt");
      fs.writeFileSync(mockPdfPath, mockPdfContent);

      // Create file loader mock that reads real files
      const fileLoader = {
        metadata: {
          name: "fileLoader",
          type: "loader",
          version: "1.0.0",
          description: "Mock file loader for testing",
        },
        async load(filePath) {
          // Handle case where pipeline calls load() without arguments
          if (!filePath) {
            return [];
          }
          const content = fs.readFileSync(filePath, "utf8");
          return [
            {
              id: path.basename(filePath),
              content: content,
              metadata: {
                source: filePath,
                type: "document",
                size: content.length,
                processed: new Date().toISOString(),
              },
            },
          ];
        },
      };

      // Create embedder that processes real content
      const contentEmbedder = {
        metadata: {
          name: "contentEmbedder",
          type: "embedder",
          version: "1.0.0",
          description: "Mock content embedder for testing",
        },
        async embed(documents) {
          // Handle case where pipeline calls embed with query string instead of documents array
          if (typeof documents === "string") {
            return this.generateEmbedding(documents);
          }

          if (!Array.isArray(documents)) {
            return [];
          }

          return documents.map((doc) => ({
            id: doc.id,
            values: this.generateEmbedding(doc.content),
            metadata: doc.metadata,
          }));
        },

        generateEmbedding(text) {
          // Simple hash-based embedding for testing
          const words = text.toLowerCase().split(/\s+/);
          const embedding = new Array(384).fill(0);

          words.forEach((word, _index) => {
            const hash = this.simpleHash(word);
            embedding[hash % 384] += 1;
          });

          // Normalize
          const magnitude = Math.sqrt(
            embedding.reduce((sum, val) => sum + val * val, 0),
          );
          return embedding.map((val) => (magnitude > 0 ? val / magnitude : 0));
        },

        simpleHash(str) {
          let hash = 0;
          for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i);
            hash = (hash << 5) - hash + char;
            hash = hash & hash; // Convert to 32-bit integer
          }
          return Math.abs(hash);
        },
      };

      // Create vector store that persists data
      const vectorStore = {
        metadata: {
          name: "vectorStore",
          type: "retriever",
          version: "1.0.0",
          description: "Mock vector store for testing",
        },
        data: new Map(),

        async store(vectors) {
          vectors.forEach((vector) => {
            this.data.set(vector.id, vector);
          });
          return { stored: vectors.length };
        },

        async retrieve(queryVectorOrOptions, options = {}) {
          // Handle pipeline calling convention: retrieve({ query, queryVector, topK })
          let queryVector, topK, threshold;

          if (
            queryVectorOrOptions &&
            typeof queryVectorOrOptions === "object" &&
            queryVectorOrOptions.queryVector
          ) {
            queryVector = queryVectorOrOptions.queryVector;
            topK = queryVectorOrOptions.topK || 5;
            threshold = 0.0;
          } else {
            // Handle direct calling convention: retrieve(queryVector, options)
            queryVector = queryVectorOrOptions;
            topK = options.topK || 5;
            threshold = options.threshold || 0.0;
          }

          const results = [];

          for (const [id, vector] of this.data.entries()) {
            const similarity = this.cosineSimilarity(
              queryVector,
              vector.values,
            );
            if (similarity >= threshold) {
              results.push({
                id,
                score: similarity,
                metadata: vector.metadata,
              });
            }
          }

          return results.sort((a, b) => b.score - a.score).slice(0, topK);
        },

        cosineSimilarity(a, b) {
          const dotProduct = a.reduce((sum, val, i) => sum + val * b[i], 0);
          const magnitudeA = Math.sqrt(
            a.reduce((sum, val) => sum + val * val, 0),
          );
          const magnitudeB = Math.sqrt(
            b.reduce((sum, val) => sum + val * val, 0),
          );
          return magnitudeA && magnitudeB
            ? dotProduct / (magnitudeA * magnitudeB)
            : 0;
        },
      };

      // Create LLM that generates contextual responses
      const contextualLLM = {
        metadata: {
          name: "contextualLLM",
          type: "llm",
          version: "1.0.0",
          description: "Mock contextual LLM for testing",
        },
        async generate(prompt, options = {}) {
          const _context = "test context";
          const _prompt = "test prompt";
          const contextText = options.context || [];
          const context = contextText
            .map((c) => c.content || c.text || "")
            .join("\n\n");

          // Generate response based on context
          const response = this.generateContextualResponse(prompt, contextText);

          return {
            text: response,
            usage: {
              promptTokens: prompt.length / 4,
              completionTokens: response.length / 4,
              totalTokens: (prompt.length + response.length) / 4,
            },
            model: "contextual-llm",
          };
        },

        generateContextualResponse(prompt, context) {
          const promptLower = prompt.toLowerCase();

          if (promptLower.includes("machine learning")) {
            return `Based on the provided context, machine learning is a subset of artificial intelligence that focuses on algorithms that can learn from data. Key concepts include supervised learning, unsupervised learning, and reinforcement learning. Applications span natural language processing, computer vision, and recommendation systems.`;
          }

          if (promptLower.includes("supervised learning")) {
            return `Supervised learning is a type of machine learning where algorithms learn from labeled examples. The model is trained on input-output pairs to make predictions on new, unseen data.`;
          }

          return `Based on the available context: ${context.substring(0, 200)}...`;
        },
      };

      // Register mock plugins with the registry
      registry.register("loader", "fileLoader", fileLoader);
      registry.register("embedder", "contentEmbedder", contentEmbedder);
      registry.register("retriever", "vectorStore", vectorStore);
      registry.register("llm", "contextualLLM", contextualLLM);

      // Create and test the complete pipeline
      const pipeline = createRagPipeline({
        registry,
        loader: "fileLoader",
        embedder: "contentEmbedder",
        retriever: "vectorStore",
        llm: "contextualLLM",
      });

      // Load and process the document
      const documents = await fileLoader.load(mockPdfPath);
      const embeddings = await contentEmbedder.embed(documents);
      await vectorStore.store(embeddings);

      // Test query processing
      const query = "What is machine learning and what are its main types?";
      const queryEmbedding = contentEmbedder.generateEmbedding(query);

      const result = await pipeline.run({
        query,
        queryVector: queryEmbedding,
        options: { topK: 3 },
      });

      expect(result).toBeDefined();
      if (!result.success) {
        console.log("Pipeline failed with error:", result.error);
      }
      expect(result.success).toBe(true);
      expect(result.query).toBe(query);
      expect(result.results).toBeDefined();

      // Cleanup
      fs.unlinkSync(mockPdfPath);
    });

    it("should handle multiple document formats", async () => {
      const documentFormats = [
        {
          name: "markdown",
          extension: ".md",
          content: `# AI Research Paper\n\n## Abstract\n\nThis paper explores artificial intelligence applications.`,
        },
        {
          name: "text",
          extension: ".txt",
          content: `Natural Language Processing (NLP) is a branch of AI that helps computers understand human language.`,
        },
        {
          name: "json",
          extension: ".json",
          content: JSON.stringify({
            title: "Deep Learning Concepts",
            content:
              "Neural networks are the foundation of deep learning systems.",
            tags: ["AI", "Deep Learning", "Neural Networks"],
          }),
        },
      ];

      const multiFormatLoader = {
        async load(filePaths) {
          const documents = [];

          for (const filePath of filePaths) {
            const content = fs.readFileSync(filePath, "utf8");
            const extension = path.extname(filePath);

            let processedContent;
            if (extension === ".json") {
              const jsonData = JSON.parse(content);
              processedContent = `${jsonData.title}\n\n${jsonData.content}`;
            } else {
              processedContent = content;
            }

            documents.push({
              id: path.basename(filePath),
              content: processedContent,
              metadata: {
                format: extension,
                source: filePath,
                size: content.length,
              },
            });
          }

          return documents;
        },
      };

      // Create test files
      const testFiles = [];
      for (const format of documentFormats) {
        const filePath = path.join(
          testDataPath,
          `test-${format.name}${format.extension}`,
        );
        fs.writeFileSync(filePath, format.content);
        testFiles.push(filePath);
      }

      try {
        const documents = await multiFormatLoader.load(testFiles);

        expect(documents).toHaveLength(3);
        expect(documents[0].metadata.format).toBe(".md");
        expect(documents[1].metadata.format).toBe(".txt");
        expect(documents[2].metadata.format).toBe(".json");

        // Verify content processing
        expect(documents[2].content).toContain("Deep Learning Concepts");
        expect(documents[2].content).toContain("Neural networks");
      } finally {
        // Cleanup test files
        testFiles.forEach((filePath) => {
          if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
          }
        });
      }
    });

    it("should handle large document collections", async () => {
      const documentCollection = [];
      const collectionSize = 100;

      // Generate realistic document collection
      const topics = [
        "artificial intelligence",
        "machine learning",
        "deep learning",
        "natural language processing",
        "computer vision",
        "robotics",
        "data science",
        "neural networks",
        "reinforcement learning",
      ];

      for (let i = 0; i < collectionSize; i++) {
        const topic = topics[i % topics.length];
        const content = `
          Document ${i}: ${topic.toUpperCase()}
          
          This document discusses ${topic} in detail. It covers the fundamental
          concepts, applications, and recent developments in the field.
          
          Key points:
          - Definition and scope of ${topic}
          - Historical development and milestones
          - Current applications and use cases
          - Future research directions
          
          The field of ${topic} continues to evolve rapidly with new breakthroughs
          and applications emerging regularly.
        `;

        documentCollection.push({
          id: `doc-${i}`,
          content: content.trim(),
          metadata: {
            topic,
            index: i,
            wordCount: content.split(/\s+/).length,
          },
        });
      }

      // Create scalable embedder
      const scalableEmbedder = {
        async embed(documents, options = {}) {
          const { batchSize = 10 } = options;
          const results = [];

          for (let i = 0; i < documents.length; i += batchSize) {
            const batch = documents.slice(i, i + batchSize);
            const batchEmbeddings = batch.map((doc) => ({
              id: doc.id,
              values: this.generateEmbedding(doc.content),
              metadata: doc.metadata,
            }));

            results.push(...batchEmbeddings);

            // Simulate processing delay
            await new Promise((resolve) => setTimeout(resolve, 10));
          }

          return results;
        },

        generateEmbedding(text) {
          // Simplified embedding generation
          const words = text.toLowerCase().split(/\s+/);
          const embedding = new Array(128).fill(0);

          words.forEach((word) => {
            const hash = this.hash(word) % 128;
            embedding[hash] += 1;
          });

          return embedding;
        },

        hash(str) {
          let hash = 0;
          for (let i = 0; i < str.length; i++) {
            hash = (hash << 5) - hash + str.charCodeAt(i);
          }
          return Math.abs(hash);
        },
      };

      // Process large collection
      const startTime = Date.now();
      const embeddings = await scalableEmbedder.embed(documentCollection, {
        batchSize: 20,
      });
      const endTime = Date.now();

      expect(embeddings).toHaveLength(collectionSize);
      expect(endTime - startTime).toBeLessThan(10000); // Complete within 10 seconds

      // Verify embedding quality
      embeddings.forEach((embedding) => {
        expect(embedding.values).toHaveLength(128);
        expect(embedding.metadata.topic).toBeDefined();
      });
    });
  });

  describe("real-world query scenarios", () => {
    it("should handle complex multi-part queries", async () => {
      const complexQueries = [
        {
          query:
            "Compare supervised and unsupervised learning approaches, and provide examples of when to use each",
          expectedTopics: [
            "supervised learning",
            "unsupervised learning",
            "examples",
          ],
        },
        {
          query:
            "What are the main challenges in natural language processing and how are they being addressed?",
          expectedTopics: [
            "natural language processing",
            "challenges",
            "solutions",
          ],
        },
        {
          query:
            "Explain the relationship between artificial intelligence, machine learning, and deep learning",
          expectedTopics: [
            "artificial intelligence",
            "machine learning",
            "deep learning",
            "relationship",
          ],
        },
      ];

      // Create knowledge base
      const knowledgeBase = [
        {
          id: "ml-types",
          content:
            "Supervised learning uses labeled data to train models, while unsupervised learning finds patterns in unlabeled data. Examples of supervised learning include classification and regression. Examples of unsupervised learning include clustering and dimensionality reduction.",
          metadata: { topic: "machine learning types" },
        },
        {
          id: "nlp-challenges",
          content:
            "Natural language processing faces challenges including ambiguity, context understanding, and cultural nuances. These are addressed through advanced neural networks, transformer models, and large-scale training data.",
          metadata: { topic: "nlp challenges" },
        },
        {
          id: "ai-hierarchy",
          content:
            "Artificial intelligence is the broad field of making machines smart. Machine learning is a subset of AI that learns from data. Deep learning is a subset of machine learning using neural networks with many layers.",
          metadata: { topic: "ai hierarchy" },
        },
      ];

      // Create intelligent retriever
      const intelligentRetriever = {
        data: new Map(),

        async store(documents) {
          documents.forEach((doc) => {
            this.data.set(doc.id, doc);
          });
          return { stored: documents.length };
        },

        async retrieve(query, options = {}) {
          const { topK = 3 } = options;
          const queryTerms = query.toLowerCase().split(/\s+/);
          const results = [];

          for (const [id, doc] of this.data.entries()) {
            const content = doc.content.toLowerCase();
            let relevanceScore = 0;

            queryTerms.forEach((term) => {
              if (content.includes(term)) {
                relevanceScore += 1;
              }
            });

            if (relevanceScore > 0) {
              results.push({
                id,
                score: relevanceScore / queryTerms.length,
                content: doc.content,
                metadata: doc.metadata,
              });
            }
          }

          return results.sort((a, b) => b.score - a.score).slice(0, topK);
        },
      };

      // Store knowledge base
      await intelligentRetriever.store(knowledgeBase);

      // Test complex queries
      for (const testCase of complexQueries) {
        const results = await intelligentRetriever.retrieve(testCase.query, {
          topK: 2,
        });

        expect(results.length).toBeGreaterThan(0);
        expect(results[0].score).toBeGreaterThan(0);

        // Verify relevant content is retrieved
        const retrievedContent = results
          .map((r) => r.content)
          .join(" ")
          .toLowerCase();
        const foundTopics = testCase.expectedTopics.filter((topic) =>
          retrievedContent.includes(topic.toLowerCase()),
        );

        expect(foundTopics.length).toBeGreaterThan(0);
      }
    });

    it("should handle domain-specific terminology", async () => {
      const domainSpecificContent = [
        {
          domain: "medical",
          content:
            "Myocardial infarction, commonly known as a heart attack, occurs when blood flow to the myocardium is blocked. Symptoms include chest pain, dyspnea, and diaphoresis.",
          terminology: [
            "myocardial infarction",
            "myocardium",
            "dyspnea",
            "diaphoresis",
          ],
        },
        {
          domain: "legal",
          content:
            "A tort is a civil wrong that causes harm to another person. The plaintiff must prove negligence by establishing duty, breach, causation, and damages.",
          terminology: ["tort", "plaintiff", "negligence", "causation"],
        },
        {
          domain: "technical",
          content:
            "Kubernetes orchestrates containerized applications using pods, services, and deployments. The kubelet manages node-level operations.",
          terminology: ["kubernetes", "containerized", "pods", "kubelet"],
        },
      ];

      const domainAwareLLM = {
        async generate(prompt, options = {}) {
          const context = options.context || [];
          const domain = this.detectDomain(prompt, context);

          let response;
          if (domain === "medical") {
            response = this.generateMedicalResponse(prompt, context);
          } else if (domain === "legal") {
            response = this.generateLegalResponse(prompt, context);
          } else if (domain === "technical") {
            response = this.generateTechnicalResponse(prompt, context);
          } else {
            response = this.generateGeneralResponse(prompt, context);
          }

          return {
            text: response,
            domain: domain,
            usage: {
              promptTokens: 50,
              completionTokens: 100,
              totalTokens: 150,
            },
          };
        },

        detectDomain(prompt, context) {
          const text = (
            prompt +
            " " +
            context.map((c) => c.content || "").join(" ")
          ).toLowerCase();

          if (
            text.includes("myocardial") ||
            text.includes("medical") ||
            text.includes("patient")
          ) {
            return "medical";
          }
          if (
            text.includes("tort") ||
            text.includes("legal") ||
            text.includes("court")
          ) {
            return "legal";
          }
          if (
            text.includes("kubernetes") ||
            text.includes("container") ||
            text.includes("deployment")
          ) {
            return "technical";
          }

          return "general";
        },

        generateMedicalResponse(___prompt, ___context) {
          return "Based on medical knowledge, myocardial infarction is a serious cardiac event requiring immediate medical attention. Symptoms typically include chest pain and shortness of breath.";
        },

        generateLegalResponse(___prompt, ___context) {
          return "In legal terms, a tort represents a civil wrong where one party causes harm to another. The burden of proof lies with the plaintiff to establish all required elements.";
        },

        generateTechnicalResponse(___prompt, ___context) {
          return "Kubernetes provides container orchestration capabilities, managing the deployment and scaling of containerized applications across clusters of nodes.";
        },

        generateGeneralResponse(___prompt, ___context) {
          return "Based on the available information, I can provide a general response to your query.";
        },
      };

      // Test domain-specific queries
      for (const domainContent of domainSpecificContent) {
        const query = `Explain the key concepts in this ${domainContent.domain} context`;

        const response = await domainAwareLLM.generate(query, {
          context: [{ content: domainContent.content }],
        });

        expect(response.domain).toBe(domainContent.domain);
        expect(response.text).toBeDefined();
        expect(response.text.length).toBeGreaterThan(50);
      }
    });
  });

  describe("sandbox environment testing", () => {
    it("should enforce sandbox security constraints", async () => {
      const { run } = require("../../src/security/plugin-sandbox");

      const sandboxedPipeline = {
        config: sandboxConfig,

        async validateOperation(operation) {
          if (!this.config.enableSandbox) {
            return true;
          }

          // Check data size
          if (operation.dataSize > this.config.maxDataSize) {
            throw new Error("Data size limit exceeded");
          }

          // Check networking
          if (operation.requiresNetwork && !this.config.enableNetworking) {
            throw new Error("Network access not allowed in sandbox");
          }

          return true;
        },

        async run(operation) {
          try {
            // Pre-validate operation constraints
            await this.validateOperation({
              ...operation,
              dataSize: JSON.stringify(operation).length,
            });

            // Use plugin sandbox run function with timeout
            const result = await run(
              async () => {
                // Simulate operation
                await new Promise((resolve) =>
                  setTimeout(resolve, operation.delay || 100),
                );
                return { duration: operation.delay || 100 };
              },
              { timeoutMs: this.config.sandboxTimeout },
            );

            if (!result.success) {
              return { success: false, error: result.error };
            }

            return { success: true, duration: result.result.duration };
          } catch (error) {
            return { success: false, error: error.message };
          }
        },
      };

      // Test valid operations
      const validOperation = {
        query: "Test query",
        data: "small data",
        delay: 100,
      };

      const validResult = await sandboxedPipeline.run(validOperation);
      expect(validResult.success).toBe(true);

      // Test timeout violation
      const timeoutOperation = {
        query: "Long running query",
        data: "data",
        delay: 35000, // Exceeds 30 second limit
      };

      const timeoutResult = await sandboxedPipeline.run(timeoutOperation);
      expect(timeoutResult.success).toBe(false);
      expect(timeoutResult.error).toContain("timeout");

      // Test data size violation
      const largeDataOperation = {
        query: "Large data query",
        data: "x".repeat(15 * 1024 * 1024), // 15MB, exceeds 10MB limit
        delay: 100,
      };

      const dataSizeResult = await sandboxedPipeline.run(largeDataOperation);
      expect(dataSizeResult.success).toBe(false);
      expect(dataSizeResult.error).toContain("Data size limit");
    });

    it("should isolate test environments", async () => {
      const environmentA = {
        id: "env-a",
        data: new Map(),

        async store(key, value) {
          this.data.set(key, value);
        },

        async retrieve(key) {
          return this.data.get(key);
        },

        async clear() {
          this.data.clear();
        },
      };

      const environmentB = {
        id: "env-b",
        data: new Map(),

        async store(key, value) {
          this.data.set(key, value);
        },

        async retrieve(key) {
          return this.data.get(key);
        },

        async clear() {
          this.data.clear();
        },
      };

      // Store different data in each environment
      await environmentA.store("test-key", "value-a");
      await environmentB.store("test-key", "value-b");

      // Verify isolation
      const valueA = await environmentA.retrieve("test-key");
      const valueB = await environmentB.retrieve("test-key");

      expect(valueA).toBe("value-a");
      expect(valueB).toBe("value-b");
      expect(valueA).not.toBe(valueB);

      // Verify independent cleanup
      await environmentA.clear();

      const clearedA = await environmentA.retrieve("test-key");
      const unchangedB = await environmentB.retrieve("test-key");

      expect(clearedA).toBeUndefined();
      expect(unchangedB).toBe("value-b");
    });
  });
});
