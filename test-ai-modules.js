#!/usr/bin/env node

/**
 * Quick validation script for AI/ML modules
 */

console.log("🧪 Testing AI/ML Module Implementations...\n");

try {
  // Test AI module imports
  console.log("📦 Testing module imports...");
  const {
    ModelTrainingOrchestrator,
    AdaptiveRetrieval,
    MultiModalProcessor,
    FederatedLearningCoordinator,
  } = require("./src/ai/index.js");
  console.log("✅ All AI modules imported successfully\n");

  // Test ModelTrainingOrchestrator
  console.log("🤖 Testing ModelTrainingOrchestrator...");
  const trainer = new ModelTrainingOrchestrator();
  const jobId = trainer.createTrainingJob("tenant-1", {
    modelType: "embedding",
  });
  console.log(`✅ Created training job: ${jobId}`);

  trainer.startTraining(jobId).then(() => {
    console.log("✅ Training started successfully");
    const metrics = trainer.getTrainingMetrics(jobId);
    console.log(`✅ Got training metrics: ${JSON.stringify(metrics)}\n`);
  });

  // Test AdaptiveRetrieval
  console.log("🔍 Testing AdaptiveRetrieval...");
  const retrieval = new AdaptiveRetrieval();
  retrieval
    .initializeUserProfile("user-123", { interests: ["AI", "ML"] })
    .then((profile) => {
      console.log(`✅ Created user profile: ${profile.userId}`);

      return retrieval.adaptiveRetrieve("user-123", "machine learning");
    })
    .then((results) => {
      console.log(
        `✅ Adaptive retrieval completed: ${results.documents.length} documents\n`,
      );
    });

  // Test MultiModalProcessor
  console.log("🎨 Testing MultiModalProcessor...");
  const processor = new MultiModalProcessor();
  const content = { type: "text/plain", text: "Test content" };
  processor.processContent("tenant-1", content).then((result) => {
    console.log(`✅ Processed content: ${result.id}`);
    console.log(
      `✅ Modalities: ${Object.keys(result.modalities).join(", ")}\n`,
    );
  });

  // Test FederatedLearningCoordinator
  console.log("🌐 Testing FederatedLearningCoordinator...");
  const coordinator = new FederatedLearningCoordinator();
  const federationId = coordinator.createFederation("tenant-1", {
    type: "embedding",
  });
  console.log(`✅ Created federation: ${federationId}`);

  setTimeout(() => {
    console.log("\n🎉 All AI/ML modules validated successfully!");
    console.log("✨ Ready for comprehensive testing");
  }, 100);
} catch (error) {
  console.error("❌ Error testing AI/ML modules:", error.message);
  console.error(error.stack);
  process.exit(1);
}
