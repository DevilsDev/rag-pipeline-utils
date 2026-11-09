"use strict";

const { CostCalculator } = require("../../../src/cost/cost-calculator");

function calc() {
  const c = new CostCalculator();
  c.on("warning", () => {});
  return c;
}

describe("CostCalculator model matching", () => {
  test.each([
    ["gpt-4.1", "gpt-4.1"],
    ["gpt-4.1-mini", "gpt-4.1-mini"],
    ["gpt-4.1-nano", "gpt-4.1-nano"],
    ["gpt-4.1-mini-2025-04-14", "gpt-4.1-mini"],
    ["gpt-4.5-preview", "gpt-4.5-preview"],
  ])("%s has its own price", (model, key) => {
    const e = calc().estimate(model, 1000, 1000);
    expect(e.model).toBe(key);
    expect(e.totalCost).toBeGreaterThan(0);
  });

  test("gpt-4.1 is not priced as gpt-4", () => {
    const c = calc();
    expect(c.estimate("gpt-4.1", 1000, 1000).totalCost).toBeLessThan(
      c.estimate("gpt-4", 1000, 1000).totalCost / 4,
    );
  });

  test("an unknown later version does not fall back to the older model", () => {
    const e = calc().estimate("gpt-4.9", 1000, 1000);
    expect(e.warning).toBe("Unknown model");
    expect(e.totalCost).toBe(0);
  });

  test.each([
    ["gpt-4-0613", "gpt-4"],
    ["gpt-4-turbo-2024-04-09", "gpt-4-turbo"],
    ["gpt-4o-mini-2024-07-18", "gpt-4o-mini"],
    ["claude-3-5-sonnet-20241022", "claude-3.5-sonnet"],
  ])("dated snapshot %s still resolves to %s", (model, key) => {
    expect(calc().estimate(model, 1000, 1000).model).toBe(key);
  });
});
