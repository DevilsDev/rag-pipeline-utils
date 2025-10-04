/**
 * @fileoverview Safe Expression Evaluator
 * Safely evaluates simple expressions without allowing arbitrary code execution
 * Replaces dangerous eval() and Function() usage with a restricted parser
 *
 * @author DevilsDev Team
 * @since 2.1.8
 */

/**
 * Safe expression evaluator for debugging conditions
 * Only allows simple property access, comparisons, and basic operations
 */
class SafeExpressionEvaluator {
  constructor(options = {}) {
    // Dynamic production check
    const productionEnabled = process.env.NODE_ENV !== "production";
    this.enabled = options.enabled !== false && productionEnabled;
    this.maxDepth = options.maxDepth || 5;
    this.maxExpression = options.maxExpression || 200;

    // Allowed operators for expressions
    this.allowedOperators = new Set([
      "==",
      "===",
      "!=",
      "!==",
      "<",
      ">",
      "<=",
      ">=",
      "&&",
      "||",
      "!",
      "+",
      "-",
      "*",
      "/",
      "%",
    ]);

    // Allowed property access patterns
    this.allowedPropertyPattern = /^[a-zA-Z_$][a-zA-Z0-9_$]*$/;

    // Dangerous identifiers that should never be accessible
    this.blockedIdentifiers = new Set([
      "globalThis",
      "global",
      "process",
      "require",
      "module",
      "console",
      "eval",
      "Function",
      "window",
      "document",
    ]);
  }

  /**
   * Evaluate a safe expression
   * @param {string} expression - Expression to evaluate
   * @param {object} context - Safe context object
   * @returns {any} Evaluation result
   */
  evaluate(expression, context = {}) {
    if (!this.enabled) {
      throw new Error("Safe evaluator is disabled in production for security");
    }

    if (typeof expression !== "string") {
      throw new Error("Expression must be a string");
    }

    if (expression.length > this.maxExpression) {
      throw new Error("Expression too long");
    }

    // Parse and validate the expression
    const tokens = this.tokenize(expression);
    const ast = this.parse(tokens);

    return this.evaluateNode(ast, context);
  }

  /**
   * Tokenize expression into safe tokens
   * @param {string} expression - Expression to tokenize
   * @returns {Array} Array of tokens
   */
  tokenize(expression) {
    const tokens = [];
    let i = 0;

    while (i < expression.length) {
      const char = expression[i];

      // Skip whitespace
      if (/\s/.test(char)) {
        i++;
        continue;
      }

      // Numbers
      if (/\d/.test(char)) {
        let number = "";
        while (i < expression.length && /[\d.]/.test(expression[i])) {
          number += expression[i];
          i++;
        }
        tokens.push({ type: "NUMBER", value: parseFloat(number) });
        continue;
      }

      // Identifiers and property access
      if (/[a-zA-Z_$]/.test(char)) {
        let identifier = "";
        while (i < expression.length && /[a-zA-Z0-9_$]/.test(expression[i])) {
          identifier += expression[i];
          i++;
        }

        // Check for boolean literals
        if (identifier === "true") {
          tokens.push({ type: "BOOLEAN", value: true });
        } else if (identifier === "false") {
          tokens.push({ type: "BOOLEAN", value: false });
        } else if (identifier === "null") {
          tokens.push({ type: "NULL", value: null });
        } else if (identifier === "undefined") {
          tokens.push({ type: "UNDEFINED", value: undefined });
        } else {
          tokens.push({ type: "IDENTIFIER", value: identifier });
        }
        continue;
      }

      // String literals
      if (char === '"' || char === "'") {
        const quote = char;
        let string = "";
        i++; // Skip opening quote

        while (i < expression.length && expression[i] !== quote) {
          if (expression[i] === "\\" && i + 1 < expression.length) {
            // Handle escape sequences
            const nextChar = expression[i + 1];
            if (nextChar === quote || nextChar === "\\") {
              string += nextChar;
              i += 2;
            } else {
              string += expression[i];
              i++;
            }
          } else {
            string += expression[i];
            i++;
          }
        }

        if (i >= expression.length) {
          throw new Error("Unterminated string literal");
        }

        i++; // Skip closing quote
        tokens.push({ type: "STRING", value: string });
        continue;
      }

      // Operators
      if (char === "=" && expression[i + 1] === "=") {
        if (expression[i + 2] === "=") {
          tokens.push({ type: "OPERATOR", value: "===" });
          i += 3;
        } else {
          tokens.push({ type: "OPERATOR", value: "==" });
          i += 2;
        }
        continue;
      }

      if (char === "!" && expression[i + 1] === "=") {
        if (expression[i + 2] === "=") {
          tokens.push({ type: "OPERATOR", value: "!==" });
          i += 3;
        } else {
          tokens.push({ type: "OPERATOR", value: "!=" });
          i += 2;
        }
        continue;
      }

      if (char === "<" || char === ">") {
        if (expression[i + 1] === "=") {
          tokens.push({ type: "OPERATOR", value: char + "=" });
          i += 2;
        } else {
          tokens.push({ type: "OPERATOR", value: char });
          i++;
        }
        continue;
      }

      if (char === "&" && expression[i + 1] === "&") {
        tokens.push({ type: "OPERATOR", value: "&&" });
        i += 2;
        continue;
      }

      if (char === "|" && expression[i + 1] === "|") {
        tokens.push({ type: "OPERATOR", value: "||" });
        i += 2;
        continue;
      }

      // Single character operators and punctuation
      if ("!+-*/%().".includes(char)) {
        if (char === ".") {
          tokens.push({ type: "DOT", value: "." });
        } else if (char === "(" || char === ")") {
          tokens.push({ type: "PAREN", value: char });
        } else {
          tokens.push({ type: "OPERATOR", value: char });
        }
        i++;
        continue;
      }

      throw new Error(`Unexpected character: ${char}`);
    }

    return tokens;
  }

