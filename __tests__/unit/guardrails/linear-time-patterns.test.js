/**
 * Built-in injection and PII patterns scan long inputs in linear time, and
 * keep their matches on ordinary text.
 */

const {
  detectInjection,
} = require("../../../src/guardrails/injection-detector");
const { DEFAULT_PII_PATTERNS } = require("../../../src/guardrails/detectors");

jest.setTimeout(30000);

// The suite runs on fake timers; the clock below must be real.
beforeEach(() => jest.useRealTimers());

function elapsed(fn) {
  const start = process.hrtime.bigint();
  const value = fn();
  return { ms: Number(process.hrtime.bigint() - start) / 1e6, value };
}

const isRoleMarker = (result) =>
  result.matches.some((m) => m.id === "role-marker");

describe("injection role-marker pattern", () => {
  test("scans a long run of '#' in linear time", () => {
    const { ms, value } = elapsed(() => detectInjection("#".repeat(40000)));
    expect(isRoleMarker(value)).toBe(false);
    expect(ms).toBeLessThan(2000);
  });

  test("scans a long run of '#' ending in a marker in linear time", () => {
    const { ms, value } = elapsed(() =>
      detectInjection("#".repeat(40000) + " system"),
    );
    expect(isRoleMarker(value)).toBe(true);
    expect(ms).toBeLessThan(2000);
  });

  test.each([
    ["## system", true],
    ["### Instructions", true],
    ["#### system prompt follows", true],
    ["intro\n##instruction", true],
    ["a ## system", true],
    ["## systematic review", false],
    ["# system", false],
    ["#system", false],
    ["issue #2 about the system", false],
    ["##", false],
  ])("flags %j: %s", (text, flagged) => {
    expect(isRoleMarker(detectInjection(text))).toBe(flagged);
  });
});

describe("email PII pattern", () => {
  const find = (text) => text.match(DEFAULT_PII_PATTERNS.email) || [];

  test("scans a long local part without an '@' in linear time", () => {
    const { ms, value } = elapsed(() => find("a".repeat(100000)));
    expect(value).toEqual([]);
    expect(ms).toBeLessThan(2000);
  });

  test.each([50000, 100000])(
    "scans %i 'a' characters in linear time (real timers)",
    (n) => {
      jest.useRealTimers();
      const { ms, value } = elapsed(() => find("a".repeat(n)));
      expect(value).toEqual([]);
      expect(ms).toBeLessThan(1000);
    },
  );

  test("a 64-character local part is matched whole", () => {
    const address = "a".repeat(64) + "@example.com";
    expect(find(`mail ${address} now`)).toEqual([address]);
  });

  test("a 70-character local part is detected and fully redacted", () => {
    const address = "a".repeat(70) + "@example.com";
    expect(find(`mail ${address} now`)).toEqual([address]);
    const {
      PostGenerationGuard,
    } = require("../../../src/guardrails/post-generation-guard");
    const guard = new PostGenerationGuard({ enableGroundednessCheck: false });
    const { sanitizedOutput } = guard.check(`mail ${address} now`);
    expect(sanitizedOutput).toBe("mail [REDACTED] now");
  });

  test("a 100,000-character run ending in an address does not stall", () => {
    const { ms } = elapsed(() => find("a".repeat(100000) + "@example.com"));
    expect(ms).toBeLessThan(1000);
  });

  test("concatenated addresses are still detected and redacted", () => {
    const glued = "first@a.comsecond@b.org";
    const hits = find(glued);
    expect(hits.length).toBeGreaterThan(0);
    expect(glued.replace(DEFAULT_PII_PATTERNS.email, "[R]")).not.toMatch(
      /first/,
    );
    expect(find("first@a.com,second@b.org")).toEqual([
      "first@a.com",
      "second@b.org",
    ]);
  });

  test("scans a long domain-like run after an '@' in linear time", () => {
    const { ms, value } = elapsed(() => find("x@" + "a.".repeat(50000)));
    expect(value).toEqual([]);
    expect(ms).toBeLessThan(2000);
  });

  test("scans many '@' separated runs in linear time", () => {
    const { ms } = elapsed(() => find("a@".repeat(50000)));
    expect(ms).toBeLessThan(2000);
  });

  test.each([
    ["write to john.doe+tag@example.co.uk now", ["john.doe+tag@example.co.uk"]],
    ["a@b.com, c_d@e-f.org.", ["a@b.com", "c_d@e-f.org"]],
    ["x%y@host.io;z@w.net", ["x%y@host.io", "z@w.net"]],
    ["no email here@ or @there.com", []],
    ["user@localhost", []],
    ["first@a.com second@b.com", ["first@a.com", "second@b.com"]],
    ["...dots.@example.com", ["...dots.@example.com"]],
  ])("finds the same emails in %j", (text, expected) => {
    expect(find(text)).toEqual(expected);
  });
});
