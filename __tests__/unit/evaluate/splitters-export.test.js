/**
 * rag-eval exports the sentence splitter and the clause splitter the
 * grounding checks use, so other tools (the MCP server's size limits) can
 * count sentences and clauses the same way.
 */

const evalPackage = require("../../../src/packages/eval");
const main = require("../../../src/index");

describe("splitters", () => {
  test("rag-eval and the main entry export splitSentences and splitClauses", () => {
    for (const name of ["splitSentences", "splitClauses"]) {
      expect(typeof evalPackage[name]).toBe("function");
      expect(evalPackage[name]).toBe(main[name]);
    }
  });

  test("splitClauses splits at punctuation and clause words, as the polarity check does", () => {
    expect(
      evalPackage.splitClauses(
        "Staff get 5 paid days, but not on Mondays; contractors (if any) get none.",
      ),
    ).toEqual([
      ["staff", "get", "5", "paid", "days"],
      ["not", "on", "mondays"],
      ["contractors"],
      ["if", "any"],
      ["get", "none"],
    ]);
    expect(evalPackage.splitSentences("One. Two.")).toEqual(["One.", "Two."]);
  });
});
