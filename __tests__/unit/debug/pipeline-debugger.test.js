"use strict";

const { ExecutionTracer } = require("../../../src/debug/execution-tracer");
const { TraceInspector } = require("../../../src/debug/trace-inspector");

describe("ExecutionTracer", () => {
  let tracer;
  let mockPipeline;

  beforeEach(() => {
    tracer = new ExecutionTracer();
    mockPipeline = {
      run: jest.fn().mockResolvedValue({
        answer: "Test answer",
        results: [{ content: "doc1" }, { content: "doc2" }],
        citations: { groundedness: 0.9 },
        evaluation: { groundedness: 0.85, faithfulness: 0.9, relevance: 0.8 },
      }),
    };
  });

  describe("trace()", () => {
    test("wraps pipeline and records timing", async () => {
      const traced = tracer.trace(mockPipeline);
      const result = await traced.run({ query: "test" });

      expect(result.answer).toBe("Test answer");
      expect(result.trace).toBeDefined();
      expect(result.trace.totalDurationMs).toBeGreaterThanOrEqual(0);
      expect(result.trace.startTime).toBeDefined();
      expect(result.trace.endTime).toBeDefined();
    });

    test("records step information", async () => {
      const traced = tracer.trace(mockPipeline);
      await traced.run({ query: "test" });

      const traces = tracer.getTraces();
      expect(traces[0].steps.length).toBeGreaterThan(0);
      expect(traces[0].steps[0].step).toBe("pipeline.run");
      expect(traces[0].steps[0].durationMs).toBeGreaterThanOrEqual(0);
      expect(traces[0].steps[0].success).toBe(true);
    });

    test("captures input when configured", async () => {
      const traced = tracer.trace(mockPipeline);
      await traced.run({ query: "my question" });

      const traces = tracer.getTraces();
      expect(traces[0].input).toEqual({ query: "my question" });
    });

    test("captures metadata from result", async () => {
      const traced = tracer.trace(mockPipeline);
      await traced.run({ query: "test" });

      const traces = tracer.getTraces();
      expect(traces[0].metadata.resultCount).toBe(2);
      expect(traces[0].metadata.hasCitations).toBe(true);
      expect(traces[0].metadata.hasEvaluation).toBe(true);
    });

    test("propagates errors from pipeline", async () => {
      const failPipeline = {
        run: jest.fn().mockRejectedValue(new Error("pipeline failed")),
      };
      const traced = tracer.trace(failPipeline);

      await expect(traced.run({ query: "test" })).rejects.toThrow(
        "pipeline failed",
      );
      // Error trace should still be recorded
      expect(tracer.getTraces().length).toBe(1);
      expect(tracer.getTraces()[0].steps[0].success).toBe(false);
    });
  });

  describe("getTraces()", () => {
    test("returns array of traces", async () => {
      const traced = tracer.trace(mockPipeline);
      await traced.run({ query: "q1" });
      await traced.run({ query: "q2" });

      const traces = tracer.getTraces();
      expect(Array.isArray(traces)).toBe(true);
      expect(traces.length).toBe(2);
    });
  });

  describe("getTrace()", () => {
    test("returns trace by id", async () => {
      const traced = tracer.trace(mockPipeline);
      await traced.run({ query: "test" });

      const traces = tracer.getTraces();
      const found = tracer.getTrace(traces[0].id);
      expect(found).toBe(traces[0]);
    });

    test("returns undefined for unknown id", () => {
      expect(tracer.getTrace("nonexistent")).toBeUndefined();
    });
  });

  describe("clear()", () => {
    test("empties trace list", async () => {
      const traced = tracer.trace(mockPipeline);
      await traced.run({ query: "test" });
      expect(tracer.getTraces().length).toBe(1);

      tracer.clear();
      expect(tracer.getTraces().length).toBe(0);
    });
  });

  describe("exportTraces()", () => {
    test("returns JSON string", async () => {
      // Use captureOutputs: false to avoid circular references
      // (result.trace points back to the trace record)
      const noOutputTracer = new ExecutionTracer({ captureOutputs: false });
      const traced = noOutputTracer.trace(mockPipeline);
      await traced.run({ query: "test" });

      const exported = noOutputTracer.exportTraces();
      expect(typeof exported).toBe("string");
      const parsed = JSON.parse(exported);
      expect(Array.isArray(parsed)).toBe(true);
      expect(parsed.length).toBe(1);
    });

    test("throws for unsupported format", () => {
      expect(() => tracer.exportTraces("xml")).toThrow(
        /Unsupported export format/,
      );
    });
  });

  describe("events", () => {
    test("emits traced event on each run", async () => {
      const handler = jest.fn();
      tracer.on("traced", handler);

      const traced = tracer.trace(mockPipeline);
      await traced.run({ query: "test" });

      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({
          id: expect.any(String),
          totalDurationMs: expect.any(Number),
        }),
      );
    });
  });
});

