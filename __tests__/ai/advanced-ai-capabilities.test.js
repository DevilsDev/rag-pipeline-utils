/**
 * Advanced AI/ML Capabilities Test Suite
 * Tests for model training, adaptive retrieval, multi-modal processing, and federated learning
 */

// Use real timers so setTimeout-based waits resolve even if the global setup uses fake timers
beforeAll(() => {
  jest.useRealTimers();
});

describe("Advanced AI/ML Capabilities", () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  // Real in-memory modules behind the exported MultiModalProcessor and
  // AdaptiveRetrievalEngine wrappers (src/ai/multimodal.js, retrieval-engine.js)
  const adaptiveRetrieval = require("../../src/ai/adaptive-retrieval");
  const multiModalProcessor = require("../../src/ai/multimodal-processing");

  beforeEach(() => {
    // Clear all modules before each test
    adaptiveRetrieval.clear();
    multiModalProcessor.clear();
  });

  //
  // Adaptive Retrieval Engine
  //
  describe("Adaptive Retrieval Engine", () => {
    test("should initialize user profile", async () => {
      const userId = "user-123";
      const profile = await adaptiveRetrieval.initializeUserProfile(userId, {
        interests: ["technology", "AI"],
        expertise: "intermediate",
      });
      expect(profile).toHaveProperty("userId", userId);
      expect(profile).toHaveProperty("preferences");
      expect(profile).toHaveProperty("learningHistory");
    });

    test("should adapt retrieval based on feedback", async () => {
      const userId = "user-123";
      await adaptiveRetrieval.initializeUserProfile(userId);

      const query = "machine learning algorithms";
      const results = await adaptiveRetrieval.adaptiveRetrieve(userId, query, {
        maxResults: 5,
      });

      expect(results).toHaveProperty("documents");
      expect(results).toHaveProperty("adaptationMetadata");
      expect(Array.isArray(results.documents)).toBe(true);

      const feedback = {
        query,
        results: results.documents.slice(0, 2),
        ratings: [5, 4],
        clickedResults: [0],
        dwellTime: [120],
      };
      await adaptiveRetrieval.recordFeedback(userId, feedback);

      const updatedProfile = await adaptiveRetrieval.getUserProfile(userId);
      expect(updatedProfile.learningHistory.length).toBeGreaterThan(0);
    });

    test("should perform reinforcement learning updates", async () => {
      const userId = "user-123";
      await adaptiveRetrieval.initializeUserProfile(userId);

      for (let i = 0; i < 5; i++) {
        const query = `test query ${i}`;
        await adaptiveRetrieval.adaptiveRetrieve(userId, query);
        await adaptiveRetrieval.recordFeedback(userId, {
          query,
          results: [{ id: i, content: `doc ${i}` }],
          ratings: [Math.random() > 0.5 ? 5 : 2],
          clickedResults: Math.random() > 0.5 ? [0] : [],
          dwellTime: [Math.random() * 200],
        });
      }

      const userProfileResult = await adaptiveRetrieval.getUserProfile(userId);
      expect(userProfileResult.learningHistory.length).toBeGreaterThanOrEqual(
        5,
      );
    });

    test("should generate personalized rankings", async () => {
      const userId = "user-123";
      await adaptiveRetrieval.initializeUserProfile(userId, {
        interests: ["machine learning", "deep learning"],
      });

      const documents = [
        { id: "1", content: "Introduction to machine learning", score: 0.8 },
        { id: "2", content: "Deep learning fundamentals", score: 0.7 },
        { id: "3", content: "Statistics for beginners", score: 0.6 },
      ];

      const rankedResults = await adaptiveRetrieval.personalizeRanking(
        userId,
        documents,
      );
      expect(rankedResults).toHaveLength(3);
      expect(rankedResults[0]).toHaveProperty("personalizedScore");
      expect(rankedResults[0]).toHaveProperty("rankingFactors");
    });
  });

  //
  // Multi-Modal Processor
  //
  describe("Multi-Modal Processor", () => {
    test("should process image content", async () => {
      const imageContent = {
        type: "image/jpeg",
        size: 1024000,
        data: Buffer.from("mock-image-data"),
        ocrText: "Sample text in image",
      };
      const result = await multiModalProcessor.processContent(
        "tenant-1",
        imageContent,
      );

      expect(result).toHaveProperty("id");
      expect(result).toHaveProperty("modalities");
      expect(result.modalities).toHaveProperty("image");
      expect(result.modalities.image).toHaveProperty("embedding");
      expect(result.modalities.image).toHaveProperty("features");
      expect(result).toHaveProperty("unifiedEmbedding");
    });

    test("should process audio content", async () => {
      const audioContent = {
        type: "audio/mp3",
        size: 2048000,
        duration: 120,
        transcript: "This is a sample audio transcript",
      };
      const result = await multiModalProcessor.processContent(
        "tenant-1",
        audioContent,
      );

      expect(result.modalities).toHaveProperty("audio");
      expect(result.modalities.audio).toHaveProperty("features");
      expect(result.modalities.audio.features).toHaveProperty("transcript");
      expect(result.modalities.audio.features.transcript).toBe(
        audioContent.transcript,
      );
    });

    test("should process video content", async () => {
      const videoContent = {
        type: "video/mp4",
        size: 10240000,
        duration: 300,
        audioTranscript: "Video audio transcript",
      };
      const result = await multiModalProcessor.processContent(
        "tenant-1",
        videoContent,
      );

      expect(result.modalities).toHaveProperty("video");
      expect(result.modalities.video).toHaveProperty("features");
      expect(result.modalities.video.features).toHaveProperty("scenes");
      expect(result.modalities.video.features).toHaveProperty("actions");
    });

    test("should perform multi-modal search", async () => {
      const contents = [
        {
          type: "image/jpeg",
          text: "Machine learning diagram",
          data: Buffer.from("image-data-1"),
        },
        {
          type: "audio/mp3",
          transcript: "Explanation of neural networks",
          duration: 180,
        },
        {
          type: "text/plain",
          text: "Deep learning is a subset of machine learning",
        },
      ];
      for (const content of contents) {
        await multiModalProcessor.processContent("tenant-1", content);
      }

      const query = { text: "machine learning", type: "text" };
      const searchResults = await multiModalProcessor.search(
        "tenant-1",
        query,
        { maxResults: 10 },
      );

      expect(searchResults).toHaveProperty("results");
      expect(searchResults).toHaveProperty("metadata");
      expect(Array.isArray(searchResults.results)).toBe(true);
    });

    test("should generate content descriptions", async () => {
      const content = {
        type: "video/mp4",
        size: 5120000,
        duration: 240,
        audioTranscript: "Tutorial on machine learning",
      };
      const processed = await multiModalProcessor.processContent(
        "tenant-1",
        content,
      );
      const descriptions = await multiModalProcessor.describeContent(
        processed.id,
      );

      expect(descriptions).toHaveProperty("video");
      expect(descriptions).toHaveProperty("unified");
      expect(typeof descriptions.video).toBe("string");
      expect(typeof descriptions.unified).toBe("string");
    });

    test("should find similar content", async () => {
      const contents = [
        { type: "text/plain", text: "Machine learning basics" },
        { type: "text/plain", text: "Deep learning fundamentals" },
        { type: "text/plain", text: "Cooking recipes" },
      ];
      const processedIds = [];
      for (const content of contents) {
        const result = await multiModalProcessor.processContent(
          "tenant-1",
          content,
        );
        processedIds.push(result.id);
      }

      const similarities = await multiModalProcessor.findSimilar(
        processedIds[0],
        { threshold: 0.5 },
      );
      expect(Array.isArray(similarities)).toBe(true);
      expect(similarities.length).toBeGreaterThan(0);
    });
  });

  //
  // Exported experimental classes (src/experimental.js)
  //
  describe("Exported experimental classes", () => {
    const experimental = require("../../src/experimental");

    test("exports the four AI/ML classes as constructors", () => {
      for (const name of [
        "MultiModalProcessor",
        "AdaptiveRetrievalEngine",
        "FederatedLearningCoordinator",
        "ModelTrainingOrchestrator",
      ]) {
        expect(typeof experimental[name]).toBe("function");
        expect(() => new experimental[name]()).not.toThrow();
      }
    });

    test("ModelTrainingOrchestrator runs a job through its lifecycle", async () => {
      const orchestrator = new experimental.ModelTrainingOrchestrator({
        epochs: 3,
      });
      expect(orchestrator.config.epochs).toBe(3);

      const jobId = await orchestrator.createTrainingJob("tenant-1", {
        modelType: "embedding",
      });
      expect(typeof jobId).toBe("string");
      expect(orchestrator.getTrainingStatus(jobId).status).toBe("created");

      await expect(orchestrator.deployModel(jobId)).rejects.toThrow(
        /is not completed/,
      );

      const completed = new Promise((resolve) =>
        orchestrator.once("training_completed", resolve),
      );
      await expect(orchestrator.startTraining(jobId)).resolves.toEqual({
        jobId,
        status: "started",
      });
      expect(orchestrator.getTrainingStatus(jobId).status).toBe("training");
      await completed;
      expect(orchestrator.getTrainingStatus(jobId).status).toBe("completed");
    });

    test("FederatedLearningCoordinator registers eligible participants", async () => {
      const coordinator = new experimental.FederatedLearningCoordinator();
      const federationId = await coordinator.createFederation("tenant-1", {
        type: "embedding",
      });

      await coordinator.registerParticipant(federationId, {
        tenantId: "tenant-2",
        dataSize: 1000,
        computeCapacity: 0.5,
      });
      await expect(
        coordinator.registerParticipant(federationId, {
          tenantId: "tenant-3",
          dataSize: 10,
          computeCapacity: 0.5,
        }),
      ).rejects.toThrow(/Insufficient data size/);

      const status = await coordinator.getFederationStatus(federationId);
      expect(status).toMatchObject({
        id: federationId,
        status: "created",
        participantCount: 1,
      });
    });

    test("MultiModalProcessor delegates to the in-memory processor", async () => {
      const processor = new experimental.MultiModalProcessor();
      const result = await processor.processContent("tenant-1", {
        type: "text/plain",
        content: "hello world",
      });
      expect(result).toBeDefined();
    });
  });
});
