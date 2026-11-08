/**
 * EntityExtractor's email pattern runs in time linear in the text length.
 */

const { EntityExtractor } = require("../../../src/graph/entity-extractor");

// The suite runs on fake timers; the clock below must be real.
beforeEach(() => jest.useRealTimers());

function timed(fn) {
  const start = process.hrtime.bigint();
  fn();
  return Number(process.hrtime.bigint() - start) / 1e6;
}

// Runs of characters an address can contain, with no "@": each took seconds
// with the old pattern, which retried the run from every position.
const RUNS = [
  ["letters", "a".repeat(100000)],
  ["letters and dots", "a.".repeat(50000)],
  ["letters and hyphens", "a-".repeat(50000)],
];

describe("EntityExtractor email pattern", () => {
  test.each(RUNS)("a long run of %s is scanned in linear time", (_k, text) => {
    const extractor = new EntityExtractor();
    expect(timed(() => extractor.extract(text))).toBeLessThan(1000);
  });

  test("still finds addresses, including one after a long run", () => {
    const extractor = new EntityExtractor();
    const names = (text) =>
      extractor
        .extract(text)
        .filter((e) => e.type === "email")
        .map((e) => e.name);
    expect(names("Write to jane.doe@example.com today")).toEqual([
      "jane.doe@example.com",
    ]);
    expect(names(`${"x".repeat(50000)} ops@example.org`)).toEqual([
      "ops@example.org",
    ]);
  });
});
