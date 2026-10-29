"use strict";

// jest.setup.js resets modules after every test, so load per test.
let runEvaluation;
let compareConfigurations;
let createTestPipeline;
let EchoLLM;

beforeEach(() => {
  ({
    runEvaluation,
    compareConfigurations,
  } = require("../../../src/evaluate/compare"));
  ({ createTestPipeline, EchoLLM } = require("../../../src/testing"));
});

const DATASET = [
  {
    id: "vacation",
    prompt: "How many vacation days do I get?",
    expected: "Full-time employees receive twenty days of paid vacation.",
    sourceIds: ["vacation"],
  },
  {
    id: "remote",
    prompt: "Can I work remotely?",
    sourceIds: ["remote-work"],
  },
];

describe("runEvaluation", () => {
  it("scores every case and summarises the metrics", async () => {
    const { pipeline } = await createTestPipeline();
    const report = await runEvaluation(DATASET, pipeline);

    expect(report.version).toBe(1);
    expect(report.summary).toMatchObject({
      cases: 2,
      succeeded: 2,
      failed: 0,
    });
    const [vacation, remote] = report.cases;
    expect(vacation).toMatchObject({
      id: "vacation",
      success: true,
      retrievedIds: expect.arrayContaining(["vacation"]),
    });
    expect(vacation.retrievedIds[0]).toBe("vacation");
    expect(vacation.scores).toMatchObject({
      faithfulness: 1,
      citationCoverage: 1,
      sourceRecall: 1,
    });
    expect(typeof vacation.scores.contextRecall).toBe("number");
    // No reference answer, so no context recall for this case.
    expect(remote.scores.contextRecall).toBeUndefined();
    expect(report.summary.metrics.sourceRecall).toEqual({ mean: 1, count: 2 });
    expect(report.summary.metrics.contextRecall.count).toBe(1);
    // A report is plain JSON.
    expect(JSON.parse(JSON.stringify(report))).toEqual(report);
  });

  it("scores retrieval only when there is no llm", async () => {
    const { pipeline } = await createTestPipeline({ llm: null });
    const report = await runEvaluation(DATASET, pipeline);
    expect(report.cases[0].answer).toBeNull();
    expect(report.cases[0].scores).toEqual({ sourceRecall: 1 });
  });

  it("records failed cases instead of throwing", async () => {
    const failing = {
      run: async ({ query }) =>
        query.startsWith("How")
          ? { success: false, error: "Execution timeout" }
          : Promise.reject(new Error("boom")),
    };
    const report = await runEvaluation(DATASET, failing);
    expect(report.summary).toMatchObject({ succeeded: 0, failed: 2 });
    expect(report.cases.map((c) => c.error)).toEqual([
      "Execution timeout",
      "boom",
    ]);
    expect(report.summary.metrics).toEqual({});
  });

  it("throws a DatasetError listing the problems", async () => {
    const { pipeline } = await createTestPipeline();
    await expect(
      runEvaluation([{ expected: "x" }], pipeline),
    ).rejects.toMatchObject({
      name: "DatasetError",
      code: "RAG_INVALID_DATASET",
      errors: [expect.objectContaining({ field: "prompt" })],
    });
  });

  it("runs cases concurrently and keeps their order", async () => {
    let active = 0;
    let peak = 0;
    const slow = {
      run: async ({ query }) => {
        active += 1;
        peak = Math.max(peak, active);
        await new Promise((r) => setTimeout(r, query.length % 7));
        active -= 1;
        return { success: true, answer: null, results: [] };
      },
    };
    const dataset = Array.from({ length: 6 }, (_, i) => ({
      prompt: `question ${"x".repeat(i)}`,
    }));
    const seen = [];
    const report = await runEvaluation(dataset, slow, {
      concurrency: 3,
      onCase: (c) => seen.push(c.id),
    });
    expect(peak).toBe(3);
    expect(report.cases.map((c) => c.id)).toEqual(
      dataset.map((_, i) => `case-${i + 1}`),
    );
    expect(seen.sort()).toEqual(report.cases.map((c) => c.id).sort());
  });

  it("stops when the signal aborts", async () => {
    const controller = new AbortController();
    const pipeline = {
      run: async () => {
        controller.abort();
        return { success: false, error: "Execution aborted" };
      },
    };
    await expect(
      runEvaluation(DATASET, pipeline, { signal: controller.signal }),
    ).rejects.toMatchObject({ code: "ABORT_ERR" });
  });
});

