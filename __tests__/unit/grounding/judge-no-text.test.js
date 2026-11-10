/**
 * A judge reply that can't be used is a judge error, not a rejection
 * (BH-15, 3.9): the sentence keeps its lexical verdict and `judge.error`
 * says why. Found on the 2026-11-07 Claude Haiku 5.5 rerun of the RAGTruth
 * full split, where one reply reached maxTokens before any text and
 * checkAnswer rejected.
 */

const { checkAnswer } = require("../../../src/grounding/check-answer");

// A paraphrase the lexical check fails for low overlap, so the judge is asked
const input = {
  answer: "Staff are allowed to do their jobs from home.",
  sources: ["Employees may work remotely."],
  evaluate: false,
};

const throwing = (message, code) => ({
  async generate() {
    const error = new Error(message);
    error.code = code;
    throw error;
  },
});

describe("checkAnswer with a judge reply that can't be used", () => {
  test.each([
    [
      "no text (cut off at maxTokens)",
      throwing(
        "Claude reached maxTokens before writing an answer (stop_reason: max_tokens); raise maxTokens",
        "NO_TEXT",
      ),
      /judge returned no text.*maxTokens/,
    ],
    [
      "a refusal",
      throwing(
        "Claude declined to answer (stop_reason: refusal)",
        "MODEL_REFUSED",
      ),
      /judge returned no text.*declined/,
    ],
    [
      "invalid JSON",
      { generate: async () => "Sure! Claim 1 looks supported." },
      /not valid JSON/,
    ],
  ])(
    "%s: a judge error, the lexical verdict stands",
    async (_l, judge, error) => {
      const result = await checkAnswer({ ...input, judge });
      expect(result.judge.error).toMatch(error);
      expect(result.judge.calls).toBe(1);
      expect(result.grounded).toBe(false);
      expect(result.judge.verdicts[0]).toMatchObject({
        verdict: "unsupported",
        lexicalReason: "low_overlap",
      });
    },
  );

  test("a network error still rejects: it isn't a judge reply", async () => {
    await expect(
      checkAnswer({
        ...input,
        judge: throwing("socket hang up", "ECONNRESET"),
      }),
    ).rejects.toThrow("socket hang up");
  });
});
