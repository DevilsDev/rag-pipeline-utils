/**
 * Unit tests for distributed tracing support
 * Tests span lifecycle, tracing, and export functionality
 */

const {
  Span,
  Tracer,
  PipelineTracer,
  pipelineTracer,
} = require("../../../src/core/observability/tracing.js");

describe("Span", () => {
  let span;

  beforeEach(() => {
    span = new Span("test.operation", "test-trace-id");
  });

  describe("constructor", () => {
    it("should initialize with required properties", () => {
      expect(span.name).toBe("test.operation");
      expect(span.traceId).toBe("test-trace-id");
      expect(span.spanId).toMatch(/^[a-f0-9]{16}$/);
      expect(span.startTime).toBeInstanceOf(Date);
      expect(span.endTime).toBeNull();
      // Check that attributes is properly initialized (empty Map with Proxy)
      expect(Object.keys(Object.fromEntries(span.attributes))).toHaveLength(0);
      expect(span.events).toEqual([]);
      expect(span.status).toEqual({ code: "UNSET" });
    });

    it("should generate unique span IDs", () => {
      const span1 = new Span("test1", "trace1");
      const span2 = new Span("test2", "trace2");
      expect(span1.spanId).not.toBe(span2.spanId);
    });

    it("should accept parent span ID", () => {
      const parentSpan = new Span("parent", "trace-id");
      const childSpan = new Span("child", "trace-id", parentSpan.spanId);
      expect(childSpan.parentSpanId).toBe(parentSpan.spanId);
    });
  });

  describe("setAttributes", () => {
    it("should set single attribute", () => {
      span.setAttribute("key", "value");
      expect(span.attributes.key).toBe("value");
    });

    it("should set multiple attributes", () => {
      span.setAttributes({
        key1: "value1",
        key2: 42,
        key3: true,
      });

      expect(span.attributes["key1"]).toBe("value1");
      expect(span.attributes["key2"]).toBe(42);
      expect(span.attributes["key3"]).toBe(true);
    });

    it("should merge with existing attributes", () => {
      span.setAttribute("existing", "value");
      span.setAttributes({ new: "value", existing: "updated" });

      expect(span.attributes["existing"]).toBe("updated");
      expect(span.attributes["new"]).toBe("value");
    });
  });

  describe("addEvent", () => {
    it("should add event with timestamp", () => {
      span.addEvent("test.event", { data: "value" });

      expect(span.events).toHaveLength(1);
      expect(span.events[0].name).toBe("test.event");
      expect(span.events[0].attributes.data).toBe("value");
      expect(span.events[0].timestamp).toBeInstanceOf(Date);
    });

    it("should add event without attributes", () => {
      span.addEvent("simple.event");

      expect(span.events[0].name).toBe("simple.event");
      expect(span.events[0].attributes).toEqual({});
    });
  });

  describe("recordException", () => {
    it("should record error with details", () => {
      const error = new Error("Test error");
      error.code = "TEST_ERROR";
      error.stack = "Error: Test error\n    at test";

      span.recordException(error);

      expect(span.status).toEqual({ code: "ERROR", message: "Test error" });
      expect(span.events).toHaveLength(1);

      const event = span.events[0];
      expect(event.name).toBe("exception");
      expect(event.attributes["exception.type"]).toBe("Error");
      expect(event.attributes["exception.message"]).toBe("Test error");
      expect(event.attributes["exception.code"]).toBe("TEST_ERROR");
      expect(event.attributes["exception.stacktrace"]).toBe(
        "Error: Test error\n    at test",
      );
    });

    it("should handle error without stack trace", () => {
      const error = new Error("Simple error");
      delete error.stack;

      span.recordException(error);

      expect(span.events[0].attributes["exception.stacktrace"]).toBeUndefined();
    });
  });

  describe("end", () => {
    it("should set end time and mark as finished", () => {
      expect(span.isFinished()).toBe(false);

      span.end();

      expect(span.endTime).toBeInstanceOf(Date);
      expect(span.isFinished()).toBe(true);
      expect(span.getDuration()).toBeGreaterThan(0);
    });

    it("should not allow ending twice", () => {
      span.end();
      const firstEndTime = span.endTime;

      // Try to end again
      span.end();

      expect(span.endTime).toBe(firstEndTime);
    });
  });

  describe("getDuration", () => {
    it("should return duration for finished span", () => {
      span.end();
      const duration = span.getDuration();
      expect(duration).toBeGreaterThanOrEqual(0);
    });

    it("should return current duration for active span", () => {
      // Use real timers for this test to ensure proper time measurement
      jest.useRealTimers();

      const duration = span.getDuration();
      expect(duration).toBeGreaterThanOrEqual(0);

      // Restore fake timers for other tests
      jest.useFakeTimers({
        advanceTimers: true,
        doNotFake: ["nextTick", "setImmediate"],
        legacyFakeTimers: false,
      });
    });
  });

  describe("toJSON", () => {
    it("should serialize span data", () => {
      span.setAttribute("test", "value");
      span.addEvent("test.event");
      span.end();

      const json = span.toJSON();

      expect(json.name).toBe("test.operation");
      expect(json.traceId).toBe("test-trace-id");
      expect(json.spanId).toBe(span.spanId);
      expect(json.startTime).toBe(span.startTime.toISOString());
      expect(json.endTime).toBe(span.endTime.toISOString());
      expect(json.duration).toBe(span.getDuration());
      expect(json.attributes).toEqual({ test: "value" });
      expect(json.events).toHaveLength(1);
      expect(json.status).toEqual({ code: "OK" });
    });
  });
});

