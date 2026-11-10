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
  // "Processing takes 20 days.") // { consistent: true, claimNumbers:
  // ["duration:20 day"], missing: [], matchedWords: [] } (corrected in 3.9)
  test("BH-9: checkNumericConsistency matches the API Reference example", () => {
    expect(
      checkNumericConsistency(
        "It takes twenty days.",
        "Processing takes 20 days.",
      ),
    ).toEqual({
      consistent: true,
      claimNumbers: ["duration:20 day"],
      missing: [],
      matchedWords: [],
    });
  });

  // Evaluation.md: checkNumericConsistency("Returns within 45 days",
  // "Returns within 30 days") // { consistent: false, claimNumbers:
  // ["duration:45 day"], missing: ["duration:45 day"], matchedWords: [] }
  test("BH-9: checkNumericConsistency matches the Evaluation example", () => {
    expect(
      checkNumericConsistency(
        "Returns within 45 days",
        "Returns within 30 days",
      ),
    ).toEqual({
      consistent: false,
      claimNumbers: ["duration:45 day"],
      missing: ["duration:45 day"],
      matchedWords: [],
    });
  });

  // Usage.md: "It returns `{ run, cleanup, cacheStats }`" and "The pipeline
  // object only exposes `run()`, `cleanup()` and `cacheStats()`" (corrected in 3.9)
  test("BH-10: createRagPipeline returns run, cleanup and cacheStats, as Usage.md says", async () => {
    const { embedder, retriever, llm } = await createTestPipeline();
    const pipeline = createRagPipeline({ embedder, retriever, llm });
    expect(Object.keys(pipeline).sort()).toEqual([
      "cacheStats",
      "cleanup",
      "run",
    ]);
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
  // The docs said the built-in PII check finds "phone numbers"; it finds US
  // 10-digit ones only, which the docs now say (corrected in 3.9)
  test("BH-11: the docs qualify the PII check's phone numbers as US", () => {
    const docs = path.join(__dirname, "..", "..", "docs-site", "docs");
    for (const page of [
      "Concepts-Guardrails.md",
      "Integrations.md",
      "Security.md",
      "Security-Capabilities.md",
      "Testing.md",
      "Testing-RAG-TypeScript.md",
    ]) {
      const text = fs.readFileSync(path.join(docs, page), "utf8");
      const line = text
        .split("\n")
        .find((l) => /PII|\bpii\b/.test(l) && /phone/i.test(l));
      expect([page, line && /US phone/.test(line)]).toEqual([page, true]);
    }
  });

  test("BH-11: patternPIIDetector finds a US phone number", async () => {
    const r = await patternPIIDetector().detect("Call 555-123-4567 today.");
    expect(r.labels).toContain("phone");
  });
});
