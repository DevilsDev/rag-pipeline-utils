#!/usr/bin/env node

// Validation script for critical fixes
console.log("🔍 Validating critical fixes...\n");

let allPassed = true;

// Test 1: Plugin registry import and methods
try {
  const { registry } = require("./src/core/plugin-registry.js");
  console.log("✅ Plugin registry import successful");

  if (typeof registry.get === "function") {
    console.log("✅ registry.get() method exists");
  } else {
    console.log("❌ registry.get() method missing");
    allPassed = false;
  }

  // Test registry operations
  const mockPlugin = { name: "test-plugin" };
  registry.register("loader", "test-loader", mockPlugin);
  const retrieved = registry.get("loader", "test-loader");

  if (retrieved === mockPlugin) {
    console.log("✅ Plugin registry operations working");
  } else {
    console.log("❌ Plugin registry operations failed");
    allPassed = false;
  }
} catch (error) {
  console.log("❌ Plugin registry test failed:", error.message);
  allPassed = false;
}

// Test 2: Create pipeline import
try {
  const { createRagPipeline } = require("./src/core/create-pipeline.js");
  console.log("✅ createRagPipeline import successful");
} catch (error) {
  console.log("❌ createRagPipeline import failed:", error.message);
  allPassed = false;
}

// Test 3: Instrumented pipeline cleanup method
try {
  const {
    createInstrumentedPipeline,
  } = require("./src/core/observability/instrumented-pipeline.js");
  console.log("✅ createInstrumentedPipeline import successful");

  // Create a mock pipeline to test instrumentation
  const mockPipeline = {
    ingest: () => Promise.resolve(),
    query: () => Promise.resolve("test response"),
  };

  const instrumented = createInstrumentedPipeline(mockPipeline);

  if (typeof instrumented.cleanup === "function") {
    console.log("✅ instrumented.cleanup() method exists");
    instrumented.cleanup(); // Test cleanup execution
    console.log("✅ cleanup() executed successfully");
  } else {
    console.log("❌ instrumented.cleanup() method missing");
    allPassed = false;
  }
} catch (error) {
  console.log("❌ Instrumented pipeline test failed:", error.message);
  allPassed = false;
}

console.log("\n" + "=".repeat(50));
if (allPassed) {
  console.log("🎉 ALL CRITICAL FIXES VALIDATED SUCCESSFULLY!");
  process.exit(0);
} else {
  console.log("❌ Some fixes still need attention");
  process.exit(1);
}
