/**
 * PostGenerationGuard redacts PII first and truncates after, so a value cut
 * by maxResponseLength never leaves part of itself in the output.
 */

const {
  PostGenerationGuard,
} = require("../../../src/guardrails/post-generation-guard");

const EMAIL = "jane.doe@example.com";
const SSN = "123-45-6789";

describe("PostGenerationGuard: redact, then truncate", () => {
  test.each(["jane.doe", "jane.doe@exam", EMAIL.slice(0, 19)])(
    "no fragment of an email remains when the limit falls inside it (cut after %j)",
    (head) => {
      const prefix = "x".repeat(40);
      const guard = new PostGenerationGuard({
        maxResponseLength: prefix.length + 1 + head.length,
        enableGroundednessCheck: false,
      });
      const result = guard.check(`${prefix} ${EMAIL} and more text`);
      expect(result.sanitizedOutput.length).toBeLessThanOrEqual(
        prefix.length + 1 + head.length,
      );
      expect(result.sanitizedOutput).not.toMatch(/jane|doe|example|@/);
      expect(result.sanitizedOutput.startsWith(prefix + " [")).toBe(true);
    },
  );

  test("no fragment of an SSN remains when the limit falls inside it", () => {
    for (let cut = 1; cut < SSN.length; cut += 1) {
      const guard = new PostGenerationGuard({
        maxResponseLength: 10 + cut,
        enableGroundednessCheck: false,
      });
      const { sanitizedOutput } = guard.check(`ssn is -- ${SSN} ok ok`);
      expect(sanitizedOutput).not.toMatch(/123|45-|6789/);
    }
  });

  test("a value found by a custom detector is redacted before truncation", () => {
    const secret = "TOKEN-ABCDEF-123456";
    const guard = new PostGenerationGuard({
      maxResponseLength: 30,
      enableGroundednessCheck: false,
      detectors: [
        {
          name: "token",
          kind: "pii",
          detect: (text) => {
            const at = text.indexOf(secret);
            return at < 0
              ? { flagged: false, labels: [], matches: [] }
              : {
                  flagged: true,
                  labels: ["token"],
                  matches: [
                    { text: secret, start: at, end: at + secret.length },
                  ],
                };
          },
        },
      ],
    });
    const { sanitizedOutput } = guard.check(`${"y".repeat(20)} ${secret} tail`);
    expect(sanitizedOutput.length).toBeLessThanOrEqual(30);
    expect(sanitizedOutput).not.toMatch(/TOKEN|ABCDEF|123456/);
  });

  test("text without PII is only truncated", () => {
    const guard = new PostGenerationGuard({
      maxResponseLength: 10,
      enableGroundednessCheck: false,
    });
    const result = guard.check("a".repeat(25));
    expect(result.sanitizedOutput).toBe("a".repeat(10));
    expect(result.safe).toBe(false);
  });
});