describe("TraceInspector", () => {
  let inspector;

  beforeEach(() => {
    inspector = new TraceInspector();
  });

  describe("analyze()", () => {
    test("returns summary with totalDuration and recommendations", () => {
      const trace = {
        totalDurationMs: 250,
        steps: [{ step: "pipeline.run", durationMs: 230, success: true }],
        metadata: {
          resultCount: 5,
          hasCitations: true,
          hasEvaluation: true,
          evaluation: { groundedness: 0.9, faithfulness: 0.85 },
        },
      };

      const analysis = inspector.analyze(trace);
      expect(analysis.summary.totalDuration).toBe(250);
      expect(analysis.summary.stepCount).toBe(1);
      expect(analysis.summary.resultCount).toBe(5);
      expect(analysis.timeBreakdown["pipeline.run"]).toBe(230);
      expect(analysis.bottleneck).toBeDefined();
      expect(analysis.bottleneck.step).toBe("pipeline.run");
      expect(Array.isArray(analysis.recommendations)).toBe(true);
    });

    test("recommends caching for slow queries", () => {
      const trace = {
        totalDurationMs: 6000,
        steps: [{ step: "pipeline.run", durationMs: 5800, success: true }],
        metadata: { resultCount: 3, hasCitations: true, hasEvaluation: true },
      };

      const analysis = inspector.analyze(trace);
      expect(analysis.recommendations).toContain(
        "Consider caching frequent queries",
      );
    });

    test("recommends checking retriever for zero results", () => {
      const trace = {
        totalDurationMs: 100,
        steps: [{ step: "pipeline.run", durationMs: 90, success: true }],
        metadata: { resultCount: 0, hasCitations: true, hasEvaluation: true },
      };

      const analysis = inspector.analyze(trace);
      expect(analysis.recommendations).toContain(
        "No results retrieved - check retriever configuration",
      );
    });

    test("recommends enabling citations when missing", () => {
      const trace = {
        totalDurationMs: 100,
        steps: [],
        metadata: { resultCount: 1, hasEvaluation: true },
      };

      const analysis = inspector.analyze(trace);
      expect(analysis.recommendations).toContain(
        "Enable citations for source tracking",
      );
    });
  });

  describe("compare()", () => {
    test("compares multiple traces and returns avg/min/max", () => {
      const traces = [
        { totalDurationMs: 100, metadata: { resultCount: 5 } },
        { totalDurationMs: 200, metadata: { resultCount: 3 } },
        { totalDurationMs: 300, metadata: { resultCount: 7 } },
      ];

      const comparison = inspector.compare(traces);
      expect(comparison.avgDuration).toBe(200);
      expect(comparison.minDuration).toBe(100);
      expect(comparison.maxDuration).toBe(300);
      expect(comparison.avgResultCount).toBe(5);
    });

    test("returns zero values for empty traces array", () => {
      const comparison = inspector.compare([]);
      expect(comparison.avgDuration).toBe(0);
      expect(comparison.minDuration).toBe(0);
      expect(comparison.maxDuration).toBe(0);
    });

    test("includes quality trend when evaluation data present", () => {
      const traces = [
        {
          totalDurationMs: 100,
          metadata: { resultCount: 5, evaluation: { groundedness: 0.8 } },
        },
        {
          totalDurationMs: 200,
          metadata: { resultCount: 3, evaluation: { groundedness: 0.9 } },
        },
      ];

      const comparison = inspector.compare(traces);
      expect(comparison.qualityTrend.groundedness).toBeCloseTo(0.85);
    });
  });

  describe("findAnomalies()", () => {
    test("detects slow traces (> 2x average)", () => {
      const traces = [
        { id: "t1", totalDurationMs: 100, metadata: { resultCount: 5 } },
        { id: "t2", totalDurationMs: 100, metadata: { resultCount: 5 } },
        { id: "t3", totalDurationMs: 500, metadata: { resultCount: 5 } },
      ];

      const anomalies = inspector.findAnomalies(traces);
      const slow = anomalies.filter((a) => a.anomalyType === "slow_execution");
      expect(slow.length).toBeGreaterThan(0);
      expect(slow[0].traceId).toBe("t3");
    });

    test("detects zero-result traces when others have results", () => {
      const traces = [
        { id: "t1", totalDurationMs: 100, metadata: { resultCount: 5 } },
        { id: "t2", totalDurationMs: 100, metadata: { resultCount: 0 } },
      ];

      const anomalies = inspector.findAnomalies(traces);
      const noResults = anomalies.filter((a) => a.anomalyType === "no_results");
      expect(noResults.length).toBe(1);
      expect(noResults[0].traceId).toBe("t2");
    });

    test("returns empty array for empty input", () => {
      expect(inspector.findAnomalies([])).toEqual([]);
    });

    test("detects low quality scores", () => {
      const traces = [
        {
          id: "t1",
          totalDurationMs: 100,
          metadata: { resultCount: 5, evaluation: { groundedness: 0.9 } },
        },
        {
          id: "t2",
          totalDurationMs: 100,
          metadata: { resultCount: 5, evaluation: { groundedness: 0.9 } },
        },
        {
          id: "t3",
          totalDurationMs: 100,
          metadata: { resultCount: 5, evaluation: { groundedness: 0.2 } },
        },
      ];

      const anomalies = inspector.findAnomalies(traces);
      const lowQuality = anomalies.filter(
        (a) => a.anomalyType === "low_quality",
      );
      expect(lowQuality.length).toBeGreaterThan(0);
      expect(lowQuality[0].traceId).toBe("t3");
    });
  });
});
