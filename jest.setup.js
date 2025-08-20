// Global test setup and cleanup
const {
  MockOpenAI,
  MockAzureOpenAI,
  MockPinecone,
  MockChroma,
  TestMockUtils
} = require('./__tests__/mocks/external-apis');

// Mock external APIs globally to reduce test flakiness
jest.mock('openai', () => {
  return {
    OpenAI: MockOpenAI
  };
});

jest.mock('@azure/openai', () => {
  return {
    OpenAIApi: MockAzureOpenAI
  };
});

jest.mock('@pinecone-database/pinecone', () => {
  return {
    Pinecone: MockPinecone
  };
});

jest.mock('chromadb', () => {
  return {
    ChromaApi: MockChroma
  };
});

// Set longer timeout for tests with external API calls
jest.setTimeout(30000);

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

// Make test utilities available globally
global.TestMockUtils = TestMockUtils;
