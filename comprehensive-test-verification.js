#!/usr/bin/env node

/**
 * Comprehensive Test Verification Script
 * Validates all critical fixes and components before final test suite run
 */

const fs = require("fs");
const path = require("path");

console.log("🔍 RAG Pipeline Utils - Comprehensive Verification\n");

let totalTests = 0;
let passedTests = 0;
const failures = [];

function test(name, fn) {
  totalTests++;
  try {
    const result = fn();
    if (result === true || result === undefined) {
      console.log(`✅ ${name}`);
      passedTests++;
    } else {
      console.log(`❌ ${name}: ${result}`);
      failures.push(`${name}: ${result}`);
    }
  } catch (error) {
    console.log(`❌ ${name}: ${error.message}`);
    failures.push(`${name}: ${error.message}`);
  }
}

// Test 1: Plugin Registry Fix
test("Plugin registry import and methods", () => {
  const { registry } = require("./src/core/plugin-registry.js");
  if (typeof registry.get !== "function")
    return "registry.get() method missing";

  // Test basic operations
  const mockPlugin = { name: "test-plugin" };
  registry.register("loader", "test-loader", mockPlugin);
  const retrieved = registry.get("loader", "test-loader");
  if (retrieved !== mockPlugin) return "Plugin registry operations failed";

  return true;
});

// Test 2: Create Pipeline Import
test("Create pipeline import", () => {
  const { createRagPipeline } = require("./src/core/create-pipeline.js");
  if (typeof createRagPipeline !== "function")
    return "createRagPipeline not exported";
  return true;
});

// Test 3: Instrumented Pipeline Cleanup
test("Instrumented pipeline cleanup method", () => {
  const {
    createInstrumentedPipeline,
  } = require("./src/core/observability/instrumented-pipeline.js");

  const mockPipeline = {
    ingest: () => Promise.resolve(),
    query: () => Promise.resolve("test response"),
  };

  const instrumented = createInstrumentedPipeline(mockPipeline);
  if (typeof instrumented.cleanup !== "function")
    return "cleanup() method missing";

  // Test cleanup execution
  instrumented.cleanup();
  return true;
});

// Test 4: AI/ML Module Imports
test("AI/ML module imports", () => {
  const {
    ModelTrainingOrchestrator,
    AdaptiveRetrieval,
    MultiModalProcessor,
    FederatedLearningCoordinator,
  } = require("./src/ai/index.js");

  if (typeof ModelTrainingOrchestrator !== "function")
    return "ModelTrainingOrchestrator missing";
  if (typeof AdaptiveRetrieval !== "function")
    return "AdaptiveRetrieval missing";
  if (typeof MultiModalProcessor !== "function")
    return "MultiModalProcessor missing";
  if (typeof FederatedLearningCoordinator !== "function")
    return "FederatedLearningCoordinator missing";

  return true;
});

// Test 5: AI/ML Module Instantiation
test("AI/ML module instantiation", () => {
  const {
    ModelTrainingOrchestrator,
    AdaptiveRetrieval,
  } = require("./src/ai/index.js");

  const trainer = new ModelTrainingOrchestrator({ model: "test" });
  const retrieval = new AdaptiveRetrieval({ model: "test" });

  // Check required methods exist
  const trainerMethods = [
    "createTrainingJob",
    "startTraining",
    "optimizeHyperparameters",
    "getOptimizationResults",
    "deployModel",
    "getDeploymentStatus",
  ];
  for (const method of trainerMethods) {
    if (typeof trainer[method] !== "function")
      return `ModelTrainingOrchestrator.${method} missing`;
  }

  const retrievalMethods = [
    "initializeUserProfile",
    "adaptiveRetrieve",
    "processFeedback",
    "getUserProfile",
    "personalizeRanking",
  ];
  for (const method of retrievalMethods) {
    if (typeof retrieval[method] !== "function")
      return `AdaptiveRetrieval.${method} missing`;
  }

  return true;
});

// Test 6: CLI Command Structure
test("CLI command structure", () => {
  const { createEnhancedCLI } = require("./src/cli/enhanced-cli-commands.js");
  const cli = createEnhancedCLI();

  if (!cli.program) return "CLI program not created";
  if (cli.program.name() !== "rag-pipeline") return "CLI name incorrect";
  if (
    !cli.program.description().includes("Enterprise-grade RAG pipeline toolkit")
  )
    return "CLI description incorrect";

  return true;
});

// Test 7: Essential File Existence
test("Essential files exist", () => {
  const essentialFiles = [
    "src/core/plugin-registry.js",
    "src/core/create-pipeline.js",
    "src/core/observability/instrumented-pipeline.js",
    "src/ai/index.js",
    "src/cli/enhanced-cli-commands.js",
    "package.json",
    "jest.config.js",
  ];

  for (const file of essentialFiles) {
    if (!fs.existsSync(path.join(__dirname, file))) {
      return `Missing essential file: ${file}`;
    }
  }

  return true;
});

// Test 8: Package.json Structure
test("Package.json structure", () => {
  const pkg = JSON.parse(
    fs.readFileSync(path.join(__dirname, "package.json"), "utf8"),
  );

  if (!pkg.scripts || !pkg.scripts.test) return "Missing test script";
  if (!pkg.dependencies || !pkg.devDependencies) return "Missing dependencies";
  if (!pkg.name || !pkg.version) return "Missing name or version";

  return true;
});

// Test 9: Jest Configuration
test("Jest configuration", () => {
  const jestConfig = require("./jest.config.js");

  if (!jestConfig.testEnvironment) return "Missing test environment";
  if (!jestConfig.setupFilesAfterEnv) return "Missing setup files";

  return true;
});

// Test 10: Module System Consistency
test("Module system consistency", () => {
  // Check that we're using CommonJS consistently
  const pkg = JSON.parse(
    fs.readFileSync(path.join(__dirname, "package.json"), "utf8"),
  );

  if (pkg.type === "module")
    return 'Package.json has "type": "module" which conflicts with CommonJS';

  return true;
});

console.log("\n" + "=".repeat(60));
console.log(
  `📊 VERIFICATION RESULTS: ${passedTests}/${totalTests} tests passed`,
);

if (failures.length > 0) {
  console.log("\n❌ FAILURES:");
  failures.forEach((failure) => console.log(`  • ${failure}`));
  console.log(
    "\n🔧 Please fix the above issues before running the full test suite.",
  );
  process.exit(1);
} else {
  console.log("\n🎉 ALL VERIFICATIONS PASSED!");
  console.log("✅ Ready for full test suite execution");
  console.log("\nNext steps:");
  console.log("  1. Run: npm test");
  console.log("  2. Fix any remaining test failures");
  console.log("  3. Complete final documentation");
  process.exit(0);
}
