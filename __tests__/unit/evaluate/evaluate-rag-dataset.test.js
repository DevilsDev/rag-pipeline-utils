const fs = require("fs");
const os = require("os");
const path = require("path");
const { evaluateRagDataset } = require("../../../src/evaluate/evaluator");

describe("evaluateRagDataset", () => {
  test("scores the generated answer against the expected answer", async () => {
    const dataset = path.join(
      os.tmpdir(),
      `eval-${process.pid}-${Date.now()}.json`,
    );
    fs.writeFileSync(
      dataset,
      JSON.stringify([{ prompt: "vacation?", expected: "Twenty days." }]),
    );
    try {
      const results = await evaluateRagDataset(dataset, {
        embedder: { embed: async () => [1, 0] },
        retriever: {
          retrieve: async () => [
            { id: "v", content: "Twenty days of vacation." },
          ],
        },
        llm: { generate: async () => "Twenty days." },
      });
      expect(results).toHaveLength(1);
      expect(results[0].actual).toBe("Twenty days.");
      expect(results[0].success).toBe(true);
      expect(results[0].scores.rouge).toBeGreaterThan(0.9);
    } finally {
      fs.unlinkSync(dataset);
    }
  });
});
