"use strict";

const { SSEAdapter } = require("../../../src/streaming/sse-adapter");
const {
  WebSocketAdapter,
} = require("../../../src/streaming/websocket-adapter");
const { StreamRouter } = require("../../../src/streaming/stream-router");

/**
 * Helper: create a mock HTTP response object
 */
function createMockHttpResponse() {
  return {
    writeHead: jest.fn(),
    write: jest.fn(),
    end: jest.fn(),
    on: jest.fn(),
    removeListener: jest.fn(),
    headersSent: false,
    writableEnded: false,
    setHeader: jest.fn(),
  };
}

/**
 * Helper: create a mock WebSocket connection object
 */
function createMockWsConnection() {
  return {
    send: jest.fn(),
    on: jest.fn(),
    removeListener: jest.fn(),
    readyState: 1, // OPEN
  };
}

/**
 * Helper: create an async generator from an array of values
 */
async function* arrayToAsyncGenerator(values) {
  for (const value of values) {
    yield value;
  }
}

describe("SSEAdapter", () => {
  let adapter;
  let mockRes;

  beforeEach(() => {
    adapter = new SSEAdapter({ heartbeatIntervalMs: 60000 }); // long interval to avoid interference
    mockRes = createMockHttpResponse();
  });

  describe("stream()", () => {
    test("writes SSE headers", async () => {
      const gen = arrayToAsyncGenerator([{ token: "hello" }]);
      await adapter.stream(gen, mockRes);

      expect(mockRes.writeHead).toHaveBeenCalledWith(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      });
    });

    test("formats events correctly and sends tokens", async () => {
      const gen = arrayToAsyncGenerator([
        { token: "Hello" },
        { token: " world" },
      ]);
      await adapter.stream(gen, mockRes);

      // Should have written token events
      const writes = mockRes.write.mock.calls.map((c) => c[0]);
      const tokenWrites = writes.filter((w) => w.includes("event: token"));
      expect(tokenWrites.length).toBe(2);
    });

    test("sends [DONE] at end of stream", async () => {
      const gen = arrayToAsyncGenerator([{ token: "test" }]);
      await adapter.stream(gen, mockRes);

      const writes = mockRes.write.mock.calls.map((c) => c[0]);
      const doneWrites = writes.filter((w) => w.includes("[DONE]"));
      expect(doneWrites.length).toBe(1);
    });

    test("sends [DONE] when generator yields done flag", async () => {
      const gen = arrayToAsyncGenerator([{ token: "hello" }, { done: true }]);
      await adapter.stream(gen, mockRes);

      const writes = mockRes.write.mock.calls.map((c) => c[0]);
      const doneWrites = writes.filter((w) => w.includes("[DONE]"));
      expect(doneWrites.length).toBeGreaterThanOrEqual(1);
    });

    test("calls end on response", async () => {
      const gen = arrayToAsyncGenerator([]);
      await adapter.stream(gen, mockRes);
      expect(mockRes.end).toHaveBeenCalled();
    });

    test("handles empty generator", async () => {
      const gen = arrayToAsyncGenerator([]);
      await adapter.stream(gen, mockRes);

      expect(mockRes.writeHead).toHaveBeenCalled();
      // Should still send DONE
      const writes = mockRes.write.mock.calls.map((c) => c[0]);
      const doneWrites = writes.filter((w) => w.includes("[DONE]"));
      expect(doneWrites.length).toBe(1);
    });

    test("handles client disconnect during stream", async () => {
      // Simulate client disconnect via the 'close' event callback
      mockRes.on.mockImplementation((event, cb) => {
        if (event === "close") {
          // Trigger close immediately after first write
          const origWrite = mockRes.write;
          mockRes.write = jest.fn((...args) => {
            origWrite(...args);
            cb(); // disconnect
          });
        }
      });

      const gen = arrayToAsyncGenerator([
        { token: "a" },
        { token: "b" },
        { token: "c" },
      ]);

      await adapter.stream(gen, mockRes);
      // Should not throw
    });
  });

  describe("formatEvent()", () => {
    test("formats single-line data", () => {
      const frame = adapter.formatEvent("token", { token: "hello" });
      expect(frame).toContain("event: token\n");
      expect(frame).toContain("data: ");
      expect(frame).toMatch(/\n\n$/);
    });

    test("formats data with JSON serialization", () => {
      const frame = adapter.formatEvent("test", { key: "value" });
      expect(frame).toContain("event: test\n");
      // The data line should contain valid JSON
      const dataMatch = frame.match(/data: (.+)\n/);
      expect(dataMatch).toBeTruthy();
      const parsed = JSON.parse(dataMatch[1]);
      expect(parsed.key).toBe("value");
    });
  });
});

