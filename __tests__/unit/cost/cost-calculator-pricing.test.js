"use strict";

const {
  CostCalculator,
  PRICING,
  PRICING_METADATA,
} = require("../../../src/cost/cost-calculator");

describe("CostCalculator pricing provenance", () => {
  test("built-in table records source and asOf", () => {
    expect(PRICING_METADATA.asOf).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(PRICING_METADATA.verified).toBe(false);
    for (const [model, entry] of Object.entries(PRICING)) {
      expect({ model, source: entry.source }).toEqual({
        model,
        source: expect.stringMatching(/^https:\/\//),
      });
      expect(entry.asOf).toBe(PRICING_METADATA.asOf);
    }
    expect(CostCalculator.getPricingMetadata()).toBe(PRICING_METADATA);
  });

  test("estimate reports where the price came from", () => {
    const calc = new CostCalculator();
    expect(calc.estimate("gpt-4o", 1000, 1000)).toMatchObject({
      pricingSource: PRICING_METADATA.sources.openai,
      pricingAsOf: PRICING_METADATA.asOf,
    });
  });
});

describe("CostCalculator pricing override", () => {
  test("`pricing` replaces the built-in table", () => {
    const calc = new CostCalculator({
      pricing: {
        "my-model": { input: 1, output: 2, unit: 1000000, asOf: "2026-10-01" },
      },
    });
    expect(calc.listModels()).toEqual(["my-model"]);
    expect(calc.estimate("my-model", 1000000, 500000)).toMatchObject({
      inputCost: 1,
      outputCost: 1,
      totalCost: 2,
      pricingSource: "custom",
      pricingAsOf: "2026-10-01",
    });
    const warnings = [];
    calc.on("warning", (w) => warnings.push(w));
    expect(calc.estimate("gpt-4o", 1000).warning).toBe("Unknown model");
    expect(warnings).toHaveLength(1);
  });

  test("`customPricing` still merges over the built-in table", () => {
    const calc = new CostCalculator({
      customPricing: { "gpt-4o": { input: 1, output: 1, unit: 1000 } },
    });
    expect(calc.listModels()).toContain("gpt-4");
    expect(calc.estimate("gpt-4o", 1000, 0).totalCost).toBe(1);
  });

  test("customPricing entries without a unit default to per-1000 tokens", () => {
    const calc = new CostCalculator({
      customPricing: { local: { input: 0.5, output: 0.5 } },
    });
    expect(calc.estimate("local", 2000, 0).totalCost).toBe(1);
  });
});

describe("CostCalculator unknown models", () => {
  test("warns once per model via the 'warning' event, without inventing a price", () => {
    const calc = new CostCalculator();
    const handler = jest.fn();
    calc.on("warning", handler);
    for (let i = 0; i < 3; i++) {
      expect(calc.estimate("mystery-model", 100, 100)).toMatchObject({
        totalCost: 0,
        warning: "Unknown model",
      });
    }
    calc.estimate("other-mystery", 1);
    expect(handler).toHaveBeenCalledTimes(2);
    expect(handler.mock.calls[0][0]).toMatchObject({
      type: "unknown-model",
      model: "mystery-model",
    });
  });

  test("falls back to process.emitWarning once when nobody listens", () => {
    const emit = jest
      .spyOn(process, "emitWarning")
      .mockImplementation(() => {});
    try {
      const calc = new CostCalculator();
      calc.estimate("mystery-model", 1);
      calc.estimate("mystery-model", 1);
      expect(emit).toHaveBeenCalledTimes(1);
      expect(emit.mock.calls[0][1]).toEqual({
        code: "RAG_UNKNOWN_MODEL_PRICING",
      });
    } finally {
      emit.mockRestore();
    }
  });
});

describe("CostCalculator model resolution", () => {
  test.each([
    ["gpt-4o-mini-2024-07-18", "gpt-4o-mini"],
    ["gpt-4-turbo-preview", "gpt-4-turbo"],
    ["claude-3-5-sonnet-20241022", "claude-3.5-sonnet"],
    ["claude-3-haiku-20240307", "claude-3-haiku"],
    ["GPT-4O", "gpt-4o"],
    ["gpt-4", "gpt-4"],
  ])("%s resolves to %s (longest match)", (model, key) => {
    expect(new CostCalculator().estimate(model, 1).model).toBe(key);
  });
});
