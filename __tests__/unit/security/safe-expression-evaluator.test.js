/**
 * @fileoverview Unit tests for SafeExpressionEvaluator
 * Tests that the safe evaluator prevents code injection while allowing safe expressions
 *
 * @author DevilsDev Team
 * @since 2.1.8
 */

const {
  SafeExpressionEvaluator,
  createSafeEvaluator,
  evaluateExpression,
} = require("../../../src/utils/safe-expression-evaluator.js");

describe("SafeExpressionEvaluator", () => {
  let evaluator;

  beforeEach(() => {
    // Force enable for testing
    evaluator = new SafeExpressionEvaluator({ enabled: true });
  });

  describe("Basic functionality", () => {
    test("should evaluate simple expressions", () => {
      expect(evaluator.evaluate("true")).toBe(true);
      expect(evaluator.evaluate("false")).toBe(false);
      expect(evaluator.evaluate("null")).toBe(null);
      expect(evaluator.evaluate("undefined")).toBe(undefined);
      expect(evaluator.evaluate("42")).toBe(42);
      expect(evaluator.evaluate('"hello"')).toBe("hello");
      expect(evaluator.evaluate("'world'")).toBe("world");
    });

    test("should evaluate simple arithmetic", () => {
      expect(evaluator.evaluate("2 + 3")).toBe(5);
      expect(evaluator.evaluate("10 - 4")).toBe(6);
      expect(evaluator.evaluate("3 * 4")).toBe(12);
      expect(evaluator.evaluate("15 / 3")).toBe(5);
      expect(evaluator.evaluate("17 % 5")).toBe(2);
    });

    test("should evaluate comparison operations", () => {
      expect(evaluator.evaluate("5 > 3")).toBe(true);
      expect(evaluator.evaluate("2 < 1")).toBe(false);
      expect(evaluator.evaluate("5 >= 5")).toBe(true);
      expect(evaluator.evaluate("3 <= 2")).toBe(false);
      expect(evaluator.evaluate("5 == 5")).toBe(true);
      expect(evaluator.evaluate("5 === 5")).toBe(true);
      expect(evaluator.evaluate("5 != 3")).toBe(true);
      expect(evaluator.evaluate('5 !== "5"')).toBe(true);
    });

    test("should evaluate logical operations", () => {
      expect(evaluator.evaluate("true && true")).toBe(true);
      expect(evaluator.evaluate("true && false")).toBe(false);
      expect(evaluator.evaluate("true || false")).toBe(true);
      expect(evaluator.evaluate("false || false")).toBe(false);
      expect(evaluator.evaluate("!true")).toBe(false);
      expect(evaluator.evaluate("!false")).toBe(true);
    });

    test("should handle parentheses correctly", () => {
      expect(evaluator.evaluate("(2 + 3) * 4")).toBe(20);
      expect(evaluator.evaluate("2 + (3 * 4)")).toBe(14);
      expect(evaluator.evaluate("((1 + 2) * 3) / 2")).toBe(4.5);
    });
  });

  describe("Context variables", () => {
    test("should access context variables", () => {
      const context = { x: 10, y: 20, name: "test" };

      expect(evaluator.evaluate("x", context)).toBe(10);
      expect(evaluator.evaluate("y", context)).toBe(20);
      expect(evaluator.evaluate("name", context)).toBe("test");
      expect(evaluator.evaluate("x + y", context)).toBe(30);
      expect(evaluator.evaluate('name === "test"', context)).toBe(true);
    });

    test("should return undefined for missing variables", () => {
      const context = { x: 10 };

      expect(evaluator.evaluate("missing", context)).toBe(undefined);
      expect(evaluator.evaluate("x + missing", context)).toBeNaN();
    });

    test("should handle property access", () => {
      const context = {
        input: { value: 42, name: "test" },
        config: { enabled: true, count: 5 },
      };

      expect(evaluator.evaluate("input.value", context)).toBe(42);
      expect(evaluator.evaluate("input.name", context)).toBe("test");
      expect(evaluator.evaluate("config.enabled", context)).toBe(true);
      expect(evaluator.evaluate("config.count", context)).toBe(5);
      expect(evaluator.evaluate("input.value > 40", context)).toBe(true);
    });

    test("should handle null/undefined property access gracefully", () => {
      const context = {
        nullable: null,
        undefinedValue: undefined,
      };

      expect(evaluator.evaluate("nullable.property", context)).toBe(undefined);
      expect(evaluator.evaluate("undefinedValue.property", context)).toBe(
        undefined,
      );
      expect(evaluator.evaluate("missing.property", context)).toBe(undefined);
    });
  });

  describe("Security features", () => {
    test("should reject expressions when disabled in production", () => {
      const prodEvaluator = new SafeExpressionEvaluator({ enabled: false });

      expect(() => {
        prodEvaluator.evaluate("true");
      }).toThrow("Safe evaluator is disabled in production for security");
    });

    test("should reject non-string expressions", () => {
      expect(() => {
        evaluator.evaluate(null);
      }).toThrow("Expression must be a string");

      expect(() => {
        evaluator.evaluate(42);
      }).toThrow("Expression must be a string");

      expect(() => {
        evaluator.evaluate({});
      }).toThrow("Expression must be a string");
    });

    test("should reject expressions that are too long", () => {
      const longExpression = "true && ".repeat(100) + "true";

      expect(() => {
        evaluator.evaluate(longExpression);
      }).toThrow("Expression too long");
    });

    test("should prevent access to dangerous properties", () => {
      const context = {
        obj: {
          constructor: function () {},
          __proto__: {},
          prototype: {},
        },
      };

      // Should only allow alphanumeric property names
      expect(() => {
        evaluator.evaluate("obj.__proto__", context);
      }).toThrow("Invalid property name");

      expect(() => {
        evaluator.evaluate("obj.constructor", context);
      }).toBe(undefined); // allowed property name but not accessible
    });

    test("should enforce recursion depth limits", () => {
      const context = { a: { b: { c: { d: { e: { f: "deep" } } } } } };

      const shallowEvaluator = new SafeExpressionEvaluator({
        enabled: true,
        maxDepth: 2,
      });

      expect(() => {
        shallowEvaluator.evaluate("a.b.c.d.e.f", context);
      }).toThrow("Expression too complex");
    });
  });

  describe("Malicious input prevention", () => {
    test("should block code injection attempts", () => {
      const maliciousExpressions = [
        'constructor.constructor("alert(1)")()',
        'this.constructor.constructor("return process")()',
        '__proto__.constructor("evil code")',
        'globalThis.eval("malicious")',
        "process.exit(1)",
        'require("fs")',
        'import("evil-module")',
        'function() { return "bad"; }',
        '() => "arrow function"',
        'new Date().constructor("code")',
        '{}["constructor"]["constructor"]("code")()',
      ];

      maliciousExpressions.forEach((expr) => {
        expect(() => {
          evaluator.evaluate(expr, {});
        }).toThrow();
      });
    });

    test("should block access to global objects", () => {
      const context = {
        globalThis: global,
        process: process,
        require: require,
        module: module,
        console: console,
      };

      // These should not be accessible even if in context
      expect(evaluator.evaluate("globalThis", context)).toBe(undefined);
      expect(evaluator.evaluate("process", context)).toBe(undefined);
      expect(evaluator.evaluate("require", context)).toBe(undefined);
      expect(evaluator.evaluate("module", context)).toBe(undefined);
      expect(evaluator.evaluate("console", context)).toBe(undefined);
    });

    test("should sanitize string literals", () => {
      expect(evaluator.evaluate('"hello\\nworld"')).toBe("hello\\nworld");
      expect(evaluator.evaluate("'test\\ttab'")).toBe("test\\ttab");
      expect(evaluator.evaluate('"escaped\\"quote"')).toBe('escaped"quote');
    });

    test("should handle unterminated strings", () => {
      expect(() => {
        evaluator.evaluate('"unterminated string');
      }).toThrow("Unterminated string literal");

      expect(() => {
        evaluator.evaluate("'also unterminated");
      }).toThrow("Unterminated string literal");
    });
  });

  describe("Error handling", () => {
    test("should handle unexpected characters", () => {
      expect(() => {
        evaluator.evaluate("1 @ 2");
      }).toThrow("Unexpected character: @");

      expect(() => {
        evaluator.evaluate("test # comment");
      }).toThrow("Unexpected character: #");
    });

    test("should handle unexpected tokens", () => {
      expect(() => {
        evaluator.evaluate("1 +");
      }).toThrow("Unexpected end of expression");

      expect(() => {
        evaluator.evaluate("+ 1");
      }).toThrow("Unexpected token: +");
    });

    test("should handle missing closing parentheses", () => {
      expect(() => {
        evaluator.evaluate("(1 + 2");
      }).toThrow("Expected closing parenthesis");
    });

    test("should handle unexpected tokens after expression", () => {
      expect(() => {
        evaluator.evaluate("1 + 2 extra");
      }).toThrow("Unexpected token after expression: extra");
    });
  });

  describe("Edge cases", () => {
    test("should handle empty expressions", () => {
      expect(() => {
        evaluator.evaluate("");
      }).toThrow("Unexpected end of expression");
    });

    test("should handle whitespace-only expressions", () => {
      expect(() => {
        evaluator.evaluate("   ");
      }).toThrow("Unexpected end of expression");
    });

    test("should handle complex nested expressions", () => {
      const context = {
        input: {
          nested: {
            deep: {
              value: 42,
            },
          },
        },
      };

      expect(evaluator.evaluate("input.nested.deep.value > 40", context)).toBe(
        true,
      );
    });

    test("should handle array-like access safely", () => {
      const context = {
        items: [1, 2, 3],
        config: { items: ["a", "b"] },
      };

      // Should expose length but not array access
      expect(evaluator.evaluate("items.length", context)).toBe(3);
      expect(evaluator.evaluate("items.first", context)).toBe(1);
      expect(evaluator.evaluate("items.last", context)).toBe(3);
    });
  });

  describe("Integration functions", () => {
    test("createSafeEvaluator should create instance", () => {
      const evaluator = createSafeEvaluator({ maxDepth: 10 });
      expect(evaluator).toBeInstanceOf(SafeExpressionEvaluator);
    });

    test("evaluateExpression should work as convenience function", () => {
      const result = evaluateExpression(
        "x + y",
        { x: 5, y: 3 },
        { enabled: true },
      );
      expect(result).toBe(8);
    });

    test("should be disabled by default in production environment", () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = "production";

      try {
        const evaluator = new SafeExpressionEvaluator();
        expect(() => {
          evaluator.evaluate("true");
        }).toThrow("Safe evaluator is disabled in production for security");
      } finally {
        process.env.NODE_ENV = originalEnv;
      }
    });
  });

  describe("Real-world debugging scenarios", () => {
    test("should handle typical breakpoint conditions", () => {
      const context = {
        input: { size: 1024, type: "document" },
        context: { userId: "user123", retryCount: 2 },
      };

      expect(evaluator.evaluate("input.size > 500", context)).toBe(true);
      expect(evaluator.evaluate('input.type === "document"', context)).toBe(
        true,
      );
      expect(evaluator.evaluate("context.retryCount < 5", context)).toBe(true);
      expect(
        evaluator.evaluate(
          "input.size > 1000 && context.retryCount <= 3",
          context,
        ),
      ).toBe(true);
    });

    test("should handle performance monitoring conditions", () => {
      const context = {
        performance: { duration: 1500, memoryUsed: 256 },
        thresholds: { maxDuration: 2000, maxMemory: 512 },
      };

      expect(
        evaluator.evaluate(
          "performance.duration > thresholds.maxDuration",
          context,
        ),
      ).toBe(false);
      expect(
        evaluator.evaluate(
          "performance.memoryUsed > thresholds.maxMemory",
          context,
        ),
      ).toBe(false);
      expect(evaluator.evaluate("performance.duration > 1000", context)).toBe(
        true,
      );
    });
  });
});
