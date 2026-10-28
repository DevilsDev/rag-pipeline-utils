const fs = require("fs");
const os = require("os");
const path = require("path");
const {
  applyFeedback,
  termSimilarity,
  feedbackPath,
  loadFeedback,
  addFeedback,
  VOTE_WEIGHT,
  MAX_ADJUSTMENT,
} = require("../../../src/cli/services/feedback");

const results = [
  { id: "a#0", score: 0.5, content: "A" },
  { id: "b#0", score: 0.4, content: "B" },
  { id: "c#0", score: 0.1, content: "C" },
];

describe("termSimilarity", () => {
  test("is the Jaccard index of the token sets", () => {
    expect(termSimilarity("paid vacation days", "Paid vacation days!")).toBe(1);
    // {how, many, vacation, days} vs {vacation, days}: 2 shared / 4 total
    expect(termSimilarity("how many vacation days", "vacation days")).toBe(0.5);
    expect(termSimilarity("remote work", "paid vacation")).toBe(0);
    expect(termSimilarity("", "anything")).toBe(0);
  });
});

describe("applyFeedback", () => {
  test("without votes keeps order and scores", () => {
    const ranked = applyFeedback(results, [], "question");
    expect(ranked.map((r) => r.id)).toEqual(["a#0", "b#0", "c#0"]);
    for (const r of ranked) {
      expect(r.adjustment).toBe(0);
      expect(r.finalScore).toBe(r.baseScore);
      expect(r.reasons).toEqual([]);
    }
  });

  test("an up vote on the same question adds VOTE_WEIGHT", () => {
    const ranked = applyFeedback(
      results,
      [{ question: "q one", docId: "c#0", rating: "up" }],
      "q one",
    );
    const c = ranked.find((r) => r.id === "c#0");
    expect(c.adjustment).toBeCloseTo(VOTE_WEIGHT, 12);
    expect(c.finalScore).toBeCloseTo(0.1 + VOTE_WEIGHT, 12);
    expect(c.reasons).toEqual([
      {
        rating: "up",
        question: "q one",
        similarity: 1,
        contribution: VOTE_WEIGHT,
      },
    ]);
  });

  test("contributions scale with question similarity and can reorder", () => {
    const ranked = applyFeedback(
      results,
      [
        { question: "vacation days", docId: "a#0", rating: "down" },
        { question: "how many vacation days", docId: "b#0", rating: "up" },
      ],
      "vacation days",
    );
    const a = ranked.find((r) => r.id === "a#0");
    const b = ranked.find((r) => r.id === "b#0");
    expect(a.adjustment).toBeCloseTo(-0.1, 12);
    expect(b.adjustment).toBeCloseTo(0.05, 12);
    expect(ranked.map((r) => r.id)).toEqual(["b#0", "a#0", "c#0"]);
  });

  test("votes on unrelated questions or other docs contribute nothing", () => {
    const ranked = applyFeedback(
      results,
      [
        { question: "remote work", docId: "a#0", rating: "down" },
        { question: "q", docId: "zzz", rating: "up" },
      ],
      "q",
    );
    expect(ranked.every((r) => r.adjustment === 0)).toBe(true);
  });

  test("the adjustment is capped at +/- MAX_ADJUSTMENT", () => {
    const votes = Array.from({ length: 10 }, () => ({
      question: "q",
      docId: "c#0",
      rating: "up",
    }));
    const down = votes.map((v) => ({ ...v, docId: "a#0", rating: "down" }));
    const ranked = applyFeedback(results, [...votes, ...down], "q");
    expect(ranked.find((r) => r.id === "c#0").adjustment).toBe(MAX_ADJUSTMENT);
    expect(ranked.find((r) => r.id === "a#0").adjustment).toBe(-MAX_ADJUSTMENT);
    expect(ranked.find((r) => r.id === "c#0").reasons).toHaveLength(10);
  });

  test("ties keep retrieval order and output is deterministic", () => {
    const tied = [
      { id: "x", score: 0.3 },
      { id: "y", score: 0.3 },
    ];
    const once = applyFeedback(tied, [], "q");
    expect(once.map((r) => r.id)).toEqual(["x", "y"]);
    expect(applyFeedback(tied, [], "q")).toEqual(once);
    expect(once[0]).not.toHaveProperty("rank");
  });
});

describe("feedback file", () => {
  let dir;
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "rag-feedback-"));
  });
  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

  test("lives next to a file-store index, else in <configDir>/.rag", () => {
    expect(feedbackPath({ path: path.join(dir, "idx", "i.json") }, dir)).toBe(
      path.join(dir, "idx", "feedback.json"),
    );
    expect(feedbackPath({}, dir)).toBe(path.join(dir, ".rag", "feedback.json"));
  });

  test("add then load round-trips; missing file is empty", () => {
    const file = path.join(dir, "fb", "feedback.json");
    expect(loadFeedback(file).entries).toEqual([]);
    addFeedback(file, { question: "q", docId: "a#0", rating: "up" });
    const { total } = addFeedback(file, {
      question: "q2",
      docId: "b#0",
      rating: "down",
    });
    expect(total).toBe(2);
    const loaded = loadFeedback(file);
    expect(loaded.entries.map((e) => [e.docId, e.rating])).toEqual([
      ["a#0", "up"],
      ["b#0", "down"],
    ]);
    expect(fs.readdirSync(path.dirname(file))).toEqual(["feedback.json"]);
  });

  test("rejects invalid ratings and corrupt files", () => {
    const file = path.join(dir, "feedback.json");
    expect(() =>
      addFeedback(file, { question: "q", docId: "a", rating: "meh" }),
    ).toThrow(/Rating must be one of/);
    fs.writeFileSync(file, "{oops");
    expect(() => loadFeedback(file)).toThrow(/not valid JSON/);
    expect(() =>
      addFeedback(file, { question: "q", docId: "a", rating: "up" }),
    ).toThrow(/not valid JSON/);
    expect(fs.readFileSync(file, "utf8")).toBe("{oops");
  });
});