describe("Tracer", () => {
  let tracer;

  beforeEach(() => {
    tracer = new Tracer();
  });

  describe("startSpan", () => {
    it("should create new span with unique trace ID", () => {
      const span = tracer.startSpan("test.operation");

      expect(span).toBeInstanceOf(Span);
      expect(span.name).toBe("test.operation");
      expect(span.traceId).toMatch(/^[a-f0-9]{32}$/);
      expect(span.parentSpanId).toBeUndefined();
    });

    it("should create child span with same trace ID", () => {
      const parentSpan = tracer.startSpan("parent");
      const childSpan = tracer.startSpan("child", { parent: parentSpan });

      expect(childSpan.traceId).toBe(parentSpan.traceId);
      expect(childSpan.parentSpanId).toBe(parentSpan.spanId);
    });

    it("should set initial attributes", () => {
      const span = tracer.startSpan("test", {
        attributes: { key: "value", number: 42 },
      });

      expect(span.attributes["key"]).toBe("value");
      expect(span.attributes["number"]).toBe(42);
    });
  });

  describe("span management", () => {
    it("should track active spans", () => {
      expect(tracer.getActiveSpans()).toHaveLength(0);

      const span1 = tracer.startSpan("span1");
      const span2 = tracer.startSpan("span2");

      expect(tracer.getActiveSpans()).toHaveLength(2);
      expect(tracer.getActiveSpans()).toContain(span1);
      expect(tracer.getActiveSpans()).toContain(span2);
    });

    it("should remove spans when finished", () => {
      const span = tracer.startSpan("test");
      expect(tracer.getActiveSpans()).toHaveLength(1);

      span.end();
      expect(tracer.getActiveSpans()).toHaveLength(0);
      expect(tracer.getCompletedSpans()).toHaveLength(1);
    });

    it("should maintain completed spans", () => {
      const span1 = tracer.startSpan("span1");
      const span2 = tracer.startSpan("span2");

      span1.end();
      span2.end();

      expect(tracer.getCompletedSpans()).toHaveLength(2);
    });
  });

  describe("exportSpans", () => {
    it("should export completed spans", () => {
      const span1 = tracer.startSpan("span1");
      const span2 = tracer.startSpan("span2");

      span1.setAttribute("test", "value1");
      span2.setAttribute("test", "value2");

      span1.end();
      span2.end();

      const exported = tracer.exportSpans();
      expect(exported).toHaveLength(2);
      expect(exported[0].name).toBe("span1");
      expect(exported[1].name).toBe("span2");
    });

    it("should filter spans by criteria", () => {
      const span1 = tracer.startSpan("operation1");
      const span2 = tracer.startSpan("operation2");

      span1.end();
      span2.end();

      const filtered = tracer.exportSpans({ namePattern: /operation1/ });
      expect(filtered).toHaveLength(1);
      expect(filtered[0].name).toBe("operation1");
    });

    it("should filter spans by duration", () => {
      const span1 = tracer.startSpan("fast");
      const span2 = tracer.startSpan("slow");

      span1.end(); // Fast span

      // Simulate slow span
      jest.advanceTimersByTime(10);
      span2.end();

      // Wait for slow span to complete
      jest.advanceTimersByTime(20);

      const filtered = tracer.exportSpans({ minDuration: 5 });
      expect(filtered.length).toBeGreaterThan(0);
    });
  });

  describe("clearCompletedSpans", () => {
    it("should clear completed spans", () => {
      const span = tracer.startSpan("test");
      span.end();

      expect(tracer.getCompletedSpans()).toHaveLength(1);
      tracer.clearCompletedSpans();
      expect(tracer.getCompletedSpans()).toHaveLength(0);
    });
  });
});

