"use strict";

/**
 * Input Sanitizer Security Tests
 *
 * Comprehensive test suite covering:
 * - XSS attack prevention
 * - SQL injection prevention
 * - Command injection prevention
 * - Path traversal prevention
 * - Validation patterns
 * - Performance requirements
 * - Recursive sanitization
 *
 * @since 2.3.0
 */

const {
  InputSanitizer,
  SanitizationRules,
  sanitizeInput,
  sanitizeHtml,
  sanitizeXss,
  sanitizeSql,
  sanitizeCommand,
  sanitizePath,
  validateEmail,
  validateUrl,
  validateUuid,
} = require("../../../src/utils/input-sanitizer");

describe("Input Sanitizer Security Suite", () => {
  let sanitizer;

  beforeEach(() => {
    sanitizer = new InputSanitizer({
      enableCache: false, // Disable cache for consistent testing
      trackStats: true,
    });
  });

  afterEach(() => {
    if (sanitizer) {
      sanitizer.destroy();
    }
  });

  describe("XSS Attack Prevention", () => {
    it("should block script tags", () => {
      const malicious = '<script>alert("XSS")</script>';
      const safe = sanitizer.sanitize(malicious, SanitizationRules.XSS);

      expect(safe).not.toContain("<script>");
      expect(safe).not.toContain("alert");
    });

    it("should block inline event handlers", () => {
      const malicious = '<img src=x onerror="alert(1)">';
      const safe = sanitizer.sanitize(malicious, SanitizationRules.XSS);

      expect(safe).not.toContain("onerror=");
      expect(safe).not.toContain("alert");
    });

    it("should block javascript: protocol", () => {
      const malicious = '<a href="javascript:alert(1)">Click</a>';
      const safe = sanitizer.sanitize(malicious, SanitizationRules.XSS);

      expect(safe).not.toContain("javascript:");
      expect(safe).not.toContain("alert");
    });

    it("should block iframe injection", () => {
      const malicious = '<iframe src="http://evil.com"></iframe>';
      const safe = sanitizer.sanitize(malicious, SanitizationRules.XSS);

      expect(safe).not.toContain("<iframe");
    });

    it("should block object/embed tags", () => {
      const malicious = '<object data="http://evil.com"></object>';
      const safe = sanitizer.sanitize(malicious, SanitizationRules.XSS);

      expect(safe).not.toContain("<object");
    });

    it("should block eval() calls", () => {
      const malicious = "<img src=x onerror=\"eval(atob('YWxlcnQoMSk='))\">";
      const safe = sanitizer.sanitize(malicious, SanitizationRules.XSS);

      expect(safe).not.toContain("eval(");
    });

    it("should handle multiple XSS vectors in one input", () => {
      const malicious =
        "<script>alert(1)</script><img src=x onerror=alert(2)><iframe src=x>";
      const safe = sanitizer.sanitize(malicious, SanitizationRules.XSS);

      expect(safe).not.toContain("<script>");
      expect(safe).not.toContain("onerror=");
      expect(safe).not.toContain("<iframe");
    });

    it("should increment blocked statistics", () => {
      const malicious = '<script>alert("XSS")</script>';
      sanitizer.sanitize(malicious, SanitizationRules.XSS);

      const stats = sanitizer.getStats();
      expect(stats.blocked).toBeGreaterThan(0);
    });
  });

  describe("SQL Injection Prevention", () => {
    it("should block OR-based SQL injection", () => {
      const malicious = "admin' OR '1'='1";
      const safe = sanitizer.sanitize(malicious, SanitizationRules.SQL);

      expect(safe).not.toMatch(/OR\s+['"]?1['"]?\s*=\s*['"]?1/i);
    });

    it("should block UNION-based SQL injection", () => {
      const malicious = "1' UNION SELECT * FROM users--";
      const safe = sanitizer.sanitize(malicious, SanitizationRules.SQL);

      expect(safe).not.toMatch(/UNION\s+SELECT/i);
    });

    it("should block DROP TABLE injection", () => {
      const malicious = "'; DROP TABLE users;--";
      const safe = sanitizer.sanitize(malicious, SanitizationRules.SQL);

      expect(safe).not.toMatch(/DROP\s+TABLE/i);
    });

    it("should escape single quotes", () => {
      const input = "O'Reilly";
      const safe = sanitizer.sanitize(input, SanitizationRules.SQL);

      expect(safe).toBe("O''Reilly"); // Single quote escaped as two single quotes
    });

    it("should block xp_cmdshell attacks", () => {
      const malicious = "'; EXEC xp_cmdshell('dir');--";
      const safe = sanitizer.sanitize(malicious, SanitizationRules.SQL);

      expect(safe).not.toMatch(/xp_cmdshell/i);
    });

    it("should block waitfor delay attacks", () => {
      const malicious = "'; WAITFOR DELAY '00:00:05';--";
      const safe = sanitizer.sanitize(malicious, SanitizationRules.SQL);

      expect(safe).not.toMatch(/WAITFOR\s+DELAY/i);
    });
  });

  describe("Command Injection Prevention", () => {
    it("should block semicolon command chaining", () => {
      const malicious = "test.txt; rm -rf /";
      const safe = sanitizer.sanitize(malicious, SanitizationRules.COMMAND);

      expect(safe).not.toContain(";");
    });

    it("should block pipe command chaining", () => {
      const malicious = "test.txt | cat /etc/passwd";
      const safe = sanitizer.sanitize(malicious, SanitizationRules.COMMAND);

      expect(safe).not.toContain("|");
    });

    it("should block backtick command substitution", () => {
      const malicious = "test.txt `whoami`";
      const safe = sanitizer.sanitize(malicious, SanitizationRules.COMMAND);

      expect(safe).not.toContain("`");
    });

    it("should block $() command substitution", () => {
      const malicious = "test.txt $(whoami)";
      const safe = sanitizer.sanitize(malicious, SanitizationRules.COMMAND);

      expect(safe).not.toContain("$(");
    });

    it("should block redirection to /dev/", () => {
      const malicious = "test.txt > /dev/null";
      const safe = sanitizer.sanitize(malicious, SanitizationRules.COMMAND);

      expect(safe).not.toMatch(/>\s*\/dev\//);
    });
  });

  describe("Path Traversal Prevention", () => {
    it("should block ../ path traversal", () => {
      const malicious = "../../../etc/passwd";

      // Path traversal should throw an error, not return sanitized value
      expect(() => {
        sanitizer.sanitize(malicious, SanitizationRules.PATH);
      }).toThrow("Potential path traversal detected");
    });

    it("should block ..\\ Windows path traversal", () => {
      const malicious = "..\\..\\..\\windows\\system32";

      // Path traversal should throw an error, not return sanitized value
      expect(() => {
        sanitizer.sanitize(malicious, SanitizationRules.PATH);
      }).toThrow("Potential path traversal detected");
    });

    it("should block URL-encoded path traversal", () => {
      const malicious = "%2e%2e%2f%2e%2e%2fetc%2fpasswd";

      // Path traversal should throw an error, not return sanitized value
      expect(() => {
        sanitizer.sanitize(malicious, SanitizationRules.PATH);
      }).toThrow("Potential path traversal detected");
    });

    it("should normalize path separators", () => {
      const input = "folder\\subfolder\\file.txt";
      const safe = sanitizer.sanitize(input, SanitizationRules.PATH);

      expect(safe).toBe("folder/subfolder/file.txt");
    });

    it("should remove leading/trailing slashes", () => {
      const input = "/path/to/file/";
      const safe = sanitizer.sanitize(input, SanitizationRules.PATH);

      expect(safe).toBe("path/to/file");
    });
  });

  describe("HTML Escaping", () => {
    it("should escape HTML entities", () => {
      const html = '<div class="test">Hello & "goodbye"</div>';
      const safe = sanitizer.sanitize(html, SanitizationRules.HTML);

      expect(safe).toContain("&lt;");
      expect(safe).toContain("&gt;");
      expect(safe).toContain("&amp;");
      expect(safe).toContain("&quot;");
    });

    it("should escape single quotes", () => {
      const html = "It's a test";
      const safe = sanitizer.sanitize(html, SanitizationRules.HTML);

      expect(safe).toContain("&#x27;");
    });

    it("should escape forward slashes", () => {
      const html = "</script>";
      const safe = sanitizer.sanitize(html, SanitizationRules.HTML);

      expect(safe).toContain("&#x2F;");
    });
  });

  describe("HTML Tag Stripping", () => {
    it("should strip all HTML tags", () => {
      const html = "<div><p>Hello <strong>World</strong></p></div>";
      const safe = sanitizer.sanitize(html, SanitizationRules.HTML_STRICT);

      expect(safe).toBe("Hello World");
      expect(safe).not.toContain("<");
      expect(safe).not.toContain(">");
    });

    it("should preserve text content", () => {
      const html = "<h1>Title</h1><p>Paragraph text</p>";
      const safe = sanitizer.sanitize(html, SanitizationRules.HTML_STRICT);

      expect(safe).toContain("Title");
      expect(safe).toContain("Paragraph text");
    });
  });

  describe("Email Validation", () => {
    it("should validate correct email addresses", () => {
      const emails = [
        "test@example.com",
        "user.name@example.co.uk",
        "test+tag@example.com",
        "user_123@test-domain.com",
      ];

      emails.forEach((email) => {
        const result = sanitizer.sanitize(email, SanitizationRules.EMAIL);
        expect(result).toBe(email.toLowerCase());
      });
    });

    it("should reject invalid email addresses", () => {
      const invalid = [
        "notanemail",
        "@example.com",
        "test@",
        "test @example.com",
        "test@.com",
      ];

      invalid.forEach((email) => {
        const result = sanitizer.sanitize(email, SanitizationRules.EMAIL);
        expect(result).toBe("");
      });
    });

    it("should convert emails to lowercase", () => {
      const email = "Test.User@EXAMPLE.COM";
      const result = sanitizer.sanitize(email, SanitizationRules.EMAIL);

      expect(result).toBe("test.user@example.com");
    });
  });

  describe("URL Validation", () => {
    it("should validate correct HTTP URLs", () => {
      const urls = [
        "http://example.com",
        "https://www.example.com",
        "https://example.com/path/to/resource",
        "https://example.com:8080/api",
      ];

      urls.forEach((url) => {
        const result = sanitizer.sanitize(url, SanitizationRules.URL);
        expect(result).toBe(url);
      });
    });

    it("should reject invalid URLs", () => {
      const invalid = [
        "javascript:alert(1)",
        "file:///etc/passwd",
        "ftp://example.com",
        "not a url",
        "htp://example.com", // typo
      ];

      invalid.forEach((url) => {
        const result = sanitizer.sanitize(url, SanitizationRules.URL);
        expect(result).toBe("");
      });
    });

    it("should only allow http and https protocols", () => {
      const result = sanitizer.sanitize(
        "ftp://example.com",
        SanitizationRules.URL,
      );
      expect(result).toBe("");
    });
  });

  describe("UUID Validation", () => {
    it("should validate correct UUIDs", () => {
      const validUuids = [
        "550e8400-e29b-41d4-a716-446655440000",
        "6ba7b810-9dad-11d1-80b4-00c04fd430c8",
        "6ba7b811-9dad-11d1-80b4-00c04fd430c8",
      ];

      validUuids.forEach((uuid) => {
        const result = sanitizer.sanitize(uuid, SanitizationRules.UUID);
        expect(result).toBe(uuid.toLowerCase());
      });
    });

    it("should reject invalid UUIDs", () => {
      const invalid = [
        "not-a-uuid",
        "550e8400-e29b-41d4-a716", // Too short
        "550e8400-e29b-41d4-a716-446655440000-extra", // Too long
        "550e8400e29b41d4a716446655440000", // Missing dashes
      ];

      invalid.forEach((uuid) => {
        const result = sanitizer.sanitize(uuid, SanitizationRules.UUID);
        expect(result).toBe("");
      });
    });
  });

  describe("Alphanumeric Validation", () => {
    it("should accept alphanumeric strings", () => {
      const valid = "test123ABC";
      const result = sanitizer.sanitize(valid, SanitizationRules.ALPHANUMERIC);

      expect(result).toBe(valid);
    });

    it("should strip non-alphanumeric characters", () => {
      const input = "test-123_abc@example.com";
      const result = sanitizer.sanitize(input, SanitizationRules.ALPHANUMERIC);

      expect(result).toBe("test123abcexamplecom");
    });
  });

  describe("Numeric Validation", () => {
    it("should validate integers", () => {
      const valid = ["123", "-456", "0"];

      valid.forEach((num) => {
        const result = sanitizer.sanitize(num, SanitizationRules.INTEGER);
        expect(result).toBe(num);
      });
    });

    it("should reject non-integer strings", () => {
      const invalid = ["abc", "12.34", "12abc"];

      invalid.forEach((num) => {
        const result = sanitizer.sanitize(num, SanitizationRules.INTEGER);
        expect(result).toBe("");
      });
    });

    it("should validate floats", () => {
      const valid = ["123.456", "-456.789", "0.0", "123"];

      valid.forEach((num) => {
        const result = sanitizer.sanitize(num, SanitizationRules.FLOAT);
        expect(result).toBe(num);
      });
    });
  });

  describe("Boolean Validation", () => {
    it("should normalize boolean values", () => {
      expect(sanitizer.sanitize("true", SanitizationRules.BOOLEAN)).toBe(
        "true",
      );
      expect(sanitizer.sanitize("false", SanitizationRules.BOOLEAN)).toBe(
        "false",
      );
      expect(sanitizer.sanitize("TRUE", SanitizationRules.BOOLEAN)).toBe(
        "true",
      );
      expect(sanitizer.sanitize("1", SanitizationRules.BOOLEAN)).toBe("true");
      expect(sanitizer.sanitize("0", SanitizationRules.BOOLEAN)).toBe("false");
      expect(sanitizer.sanitize("yes", SanitizationRules.BOOLEAN)).toBe("true");
      expect(sanitizer.sanitize("no", SanitizationRules.BOOLEAN)).toBe("false");
    });

    it("should reject invalid boolean values", () => {
      const result = sanitizer.sanitize("maybe", SanitizationRules.BOOLEAN);
      expect(result).toBe("");
    });
  });

  describe("Recursive Object Sanitization", () => {
    it("should sanitize nested objects", () => {
      const dirty = {
        name: '<script>alert("xss")</script>',
        user: {
          email: "test@example.com",
          bio: "<img src=x onerror=alert(1)>",
        },
      };

      const safe = sanitizer.sanitize(dirty, {
        name: SanitizationRules.XSS,
        user: {
          email: SanitizationRules.EMAIL,
          bio: SanitizationRules.XSS,
        },
      });

      expect(safe.name).not.toContain("<script>");
      expect(safe.user.email).toBe("test@example.com");
      expect(safe.user.bio).not.toContain("onerror=");
    });

    it("should sanitize arrays", () => {
      const dirty = [
        "<script>alert(1)</script>",
        "<img src=x onerror=alert(2)>",
        "safe text",
      ];

      const safe = sanitizer.sanitize(dirty, SanitizationRules.XSS);

      expect(safe[0]).not.toContain("<script>");
      expect(safe[1]).not.toContain("onerror=");
      expect(safe[2]).toContain("safe text");
    });

    it("should enforce maximum depth limit", () => {
      const deep = { level1: { level2: { level3: { level4: {} } } } };
      const shallowSanitizer = new InputSanitizer({ defaultObjectDepth: 2 });

      expect(() => {
        shallowSanitizer.sanitize(deep, SanitizationRules.HTML);
      }).toThrow("Maximum object depth exceeded");

      shallowSanitizer.destroy();
    });
  });

  describe("Performance Requirements", () => {
    it("should sanitize simple strings in <2ms", () => {
      const input = "Hello World";
      const iterations = 1000;

      const startTime = performance.now();

      for (let i = 0; i < iterations; i++) {
        sanitizer.sanitize(input, SanitizationRules.HTML);
      }

      const endTime = performance.now();
      const avgTime = (endTime - startTime) / iterations;

      expect(avgTime).toBeLessThan(2); // Average time should be <2ms
    });

    it("should sanitize complex objects in <10ms", () => {
      const input = {
        name: "Test User",
        email: "test@example.com",
        bio: "<p>Hello World</p>",
        metadata: {
          tags: ["tag1", "tag2"],
          created: "2024-01-01",
        },
      };

      const startTime = performance.now();

      sanitizer.sanitize(input, {
        name: SanitizationRules.HTML,
        email: SanitizationRules.EMAIL,
        bio: SanitizationRules.XSS,
      });

      const endTime = performance.now();

      expect(endTime - startTime).toBeLessThan(10);
    });
  });

  describe("Caching", () => {
    it("should cache sanitization results", () => {
      const cachedSanitizer = new InputSanitizer({ enableCache: true });
      const input = '<script>alert("test")</script>';

      // First call
      cachedSanitizer.sanitize(input, SanitizationRules.XSS);

      // Second call should use cache
      cachedSanitizer.sanitize(input, SanitizationRules.XSS);

      const stats = cachedSanitizer.getStats();
      expect(stats.cached).toBe(1);
      expect(stats.cacheHitRate).toBeGreaterThan(0);

      cachedSanitizer.destroy();
    });

    it("should respect cache size limit", () => {
      const cachedSanitizer = new InputSanitizer({
        enableCache: true,
        cacheSize: 10,
      });

      // Add 20 entries to exceed cache size
      for (let i = 0; i < 20; i++) {
        cachedSanitizer.sanitize(`test${i}`, SanitizationRules.HTML);
      }

      expect(cachedSanitizer.cache.size).toBeLessThanOrEqual(10);

      cachedSanitizer.destroy();
    });

    it("should clear cache", () => {
      const cachedSanitizer = new InputSanitizer({ enableCache: true });

      cachedSanitizer.sanitize("test", SanitizationRules.HTML);
      expect(cachedSanitizer.cache.size).toBeGreaterThan(0);

      cachedSanitizer.clearCache();
      expect(cachedSanitizer.cache.size).toBe(0);

      cachedSanitizer.destroy();
    });
  });

  describe("Statistics Tracking", () => {
    it("should track sanitization statistics", () => {
      sanitizer.sanitize("<script>alert(1)</script>", SanitizationRules.XSS);
      sanitizer.sanitize("test@example.com", SanitizationRules.EMAIL);

      const stats = sanitizer.getStats();

      expect(stats.sanitized).toBe(2);
      expect(stats.averageTime).toBeGreaterThan(0);
    });

    it("should reset statistics", () => {
      sanitizer.sanitize("test", SanitizationRules.HTML);

      sanitizer.resetStats();

      const stats = sanitizer.getStats();
      expect(stats.sanitized).toBe(0);
      expect(stats.totalTime).toBe(0);
    });
  });

  describe("Helper Functions", () => {
    it("sanitizeHtml should escape HTML", () => {
      const result = sanitizeHtml("<div>test</div>");
      expect(result).toContain("&lt;");
      expect(result).toContain("&gt;");
    });

    it("sanitizeXss should block XSS", () => {
      const result = sanitizeXss("<script>alert(1)</script>");
      expect(result).not.toContain("<script>");
    });

    it("sanitizeSql should escape SQL", () => {
      const result = sanitizeSql("O'Reilly");
      expect(result).toBe("O''Reilly");
    });

    it("sanitizeCommand should block command injection", () => {
      const result = sanitizeCommand("test; rm -rf /");
      expect(result).toBe("");
    });

    it("sanitizePath should block path traversal", () => {
      // Path traversal should throw an error
      expect(() => {
        sanitizePath("../../../etc/passwd");
      }).toThrow("Potential path traversal detected");
    });

    it("validateEmail should validate emails", () => {
      const result = validateEmail("test@example.com");
      expect(result).toBe("test@example.com");
    });

    it("validateUrl should validate URLs", () => {
      const result = validateUrl("https://example.com");
      expect(result).toBe("https://example.com");
    });

    it("validateUuid should validate UUIDs", () => {
      const result = validateUuid("550e8400-e29b-41d4-a716-446655440000");
      expect(result).toBe("550e8400-e29b-41d4-a716-446655440000");
    });
  });

  describe("Edge Cases", () => {
    it("should handle null input", () => {
      const result = sanitizer.sanitize(null, SanitizationRules.HTML);
      expect(result).toBeNull();
    });

    it("should handle undefined input", () => {
      const result = sanitizer.sanitize(undefined, SanitizationRules.HTML);
      expect(result).toBeUndefined();
    });

    it("should handle empty string", () => {
      const result = sanitizer.sanitize("", SanitizationRules.HTML);
      expect(result).toBe("");
    });

    it("should handle numbers", () => {
      const result = sanitizer.sanitize(123, SanitizationRules.HTML);
      expect(result).toBe(123);
    });

    it("should handle booleans", () => {
      const result = sanitizer.sanitize(true, SanitizationRules.HTML);
      expect(result).toBe(true);
    });

    it("should handle empty objects", () => {
      const result = sanitizer.sanitize({}, SanitizationRules.HTML);
      expect(result).toEqual({});
    });

    it("should handle empty arrays", () => {
      const result = sanitizer.sanitize([], SanitizationRules.HTML);
      expect(result).toEqual([]);
    });
  });
});
