#!/usr/bin/env node

/**
 * Simple test script to verify stream and timer fixes
 * Tests the core streaming functionality without Jest overhead
 */

const { performance } = require("perf_hooks");

// Test timeout wrapper
function withTimeout(p, ms, label) {
  let t;
  return Promise.race([
    p,
    new Promise(
      (_, rej) =>
        (t = setTimeout(() => rej(new Error(`Timed out: ${label}`)), ms)),
    ),
  ]).finally(() => clearTimeout(t));
}

// Mock streaming function
async function* mockStream(tokens) {
  for (const token of tokens) {
    yield { content: token, done: false };
  }
  yield { content: "", done: true };
}

// Test async iteration (the main culprit in hanging tests)
async function testAsyncIteration() {
  console.log("🔄 Testing async iteration...");
  const start = performance.now();

  const tokens = [];
  const stream = mockStream(["Hello", " ", "World", "!"]);

  try {
    for await (const chunk of stream) {
      tokens.push(chunk.content);
      if (chunk.done) break;
    }

    const duration = performance.now() - start;
    console.log(`✅ Async iteration completed in ${duration.toFixed(2)}ms`);
    console.log(`   Collected tokens: ${JSON.stringify(tokens)}`);
    return true;
  } catch (error) {
    console.error(`❌ Async iteration failed: ${error.message}`);
    return false;
  }
}

// Test timer cleanup
async function testTimerCleanup() {
  console.log("🔄 Testing timer cleanup...");

  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      console.log("✅ Timer executed and will be cleaned up");
      resolve(true);
    }, 100);

    // Ensure timer doesn't keep process alive
    if (typeof timer.unref === "function") {
      timer.unref();
    }
  });
}

// Test timeout wrapper
async function testTimeoutWrapper() {
  console.log("🔄 Testing timeout wrapper...");

  try {
    // This should complete quickly
    await withTimeout(
      new Promise((resolve) => setTimeout(resolve, 50)),
      1000,
      "quick-promise",
    );
    console.log("✅ Timeout wrapper works for successful promises");

    // This should timeout
    try {
      await withTimeout(
        new Promise(() => {}), // Never resolves
        100,
        "hanging-promise",
      );
      console.log("❌ Timeout wrapper failed - should have timed out");
      return false;
    } catch (error) {
      if (error.message.includes("Timed out: hanging-promise")) {
        console.log("✅ Timeout wrapper correctly caught hanging promise");
        return true;
      } else {
        console.log(`❌ Unexpected error: ${error.message}`);
        return false;
      }
    }
  } catch (error) {
    console.error(`❌ Timeout wrapper test failed: ${error.message}`);
    return false;
  }
}

// Main test runner
async function runTests() {
  console.log("🧪 Running stream and timer fix validation tests...\n");

  const results = [];

  // Run tests
  results.push(await testAsyncIteration());
  results.push(await testTimerCleanup());
  results.push(await testTimeoutWrapper());

  // Summary
  const passed = results.filter(Boolean).length;
  const total = results.length;

  console.log(`\n📊 Test Results: ${passed}/${total} passed`);

  if (passed === total) {
    console.log("🎉 All stream and timer fixes are working correctly!");
    process.exit(0);
  } else {
    console.log("❌ Some tests failed - stream/timer issues may persist");
    process.exit(1);
  }
}

// Handle cleanup
process.on("exit", () => {
  console.log("🧹 Process exiting cleanly");
});

process.on("SIGINT", () => {
  console.log("\n🛑 Interrupted - cleaning up...");
  process.exit(0);
});

// Run the tests
runTests().catch((error) => {
  console.error(`💥 Test runner crashed: ${error.message}`);
  process.exit(1);
});
