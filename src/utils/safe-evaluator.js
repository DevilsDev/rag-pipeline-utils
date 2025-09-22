/**
 * @fileoverview Safe expression evaluator for user-provided conditions
 * Provides a secure alternative to eval() and Function() constructor
 */

/**
 * Safe expression evaluator with limited capabilities
 * Only allows basic arithmetic, logical operations, and property access
 */
class SafeEvaluator {
  constructor() {
    // Feature flag - default to OFF in production
    this.enabled =
      process.env.SAFE_EVALUATOR_ENABLED === 'true' ||
      process.env.NODE_ENV === 'development';

    // Whitelist of allowed operators
    this.allowedOperators = new Set([
      '+',
      '-',
      '*',
      '/',
      '%',
      '**',
      '==',
      '===',
      '!=',
      '!==',
      '<',
      '>',
      '<=',
      '>=',
      '&&',
      '||',
      '!',
      '?',
      ':',
    ]);

    // Whitelist of allowed property names (simple alphanumeric + underscore)
    this.propertyPattern = /^[a-zA-Z_][a-zA-Z0-9_]*$/;
  }

  /**
   * Evaluate a simple expression safely
   * @param {string} expression - Expression to evaluate
   * @param {object} context - Context object with input and other variables
   * @returns {any} Evaluation result
   */
  evaluate(expression, context = {}) {
    if (!this.enabled) {
      throw new Error('Safe evaluator is disabled in production for security');
    }

    if (typeof expression !== 'string') {
      throw new Error('Expression must be a string');
    }

    // Basic security checks
    this._validateExpression(expression);

    try {
      // Parse and evaluate the expression using a simple parser
      return this._parseAndEvaluate(expression, context);
    } catch (error) {
      throw new Error(`Expression evaluation failed: ${error.message}`);
    }
  }

