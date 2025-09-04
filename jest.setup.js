/* eslint-disable */
// ---- Global network block for tests (catches hangs) ----
const http = require("http");
const https = require("https");

function prettyUrl(target) {
  try {
    if (typeof target === "string") return target;
    const proto = target.protocol || "http:";
    const host = target.hostname || target.host || "localhost";
    const path = target.path || "/";
    return `${proto}//${host}${path}`;
  } catch {
    return String(target);
  }
}

function deny(fnName, orig) {
  return (...args) => {
    const msg = `🚫 ${fnName} blocked in tests: ${prettyUrl(args[0])}`;
    // eslint-disable-next-line no-console
    console.error(msg, "\n", new Error().stack);
    throw new Error(msg);
  };
}

// Block Node core http/https
http.request = deny("http.request", http.request.bind(http));
http.get = deny("http.get", http.get.bind(http));
https.request = deny("https.request", https.request.bind(https));
https.get = deny("https.get", https.get.bind(https));

// Block global fetch (Node 18+ / 22 uses undici)
if (globalThis.fetch) {
  const original = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    const url = typeof input === "string" ? input : input?.url;
    const msg = `🚫 fetch blocked in tests: ${url}`;
    // eslint-disable-next-line no-console
    console.error(msg, "\n", new Error().stack);
    throw new Error(msg);
  };
}

// Also tell undici itself to disallow net connects (belt + suspenders)
try {
  const { setGlobalDispatcher, MockAgent } = require("undici");
  const mock = new MockAgent();
  mock.disableNetConnect();
  setGlobalDispatcher(mock);
} catch (_) {}
// ---------------------------------------------------------

// Global test setup and cleanup
const {
  MockOpenAI,
  MockAzureOpenAI,
  MockPinecone,
  MockChroma,
  TestMockUtils,
} = require("./__tests__/mocks/external-apis");
const { TestEnvironment } = require("./__tests__/utils/test-environment");

// Mock external APIs globally to reduce test flakiness
jest.mock("openai", () => {
  return {
    OpenAI: MockOpenAI,
  };
});

// Conditionally mock @azure/openai only if it exists
try {
  require.resolve("@azure/openai");
  jest.mock("@azure/openai", () => {
    return {
      OpenAIApi: MockAzureOpenAI,
    };
  });
} catch (e) {
  // Package not installed, skip mocking
}

// Conditionally mock @pinecone-database/pinecone only if it exists
try {
  require.resolve("@pinecone-database/pinecone");
  jest.mock("@pinecone-database/pinecone", () => {
    return {
      Pinecone: MockPinecone,
    };
  });
} catch (e) {
  // Package not installed, skip mocking
}

// Conditionally mock chromadb only if it exists
try {
  require.resolve("chromadb");
  jest.mock("chromadb", () => {
    return {
      ChromaApi: MockChroma,
    };
  });
} catch (e) {
  // Package not installed, skip mocking
}

// Set longer timeout for tests with external API calls
jest.setTimeout(60000);

// Configure timezone for deterministic tests
process.env.TZ = "UTC";

// Windows-friendly VM module support
if (process.platform === "win32") {
  // Enable experimental VM modules for Windows
  process.env.NODE_OPTIONS =
    (process.env.NODE_OPTIONS || "") + " --experimental-vm-modules";

  // Set Windows-specific path handling
  const path = require("path");
  const originalResolve = path.resolve;
  path.resolve = function (...args) {
    const result = originalResolve.apply(this, args);
    // Normalize Windows paths for consistent testing
    return result.replace(/\\/g, "/");
  };
}

// Use modern fake timers by default for determinism (Windows-friendly)
jest.useFakeTimers({
  advanceTimers: true,
  doNotFake: ["nextTick", "setImmediate"],
  legacyFakeTimers: false,
});

// Setup deterministic test environment
beforeAll(() => {
  TestEnvironment.setup();
});

afterAll(() => {
  TestEnvironment.cleanup();

  // Make sure all idle sockets are gone
  const http = require("http");
  const https = require("https");
  http.globalAgent.destroy();
  https.globalAgent.destroy();

  // If your code uses node-fetch/undici internally, also disable keep-alive:
  try {
    const { setGlobalDispatcher, Agent } = require("undici");
    setGlobalDispatcher(
      new Agent({ keepAliveTimeout: 1, keepAliveMaxTimeout: 1 }),
    );
  } catch {
    /* undici may not be a dep; ignore */
  }
});

afterEach(() => {
  // Clear all mocks
  jest.clearAllMocks();
  jest.resetAllMocks();

  // Reset module registry to ensure hermetic isolation
  jest.resetModules();

  // Force garbage collection if available
  if (global.gc) {
    global.gc();
  }

  // Clear any timers
  jest.clearAllTimers();

  // Clear environment variables that might affect tests
  delete process.env.NODE_ENV;
  delete process.env.OPENAI_API_KEY;
  delete process.env.AZURE_OPENAI_API_KEY;
  delete process.env.PINECONE_API_KEY;
});

// Global error handler
process.on("unhandledRejection", (reason, promise) => {
  throw new Error(`Unhandled Promise Rejection: ${reason}`);
});

// Make test utilities available globally
global.TestMockUtils = TestMockUtils;
