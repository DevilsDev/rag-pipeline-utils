/**
 * Test Setup for Resource Management
 * Batch 4: Resource Management - Global test cleanup and leak prevention
 */

// Global test setup for resource management
beforeEach(() => {
  // Clear any pending timers before each test
  jest.clearAllTimers();

  // Reset all mocks to prevent state leakage
  jest.clearAllMocks();
});

afterEach(async () => {
  // Clean up any remaining timers
  jest.clearAllTimers();

  // Force garbage collection if available
  if (global.gc) {
    global.gc();
  }

  // Clear any console spies or mocks
  if (jest.isMockFunction(console.log)) {
    console.log.mockRestore();
  }
  if (jest.isMockFunction(console.error)) {
    console.error.mockRestore();
  }
  if (jest.isMockFunction(console.warn)) {
    console.warn.mockRestore();
  }
});

afterAll(async () => {
  // Final cleanup to prevent resource leaks
  jest.clearAllTimers();

  // Close any open handles
  if (global.gc) {
    global.gc();
  }

  // Allow time for async cleanup
  await new Promise((resolve) => setTimeout(resolve, 100));
});

// Handle unhandled promise rejections in tests
process.on("unhandledRejection", (reason, promise) => {
  console.error("Unhandled Rejection at:", promise, "reason:", reason);
  // Don't exit the process in tests, just log
});

// Handle uncaught exceptions in tests
process.on("uncaughtException", (error) => {
  console.error("Uncaught Exception:", error);
  // Don't exit the process in tests, just log
});

module.exports = {};
