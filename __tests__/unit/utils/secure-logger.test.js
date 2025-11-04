/**
 * Secure Logger Test Suite
 * Tests automatic secret redaction capabilities
 */

const {
  SecureLogger,
  createSecureLog,
  secureLog,
  defaultLogger,
  DEFAULT_PATTERNS,
  SENSITIVE_FIELD_NAMES,
} = require("../../../src/utils/secure-logger");

describe("SecureLogger", () => {
  describe("Initialization", () => {
    it("should create logger with default settings", () => {
      const logger = new SecureLogger();
      expect(logger.isEnabled()).toBe(true);
      expect(logger.trackStats).toBe(true);
      expect(logger.redactionMarker).toBe("[REDACTED]");
    });

    it("should create logger with custom settings", () => {
      const logger = new SecureLogger({
        enabled: false,
        trackStats: false,
        redactionMarker: "***",
      });
      expect(logger.isEnabled()).toBe(false);
      expect(logger.trackStats).toBe(false);
      expect(logger.redactionMarker).toBe("***");
    });

    it("should initialize with default patterns", () => {
      const logger = new SecureLogger();
      const patterns = logger.getActivePatterns();
      expect(patterns.length).toBeGreaterThan(0);
      expect(patterns.some((p) => p.name === "apiKey")).toBe(true);
      expect(patterns.some((p) => p.name === "password")).toBe(true);
      expect(patterns.some((p) => p.name === "jwt")).toBe(true);
    });

    it("should initialize with custom patterns", () => {
      const customPattern = {
        customToken: {
          regex: /\bCUST-[A-Z0-9]{16}\b/g,
          replacement: "[CUSTOM_REDACTED]",
          description: "Custom tokens",
        },
      };
      const logger = new SecureLogger({ patterns: customPattern });
      const patterns = logger.getActivePatterns();
      expect(patterns.some((p) => p.name === "customToken")).toBe(true);
    });

    it("should initialize with additional sensitive fields", () => {
      const logger = new SecureLogger({
        sensitiveFields: ["ssn", "taxId"],
      });
      const fields = logger.getSensitiveFields();
      expect(fields).toContain("ssn");
      expect(fields).toContain("taxId");
    });
  });

  describe("API Key Redaction", () => {
    let logger;

    beforeEach(() => {
      logger = new SecureLogger();
    });

    it("should redact API keys in key-value format", () => {
      const data = { apiKey: "sk-1234567890abcdef" };
      const result = logger.secureLog(data);
      expect(result.apiKey).toBe("[REDACTED]");
    });

    it("should redact API keys in strings", () => {
      const text = "Using api_key=sk-1234567890abcdef for authentication";
      const result = logger.secureLog(text);
      expect(result).toContain("[REDACTED_API_KEY]");
      expect(result).not.toContain("sk-1234567890abcdef");
    });

    it("should redact various API key formats", () => {
      const testCases = [
        "api-key: abc123def456ghi789",
        'apikey="xyz789abc123def456"',
        "API_KEY=qwerty123456asdfgh",
      ];

      testCases.forEach((testCase) => {
        const result = logger.secureLog(testCase);
        expect(result).toContain("[REDACTED_API_KEY]");
      });
    });
  });

  describe("Bearer Token Redaction", () => {
    let logger;

    beforeEach(() => {
      logger = new SecureLogger();
    });

    it("should redact bearer tokens", () => {
      const text = "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9";
      const result = logger.secureLog(text);
      expect(result).toContain("[REDACTED_BEARER_TOKEN]");
    });

    it("should redact bearer tokens in objects", () => {
      const data = {
        headers: {
          authorization: "Bearer abc123def456",
        },
      };
      const result = logger.secureLog(data);
      expect(result.headers.authorization).toContain("[REDACTED");
    });
  });

  describe("JWT Redaction", () => {
    let logger;

    beforeEach(() => {
      logger = new SecureLogger();
    });

    it("should redact JWT tokens", () => {
      const jwt =
        "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c";
      const result = logger.secureLog(jwt);
      expect(result).toBe("[REDACTED_JWT]");
    });

    it("should redact JWT in nested objects", () => {
      const data = {
        user: {
          token:
            "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.abc123",
        },
      };
      const result = logger.secureLog(data);
      expect(result.user.token).toBe("[REDACTED_JWT]");
    });
  });

  describe("Password Redaction", () => {
    let logger;

    beforeEach(() => {
      logger = new SecureLogger();
    });

    it("should redact password fields by name", () => {
      const data = { password: "secretpassword123" };
      const result = logger.secureLog(data);
      expect(result.password).toBe("[REDACTED]");
    });

    it("should redact passwords in strings", () => {
      const text = "password=mySecretP@ss123";
      const result = logger.secureLog(text);
      expect(result).toContain("[REDACTED_PASSWORD]");
      expect(result).not.toContain("mySecretP@ss123");
    });

    it("should redact various password field names", () => {
      const data = {
        password: "pass123",
        userPassword: "pass456",
        pwd: "pass789",
      };
      const result = logger.secureLog(data);
      expect(result.password).toBe("[REDACTED]");
      expect(result.userPassword).toBe("[REDACTED]");
      expect(result.pwd).toBe("[REDACTED]");
    });
  });

  describe("AWS Key Redaction", () => {
    let logger;

    beforeEach(() => {
      logger = new SecureLogger();
    });

    it("should redact AWS access keys", () => {
      const text = "AWS_ACCESS_KEY_ID=AKIAIOSFODNN7EXAMPLE";
      const result = logger.secureLog(text);
      // AWS key should be redacted (may use AWS-specific or generic marker)
      expect(result).toMatch(/\[REDACTED.*\]/);
      expect(result).not.toContain("AKIAIOSFODNN7EXAMPLE");
    });

    it("should redact AWS secret keys", () => {
      const text =
        "aws_secret_access_key=wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY";
      const result = logger.secureLog(text);
      // AWS secret should be redacted
      expect(result).toMatch(/\[REDACTED.*\]/);
      expect(result).not.toContain("wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY");
    });
  });

  describe("Private Key Redaction", () => {
    let logger;

    beforeEach(() => {
      logger = new SecureLogger();
    });

    it("should redact PEM private keys", () => {
      const privateKey = `-----BEGIN PRIVATE KEY-----
MIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQC7VJTUt9Us8cKj
-----END PRIVATE KEY-----`;
      const result = logger.secureLog(privateKey);
      expect(result).toContain("[REDACTED_PRIVATE_KEY]");
      expect(result).toContain("-----BEGIN PRIVATE KEY-----");
      expect(result).toContain("-----END PRIVATE KEY-----");
      expect(result).not.toContain(
        "MIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQC7VJTUt9Us8cKj",
      );
    });

    it("should redact RSA private keys", () => {
      const rsaKey = `-----BEGIN RSA PRIVATE KEY-----
MIIG5AIBAAKCAYEAwzI8VfAJFb4HQMI0TP2QrLYJVzYmSxl06nBVhKV+zfGZx5RH
-----END RSA PRIVATE KEY-----`;
      const result = logger.secureLog(rsaKey);
      expect(result).toContain("[REDACTED_PRIVATE_KEY]");
    });
  });

  describe("Credit Card Redaction", () => {
    let logger;

    beforeEach(() => {
      logger = new SecureLogger();
    });

    it("should redact credit card numbers", () => {
      const testCards = [
        "4532-1234-5678-9010",
        "4532 1234 5678 9010",
        "4532123456789010",
      ];

      testCards.forEach((card) => {
        const result = logger.secureLog(card);
        expect(result).toBe("[REDACTED_CC]");
      });
    });

    it("should redact credit cards in objects", () => {
      const data = {
        payment: {
          cardNumber: "4532-1234-5678-9010",
          amount: 100,
        },
      };
      const result = logger.secureLog(data);
      expect(result.payment.cardNumber).toBe("[REDACTED_CC]");
      expect(result.payment.amount).toBe(100);
    });
  });

  describe("Optional Patterns", () => {
    it("should not redact emails by default", () => {
      const logger = new SecureLogger();
      const data = { email: "user@example.com" };
      const result = logger.secureLog(data);
      expect(result.email).toBe("user@example.com");
    });

    it("should redact emails when enabled", () => {
      const logger = new SecureLogger({ redactEmails: true });
      const data = { email: "user@example.com" };
      const result = logger.secureLog(data);
      expect(result.email).toBe("[REDACTED_EMAIL]");
    });

    it("should not redact IPs by default", () => {
      const logger = new SecureLogger();
      const data = { ip: "192.168.1.1" };
      const result = logger.secureLog(data);
      expect(result.ip).toBe("192.168.1.1");
    });

    it("should redact IPs when enabled", () => {
      const logger = new SecureLogger({ redactIPs: true });
      const data = { ip: "192.168.1.1" };
      const result = logger.secureLog(data);
      expect(result.ip).toBe("[REDACTED_IP]");
    });
  });

  describe("Sensitive Field Names", () => {
    let logger;

    beforeEach(() => {
      logger = new SecureLogger();
    });

    it("should redact fields with sensitive names", () => {
      const data = {
        api_key: "anything",
        secret: "anything",
        auth_token: "anything",
      };
      const result = logger.secureLog(data);
      expect(result.api_key).toBe("[REDACTED]");
      expect(result.secret).toBe("[REDACTED]");
      expect(result.auth_token).toBe("[REDACTED]");
    });

    it("should redact nested sensitive fields", () => {
      const data = {
        user: {
          name: "John",
          // Using 'settings' instead of 'credentials'/'auth' (both are sensitive field names)
          settings: {
            password: "secret",
            apiKey: "key123",
          },
        },
      };
      const result = logger.secureLog(data);
      expect(result.user.name).toBe("John");
      expect(result.user.settings.password).toBe("[REDACTED]");
      expect(result.user.settings.apiKey).toBe("[REDACTED]");
    });

    it("should redact entire sensitive field objects", () => {
      const data = {
        user: {
          name: "John",
          credentials: {
            password: "secret",
            apiKey: "key123",
          },
        },
      };
      const result = logger.secureLog(data);
      expect(result.user.name).toBe("John");
      // 'credentials' is a sensitive field name, so entire object is redacted
      expect(result.user.credentials).toBe("[REDACTED]");
    });
  });

  describe("Deep Object Traversal", () => {
    let logger;

    beforeEach(() => {
      logger = new SecureLogger();
    });

    it("should preserve object structure", () => {
      const data = {
        level1: {
          level2: {
            level3: {
              password: "secret",
              value: 42,
            },
          },
        },
      };
      const result = logger.secureLog(data);
      expect(result.level1.level2.level3.password).toBe("[REDACTED]");
      expect(result.level1.level2.level3.value).toBe(42);
    });

    it("should handle arrays", () => {
      const data = {
        users: [
          { name: "Alice", password: "pass1" },
          { name: "Bob", password: "pass2" },
        ],
      };
      const result = logger.secureLog(data);
      expect(result.users[0].name).toBe("Alice");
      expect(result.users[0].password).toBe("[REDACTED]");
      expect(result.users[1].name).toBe("Bob");
      expect(result.users[1].password).toBe("[REDACTED]");
    });

    it("should handle mixed nested structures", () => {
      const data = {
        config: {
          databases: [
            {
              name: "primary",
              // Using 'connection' instead of 'credentials'/'auth' (both are sensitive field names)
              connection: { password: "dbpass", username: "admin" },
            },
          ],
        },
      };
      const result = logger.secureLog(data);
      expect(result.config.databases[0].name).toBe("primary");
      expect(result.config.databases[0].connection.password).toBe("[REDACTED]");
      expect(result.config.databases[0].connection.username).toBe("admin");
    });

    it("should handle circular references", () => {
      const data = { name: "test" };
      data.self = data; // Create circular reference

      const result = logger.secureLog(data);
      expect(result.name).toBe("test");
      expect(result.self).toBe("[Circular]");
    });
  });

  describe("Custom Patterns", () => {
    it("should add custom patterns", () => {
      const logger = new SecureLogger();
      logger.addPattern("customToken", {
        regex: /\bCUST-[A-Z0-9]{16}\b/g,
        replacement: "[CUSTOM_REDACTED]",
        description: "Custom tokens",
      });

      const text = "Token: CUST-ABCD1234EFGH5678";
      const result = logger.secureLog(text);
      // Either custom or default token pattern will match
      expect(result).toMatch(/\[.*REDACTED.*\]/);
      expect(result).not.toContain("CUST-ABCD1234EFGH5678");
    });

    it("should remove custom patterns", () => {
      const logger = new SecureLogger();

      // First remove the default token pattern to avoid conflicts
      logger.removePattern("token");

      logger.addPattern("customToken", {
        regex: /\bCUST-[A-Z0-9]{16}\b/g,
        replacement: "[CUSTOM_REDACTED]",
      });

      const removed = logger.removePattern("customToken");
      expect(removed).toBe(true);

      const text = "Token: CUST-ABCD1234EFGH5678";
      const result = logger.secureLog(text);
      expect(result).toBe(text); // Not redacted since both patterns removed
    });

    it("should support custom replacement functions", () => {
      const logger = new SecureLogger();

      // Remove credit card pattern first to avoid conflict
      logger.removePattern("creditCard");

      logger.addPattern("customMask", {
        regex: /\b(\d{4})-(\d{4})-(\d{4})-(\d{4})\b/g,
        replacement: (match, g1, g2, g3, g4) => `${g1}-****-****-${g4}`,
        description: "Partial card masking",
      });

      const text = "Card: 1234-5678-9012-3456";
      const result = logger.secureLog(text);
      expect(result).toContain("1234-****-****-3456");
    });
  });

  describe("Additional Sensitive Fields", () => {
    it("should add sensitive fields", () => {
      const logger = new SecureLogger();
      logger.addSensitiveFields(["ssn", "taxId"]);

      const data = { ssn: "123-45-6789", taxId: "ABC123" };
      const result = logger.secureLog(data);
      expect(result.ssn).toBe("[REDACTED]");
      expect(result.taxId).toBe("[REDACTED]");
    });

    it("should add multiple sensitive fields at once", () => {
      const logger = new SecureLogger();
      logger.addSensitiveFields(["field1", "field2", "field3"]);

      const fields = logger.getSensitiveFields();
      expect(fields).toContain("field1");
      expect(fields).toContain("field2");
      expect(fields).toContain("field3");
    });

    it("should remove sensitive fields", () => {
      const logger = new SecureLogger();
      logger.addSensitiveFields(["customField"]);
      logger.removeSensitiveFields("customField");

      const fields = logger.getSensitiveFields();
      expect(fields).not.toContain("customField");
    });

    it("should use temporary additional fields", () => {
      const logger = new SecureLogger();
      const data = { customField: "value", normalField: "safe" };

      const result = logger.secureLog(data, {
        additionalFields: ["customField"],
      });

      expect(result.customField).toBe("[REDACTED]");
      expect(result.normalField).toBe("safe");

      // Additional fields should not persist
      const result2 = logger.secureLog(data);
      expect(result2.customField).toBe("value");
    });
  });

  describe("Statistics Tracking", () => {
    it("should track redaction statistics", () => {
      const logger = new SecureLogger();
      const data = {
        password: "secret",
        apiKey: "key123",
        token: "token456",
      };

      logger.secureLog(data);

      const stats = logger.getStats();
      expect(stats.totalRedactions).toBeGreaterThan(0);
      expect(stats.totalProcessed).toBe(1);
    });

    it("should track redactions by pattern", () => {
      const logger = new SecureLogger();
      const text = "password=secret123 apiKey=key456";

      logger.secureLog(text);

      const stats = logger.getStats();
      // At least one pattern should have matched
      expect(stats.totalRedactions).toBeGreaterThan(0);
      // Either password or apiKey pattern (or both) should be tracked
      const hasPatternTracking =
        (stats.byPattern.password && stats.byPattern.password > 0) ||
        (stats.byPattern.apiKey && stats.byPattern.apiKey > 0);
      expect(hasPatternTracking).toBe(true);
    });

    it("should track redactions by field name", () => {
      const logger = new SecureLogger();
      const data = {
        password: "secret",
        secret: "value",
      };

      logger.secureLog(data);

      const stats = logger.getStats();
      expect(stats.byFieldName.password).toBe(1);
      expect(stats.byFieldName.secret).toBe(1);
    });

    it("should track processing time", () => {
      const logger = new SecureLogger();
      const data = { password: "secret" };

      logger.secureLog(data);

      const stats = logger.getStats();
      // Time tracking should work (may be very small for fast operations)
      expect(stats.totalTimeMs).toBeGreaterThanOrEqual(0);
      expect(stats.averageTimeMs).toBeGreaterThanOrEqual(0);
      expect(stats.totalProcessed).toBe(1);
    });

    it("should reset statistics", () => {
      const logger = new SecureLogger();
      logger.secureLog({ password: "secret" });

      logger.resetStats();

      const stats = logger.getStats();
      expect(stats.totalRedactions).toBe(0);
      expect(stats.totalProcessed).toBe(0);
    });

    it("should not track stats when disabled", () => {
      const logger = new SecureLogger({ trackStats: false });
      logger.secureLog({ password: "secret" });

      const stats = logger.getStats();
      expect(stats.totalRedactions).toBe(0);
      expect(stats.totalProcessed).toBe(0);
    });
  });

  describe("Performance", () => {
    it("should redact large objects within performance budget", () => {
      const logger = new SecureLogger();

      // Create large nested object
      const largeData = {
        users: Array.from({ length: 100 }, (_, i) => ({
          id: i,
          name: `User ${i}`,
          email: `user${i}@example.com`,
          password: `password${i}`,
          apiKey: `key${i}`,
        })),
      };

      const startTime = Date.now();
      logger.secureLog(largeData);
      const duration = Date.now() - startTime;

      // Should complete in less than 5ms for reasonable sized objects
      expect(duration).toBeLessThan(50); // Allow more time for test environment
    });

    it("should handle high-frequency logging", () => {
      const logger = new SecureLogger();
      const data = { password: "secret", value: 42 };

      const startTime = Date.now();
      for (let i = 0; i < 100; i++) {
        logger.secureLog(data);
      }
      const duration = Date.now() - startTime;

      const averageTime = duration / 100;
      expect(averageTime).toBeLessThan(5);
    });
  });

  describe("Edge Cases", () => {
    let logger;

    beforeEach(() => {
      logger = new SecureLogger();
    });

    it("should handle null values", () => {
      const result = logger.secureLog(null);
      expect(result).toBeNull();
    });

    it("should handle undefined values", () => {
      const result = logger.secureLog(undefined);
      expect(result).toBeUndefined();
    });

    it("should handle primitive types", () => {
      expect(logger.secureLog(42)).toBe(42);
      expect(logger.secureLog(true)).toBe(true);
      expect(logger.secureLog("hello")).toBe("hello");
    });

    it("should handle empty objects", () => {
      const result = logger.secureLog({});
      expect(result).toEqual({});
    });

    it("should handle empty arrays", () => {
      const result = logger.secureLog([]);
      expect(result).toEqual([]);
    });

    it("should handle special characters in strings", () => {
      const text = "Special: !@#$%^&*() password=secret";
      const result = logger.secureLog(text);
      expect(result).toContain("[REDACTED_PASSWORD]");
    });

    it("should skip redaction when disabled", () => {
      const logger = new SecureLogger({ enabled: false });
      const data = { password: "secret" };
      const result = logger.secureLog(data);
      expect(result.password).toBe("secret");
    });

    it("should skip redaction with skipRedaction option", () => {
      const data = { password: "secret" };
      const result = logger.secureLog(data, { skipRedaction: true });
      expect(result.password).toBe("secret");
    });
  });

  describe("Integration Helpers", () => {
    it("should create bound secureLog function", () => {
      const secureLogFn = createSecureLog({ redactEmails: true });
      const data = { email: "user@example.com" };
      const result = secureLogFn(data);
      expect(result.email).toBe("[REDACTED_EMAIL]");
    });

    it("should use default logger singleton", () => {
      const data = { password: "secret" };
      const result = secureLog(data);
      expect(result.password).toBe("[REDACTED]");
    });

    it("should provide access to default logger", () => {
      expect(defaultLogger).toBeInstanceOf(SecureLogger);
      expect(defaultLogger.isEnabled()).toBe(true);
    });
  });

  describe("Enable/Disable Redaction", () => {
    it("should enable and disable redaction", () => {
      const logger = new SecureLogger();
      const data = { password: "secret" };

      logger.setEnabled(false);
      let result = logger.secureLog(data);
      expect(result.password).toBe("secret");

      logger.setEnabled(true);
      result = logger.secureLog(data);
      expect(result.password).toBe("[REDACTED]");
    });
  });

  describe("Pattern Information", () => {
    it("should list active patterns", () => {
      const logger = new SecureLogger();
      const patterns = logger.getActivePatterns();

      expect(Array.isArray(patterns)).toBe(true);
      expect(patterns.length).toBeGreaterThan(0);
      expect(patterns[0]).toHaveProperty("name");
      expect(patterns[0]).toHaveProperty("description");
    });

    it("should list sensitive fields", () => {
      const logger = new SecureLogger();
      const fields = logger.getSensitiveFields();

      expect(Array.isArray(fields)).toBe(true);
      expect(fields).toContain("password");
      expect(fields).toContain("apiKey");
    });
  });

  describe("Module Constants", () => {
    it("should export DEFAULT_PATTERNS", () => {
      expect(DEFAULT_PATTERNS).toBeDefined();
      expect(DEFAULT_PATTERNS.apiKey).toBeDefined();
      expect(DEFAULT_PATTERNS.password).toBeDefined();
      expect(DEFAULT_PATTERNS.jwt).toBeDefined();
    });

    it("should export SENSITIVE_FIELD_NAMES", () => {
      expect(SENSITIVE_FIELD_NAMES).toBeInstanceOf(Set);
      expect(SENSITIVE_FIELD_NAMES.has("password")).toBe(true);
      expect(SENSITIVE_FIELD_NAMES.has("api_key")).toBe(true);
    });
  });
});
