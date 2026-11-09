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
    expect(ms).toBeLessThan(1000);
  });

  test("checkAnswer with evaluation checks a 20 KB answer in linear time", async () => {
    const answer = longAnswer(20);
    const { ms } = await elapsed(() =>
      checkAnswer({ answer, sources: policySources }),
    );
    expect(ms).toBeLessThan(1500);
  });
});