  /**
   * Parse tokens into AST
   * @param {Array} tokens - Tokens to parse
   * @returns {object} AST node
   */
  parse(tokens) {
    let index = 0;

    const parseExpression = () => {
      return parseLogicalOr();
    };

    const parseLogicalOr = () => {
      let left = parseLogicalAnd();

      while (index < tokens.length && tokens[index].value === "||") {
        const operator = tokens[index].value;
        index++;
        const right = parseLogicalAnd();
        left = { type: "BinaryExpression", operator, left, right };
      }

      return left;
    };

    const parseLogicalAnd = () => {
      let left = parseEquality();

      while (index < tokens.length && tokens[index].value === "&&") {
        const operator = tokens[index].value;
        index++;
        const right = parseEquality();
        left = { type: "BinaryExpression", operator, left, right };
      }

      return left;
    };

    const parseEquality = () => {
      let left = parseComparison();

      while (
        index < tokens.length &&
        ["==", "===", "!=", "!=="].includes(tokens[index].value)
      ) {
        const operator = tokens[index].value;
        index++;
        const right = parseComparison();
        left = { type: "BinaryExpression", operator, left, right };
      }

      return left;
    };

    const parseComparison = () => {
      let left = parseAdditive();

      while (
        index < tokens.length &&
        ["<", ">", "<=", ">="].includes(tokens[index].value)
      ) {
        const operator = tokens[index].value;
        index++;
        const right = parseAdditive();
        left = { type: "BinaryExpression", operator, left, right };
      }

      return left;
    };

    const parseAdditive = () => {
      let left = parseMultiplicative();

      while (
        index < tokens.length &&
        ["+", "-"].includes(tokens[index].value)
      ) {
        const operator = tokens[index].value;
        index++;
        const right = parseMultiplicative();
        left = { type: "BinaryExpression", operator, left, right };
      }

      return left;
    };

    const parseMultiplicative = () => {
      let left = parseUnary();

      while (
        index < tokens.length &&
        ["*", "/", "%"].includes(tokens[index].value)
      ) {
        const operator = tokens[index].value;
        index++;
        const right = parseUnary();
        left = { type: "BinaryExpression", operator, left, right };
      }

      return left;
    };

    const parseUnary = () => {
      if (index < tokens.length && tokens[index].value === "!") {
        const operator = tokens[index].value;
        index++;
        const argument = parseUnary();
        return { type: "UnaryExpression", operator, argument };
      }

      return parseMemberAccess();
    };

    const parseMemberAccess = () => {
      let object = parsePrimary();

      while (index < tokens.length && tokens[index].type === "DOT") {
        index++; // Skip dot
        if (index >= tokens.length || tokens[index].type !== "IDENTIFIER") {
          throw new Error("Expected property name after dot");
        }
        const property = tokens[index].value;
        index++;
        object = { type: "MemberExpression", object, property };
      }

      return object;
    };

    const parsePrimary = () => {
      if (index >= tokens.length) {
        throw new Error("Unexpected end of expression");
      }

      const token = tokens[index];

      if (token.type === "NUMBER") {
        index++;
        return { type: "Literal", value: token.value };
      }

      if (token.type === "STRING") {
        index++;
        return { type: "Literal", value: token.value };
      }

      if (token.type === "BOOLEAN") {
        index++;
        return { type: "Literal", value: token.value };
      }

      if (token.type === "NULL") {
        index++;
        return { type: "Literal", value: null };
      }

      if (token.type === "UNDEFINED") {
        index++;
        return { type: "Literal", value: undefined };
      }

      if (token.type === "IDENTIFIER") {
        index++;
        return { type: "Identifier", name: token.value };
      }

      if (token.type === "PAREN" && token.value === "(") {
        index++; // Skip opening paren
        const expr = parseExpression();
        if (index >= tokens.length || tokens[index].value !== ")") {
          throw new Error("Expected closing parenthesis");
        }
        index++; // Skip closing paren
        return expr;
      }

      throw new Error(`Unexpected token: ${token.value}`);
    };

    const ast = parseExpression();

    if (index < tokens.length) {
      throw new Error(
        `Unexpected token after expression: ${tokens[index].value}`,
      );
    }

    return ast;
  }

