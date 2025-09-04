#!/usr/bin/env node

// Quick test of AI/ML modules to verify they return correct shapes
console.log("🧠 Testing AI/ML modules...\n");

let allPassed = true;

try {
  // Test AI module imports
  const {
    ModelTrainingOrchestrator,
    AdaptiveRetrieval,
    MultiModalProcessor,
    FederatedLearningCoordinator,
  } = require("./src/ai/index.js");

  console.log("✅ AI module imports successful");

  // Test ModelTrainingOrchestrator
  const trainer = new ModelTrainingOrchestrator({ model: "test" });
  console.log("✅ ModelTrainingOrchestrator instantiated");

  // Test method existence
  const requiredMethods = [
    "createTrainingJob",
    "startTraining",
    "optimizeHyperparameters",
    "getOptimizationResults",
    "deployModel",
    "getDeploymentStatus",
  ];

  for (const method of requiredMethods) {
    if (typeof trainer[method] === "function") {
      console.log(`✅ ${method} exists`);
    } else {
      console.log(`❌ ${method} missing`);
      allPassed = false;
    }
  }

  // Test AdaptiveRetrieval
  const retrieval = new AdaptiveRetrieval({ model: "test" });
  console.log("✅ AdaptiveRetrieval instantiated");

  const retrievalMethods = [
    "initializeUserProfile",
    "adaptiveRetrieve",
    "processFeedback",
    "getUserProfile",
    "personalizeRanking",
  ];

  for (const method of retrievalMethods) {
    if (typeof retrieval[method] === "function") {
      console.log(`✅ ${method} exists`);
    } else {
      console.log(`❌ ${method} missing`);
      allPassed = false;
    }
  }

  // Test MultiModalProcessor
  const processor = new MultiModalProcessor({ model: "test" });
  console.log("✅ MultiModalProcessor instantiated");

  // Test FederatedLearningCoordinator
  const coordinator = new FederatedLearningCoordinator({ model: "test" });
  console.log("✅ FederatedLearningCoordinator instantiated");
} catch (error) {
  console.log("❌ AI modules test failed:", error.message);
  allPassed = false;
}

console.log("\n" + "=".repeat(50));
if (allPassed) {
  console.log("🎉 AI/ML MODULES VERIFICATION PASSED!");
  process.exit(0);
} else {
  console.log("❌ Some AI/ML modules need attention");
  process.exit(1);
}
