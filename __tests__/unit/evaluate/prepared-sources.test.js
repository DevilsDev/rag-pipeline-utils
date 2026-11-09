/**
 * Claim checks prepare each source and each answer once, so long answers
 * and long sources are checked in time that grows with their length.
 */

const { checkAnswer } = require("../../../src/grounding/check-answer");
const { CitationTracker } = require("../../../src/citation/citation-tracker");

jest.setTimeout(60000);

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
  test("the condition check reads a 30 KB answer in linear time", async () => {
    const answer = longAnswer(30);
    const { ms } = await elapsed(() =>
      new CitationTracker().track(answer, policySources),
    );
    expect(ms).toBeLessThan(3000);
  });

  test("checkAnswer with evaluation checks a 20 KB answer in linear time", async () => {
    const answer = longAnswer(20);
    const { ms } = await elapsed(() =>
      checkAnswer({ answer, sources: policySources }),
    );
    expect(ms).toBeLessThan(3000);
  });
});

describe("long sources", () => {
  test("checks 50 sentences against a 200 KB source in linear time", async () => {
    let source = "";
    for (let k = 0; source.length < 200 * 1024; k++) {
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
    expect(ms).toBeLessThan(3000);
  });
});

describe("many quantities", () => {
  const { checkNumericConsistency } = require("../../../src/evaluate/scoring");

  test("compares 12,000 claim quantities with 12,000 source quantities in linear time", () => {
    const claim = "Pack " + "5 kg, ".repeat(12000) + "done.";
    const source = "Each box holds 5 kg. ".repeat(12000) + "Also 5 g.";
    const start = process.hrtime.bigint();
    const result = checkNumericConsistency(claim, source);
    const ms = Number(process.hrtime.bigint() - start) / 1e6;
    expect(result.consistent).toBe(true);
    expect(ms).toBeLessThan(3000);
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
  test("checkAnswer prepares each source once for citations and evaluation", async () => {
    const source =
      "Staff carry " + "5 kg ".repeat(40000).trim() + " in each crate.";
    // New source objects for every run, so no run reuses another's work
    const sources = () =>
      Array.from({ length: 6 }, (_, i) => ({ id: String(i), content: source }));
    const answer = "Staff carry 5 kg in each crate.";
    // The faster of two runs each, so a pause in a busy test run doesn't decide
    const fastest = async (evaluate) => {
      const runs = [];
      for (let i = 0; i < 2; i++) {
        runs.push(
          await elapsed(() =>
            checkAnswer({ answer, sources: sources(), evaluate }),
          ),
        );
      }
      return runs.sort((a, b) => a.ms - b.ms)[0];
    };
    const citationsOnly = await fastest(false);
    const withEvaluation = await fastest(true);
    expect(withEvaluation.value.evaluation.scores.faithfulness).toBe(1);
    // Evaluation reuses the prepared sources: far less than a second pass
    expect(withEvaluation.ms).toBeLessThan(citationsOnly.ms * 1.5 + 200);
  });
});