  /**
   * Evaluate AST node
   * @param {object} node - AST node
   * @param {object} context - Evaluation context
   * @param {number} depth - Current recursion depth
   * @returns {any} Evaluation result
   */
  evaluateNode(node, context, depth = 0) {
    if (depth > this.maxDepth) {
      throw new Error("Expression too complex");
    }

    switch (node.type) {
      case "Literal":
        return node.value;

      case "Identifier":
        // Block dangerous identifiers
        if (this.blockedIdentifiers.has(node.name)) {
          return undefined;
        }
        if (!Object.prototype.hasOwnProperty.call(context, node.name)) {
          return undefined;
        }
        return context[node.name];

      case "MemberExpression": {
        const object = this.evaluateNode(node.object, context, depth + 1);
        if (object == null) {
          return undefined;
        }

        // Allow specific properties on arrays
        if (Array.isArray(object)) {
          if (node.property === "length") {
            return object.length;
          }
          if (node.property === "first") {
            return object[0];
          }
          if (node.property === "last") {
            return object[object.length - 1];
          }
          // Block other array access
          return undefined;
        }

        // Only allow simple property access on plain objects
        if (typeof object !== "object") {
          return undefined;
        }

        // Validate property name - block dangerous properties
        if (
          !this.allowedPropertyPattern.test(node.property) ||
          node.property.startsWith("__") ||
          ["constructor", "prototype", "__proto__"].includes(node.property)
        ) {
          throw new Error("Invalid property name");
        }

        // Only access own properties
        if (!Object.prototype.hasOwnProperty.call(object, node.property)) {
          return undefined;
        }

        return object[node.property];
      }

      case "BinaryExpression": {
        const left = this.evaluateNode(node.left, context, depth + 1);
        const right = this.evaluateNode(node.right, context, depth + 1);

        switch (node.operator) {
          case "==":
            return left == right; // eslint-disable-line eqeqeq
          case "===":
            return left === right;
          case "!=":
            return left != right; // eslint-disable-line eqeqeq
          case "!==":
            return left !== right;
          case "<":
            return left < right;
          case ">":
            return left > right;
          case "<=":
            return left <= right;
          case ">=":
            return left >= right;
          case "&&":
            return left && right;
          case "||":
            return left || right;
          case "+":
            return left + right;
          case "-":
            return left - right;
          case "*":
            return left * right;
          case "/":
            return left / right;
          case "%":
            return left % right;
          default:
            throw new Error(`Unknown operator: ${node.operator}`);
        }
      }

      case "UnaryExpression": {
        const argument = this.evaluateNode(node.argument, context, depth + 1);

        switch (node.operator) {
          case "!":
            return !argument;
          default:
            throw new Error(`Unknown unary operator: ${node.operator}`);
        }
      }

      default:
        throw new Error(`Unknown node type: ${node.type}`);
    }
  }
}

/**
 * Create a safe evaluator instance
 * @param {object} options - Configuration options
 * @returns {SafeExpressionEvaluator} Evaluator instance
 */
function createSafeEvaluator(options = {}) {
  return new SafeExpressionEvaluator(options);
}

/**
 * Evaluate expression safely
 * @param {string} expression - Expression to evaluate
 * @param {object} context - Context object
 * @param {object} options - Options
 * @returns {any} Evaluation result
 */
function evaluateExpression(expression, context = {}, options = {}) {
  const evaluator = createSafeEvaluator(options);
  return evaluator.evaluate(expression, context);
}

module.exports = {
  SafeExpressionEvaluator,
  createSafeEvaluator,
  evaluateExpression,
};

// CommonJS/ESM interop
module.exports.default = module.exports;