describe("compareConfigurations", () => {
  it("reports no regression for the same configuration", async () => {
    const { pipeline } = await createTestPipeline();
    const comparison = await compareConfigurations(DATASET, {
      baseline: pipeline,
      candidate: pipeline,
    });
    expect(comparison.regressed).toBe(false);
    expect(comparison.regressions).toEqual([]);
    expect(comparison.metrics.faithfulness).toMatchObject({ delta: 0 });
  });

  it("finds a worse answer and lists the case", async () => {
    const { pipeline: baseline } = await createTestPipeline();
    const { pipeline: candidate } = await createTestPipeline({
      llm: new EchoLLM({ answer: "The office is in Paris." }),
    });
    const comparison = await compareConfigurations(DATASET, {
      baseline,
      candidate,
    });
    expect(comparison.regressed).toBe(true);
    expect(comparison.metrics.faithfulness).toMatchObject({
      baseline: 1,
      candidate: 0,
      regressed: true,
    });
    expect(comparison.metrics.sourceRecall.regressed).toBe(false);
    expect(comparison.regressions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "vacation",
          metric: "faithfulness",
          reason: "faithfulness dropped",
          delta: -1,
        }),
      ]),
    );
  });

  it("compares a pipeline against a saved report", async () => {
    const { pipeline } = await createTestPipeline();
    const saved = JSON.parse(
      JSON.stringify(await runEvaluation(DATASET, pipeline)),
    );
    const { pipeline: retrievalOnly } = await createTestPipeline({
      llm: null,
    });
    const comparison = await compareConfigurations(DATASET, {
      baseline: saved,
      candidate: retrievalOnly,
    });
    // Only sourceRecall is in both runs.
    expect(Object.keys(comparison.metrics)).toEqual(["sourceRecall"]);
    expect(comparison.regressed).toBe(false);
  });

  it("treats a case that now fails as a regression", async () => {
    const { pipeline } = await createTestPipeline();
    const baseline = await runEvaluation(DATASET, pipeline);
    const candidate = JSON.parse(JSON.stringify(baseline));
    candidate.cases[1] = {
      ...candidate.cases[1],
      success: false,
      error: "Execution timeout",
      scores: {},
    };
    const comparison = await compareConfigurations(null, {
      baseline,
      candidate,
    });
    expect(comparison.regressed).toBe(true);
    expect(comparison.regressions).toEqual([
      expect.objectContaining({
        id: "remote",
        reason: "now fails: Execution timeout",
      }),
    ]);
  });

  it("respects the tolerances and warns about mismatched cases", async () => {
    const { pipeline } = await createTestPipeline();
    const baseline = await runEvaluation(DATASET, pipeline);
    const candidate = JSON.parse(JSON.stringify(baseline));
    candidate.summary.metrics.faithfulness.mean -= 0.015;
    candidate.cases[0].scores.faithfulness -= 0.05;
    candidate.cases[1].id = "renamed";

    const comparison = await compareConfigurations(null, {
      baseline,
      candidate,
      metrics: ["faithfulness", "bleu"],
    });
    expect(comparison.metrics.faithfulness.regressed).toBe(false);
    expect(comparison.regressions).toEqual([]);
    expect(comparison.warnings).toEqual([
      'Metric "bleu" is missing from one of the runs',
      'Case "renamed" is only in the candidate run',
      'Case "remote" is only in the baseline run',
    ]);

    const strict = await compareConfigurations(null, {
      baseline,
      candidate,
      tolerance: 0.01,
      caseTolerance: 0.01,
    });
    expect(strict.metrics.faithfulness.regressed).toBe(true);
    expect(strict.regressions[0]).toMatchObject({
      id: "vacation",
      metric: "faithfulness",
    });
  });

  it("rejects sides that are neither pipelines nor reports", async () => {
    const { pipeline } = await createTestPipeline();
    await expect(
      compareConfigurations(DATASET, { baseline: {}, candidate: pipeline }),
    ).rejects.toThrow("baseline must be a pipeline or a report");
    await expect(
      compareConfigurations(null, { baseline: pipeline, candidate: pipeline }),
    ).rejects.toThrow("baseline is a pipeline, so a dataset is required");
    await expect(
      compareConfigurations(DATASET, {
        baseline: pipeline,
        candidate: pipeline,
        tolerance: -1,
      }),
    ).rejects.toThrow("tolerance must be a number of 0 or more");
  });
});
