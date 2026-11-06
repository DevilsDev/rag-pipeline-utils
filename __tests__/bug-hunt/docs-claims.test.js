/**
 * Bug hunt 4 (docs claims) and hunt 6 (adversarial guardrails): confirmed
 * bugs, each a documented claim the code does not meet. These tests fail
 * until the code or the docs are fixed; they are excluded from `npm test`
 * and run with `npm run test:bug-hunt`. See
 * benchmarks/fixtures/bug-hunt-findings.md.
 */

const fs = require("fs");
const os = require("os");
const path = require("path");
const {
  packContext,
  checkNumericConsistency,
  createRagPipeline,
  patternPIIDetector,
  FileVectorStore,
} = require("../../src/index.js");
const { createTestPipeline } = require("../../src/testing.js");

describe("bug hunt: docs claims", () => {
  // API-Reference.md (packContext): "The top document is always included.
  // When it alone exceeds the budget it is cut at a word boundary ..., so a
  // small budget never leaves the model with no context."
  test("BH-8: packContext keeps the top document when the budget is smaller than its wrapper", () => {
    const long = Array.from({ length: 200 }, (_, i) => `word${i}`).join(" ");
    const r = packContext([{ id: "a", content: long }], { maxTokens: 10 });
    expect(r.kept).toEqual(["a"]);
    expect(r.documents).toHaveLength(1);
  });

  test("BH-8: packContext keeps the top document with a character-count tokenizer", () => {
    const r = packContext(
      [
        { id: "d1", content: "aaaa" },
        { id: "d2", content: "b".repeat(400) },
      ],
      { maxTokens: 20, countTokens: (t) => t.length },
    );
    expect(r.kept[0]).toBe("d1");
  });

  // API-Reference.md: checkNumericConsistency("It takes twenty days.",
  // "Processing takes 20 days.") // { consistent: true, claimNumbers: ["20"], missing: [] }
  test("BH-9: checkNumericConsistency matches the API Reference example", () => {
    expect(
      checkNumericConsistency(
        "It takes twenty days.",
        "Processing takes 20 days.",
      ),
    ).toEqual({ consistent: true, claimNumbers: ["20"], missing: [] });
  });

  // Evaluation.md: checkNumericConsistency("Returns within 45 days",
  // "Returns within 30 days") // { consistent: false, claimNumbers: ["45"], missing: ["45"] }
  test("BH-9: checkNumericConsistency matches the Evaluation example", () => {
    expect(
      checkNumericConsistency(
        "Returns within 45 days",
        "Returns within 30 days",
      ),
    ).toEqual({ consistent: false, claimNumbers: ["45"], missing: ["45"] });
  });

  // Usage.md: "It returns `{ run, cleanup }`." and "The pipeline object only
  // exposes `run()` and `cleanup()`".
  test("BH-10: createRagPipeline returns only run and cleanup, as Usage.md says", async () => {
    const { embedder, retriever, llm } = await createTestPipeline();
    const pipeline = createRagPipeline({ embedder, retriever, llm });
    expect(Object.keys(pipeline).sort()).toEqual(["cleanup", "run"]);
  });

  // Plugins.md, Troubleshooting.md: "`MemoryRetriever` and `FileVectorStore`
  // reject query vectors of the wrong length."
  test("BH-12: FileVectorStore rejects a query vector of the wrong length", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "bh12-"));
    try {
      const store = new FileVectorStore({ path: path.join(dir, "index.json") });
      await store.store([{ id: "1", content: "a", vector: [1, 0, 0] }]);
      await expect(
        store.retrieve({ queryVector: [1, 0], topK: 1 }),
      ).rejects.toThrow(/dimension/);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("bug hunt: guardrails", () => {
  // Concepts-Guardrails.md, Security.md, Testing.md, Integrations.md: the
  // built-in PII check finds "phone numbers" (SSNs are qualified as US; phone
  // numbers are not).
  test.each([
    "Call me on +64 21 123 4567.",
    "Ring +44 20 7946 0958 after five.",
    "Our Sydney office is on (02) 9374 4000.",
  ])("BH-11: patternPIIDetector finds the phone number in %s", async (text) => {
    const r = await patternPIIDetector().detect(text);
    expect(r.labels).toContain("phone");
  });
});