  /**
   * Validate expression for security
   * @param {string} expression - Expression to validate
   */
  _validateExpression(expression) {
    // Block dangerous patterns
    const dangerousPatterns = [
      /eval\s*\(/,
      /Function\s*\(/,
      /require\s*\(/,
      /process\s*\./,
      /global\s*\./,
      /globalThis\s*\./,
      /constructor/,
      /__proto__/,
      /prototype/,
      /import\s*\(/,
      /import\s+/,
      /export\s+/,
      /function\s*\(/,
      /=>/,
      /class\s+/,
      /new\s+/,
      /delete\s+/,
      /typeof\s+/,
      /instanceof\s+/,
      /throw\s+/,
      /try\s*{/,
      /catch\s*\(/,
      /finally\s*{/,
      /for\s*\(/,
      /while\s*\(/,
      /do\s*{/,
      /switch\s*\(/,
      /case\s+/,
      /default\s*:/,
      /break\s*;/,
      /continue\s*;/,
      /return\s+/,
      /var\s+/,
      /let\s+/,
      /const\s+/,
      /with\s*\(/,
      /debugger/,
      /\/\*/,
      /\/\//,
      /`/, // Template literals
      /\$\{/, // Template literal expressions
    ];

    for (const pattern of dangerousPatterns) {
      if (pattern.test(expression)) {
        throw new Error(`Dangerous pattern detected: ${pattern.source}`);
      }
    }

    // Check for function calls other than whitelisted ones
    const functionCallPattern = /([a-zA-Z_][a-zA-Z0-9_]*)\s*\(/g;
    const allowedFunctions = new Set([
      'Math.abs',
      'Math.max',
      'Math.min',
      'Math.round',
    ]);

    let match;
    while ((match = functionCallPattern.exec(expression)) !== null) {
      const functionName = match[1];
      if (!allowedFunctions.has(functionName)) {
        throw new Error(`Function calls not allowed: ${functionName}`);
      }
    }
  }

  /**
   * Simple expression parser and evaluator
   * Only handles basic arithmetic and logical operations
   * @param {string} expression - Expression to parse
   * @param {object} context - Context for variables
   */
  _parseAndEvaluate(expression, context) {
    // This is a simplified implementation
    // In a real-world scenario, you'd use a proper expression parser like:
    // - jexl
    // - expr-eval
    // - mathjs with restricted functions

    // For now, just handle simple property access and comparisons
    expression = expression.trim();

    // Handle simple property access like "input.status === 'ready'"
    if (this._isSimpleComparison(expression)) {
      return this._evaluateSimpleComparison(expression, context);
    }

    // Handle simple arithmetic like "input.count > 5"
    if (this._isSimpleArithmetic(expression)) {
      return this._evaluateSimpleArithmetic(expression, context);
    }

    // Handle boolean values
    if (expression === 'true') return true;
    if (expression === 'false') return false;
    if (expression === 'null') return null;
    if (expression === 'undefined') return undefined;

    // Handle numbers
    const numberMatch = expression.match(/^-?\d+(\.\d+)?$/);
    if (numberMatch) {
      return parseFloat(expression);
    }

    // Handle string literals
    const stringMatch =
      expression.match(/^"([^"]*)"$/) || expression.match(/^'([^']*)'$/);
    if (stringMatch) {
      return stringMatch[1];
    }

    // Handle simple property access
    if (this._isPropertyAccess(expression)) {
      return this._getProperty(expression, context);
    }

    throw new Error(`Unsupported expression: ${expression}`);
  }

  /**
   * Check if expression is a simple comparison
   */
  _isSimpleComparison(expression) {
    return /^[a-zA-Z_.]+\s*(===|==|!==|!=|<=|>=|<|>)\s*/.test(expression);
  }

  /**
   * Evaluate simple comparison
   */
  _evaluateSimpleComparison(expression, context) {
    const match = expression.match(
      /^([a-zA-Z_.]+)\s*(===|==|!==|!=|<=|>=|<|>)\s*(.+)$/,
    );
    if (!match) {
      throw new Error('Invalid comparison expression');
    }

    const [, leftProp, operator, rightValue] = match;
    const leftVal = this._getProperty(leftProp, context);
    const rightVal = this._parseAndEvaluate(rightValue, context);

    switch (operator) {
      case '===':
        return leftVal === rightVal;
      case '==':
        return leftVal == rightVal;
      case '!==':
        return leftVal !== rightVal;
      case '!=':
        return leftVal != rightVal;
      case '<':
        return leftVal < rightVal;
      case '>':
        return leftVal > rightVal;
      case '<=':
        return leftVal <= rightVal;
      case '>=':
        return leftVal >= rightVal;
      default:
        throw new Error(`Unknown operator: ${operator}`);
    }
  }

  /**
   * Check if expression is simple arithmetic
   */
  _isSimpleArithmetic(expression) {
    return /^[a-zA-Z_.0-9\s+\-*/()\[\]]+$/.test(expression);
  }

  /**
   * Evaluate simple arithmetic (very basic)
   */
  _evaluateSimpleArithmetic(expression, context) {
    // Replace property references with their values
    const propertyPattern = /([a-zA-Z_][a-zA-Z0-9_.]*)/g;
    const substituted = expression.replace(propertyPattern, (match) => {
      if (/^\d+$/.test(match)) return match; // Don't replace numbers
      try {
        const value = this._getProperty(match, context);
        return typeof value === 'number' ? value.toString() : '0';
      } catch {
        return '0';
      }
    });

    // Very basic arithmetic evaluation (numbers and operators only)
    if (!/^[\d\s+\-*/.()]+$/.test(substituted)) {
      throw new Error('Invalid arithmetic expression after substitution');
    }

    // Use Function as a last resort with very restricted input
    try {
      const result = Function(`"use strict"; return (${substituted})`)();
      return typeof result === 'number' ? result : 0;
    } catch {
      throw new Error('Arithmetic evaluation failed');
    }
  }

  /**
   * Check if expression is simple property access
   */
  _isPropertyAccess(expression) {
    return /^[a-zA-Z_][a-zA-Z0-9_.]*$/.test(expression);
  }

  /**
   * Get property value safely
   */
  _getProperty(path, context) {
    const parts = path.split('.');
    let current = context;

    for (const part of parts) {
      if (!this.propertyPattern.test(part)) {
        throw new Error(`Invalid property name: ${part}`);
      }

      if (current === null || current === undefined) {
        return undefined;
      }

      // Only allow access to own properties, not inherited ones
      if (!Object.prototype.hasOwnProperty.call(current, part)) {
        return undefined;
      }

      current = current[part];
    }

    return current;
  }
}

// Create a singleton instance
const safeEvaluator = new SafeEvaluator();

/**
 * Evaluate expression safely
 * @param {string} expression - Expression to evaluate
 * @param {object} context - Context variables
 * @returns {any} Result
 */
function evaluateExpression(expression, context = {}) {
  return safeEvaluator.evaluate(expression, context);
}

module.exports = {
  SafeEvaluator,
  evaluateExpression,
};

// CommonJS/ESM interop
module.exports.default = module.exports;