describe("WebSocketAdapter", () => {
  let adapter;
  let mockWs;

  beforeEach(() => {
    adapter = new WebSocketAdapter();
    mockWs = createMockWsConnection();
  });

  describe("stream()", () => {
    test("sends JSON messages for each token", async () => {
      const gen = arrayToAsyncGenerator([
        { token: "Hello" },
        { token: " world" },
      ]);
      await adapter.stream(gen, mockWs);

      // Token messages + done message
      expect(mockWs.send.mock.calls.length).toBeGreaterThanOrEqual(3);

      // Verify token messages
      const firstMsg = JSON.parse(mockWs.send.mock.calls[0][0]);
      expect(firstMsg.type).toBe("token");
      expect(firstMsg.data.token).toBe("Hello");
    });

    test("sends done message when generator exhausted", async () => {
      const gen = arrayToAsyncGenerator([{ token: "test" }]);
      await adapter.stream(gen, mockWs);

      const lastMsg = JSON.parse(
        mockWs.send.mock.calls[mockWs.send.mock.calls.length - 1][0],
      );
      expect(lastMsg.type).toBe("done");
    });

    test("handles explicit done flag from generator", async () => {
      const gen = arrayToAsyncGenerator([{ token: "hi" }, { done: true }]);
      await adapter.stream(gen, mockWs);

      const calls = mockWs.send.mock.calls.map((c) => JSON.parse(c[0]));
      const doneMsgs = calls.filter((m) => m.type === "done");
      expect(doneMsgs.length).toBeGreaterThanOrEqual(1);
    });

    test("throws TypeError for invalid connection", async () => {
      const gen = arrayToAsyncGenerator([]);
      await expect(adapter.stream(gen, {})).rejects.toThrow(TypeError);
      await expect(adapter.stream(gen, null)).rejects.toThrow(TypeError);
    });

    test("handles closed connection gracefully", async () => {
      mockWs.readyState = 3; // CLOSED
      const gen = arrayToAsyncGenerator([{ token: "a" }, { token: "b" }]);
      await adapter.stream(gen, mockWs);
      // Should not throw; may not send any messages since readyState is not OPEN
    });
  });
});

describe("StreamRouter", () => {
  let router;
  let mockPipeline;

  beforeEach(() => {
    router = new StreamRouter();
    mockPipeline = {
      run: jest.fn().mockResolvedValue({
        answer: "streamed answer",
        results: [{ content: "doc1" }],
      }),
    };
  });

  describe("createHandler()", () => {
    test("returns a function", () => {
      const handler = router.createHandler(mockPipeline);
      expect(typeof handler).toBe("function");
    });

    test("handles SSE accept header", async () => {
      const handler = router.createHandler(mockPipeline);
      const req = {
        body: { query: "test query" },
        headers: { accept: "text/event-stream" },
        method: "POST",
      };
      const res = createMockHttpResponse();

      await handler(req, res);

      // Pipeline should be called
      expect(mockPipeline.run).toHaveBeenCalled();
    });

    test("returns 400 when query is missing", async () => {
      const handler = router.createHandler(mockPipeline);
      const req = {
        body: {},
        headers: {},
        method: "POST",
      };
      const res = createMockHttpResponse();

      await handler(req, res);

      expect(res.writeHead).toHaveBeenCalledWith(400, expect.any(Object));
    });

    test("handles OPTIONS preflight with CORS enabled", async () => {
      const handler = router.createHandler(mockPipeline);
      const req = {
        body: { query: "test" },
        headers: {},
        method: "OPTIONS",
      };
      const res = createMockHttpResponse();

      await handler(req, res);

      expect(res.writeHead).toHaveBeenCalledWith(204);
      expect(res.end).toHaveBeenCalled();
    });

    test("uses query param q as fallback", async () => {
      const handler = router.createHandler(mockPipeline);
      const req = {
        query: { q: "fallback query" },
        headers: { accept: "text/event-stream" },
        method: "POST",
      };
      const res = createMockHttpResponse();

      await handler(req, res);

      expect(mockPipeline.run).toHaveBeenCalledWith(
        expect.objectContaining({ query: "fallback query" }),
      );
    });
  });
});
