/**
 * verifyCitations reports the uncited text of a sentence that starts in a
 * cited block and ends outside it.
 */

const {
  fromAnthropicCitations,
  verifyCitations,
} = require("../../../src/grounding/provider-citations");

const doc =
  "Full-time employees receive twenty days of paid vacation per year.";

function message(blocks) {
  return { stop_reason: "end_turn", content: blocks };
}
const cited = (text) => ({
  type: "text",
  text,
  citations: [
    {
      type: "char_location",
      cited_text: doc,
      document_index: 0,
      document_title: "handbook",
      start_char_index: 0,
      end_char_index: doc.length,
    },
  ],
});

describe("uncited text inside a cited sentence", () => {
  test("an introductory phrase before a claim is not reported", async () => {
    const input = fromAnthropicCitations(
      message([
        { type: "text", text: "According to the handbook, " },
        cited(
          "full-time employees receive twenty days of paid vacation per year",
        ),
        { type: "text", text: "." },
      ]),
      { documents: [{ id: "handbook" }] },
    );
    expect((await verifyCitations(input)).uncited).toEqual([]);
  });

  test("an uncited tail is reported", async () => {
    const input = fromAnthropicCitations(
      message([
        cited(
          "Full-time employees receive twenty days of paid vacation per year",
        ),
        {
          type: "text",
          text: ", and contractors receive forty days of paid vacation with no approval needed.",
        },
      ]),
      { documents: [{ id: "handbook" }] },
    );
    const r = await verifyCitations(input);
    expect(r.uncited).toEqual([
      {
        text: "and contractors receive forty days of paid vacation with no approval needed.",
        start: input.answer.indexOf("and contractors"),
        end: input.answer.length,
      },
    ]);
    expect(r.summary.uncitedSentences).toBe(1);
  });

  test("a cited sentence with only punctuation left over has nothing uncited", async () => {
    const input = fromAnthropicCitations(
      message([cited(doc.slice(0, -1)), { type: "text", text: "." }]),
      { documents: [{ id: "handbook" }] },
    );
    const r = await verifyCitations(input);
    expect(r.uncited).toEqual([]);
    expect(r.verified).toBe(true);
  });
});
