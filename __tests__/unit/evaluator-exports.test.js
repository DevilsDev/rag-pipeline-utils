const evaluator = require("../../src/evaluate/evaluator");
const scoring = require("../../src/evaluate/scoring");

describe("evaluator exports", () => {
  describe("evaluator module", () => {
    it("should export evaluateRagDataset function", () => {
      expect(typeof evaluator.evaluateRagDataset).toBe("function");
    });

    it("should export normalizeText function", () => {
      expect(typeof evaluator.normalizeText).toBe("function");
    });
  });

  describe("scoring module", () => {
    it("should export scoreAnswer function", () => {
      expect(typeof scoring.scoreAnswer).toBe("function");
    });

    it("should export tokenize function", () => {
      expect(typeof scoring.tokenize).toBe("function");
    });

    it("should export computeBLEU function", () => {
      expect(typeof scoring.computeBLEU).toBe("function");
    });

    it("should export computeROUGE function", () => {
      expect(typeof scoring.computeROUGE).toBe("function");
    });
  });
});
