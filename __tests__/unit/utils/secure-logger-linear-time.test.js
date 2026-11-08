/**
 * SecureLogger's email redaction and its key-value patterns (apiKey,
 * password, token, secret) run in time linear in the text length.
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

const KEY_VALUE = [
  ["apiKey", "key", "[REDACTED_API_KEY]"],
  ["password", "password", "[REDACTED_PASSWORD]"],
  ["token", "token", "[REDACTED_TOKEN]"],
  ["secret", "secret", "[REDACTED_SECRET]"],
];

describe("SecureLogger key-value patterns", () => {
  const scan = (name, text) => {
    const { regex } = DEFAULT_PATTERNS[name];
    const pattern = new RegExp(regex.source, regex.flags);
    return timed(() => text.replace(pattern, "x"));
  };

  describe.each(KEY_VALUE)("%s", (name, keyword, marker) => {
    test.each(RUNS)(
      "a long run of %s is scanned in linear time",
      (_k, text) => {
        expect(scan(name, text)).toBeLessThan(1000);
      },
    );

    // The worst case for the 64-character bound: the keyword everywhere.
    test("a long run of the keyword stays linear", () => {
      const text = `${keyword}-`.repeat(
        Math.ceil(100000 / (keyword.length + 1)),
      );
      expect(scan(name, text)).toBeLessThan(2000);
    });

    test("a 100-character key name ending in the keyword has its value redacted", () => {
      const keyName = `${"a".repeat(100 - keyword.length)}${keyword}`;
      const value = "Zq8vR2mN5tW1xY7k";
      const { message } = new SecureLogger().secureLog({
        message: `config ${keyName}=${value} end`,
      });
      expect(message).toBe(`config ${keyName}=${marker} end`);
      expect(message).not.toContain(value);
    });
  });

  test.each([
    ["api_key=abcdef1234567890abcd", "api_key=[REDACTED_API_KEY]"],
    ['apiKey: "abcdef1234567890abcd"', 'apiKey: "[REDACTED_API_KEY]"'],
    ["password=hunter2pass", "password=[REDACTED_PASSWORD]"],
    ["db_password: 's3cretpw'", "db_password: '[REDACTED_PASSWORD]'"],
    ["auth_token=abcdefghijklmnop1234", "auth_token=[REDACTED_TOKEN]"],
    ["client_secret=topsecret99", "client_secret=[REDACTED_SECRET]"],
    ["x.password=hunter2pass", "x.password=[REDACTED_PASSWORD]"],
    ["password=abc", "password=abc"],
    ["the monkey keyboard", "the monkey keyboard"],
    ["no secrets here", "no secrets here"],
  ])("%s is redacted as before", (input, expected) => {
    expect(new SecureLogger().secureLog({ message: input }).message).toBe(
      expected,
    );
  });
});
