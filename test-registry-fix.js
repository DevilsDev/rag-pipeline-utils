#!/usr/bin/env node

// Test script to verify plugin registry fix
console.log("Testing plugin registry fix...");

try {
  // Test the fixed import
  const { registry } = require("./src/core/plugin-registry.js");
  console.log("✅ Registry import successful");

  // Test registry methods
  if (typeof registry.get === "function") {
    console.log("✅ registry.get() method exists");
  } else {
    console.log("❌ registry.get() method missing");
    process.exit(1);
  }

  // Test create-pipeline import
  const { createRagPipeline } = require("./src/core/create-pipeline.js");
  console.log("✅ createRagPipeline import successful");

  // Test basic registry operations
  const mockPlugin = { test: true };
  registry.register("test", "mock-plugin", mockPlugin);
  const retrieved = registry.get("test", "mock-plugin");

  if (retrieved === mockPlugin) {
    console.log("✅ Plugin registry operations working correctly");
  } else {
    console.log("❌ Plugin registry operations failed");
    process.exit(1);
  }

  console.log("✅ All registry tests passed!");
} catch (error) {
  console.error("❌ Test failed:", error.message);
  process.exit(1);
}
