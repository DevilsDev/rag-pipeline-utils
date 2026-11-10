"use strict";

const { CostTracker } = require("../../../src/cost/cost-tracker");

function tracker(maxCost) {
  const t = new CostTracker({
    model: "gpt-4o",
    enableBudget: true,
    budgetOptions: { maxCost },
  });
  t.calculator.on("warning", () => {});
  return t;
}

const bigAnswer = { success: true, answer: "x".repeat(40000), query: "q" };

async function* streamOf(text, doneExtra = {}) {
  yield { token: text, done: false };
  yield { token: "", done: true, ...doneExtra };
}

describe("CostTracker budget", () => {
  test("an over-budget run is recorded and the budget usage reflects it", async () => {
    const t = tracker(0.001);
    const run = jest.fn().mockResolvedValue({ ...bigAnswer });
    const wrapped = t.wrap({ run });
    await expect(wrapped.run({ query: "q" })).rejects.toMatchObject({
      code: "BUDGET_EXCEEDED",
    });
    expect(run).toHaveBeenCalledTimes(1);
    expect(t.budget.getUsage().cost).toBeGreaterThan(0);
    expect(t.getSummary().totalCost).toBeGreaterThan(0);
  });

  test("once the budget is spent the next run is refused before it executes", async () => {
    const t = tracker(0.001);
    const run = jest.fn().mockResolvedValue({ ...bigAnswer });
    const wrapped = t.wrap({ run });
    await wrapped.run({ query: "q" }).catch(() => {});
    await expect(wrapped.run({ query: "q" })).rejects.toMatchObject({
      code: "BUDGET_EXCEEDED",
    });
    expect(run).toHaveBeenCalledTimes(1);
  });

  test("a stream is costed from the tokens it produced", async () => {
    const t = tracker(100);
    const wrapped = t.wrap({ run: async () => streamOf("y".repeat(4000)) });
    const s = await wrapped.run({ query: "How many days?" });
    const chunks = [];
    for await (const c of s) chunks.push(c);
    const done = chunks[chunks.length - 1];
    expect(done.done).toBe(true);
    expect(done.cost.outputTokens).toBe(1000);
    expect(done.cost.estimatedCost).toBeGreaterThan(0);
    expect(t.getSummary().totalCost).toBeGreaterThan(0);
    expect(t.budget.getUsage().tokens).toBeGreaterThanOrEqual(1000);
  });

  test("an over-budget stream is recorded and reports BUDGET_EXCEEDED at the end", async () => {
    const t = tracker(0.001);
    const wrapped = t.wrap({ run: async () => streamOf("y".repeat(40000)) });
    const s = await wrapped.run({ query: "q" });
    await expect(
      (async () => {
        for await (const c of s) void c;
      })(),
    ).rejects.toMatchObject({ code: "BUDGET_EXCEEDED" });
    expect(t.budget.getUsage().cost).toBeGreaterThan(0);
  });

  test("a generation cache hit costs nothing", async () => {
    const t = tracker(100);
    const wrapped = t.wrap({
      run: async () => ({
        success: true,
        query: "q",
        answer: "x".repeat(4000),
        cache: { generation: "hit" },
      }),
    });
    const r = await wrapped.run({ query: "q" });
    expect(r.cost.estimatedCost).toBe(0);
    expect(t.getSummary().totalCost).toBe(0);
  });

  test("a cached stream (done chunk reports a hit) costs nothing", async () => {
    const t = tracker(100);
    const wrapped = t.wrap({
      run: async () =>
        streamOf("z".repeat(4000), { cache: { generation: "hit" } }),
    });
    const s = await wrapped.run({ query: "q" });
    for await (const c of s) void c;
    expect(t.getSummary().totalCost).toBe(0);
  });
});
