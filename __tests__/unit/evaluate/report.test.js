"use strict";

// jest.setup.js resets modules after every test, so load per test.
let evaluationVerdict;
let renderEvaluationReport;
let runEvaluation;
let compareConfigurations;
let createTestPipeline;
let EchoLLM;

beforeEach(() => {
  ({
    evaluationVerdict,
    renderEvaluationReport,
  } = require("../../../src/evaluate/report"));
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
    sourceIds: ["vacation"],
  },
  { id: "remote", prompt: "Can I work <b>remotely</b>?" },
];

async function runs() {
  const { pipeline: good } = await createTestPipeline();
  const { pipeline: bad } = await createTestPipeline({
    llm: new EchoLLM({ answer: "The office is in Paris | <script>." }),
  });
  const baseline = await runEvaluation(DATASET, good);
  const candidate = await runEvaluation(DATASET, bad);
  const comparison = await compareConfigurations(null, {
    baseline,
    candidate,
  });
  return { baseline, candidate, comparison };
}

describe("evaluationVerdict", () => {
  it("passes a clean run and checks minimums", async () => {
    const { baseline } = await runs();
    expect(evaluationVerdict({ report: baseline })).toEqual({
      passed: true,
      reasons: [],
      thresholds: [],
    });
    const verdict = evaluationVerdict({
      report: baseline,
      min: { faithfulness: 0.9, contextRecall: 0.5 },
    });
    expect(verdict.passed).toBe(false);
    expect(verdict.thresholds).toEqual([
      { metric: "faithfulness", min: 0.9, actual: 1, passed: true },
      { metric: "contextRecall", min: 0.5, actual: null, passed: false },
    ]);
    expect(verdict.reasons).toEqual([
      "Context recall was not measured (minimum 0.5)",
    ]);
  });

  it("fails on failed cases and on regressions", async () => {
    const { candidate, comparison } = await runs();
    const failedRun = JSON.parse(JSON.stringify(candidate));
    failedRun.summary.failed = 1;
    expect(evaluationVerdict({ report: failedRun }).reasons).toEqual([
      "1 of 2 cases failed",
    ]);
    const verdict = evaluationVerdict({ report: candidate, comparison });
    expect(verdict.passed).toBe(false);
    expect(verdict.reasons).toContain(
      "Faithfulness dropped -1.000 from the baseline",
    );
  });
});

describe("renderEvaluationReport", () => {
  it("renders a Markdown summary with the comparison", async () => {
    const { candidate, comparison } = await runs();
    const md = renderEvaluationReport(
      { report: candidate, comparison, min: { sourceRecall: 0.5 } },
      { title: "Eval" },
    );
    expect(md.startsWith("<!-- rag-eval-report -->")).toBe(true);
    expect(md).toContain("### Eval: ❌ Failed");
    expect(md).toContain("| Metric | This run | Baseline | Change | Minimum |");
    expect(md).toContain("| Faithfulness | 0.000 | 1.000 | -1.000 ⚠️ |  |");
    expect(md).toContain("| Source recall | 1.000 | 1.000 | 0.000 | 0.5 |");
    expect(md).toMatch(
      /<details open><summary>Cases that got worse or failed \(\d+\)<\/summary>/,
    );
    expect(md).toContain(
      "`vacation` How many vacation days do I get?: Faithfulness 1.000 → 0.000",
    );
  });

  it("escapes Markdown table cells", async () => {
    const { baseline } = await runs();
    const report = JSON.parse(JSON.stringify(baseline));
    report.cases[1] = {
      ...report.cases[1],
      success: false,
      error: "bad | pipe\nnew line",
      scores: {},
    };
    report.summary.failed = 1;
    const md = renderEvaluationReport({ report });
    expect(md).toContain("failed: bad \\| pipe new line");
  });

  it("renders a standalone, escaped HTML page", async () => {
    const { candidate, comparison } = await runs();
    const html = renderEvaluationReport(
      { report: candidate, comparison },
      { format: "html", title: "Eval <run>" },
    );
    expect(html.startsWith("<!doctype html>")).toBe(true);
    expect(html).toContain("<title>Eval &lt;run&gt;</title>");
    expect(html).toContain("Can I work &lt;b&gt;remotely&lt;/b&gt;?");
    expect(html).toContain("The office is in Paris | &lt;script&gt;.");
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("<b>remotely");
    // No minimums given, so no Minimum column.
    expect(html).not.toContain(">Minimum<");
    expect(html).toContain('class="status fail"');
  });

  it("rejects unknown formats", async () => {
    const { baseline } = await runs();
    expect(() =>
      renderEvaluationReport({ report: baseline }, { format: "pdf" }),
    ).toThrow('format must be "markdown" or "html"');
  });
});
