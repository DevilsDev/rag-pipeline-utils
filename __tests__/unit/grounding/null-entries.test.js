/**
 * Null entries in sources, citations and claims are skipped, not a crash.
 */

const { CitationTracker } = require("../../../src/citation/citation-tracker");
const {
  fromAnthropicCitations,
  verifyCitations,
} = require("../../../src/grounding/provider-citations");

const sentence = "Employees receive twenty days of paid vacation per year.";

describe("null entries", () => {
  test("CitationTracker skips a null source, keeping the others' positions and scores", () => {
    const withNull = new CitationTracker().track(sentence, [
      null,
      { id: "a", content: sentence },
    ]);
    const without = new CitationTracker().track(sentence, [
      { id: "a", content: sentence },
    ]);
    expect(withNull.citations[0].sources).toEqual([
      { ...without.citations[0].sources[0], docIndex: 1 },
    ]);
    expect(withNull.groundednessScore).toBe(1);
  });

  test("fromAnthropicCitations skips a null citation", () => {
    const input = fromAnthropicCitations({
      content: [{ type: "text", text: "hi", citations: [null] }],
    });
    expect(input.claims).toEqual([]);
  });

  test("verifyCitations takes a claim with no citations as unverifiable", async () => {
    const r = await verifyCitations({
      provider: "anthropic",
      answer: "A b.",
      claims: [{ text: "A b.", start: 0, end: 4 }],
    });
    expect(r.claims[0]).toMatchObject({
      verdict: "unverifiable",
      citations: [],
    });
    expect(r.verified).toBe(false);
  });

  test("verifyCitations skips a null citation of a claim", async () => {
    const r = await verifyCitations({
      provider: "anthropic",
      answer: sentence,
      claims: [
        {
          text: sentence,
          start: 0,
          end: sentence.length,
          citations: [null, { sourceId: "a", passages: [sentence] }],
        },
      ],
    });
    expect(r.claims[0].verdict).toBe("supported");
    expect(r.claims[0].citations).toHaveLength(1);
  });
});
