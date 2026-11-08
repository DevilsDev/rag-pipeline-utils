/**
 * Identifier handling in claim checks (words joined to a number by a hyphen)
 * runs in linear time and keeps its results.
 */

const { checkNumericConsistency } = require("../../../src/evaluate/scoring");

jest.setTimeout(30000);

// The suite runs on fake timers; the clock below must be real.
beforeEach(() => jest.useRealTimers());

function elapsed(fn) {
  const start = process.hrtime.bigint();
  const value = fn();
  return { ms: Number(process.hrtime.bigint() - start) / 1e6, value };
}

describe("identifier scanning", () => {
  test("scans a long run of letters in linear time", () => {
    const { ms } = elapsed(() =>
      checkNumericConsistency("a".repeat(60000), "a document"),
    );
    expect(ms).toBeLessThan(2000);
  });

  test("scans a long run of letters and digits in linear time", () => {
    const { ms } = elapsed(() =>
      checkNumericConsistency("a1".repeat(30000), "a document"),
    );
    expect(ms).toBeLessThan(2000);
  });

  test("scans a long run of letters in the document in linear time", () => {
    const { ms } = elapsed(() =>
      checkNumericConsistency("kinesin-8 moves", "b".repeat(60000)),
    );
    expect(ms).toBeLessThan(2000);
  });

  test("compares identifiers whole and without case", () => {
    expect(
      checkNumericConsistency("Kinesin-8 moves", "KINESIN-8 is a motor")
        .missing,
    ).toEqual([]);
    expect(checkNumericConsistency("IL-2 rises", "IL-3 rises").missing).toEqual(
      ["id:il-2"],
    );
  });

  test("finds an identifier that follows digits", () => {
    expect(
      checkNumericConsistency("the 2kinesin-8 motor", "the kinesin-8 motor")
        .claimNumbers,
    ).toContain("id:kinesin-8");
    expect(
      checkNumericConsistency("the 2kinesin-8 motor", "the kinesin-9 motor")
        .missing,
    ).toContain("id:kinesin-8");
  });

  test("finds identifiers with digits inside the word", () => {
    expect(
      checkNumericConsistency("ab1c-5 binds", "ab1c-5 binds").claimNumbers,
    ).toEqual(["id:ab1c-5"]);
  });

  test("an identifier number is not a quantity", () => {
    expect(
      checkNumericConsistency("ZAP-70 binds", "ZAP-70 binds").claimNumbers,
    ).toEqual(["id:zap-70"]);
  });
});
