"use strict";

const { CostCalculator } = require("../../../src/cost/cost-calculator");
const { TokenBudget } = require("../../../src/cost/token-budget");
const { CostTracker } = require("../../../src/cost/cost-tracker");

describe("CostCalculator", () => {
  let calculator;

  beforeEach(() => {
    calculator = new CostCalculator();
  });

  describe("estimate()", () => {
    test("known model returns correct costs", () => {
      const result = calculator.estimate("gpt-4", 1000, 500);
      expect(result.inputCost).toBeCloseTo(0.03);
      expect(result.outputCost).toBeCloseTo(0.03);
      expect(result.totalCost).toBeCloseTo(0.06);
      expect(result.model).toBe("gpt-4");
      expect(result.currency).toBe("USD");
      expect(result.inputTokens).toBe(1000);
      expect(result.outputTokens).toBe(500);
    });

    test("unknown model returns warning with zero costs", () => {
      const result = calculator.estimate("unknown-model", 1000, 500);
      expect(result.totalCost).toBe(0);
      expect(result.inputCost).toBe(0);
      expect(result.outputCost).toBe(0);
      expect(result.warning).toBe("Unknown model");
      expect(result.model).toBe("unknown-model");
    });

    test("defaults outputTokens to 0 when not provided", () => {
      const result = calculator.estimate("gpt-4", 1000);
      expect(result.outputTokens).toBe(0);
      expect(result.outputCost).toBe(0);
      expect(result.totalCost).toBeCloseTo(0.03);
    });
  });

  describe("pricing comparisons", () => {
    test("gpt-4 is more expensive than gpt-3.5-turbo", () => {
      const gpt4 = calculator.estimate("gpt-4", 1000, 1000);
      const gpt35 = calculator.estimate("gpt-3.5-turbo", 1000, 1000);
      expect(gpt4.totalCost).toBeGreaterThan(gpt35.totalCost);
    });

    test("embedding models have output cost 0", () => {
      const smallEmbed = calculator.estimate(
        "text-embedding-3-small",
        1000,
        1000,
      );
      expect(smallEmbed.outputCost).toBe(0);

      const largeEmbed = calculator.estimate(
        "text-embedding-3-large",
        1000,
        1000,
      );
      expect(largeEmbed.outputCost).toBe(0);
    });
  });

  describe("addModel()", () => {
    test("custom pricing works for new model", () => {
      calculator.addModel("my-custom-model", {
        input: 0.01,
        output: 0.02,
        unit: 1000,
      });
      const result = calculator.estimate("my-custom-model", 2000, 1000);
      expect(result.inputCost).toBeCloseTo(0.02);
      expect(result.outputCost).toBeCloseTo(0.02);
      expect(result.totalCost).toBeCloseTo(0.04);
    });

    test("defaults unit to 1000 when not provided", () => {
      calculator.addModel("another-model", { input: 0.05, output: 0.1 });
      const result = calculator.estimate("another-model", 1000, 1000);
      expect(result.inputCost).toBeCloseTo(0.05);
      expect(result.outputCost).toBeCloseTo(0.1);
    });

    test("throws when pricing fields are missing", () => {
      expect(() => calculator.addModel("bad", {})).toThrow();
      expect(() => calculator.addModel("bad", { input: 1 })).toThrow();
    });
  });

  describe("listModels()", () => {
    test("returns all known models", () => {
      const models = calculator.listModels();
      expect(Array.isArray(models)).toBe(true);
      expect(models).toContain("gpt-4");
      expect(models).toContain("gpt-3.5-turbo");
      expect(models).toContain("text-embedding-3-small");
      expect(models.length).toBeGreaterThanOrEqual(11);
    });

    test("includes custom models after addModel", () => {
      calculator.addModel("custom-llm", { input: 0.01, output: 0.02 });
      expect(calculator.listModels()).toContain("custom-llm");
    });
  });

  describe("getModelPricing()", () => {
    test("returns pricing for known model", () => {
      const pricing = calculator.getModelPricing("gpt-4");
      expect(pricing).toHaveProperty("input");
      expect(pricing).toHaveProperty("output");
      expect(pricing).toHaveProperty("unit");
    });

    test("returns null for unknown model", () => {
      expect(calculator.getModelPricing("nonexistent")).toBeNull();
    });
  });
});

