/**
 * SecureLogger's optional email redaction runs in time linear in the text
 * length.
 */

const {
  SecureLogger,
  DEFAULT_PATTERNS,
} = require("../../../src/utils/secure-logger");

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

describe("SecureLogger email redaction", () => {
  // The email pattern on its own: the logger's other patterns are not part
  // of this check.
  test.each(RUNS)("a long run of %s is scanned in linear time", (_k, text) => {
    const { regex } = DEFAULT_PATTERNS.email;
    const pattern = new RegExp(regex.source, regex.flags);
    expect(timed(() => text.replace(pattern, "x"))).toBeLessThan(1000);
  });

  test("still redacts addresses, including one after a long run", () => {
    const logger = new SecureLogger({ redactEmails: true });
    expect(logger.secureLog({ message: "from jane@example.com" }).message).toBe(
      "from [REDACTED_EMAIL]",
    );
    const long = `${"x".repeat(50000)} ops@example.org`;
    expect(logger.secureLog({ message: long }).message).toBe(
      `${"x".repeat(50000)} [REDACTED_EMAIL]`,
    );
  });
});
