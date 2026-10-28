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

// Loopback is allowed only for tests that opt in by setting
// globalThis.__ALLOW_LOOPBACK_HTTP__ (they start their own local server).
// Otherwise a test could silently reach a real local service, e.g. Ollama.
function isLoopback(target) {
  if (!globalThis.__ALLOW_LOOPBACK_HTTP__) return false;
  try {
    const host =
      typeof target === "string" || target instanceof URL
        ? new URL(String(target)).hostname
        : target.hostname || (target.host || "").split(":")[0];
    return ["127.0.0.1", "localhost", "::1", "[::1]"].includes(host);
  } catch {
    return false;
  }
}

function deny(fnName, orig) {
  return (...args) => {
    if (isLoopback(args[0])) return orig(...args);
    const msg = `🚫 ${fnName} blocked in tests: ${prettyUrl(args[0])}`;
    // eslint-disable-next-line no-console
    console.error(msg, "\n", new Error().stack);
    throw new Error(msg);
  };
}

// Block Node core http/https. Core modules are shared by every test file in
// the process, so always wrap the original function; wrapping the previous
// file's wrapper would stack checks bound to stale per-file globals.
for (const [mod, name] of [
  [http, "http"],
  [https, "https"],
]) {
  mod.__originalRequest = mod.__originalRequest || mod.request;
  mod.__originalGet = mod.__originalGet || mod.get;
  mod.request = deny(`${name}.request`, mod.__originalRequest.bind(mod));
  mod.get = deny(`${name}.get`, mod.__originalGet.bind(mod));
}

// Block global fetch (Node 18+ / 22 uses undici)
if (globalThis.fetch) {
  const original = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    const url = typeof input === "string" ? input : input?.url;
    if (isLoopback(url)) return original(input, init);
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
  // path.resolve is deliberately NOT patched: forcing "/" separators on
  // Windows broke path.relative, containment checks and coverage mapping.
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
