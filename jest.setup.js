// Global test setup and cleanup
afterEach(() => {
  // Clear all mocks
  jest.clearAllMocks();
  
  // Force garbage collection if available
  if (global.gc) {
    global.gc();
  }
  
  // Clear any timers
  jest.clearAllTimers();
});

// Global error handler
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});