describe("PipelineTracer", () => {
  let pipelineTracer;

  beforeEach(() => {
    pipelineTracer = new PipelineTracer();
  });

  describe("tracePlugin", () => {
    it("should trace successful plugin execution", async () => {
      const mockPlugin = jest.fn().mockResolvedValue("result");
      const input = "test input";

      const result = await pipelineTracer.tracePlugin(
        "embedder",
        "openai",
        mockPlugin,
        input,
      );

      expect(result).toBe("result");
      expect(mockPlugin).toHaveBeenCalledWith(input);

      const completedSpans = pipelineTracer.getCompletedSpans();
      expect(completedSpans).toHaveLength(1);

      const span = completedSpans[0];
      expect(span.name).toBe("plugin.embedder.openai");
      expect(span.attributes["plugin.type"]).toBe("embedder");
      expect(span.attributes["plugin.name"]).toBe("openai");
      expect(span.attributes["plugin.success"]).toBe(true);
      expect(span.status.code).toBe("OK");
    });

    it("should trace plugin execution errors", async () => {
      const error = new Error("Plugin failed");
      const mockPlugin = jest.fn().mockRejectedValue(error);

      await expect(
        pipelineTracer.tracePlugin("llm", "gpt-4", mockPlugin, "input"),
      ).rejects.toThrow("Plugin failed");

      const completedSpans = pipelineTracer.getCompletedSpans();
      expect(completedSpans).toHaveLength(1);

      const span = completedSpans[0];
      expect(span.attributes["plugin.success"]).toBe(false);
      expect(span.status.code).toBe("ERROR");
      expect(span.status.message).toBe("Plugin failed");
      expect(span.events).toHaveLength(1);
      expect(span.events[0].name).toBe("exception");
    });

    it("should handle plugin with context", async () => {
      const mockPlugin = jest.fn().mockResolvedValue("result");
      const context = { batchSize: 5, retryCount: 2 };

      await pipelineTracer.tracePlugin(
        "embedder",
        "openai",
        mockPlugin,
        "input",
        context,
      );

      const span = pipelineTracer.getCompletedSpans()[0];
      expect(span.attributes["plugin.context.batchSize"]).toBe(5);
      expect(span.attributes["plugin.context.retryCount"]).toBe(2);
    });
  });

  describe("traceStage", () => {
    it("should trace pipeline stage execution", async () => {
      const mockStage = jest.fn().mockResolvedValue("stage result");
      const context = { docPath: "test.pdf" };

      const result = await pipelineTracer.traceStage(
        "ingest",
        mockStage,
        context,
      );

      expect(result).toBe("stage result");
      expect(mockStage).toHaveBeenCalled();

      const span = pipelineTracer.getCompletedSpans()[0];
      expect(span.name).toBe("pipeline.ingest");
      expect(span.attributes["pipeline.stage"]).toBe("ingest");
      expect(span.attributes["stage.context.docPath"]).toBe("test.pdf");
      expect(span.attributes["stage.success"]).toBe(true);
    });

    it("should trace stage execution errors", async () => {
      const error = new Error("Stage failed");
      const mockStage = jest.fn().mockRejectedValue(error);

      await expect(
        pipelineTracer.traceStage("query", mockStage),
      ).rejects.toThrow("Stage failed");

      const span = pipelineTracer.getCompletedSpans()[0];
      expect(span.attributes["stage.success"]).toBe(false);
      expect(span.status.code).toBe("ERROR");
    });
  });

  describe("startSpan and manual span management", () => {
    it("should create and manage spans manually", () => {
      const span = pipelineTracer.startSpan("custom.operation");

      expect(span).toBeInstanceOf(Span);
      expect(span.name).toBe("custom.operation");
      expect(pipelineTracer.getActiveSpans()).toContain(span);

      span.setAttribute("custom", "value");
      span.end();

      expect(pipelineTracer.getActiveSpans()).not.toContain(span);
      expect(pipelineTracer.getCompletedSpans()).toContain(span);
    });
  });

  describe("getTraceStats", () => {
    it("should return trace statistics", async () => {
      // Create some traces
      const mockPlugin = jest.fn().mockResolvedValue("result");
      await pipelineTracer.tracePlugin(
        "embedder",
        "openai",
        mockPlugin,
        "input",
      );
      await pipelineTracer.tracePlugin("llm", "gpt-4", mockPlugin, "input");

      const stats = pipelineTracer.getTraceStats();

      expect(stats.totalSpans).toBe(2);
      expect(stats.activeSpans).toBe(0);
      expect(stats.completedSpans).toBe(2);
      expect(stats.spansByType.plugin).toBe(2);
      expect(stats.averageDuration).toBeGreaterThan(0);
    });

    it("should handle empty trace stats", () => {
      const stats = pipelineTracer.getTraceStats();

      expect(stats.totalSpans).toBe(0);
      expect(stats.activeSpans).toBe(0);
      expect(stats.completedSpans).toBe(0);
      expect(stats.spansByType).toEqual({});
      expect(stats.averageDuration).toBe(0);
    });
  });
});

describe("global pipelineTracer", () => {
  it("should be a PipelineTracer instance", () => {
    expect(pipelineTracer).toBeInstanceOf(PipelineTracer);
  });

  it("should be ready to use", () => {
    expect(typeof pipelineTracer.tracePlugin).toBe("function");
    expect(typeof pipelineTracer.traceStage).toBe("function");
    expect(typeof pipelineTracer.startSpan).toBe("function");
  });
});
