/**
 * @fileoverview Tests for the safe expression evaluator
 * Ensures dangerous code execution patterns are blocked
 */

const {
  SafeEvaluator,
  evaluateExpression,
} = require("../../../src/utils/safe-evaluator.js");

describe("SafeEvaluator", () => {
  let evaluator;
  let originalEnv;

  beforeEach(() => {
    originalEnv = process.env.SAFE_EVALUATOR_ENABLED;
    process.env.SAFE_EVALUATOR_ENABLED = "true"; // Enable for testing
    evaluator = new SafeEvaluator();
  });

  afterEach(() => {
    if (originalEnv !== undefined) {
      process.env.SAFE_EVALUATOR_ENABLED = originalEnv;
    } else {
      delete process.env.SAFE_EVALUATOR_ENABLED;
    }
  });

  describe("Security protection", () => {
    test("should block eval attempts", () => {
      expect(() => {
        evaluator.evaluate('eval("malicious code")', {});
      }).toThrow("Dangerous pattern detected");
    });

    test("should block Function constructor attempts", () => {
      expect(() => {
        evaluator.evaluate('Function("return process")()', {});
      }).toThrow("Dangerous pattern detected");
    });

    test("should block process access attempts", () => {
      expect(() => {
        evaluator.evaluate("process.exit()", {});
      }).toThrow("Dangerous pattern detected");
    });

    test("should block global access attempts", () => {
      expect(() => {
        evaluator.evaluate("global.something", {});
      }).toThrow("Dangerous pattern detected");
    });

    test("should block require attempts", () => {
      expect(() => {
        evaluator.evaluate('require("fs")', {});
      }).toThrow("Dangerous pattern detected");
    });

    test("should block constructor access", () => {
      expect(() => {
        evaluator.evaluate("input.constructor", {});
      }).toThrow("Dangerous pattern detected");
    });

    test("should block prototype pollution attempts", () => {
      expect(() => {
        evaluator.evaluate("input.__proto__", {});
      }).toThrow("Dangerous pattern detected");
    });

    test("should block arrow functions", () => {
      expect(() => {
        evaluator.evaluate("() => { malicious }", {});
      }).toThrow("Dangerous pattern detected");
    });

    test("should block template literals", () => {
      expect(() => {
        evaluator.evaluate("`malicious ${code}`", {});
      }).toThrow("Dangerous pattern detected");
    });

    test("should block control flow statements", () => {
      const dangerousExpressions = [
        "for (let i = 0; i < 10; i++) {}",
        "while (true) {}",
        "if (true) { malicious }",
        "try { malicious } catch {}",
        "throw new Error()",
        "return malicious",
      ];

      dangerousExpressions.forEach((expr) => {
        expect(() => {
          evaluator.evaluate(expr, {});
        }).toThrow("Dangerous pattern detected");
      });
    });

    test("should block variable declarations", () => {
      const dangerousExpressions = ["var x = 1", "let y = 2", "const z = 3"];

      dangerousExpressions.forEach((expr) => {
        expect(() => {
          evaluator.evaluate(expr, {});
        }).toThrow("Dangerous pattern detected");
      });
    });

    test("should block unauthorized function calls", () => {
      expect(() => {
        evaluator.evaluate("maliciousFunction()", {});
      }).toThrow("Function calls not allowed: maliciousFunction");
    });
  });

  describe("Safe operations", () => {
    test("should allow simple property access", () => {
      const context = {
        input: { status: "ready", count: 5 },
        config: { enabled: true },
      };

      expect(evaluator.evaluate("input.status", context)).toBe("ready");
      expect(evaluator.evaluate("input.count", context)).toBe(5);
      expect(evaluator.evaluate("config.enabled", context)).toBe(true);
    });

    test("should allow simple comparisons", () => {
      const context = { input: { count: 5, status: "ready" } };

      expect(evaluator.evaluate("input.count === 5", context)).toBe(true);
      expect(evaluator.evaluate("input.count > 3", context)).toBe(true);
      expect(evaluator.evaluate('input.status === "ready"', context)).toBe(
        true,
      );
      expect(evaluator.evaluate('input.status !== "pending"', context)).toBe(
        true,
      );
    });

    test("should handle undefined properties safely", () => {
      const context = { input: {} };

      expect(evaluator.evaluate("input.nonexistent", context)).toBeUndefined();
      expect(
        evaluator.evaluate("input.nested.property", context),
      ).toBeUndefined();
    });

    test("should allow basic arithmetic", () => {
      const context = { input: { a: 10, b: 5 } };

      expect(evaluator.evaluate("input.a + input.b", context)).toBe(15);
      expect(evaluator.evaluate("input.a - input.b", context)).toBe(5);
      expect(evaluator.evaluate("input.a * input.b", context)).toBe(50);
      expect(evaluator.evaluate("input.a / input.b", context)).toBe(2);
    });

    test("should handle primitive values", () => {
      expect(evaluator.evaluate("true", {})).toBe(true);
      expect(evaluator.evaluate("false", {})).toBe(false);
      expect(evaluator.evaluate("null", {})).toBe(null);
      expect(evaluator.evaluate("undefined", {})).toBe(undefined);
      expect(evaluator.evaluate("42", {})).toBe(42);
      expect(evaluator.evaluate("3.14", {})).toBe(3.14);
      expect(evaluator.evaluate('"hello"', {})).toBe("hello");
      expect(evaluator.evaluate("'world'", {})).toBe("world");
    });

    test("should validate property names", () => {
      const context = { valid_name123: "ok" };

      expect(evaluator.evaluate("valid_name123", context)).toBe("ok");

      expect(() => {
        evaluator.evaluate("123invalid", context);
      }).toThrow("Invalid property name");
    });
  });

  describe("Feature flag behavior", () => {
    test("should be disabled by default in production", () => {
      delete process.env.SAFE_EVALUATOR_ENABLED;
      delete process.env.NODE_ENV;

      const prodEvaluator = new SafeEvaluator();
      expect(() => {
        prodEvaluator.evaluate("true", {});
      }).toThrow("Safe evaluator is disabled in production for security");
    });

    test("should be enabled in development", () => {
      delete process.env.SAFE_EVALUATOR_ENABLED;
      process.env.NODE_ENV = "development";

      const devEvaluator = new SafeEvaluator();
      expect(devEvaluator.evaluate("true", {})).toBe(true);
    });

    test("should respect explicit enabling", () => {
      process.env.SAFE_EVALUATOR_ENABLED = "true";
      process.env.NODE_ENV = "production";

      const enabledEvaluator = new SafeEvaluator();
      expect(enabledEvaluator.evaluate("true", {})).toBe(true);
    });
  });

  describe("Global function interface", () => {
    test("should export convenience function", () => {
      const context = { input: { test: true } };
      expect(evaluateExpression("input.test", context)).toBe(true);
    });

    test("should handle errors in convenience function", () => {
      expect(() => {
        evaluateExpression('eval("bad")', {});
      }).toThrow("Dangerous pattern detected");
    });
  });

  describe("Edge cases and error handling", () => {
    test("should reject non-string expressions", () => {
      expect(() => {
        evaluator.evaluate(123, {});
      }).toThrow("Expression must be a string");

      expect(() => {
        evaluator.evaluate(null, {});
      }).toThrow("Expression must be a string");
    });

    test("should handle complex property access", () => {
      const context = {
        input: {
          nested: {
            deep: {
              value: "found",
            },
          },
        },
      };

      expect(evaluator.evaluate("input.nested.deep.value", context)).toBe(
        "found",
      );
    });

    test("should handle null context gracefully", () => {
      const context = { input: null };
      expect(evaluator.evaluate("input.something", context)).toBeUndefined();
    });

    test("should prevent access to inherited properties", () => {
      const context = {
        input: Object.create({ inherited: "should not access" }),
      };
      expect(evaluator.evaluate("input.inherited", context)).toBeUndefined();
    });
  });
});
