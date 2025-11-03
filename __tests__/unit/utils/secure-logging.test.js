/**
 * @fileoverview Tests for Secure Logging Utility
 */

const {
  redactObject,
  redactStringValue,
  redactLogData,
  isSensitiveFieldName,
  matchesSecretPattern,
  REDACTED,
} = require("../../../src/utils/secure-logging");

describe("Secure Logging Utility", () => {
  describe("isSensitiveFieldName", () => {
    it("should detect sensitive field names", () => {
      expect(isSensitiveFieldName("password")).toBe(true);
      expect(isSensitiveFieldName("apiKey")).toBe(true);
      expect(isSensitiveFieldName("api_key")).toBe(true);
      expect(isSensitiveFieldName("token")).toBe(true);
      expect(isSensitiveFieldName("secret")).toBe(true);
      expect(isSensitiveFieldName("authorization")).toBe(true);
      expect(isSensitiveFieldName("privateKey")).toBe(true);
    });

    it("should not flag non-sensitive field names", () => {
      expect(isSensitiveFieldName("username")).toBe(false);
      expect(isSensitiveFieldName("email")).toBe(false);
      expect(isSensitiveFieldName("userId")).toBe(false);
      expect(isSensitiveFieldName("timestamp")).toBe(false);
    });

    it("should be case-insensitive", () => {
      expect(isSensitiveFieldName("PASSWORD")).toBe(true);
      expect(isSensitiveFieldName("ApiKey")).toBe(true);
      expect(isSensitiveFieldName("Secret")).toBe(true);
    });

    it("should handle non-string inputs", () => {
      expect(isSensitiveFieldName(null)).toBe(false);
      expect(isSensitiveFieldName(undefined)).toBe(false);
      expect(isSensitiveFieldName(123)).toBe(false);
    });
  });

  describe("matchesSecretPattern", () => {
    it("should detect JWT tokens", () => {
      const jwt =
        "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c";
      expect(matchesSecretPattern(jwt)).toBe(true);
    });

    it("should detect AWS access keys", () => {
      expect(matchesSecretPattern("AKIAIOSFODNN7EXAMPLE")).toBe(true);
    });

    it("should detect Bearer tokens", () => {
      expect(matchesSecretPattern("Bearer abc123def456ghi789")).toBe(true);
    });

    it("should detect hex API keys", () => {
      expect(
        matchesSecretPattern("a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0"),
      ).toBe(true);
    });

    it("should detect GitHub tokens", () => {
      expect(
        matchesSecretPattern("ghp_1234567890abcdefghijklmnopqrstuvwxyz"),
      ).toBe(true);
      expect(
        matchesSecretPattern("gho_1234567890abcdefghijklmnopqrstuvwxyz"),
      ).toBe(true);
    });

    it("should not flag short strings", () => {
      expect(matchesSecretPattern("test")).toBe(false);
      expect(matchesSecretPattern("abc123")).toBe(false);
    });

    it("should not flag normal text", () => {
      expect(matchesSecretPattern("This is a normal message")).toBe(false);
      expect(matchesSecretPattern("user@example.com")).toBe(false);
    });

    it("should handle non-string inputs", () => {
      expect(matchesSecretPattern(null)).toBe(false);
      expect(matchesSecretPattern(undefined)).toBe(false);
      expect(matchesSecretPattern(123)).toBe(false);
    });
  });

  describe("redactStringValue", () => {
    it("should redact JWT tokens", () => {
      const jwt =
        "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c";
      expect(redactStringValue(jwt)).toBe(REDACTED);
    });

    it("should redact parts of strings containing tokens", () => {
      const message = "User token: Bearer abc123def456ghi789jkl012";
      const redacted = redactStringValue(message);
      expect(redacted).toContain(REDACTED);
      expect(redacted).not.toContain("abc123def456ghi789jkl012");
    });

    it("should preserve non-sensitive strings", () => {
      const safe = "This is a safe message";
      expect(redactStringValue(safe)).toBe(safe);
    });

    it("should handle short strings without redaction", () => {
      expect(redactStringValue("test")).toBe("test");
      expect(redactStringValue("123")).toBe("123");
    });

    it("should handle non-string inputs", () => {
      expect(redactStringValue(null)).toBe(null);
      expect(redactStringValue(undefined)).toBe(undefined);
      expect(redactStringValue(123)).toBe(123);
    });
  });

  describe("redactObject", () => {
    it("should redact sensitive field values", () => {
      const obj = {
        username: "john",
        password: "secret123",
        apiKey: "abc123def456",
        email: "john@example.com",
      };

      const redacted = redactObject(obj);

      expect(redacted.username).toBe("john");
      expect(redacted.password).toBe(REDACTED);
      expect(redacted.apiKey).toBe(REDACTED);
      expect(redacted.email).toBe("john@example.com");
    });

    it("should redact nested objects", () => {
      const obj = {
        user: {
          name: "john",
          credentials: {
            password: "secret123",
            token: "abc123",
          },
        },
      };

      const redacted = redactObject(obj);

      expect(redacted.user.name).toBe("john");
      expect(redacted.user.credentials.password).toBe(REDACTED);
      expect(redacted.user.credentials.token).toBe(REDACTED);
    });

    it("should redact arrays", () => {
      const obj = {
        tokens: [
          "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0In0.abc",
          "normal text",
        ],
      };

      const redacted = redactObject(obj);

      expect(redacted.tokens[0]).toBe(REDACTED);
      expect(redacted.tokens[1]).toBe("normal text");
    });

    it("should preserve primitives", () => {
      const obj = {
        count: 42,
        active: true,
        timestamp: new Date("2024-01-01"),
        nothing: null,
      };

      const redacted = redactObject(obj);

      expect(redacted.count).toBe(42);
      expect(redacted.active).toBe(true);
      expect(redacted.timestamp).toEqual(obj.timestamp);
      expect(redacted.nothing).toBe(null);
    });

    it("should handle deep nesting", () => {
      const obj = {
        level1: {
          level2: {
            level3: {
              level4: {
                level5: {
                  secret: "hidden",
                  safe: "visible",
                },
              },
            },
          },
        },
      };

      const redacted = redactObject(obj);

      expect(redacted.level1.level2.level3.level4.level5.secret).toBe(REDACTED);
      expect(redacted.level1.level2.level3.level4.level5.safe).toBe("visible");
    });

    it("should prevent infinite recursion", () => {
      const obj = {
        data: "test",
      };

      // Create a very deep object
      let current = obj;
      for (let i = 0; i < 20; i++) {
        current.nested = { data: "test" };
        current = current.nested;
      }

      const redacted = redactObject(obj);

      expect(redacted).toBeDefined();
      expect(redacted.data).toBe("test");
    });

    it("should handle null and undefined", () => {
      expect(redactObject(null)).toBe(null);
      expect(redactObject(undefined)).toBe(undefined);
    });
  });

  describe("redactLogData", () => {
    it("should redact both message and metadata", () => {
      const message = "Login failed for token: Bearer abc123";
      const meta = {
        username: "john",
        password: "secret123",
        attempt: 1,
      };

      const { message: redactedMsg, meta: redactedMeta } = redactLogData(
        message,
        meta,
      );

      expect(redactedMsg).toContain(REDACTED);
      expect(redactedMsg).not.toContain("abc123");
      expect(redactedMeta.username).toBe("john");
      expect(redactedMeta.password).toBe(REDACTED);
      expect(redactedMeta.attempt).toBe(1);
    });

    it("should handle empty metadata", () => {
      const message = "Test message";
      const { message: redactedMsg, meta: redactedMeta } =
        redactLogData(message);

      expect(redactedMsg).toBe(message);
      expect(redactedMeta).toEqual({});
    });

    it("should preserve safe messages and metadata", () => {
      const message = "User logged in successfully";
      const meta = {
        userId: "12345",
        timestamp: "2024-01-01T00:00:00Z",
      };

      const { message: redactedMsg, meta: redactedMeta } = redactLogData(
        message,
        meta,
      );

      expect(redactedMsg).toBe(message);
      expect(redactedMeta).toEqual(meta);
    });
  });

  describe("Security Patterns", () => {
    it("should not redact common false positives", () => {
      const safe = {
        uuid: "123e4567-e89b-12d3-a456-426614174000",
        hash: "abc123", // Too short to be considered a secret
        version: "1.2.3",
        hex: "deadbeef", // Short hex values are common
      };

      const redacted = redactObject(safe);

      expect(redacted.uuid).toBe(safe.uuid);
      expect(redacted.hash).toBe(safe.hash);
      expect(redacted.version).toBe(safe.version);
      expect(redacted.hex).toBe(safe.hex);
    });

    it("should redact real-world sensitive patterns", () => {
      const sensitive = {
        connectionString: "mongodb://admin:password123@localhost:27017/mydb",
        apiEndpoint: "https://user:secretpass@api.example.com/v1",
      };

      const redacted = redactObject(sensitive);

      // Connection strings with passwords should be partially redacted
      expect(redacted.connectionString).toContain(REDACTED);
      expect(redacted.apiEndpoint).toContain(REDACTED);
    });
  });
});
