"use strict";

const { EventEmitter } = require("events");
const { SSEAdapter } = require("../../../src/streaming/sse-adapter");
const {
  WebSocketAdapter,
} = require("../../../src/streaming/websocket-adapter");
const { StreamRouter } = require("../../../src/streaming/stream-router");

function fakeRes() {
  const r = new EventEmitter();
  r.out = [];
  r.writableEnded = false;
  r.headersSent = false;
  r.writeHead = () => {
    r.headersSent = true;
  };
  r.setHeader = () => {};
  r.write = (x) => r.out.push(x);
  r.end = (x) => {
    if (x) r.out.push(x);
    r.writableEnded = true;
  };
  return r;
}

function fakeWs() {
  const ws = new EventEmitter();
  ws.sent = [];
  ws.send = (m) => ws.sent.push(JSON.parse(m));
  ws.readyState = 1;
  return ws;
}

async function* finalChunk() {
  yield { token: "hi", done: false };
  yield {
    token: "",
    done: true,
    citations: [{ id: "a" }],
    timing: { totalMs: 5 },
  };
}

async function* failing() {
  yield { token: "a" };
  throw new Error("model failed");
}

describe("streaming: final chunk", () => {
  test("SSE forwards the final chunk fields once and sends one sentinel", async () => {
    const res = fakeRes();
    await new SSEAdapter({ heartbeatIntervalMs: 60000 }).stream(
      finalChunk(),
      res,
    );
    const all = res.out.join("");
    expect(all.match(/\[DONE\]/g)).toHaveLength(1);
    expect(all).toContain("event: done");
    expect(all).toContain('"citations":[{"id":"a"}]');
    expect(all.match(/"citations"/g)).toHaveLength(1);
  });

  test("WebSocket forwards the final chunk fields once and sends one done message", async () => {
    const ws = fakeWs();
    await new WebSocketAdapter().stream(finalChunk(), ws);
    const done = ws.sent.filter((m) => m.type === "done");
    expect(done).toHaveLength(1);
    expect(done[0].data.citations).toEqual([{ id: "a" }]);
    expect(done[0].data.timing).toEqual({ totalMs: 5 });
  });

  test("a plain done chunk still produces a single sentinel", async () => {
    const res = fakeRes();
    async function* g() {
      yield { token: "x" };
      yield { done: true };
    }
    await new SSEAdapter({ heartbeatIntervalMs: 60000 }).stream(g(), res);
    expect(res.out.join("").match(/\[DONE\]/g)).toHaveLength(1);
  });
});

describe("streaming: failing token stream without an error listener", () => {
  test("SSE writes an error frame and resolves", async () => {
    const res = fakeRes();
    await expect(
      new SSEAdapter({ heartbeatIntervalMs: 60000 }).stream(failing(), res),
    ).resolves.toBeUndefined();
    expect(res.out.join("")).toContain("event: error");
    expect(res.writableEnded).toBe(true);
  });

  test("SSE still emits error when a listener exists", async () => {
    const a = new SSEAdapter({ heartbeatIntervalMs: 60000 });
    const seen = [];
    a.on("error", (e) => seen.push(e.message));
    await a.stream(failing(), fakeRes());
    expect(seen).toEqual(["model failed"]);
  });

  test("WebSocket sends an error message and resolves", async () => {
    const ws = fakeWs();
    await expect(
      new WebSocketAdapter().stream(failing(), ws),
    ).resolves.toBeUndefined();
    expect(ws.sent.some((m) => m.type === "error")).toBe(true);
  });

  test("WebSocket socket error without a listener does not throw", () => {
    const ws = fakeWs();
    const adapter = new WebSocketAdapter();
    async function* slow() {
      yield { token: "a" };
      await new Promise((r) => setTimeout(r, 20));
      yield { token: "b" };
    }
    const p = adapter.stream(slow(), ws);
    expect(() => ws.emit("error", new Error("socket"))).not.toThrow();
    return p;
  });

  test("StreamRouter handler resolves when the pipeline stream throws", async () => {
    const pipeline = { run: async () => failing() };
    const handler = new StreamRouter().createHandler(pipeline);
    const res = fakeRes();
    await expect(
      handler(
        { body: { query: "q" }, headers: { accept: "text/event-stream" } },
        res,
      ),
    ).resolves.toBeUndefined();
    expect(res.out.join("")).toContain("event: error");
  });

  test("StreamRouter handler resolves when run() itself rejects", async () => {
    const pipeline = {
      run: async () => {
        throw new Error("boom");
      },
    };
    const handler = new StreamRouter().createHandler(pipeline);
    const res = fakeRes();
    await expect(
      handler({ body: { query: "q" }, headers: {} }, res),
    ).resolves.toBeUndefined();
    expect(res.writableEnded).toBe(true);
  });
});
