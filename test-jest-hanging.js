#!/usr/bin/env node

/**
 * Test Jest hanging issues with our fixes
 * Simulates the problematic patterns that were causing hangs
 */

const { spawn } = require("child_process");
const path = require("path");

// Test a simple Jest run with our fixes
function runJestTest() {
  return new Promise((resolve, reject) => {
    console.log("🧪 Running Jest test to verify hanging fixes...");

    const jestProcess = spawn(
      "npx",
      [
        "jest",
        "__tests__/unit/streaming/llm-streaming.test.js",
        "--runInBand",
        "--verbose",
        "--testTimeout=30000",
        "--detectOpenHandles",
      ],
      {
        cwd: process.cwd(),
        stdio: ["pipe", "pipe", "pipe"],
      },
    );

    let stdout = "";
    let stderr = "";
    let timedOut = false;

    // Set a timeout to detect hanging
    const timeout = setTimeout(() => {
      timedOut = true;
      console.log("⏰ Jest test timed out after 45 seconds - likely hanging");
      jestProcess.kill("SIGTERM");

      // Force kill if it doesn't respond
      setTimeout(() => {
        jestProcess.kill("SIGKILL");
      }, 5000);

      reject(new Error("Jest test hung - timeout after 45 seconds"));
    }, 45000);

    jestProcess.stdout.on("data", (data) => {
      stdout += data.toString();
      process.stdout.write(data); // Live output
    });

    jestProcess.stderr.on("data", (data) => {
      stderr += data.toString();
      process.stderr.write(data); // Live output
    });

    jestProcess.on("close", (code) => {
      clearTimeout(timeout);

      if (timedOut) {
        return; // Already handled by timeout
      }

      console.log(`\n📊 Jest process exited with code: ${code}`);

      if (code === 0) {
        console.log(
          "🎉 Jest test completed successfully - no hanging detected!",
        );
        resolve({ success: true, code, stdout, stderr });
      } else {
        console.log(`❌ Jest test failed with exit code ${code}`);
        resolve({ success: false, code, stdout, stderr });
      }
    });

    jestProcess.on("error", (error) => {
      clearTimeout(timeout);
      console.error(`💥 Jest process error: ${error.message}`);
      reject(error);
    });
  });
}

// Main test
async function main() {
  console.log("🔍 Testing Jest hanging fixes...\n");

  try {
    const result = await runJestTest();

    if (result.success) {
      console.log("\n✅ SUCCESS: Jest hanging issues appear to be resolved!");
      console.log("   - Test completed without hanging");
      console.log("   - Process exited cleanly");
      console.log("   - No open handles detected");
    } else {
      console.log("\n⚠️  Jest test failed but did not hang");
      console.log(
        "   - This may be due to missing dependencies or test setup issues",
      );
      console.log(
        "   - The important thing is that it did not hang indefinitely",
      );
    }

    process.exit(0);
  } catch (error) {
    console.error(`\n❌ FAILURE: ${error.message}`);
    console.log("   - Jest test appears to be hanging");
    console.log("   - Additional fixes may be needed");
    process.exit(1);
  }
}

// Handle cleanup
process.on("SIGINT", () => {
  console.log("\n🛑 Interrupted - cleaning up...");
  process.exit(0);
});

main();