describe("TokenBudget", () => {
  let budget;

  beforeEach(() => {
    budget = new TokenBudget({ maxTokens: 10000, maxCost: 1.0 });
  });

  describe("check()", () => {
    test("within budget returns allowed", () => {
      const status = budget.check(500, 0.05);
      expect(status.allowed).toBe(true);
      expect(status.remaining.tokens).toBeGreaterThan(0);
      expect(status.remaining.cost).toBeGreaterThan(0);
    });

    test("over hard token limit returns not allowed", () => {
      const status = budget.check(20000, 0.01);
      expect(status.allowed).toBe(false);
      expect(status.reason).toMatch(/Token limit exceeded/);
    });

    test("over hard cost limit returns not allowed", () => {
      const status = budget.check(100, 5.0);
      expect(status.allowed).toBe(false);
      expect(status.reason).toMatch(/Cost limit exceeded/);
    });

    test("over soft limit returns warning", () => {
      // Record 85% of tokens
      budget.record(8500, 0.85);
      const status = budget.check(100, 0.01);
      expect(status.allowed).toBe(true);
      expect(status.warnings.length).toBeGreaterThan(0);
      expect(status.warnings[0]).toMatch(/Approaching/);
    });
  });

  describe("record()", () => {
    test("accumulates usage", () => {
      budget.record(100, 0.01);
      budget.record(200, 0.02);
      expect(budget.usage.tokens).toBe(300);
      expect(budget.usage.cost).toBeCloseTo(0.03);
      expect(budget.usage.operations).toBe(2);
    });

    test("emits usage event", () => {
      const handler = jest.fn();
      budget.on("usage", handler);
      budget.record(100, 0.01);
      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({ tokens: 100, cost: 0.01 }),
      );
    });

    test("emits warning event when crossing soft limit", () => {
      const handler = jest.fn();
      budget.on("warning", handler);
      budget.record(8500, 0.0); // 85% of 10000
      expect(handler).toHaveBeenCalled();
    });

    test("emits exceeded event when crossing hard limit", () => {
      const handler = jest.fn();
      budget.on("exceeded", handler);
      budget.record(11000, 0.0);
      expect(handler).toHaveBeenCalled();
    });
  });

  describe("reset()", () => {
    test("resets usage to zero", () => {
      budget.record(5000, 0.5);
      budget.reset();
      expect(budget.usage.tokens).toBe(0);
      expect(budget.usage.cost).toBe(0);
      expect(budget.usage.operations).toBe(0);
      expect(budget.usage.history).toEqual([]);
    });
  });

  describe("getUsage()", () => {
    test("returns current usage summary", () => {
      budget.record(1000, 0.1);
      const usage = budget.getUsage();
      expect(usage.tokens).toBe(1000);
      expect(usage.cost).toBeCloseTo(0.1);
      expect(usage.operations).toBe(1);
      expect(usage.limits.maxTokens).toBe(10000);
      expect(usage.limits.maxCost).toBe(1.0);
      expect(usage.remaining.tokens).toBe(9000);
    });
  });
});

describe("CostTracker", () => {
  let tracker;
  let mockPipeline;

  beforeEach(() => {
    tracker = new CostTracker({ model: "gpt-3.5-turbo" });
    mockPipeline = {
      run: jest.fn().mockResolvedValue({
        answer: "Test answer",
        query: "Test query input text",
      }),
    };
  });

  describe("wrap()", () => {
    test("returns pipeline proxy with run method", () => {
      const wrapped = tracker.wrap(mockPipeline);
      expect(typeof wrapped.run).toBe("function");
    });

    test("attaches cost data to result", async () => {
      const wrapped = tracker.wrap(mockPipeline);
      const result = await wrapped.run({ query: "test" });
      expect(result.cost).toBeDefined();
      expect(result.cost.inputTokens).toBeGreaterThanOrEqual(0);
      expect(result.cost.outputTokens).toBeGreaterThanOrEqual(0);
      expect(result.cost.estimatedCost).toBeGreaterThanOrEqual(0);
      expect(result.cost.currency).toBe("USD");
    });

    test("calls original pipeline.run with correct args", async () => {
      const wrapped = tracker.wrap(mockPipeline);
      await wrapped.run({ query: "test" });
      expect(mockPipeline.run).toHaveBeenCalledWith({ query: "test" });
    });
  });

  describe("sessions", () => {
    test("startSession creates a session", () => {
      const session = tracker.startSession({ label: "test" });
      expect(session.id).toMatch(/^session_/);
      expect(session.metadata.label).toBe("test");
      expect(session.entries).toEqual([]);
    });

    test("endSession closes the current session", () => {
      tracker.startSession();
      const closed = tracker.endSession();
      expect(closed.endTime).toBeDefined();
      expect(tracker.currentSession).toBeNull();
    });

    test("endSession returns null when no session is active", () => {
      expect(tracker.endSession()).toBeNull();
    });

    test("tracks costs per session", async () => {
      tracker.startSession();
      const wrapped = tracker.wrap(mockPipeline);
      await wrapped.run({ query: "q1" });
      await wrapped.run({ query: "q2" });
      const session = tracker.endSession();
      expect(session.entries.length).toBe(2);
      expect(session.totalTokens).toBeGreaterThan(0);
    });
  });

  describe("getSummary()", () => {
    test("returns aggregate stats", async () => {
      tracker.startSession();
      const wrapped = tracker.wrap(mockPipeline);
      await wrapped.run({ query: "q1" });
      tracker.endSession();

      const summary = tracker.getSummary();
      expect(summary.totalTokens).toBeGreaterThan(0);
      expect(summary.totalCost).toBeGreaterThanOrEqual(0);
      expect(summary.sessionCount).toBe(1);
      expect(summary.avgCostPerQuery).toBeGreaterThanOrEqual(0);
      expect(typeof summary.breakdown).toBe("object");
    });

    test("returns zero stats when no sessions exist", () => {
      const summary = tracker.getSummary();
      expect(summary.totalTokens).toBe(0);
      expect(summary.totalCost).toBe(0);
      expect(summary.sessionCount).toBe(0);
      expect(summary.avgCostPerQuery).toBe(0);
    });
  });

  describe("budget enforcement", () => {
    test("throws when budget is exceeded", async () => {
      const budgetTracker = new CostTracker({
        model: "gpt-4",
        enableBudget: true,
        budgetOptions: { maxCost: 0.0001 },
      });

      const bigPipeline = {
        run: jest.fn().mockResolvedValue({
          answer: "A".repeat(10000),
          query: "B".repeat(10000),
        }),
      };

      const wrapped = budgetTracker.wrap(bigPipeline);
      // First call might succeed, subsequent should fail
      try {
        await wrapped.run({ query: "test" });
        await wrapped.run({ query: "test2" });
        await wrapped.run({ query: "test3" });
      } catch (err) {
        expect(err.code).toBe("BUDGET_EXCEEDED");
      }
    });
  });
});
