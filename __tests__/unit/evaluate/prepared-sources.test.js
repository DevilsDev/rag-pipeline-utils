/**
 * Claim checks prepare each source and each answer once, so long answers
 * and long sources are checked in time that grows with their length.
 */

const { checkAnswer } = require("../../../src/grounding/check-answer");
const { CitationTracker } = require("../../../src/citation/citation-tracker");

jest.setTimeout(60000);

// Each input is large enough that the code before the 3.9 grounding
// changes took far longer than the limit (measured on one machine: 21 s to
// 129 s), while the current code takes 0.3 s to 1 s, so a busy runner
// still passes.

// The suite runs on fake timers; the clock below must be real.
beforeEach(() => jest.useRealTimers());

async function elapsed(fn) {
  const start = process.hrtime.bigint();
  const value = await fn();
  return { ms: Number(process.hrtime.bigint() - start) / 1e6, value };
}

function longAnswer(kb) {
  let answer = "";
  for (let i = 0; answer.length < kb * 1024; i++) {
    answer += `Item ${i} costs ${i * 3} euros if paid before day ${(i % 28) + 1}. `;
  }
  return answer;
}

const policySources = [
  {
    id: "a",
    content:
      "Remote work is allowed two days per week with manager approval. ".repeat(
        5,
      ),
  },
  { id: "b", content: "Shipping costs 5 euros. ".repeat(10) },
];

describe("long answers", () => {
  test("the condition check reads a 120 KB answer in linear time", async () => {
    const answer = longAnswer(120);
    const { ms } = await elapsed(() =>
      new CitationTracker().track(answer, policySources),
    );
    // Before the 3.9 changes: 37 s
    expect(ms).toBeLessThan(10000);
  });

  test("checkAnswer with evaluation checks an 80 KB answer in linear time", async () => {
    const answer = longAnswer(80);
    const { ms } = await elapsed(() =>
      checkAnswer({ answer, sources: policySources }),
    );
    // Before the 3.9 changes: 52 s
    expect(ms).toBeLessThan(10000);
  });
});

describe("long sources", () => {
  test("checks 50 sentences against an 800 KB source in linear time", async () => {
    let source = "";
    for (let k = 0; source.length < 800 * 1024; k++) {
      source += `Section ${k} says employees in region ${k} receive ${k % 30} days of leave. `;
    }
    let answer = "";
    for (let j = 0; j < 50; j++) {
      answer += `Employees in region ${j} receive ${j % 30} days of leave. `;
    }
    const { ms, value } = await elapsed(() =>
      checkAnswer({
        answer,
        sources: [{ id: "big", content: source }],
        evaluate: false,
      }),
    );
    expect(value.groundedness).toBe(1);
    // Before the 3.9 changes: 21 s
    expect(ms).toBeLessThan(8000);
  });
});

describe("many quantities", () => {
  const { checkNumericConsistency } = require("../../../src/evaluate/scoring");

  test("compares 48,000 claim quantities with 48,000 source quantities in linear time", () => {
    const claim = "Pack " + "5 kg, ".repeat(48000) + "done.";
    const source = "Each box holds 5 kg. ".repeat(48000) + "Also 5 g.";
    const start = process.hrtime.bigint();
    const result = checkNumericConsistency(claim, source);
    const ms = Number(process.hrtime.bigint() - start) / 1e6;
    expect(result.consistent).toBe(true);
    // Before the 3.9 changes: 129 s
    expect(ms).toBeLessThan(10000);
  });

  test("still matches quantities converted between units", () => {
    expect(
      checkNumericConsistency("It weighs 1 lb.", "It weighs 16 oz.").consistent,
    ).toBe(true);
    expect(
      checkNumericConsistency("It takes 90 minutes.", "It takes 1.5 hours.")
        .matchedWords,
    ).toEqual(["90", "minutes"]);
    expect(
      checkNumericConsistency("A third of staff.", "33% of staff.").consistent,
    ).toBe(true);
    expect(
      checkNumericConsistency("It weighs 2 kg.", "It weighs 2 lb.").missing,
    ).toEqual(["mass:2 kilogram"]);
  });
});

describe("one check, several metrics", () => {
  const { prepareDocument } = require("../../../src/evaluate/scoring");
  const {
    PipelineEvaluator,
  } = require("../../../src/evaluate/pipeline-evaluator");

  test("citations and evaluation share each source's preparation", () => {
    const docs = [
      {
        id: "a",
        content: "Staff carry 5 kg in each crate, but not on Mondays.",
      },
      { id: "b", content: "Crates are collected at 9 am." },
    ];
    const answer = "Staff carry 5 kg in each crate.";
    new CitationTracker().track(answer, docs);
    const prepared = docs.map((d) => prepareDocument(d, d.content));
    expect(Object.keys(prepared[0].memo)).toEqual(
      expect.arrayContaining(["tokens", "numbers", "polarity"]),
    );
    new PipelineEvaluator().evaluate({
      query: "crates",
      answer,
      results: docs,
    });
    // Still the same preparations: evaluation didn't prepare the sources again
    docs.forEach((d, i) =>
      expect(prepareDocument(d, d.content)).toBe(prepared[i]),
    );
  });

  test("a changed source text is prepared again", () => {
    const doc = { id: "a", content: "Staff carry 5 kg." };
    const before = prepareDocument(doc, doc.content);
    doc.content = "Staff carry 6 kg.";
    expect(prepareDocument(doc, doc.content)).not.toBe(before);
  });
});
