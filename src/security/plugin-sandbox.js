/**
 * Plugin Security Sandbox
 *
 * Enterprise-grade plugin isolation and security controls.
 * Provides sandboxed execution environment with comprehensive security measures.
 */

const vm = require("vm");
const { EventEmitter } = require("events");

/**
 * Input sanitizer for security validation
 */
class InputSanitizer {
  static sanitizeInput(input) {
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
  }

  static validateInput(input) {
    const maxLength = 10000;
    const allowedChars = /^[a-zA-Z0-9\s.,?!;:\-_'"()[\]{}@#$%^&*+=|\\/<>~`]*$/;

    if (input.length > maxLength) {
      throw new Error("Input exceeds maximum length");
    }

    if (!allowedChars.test(input)) {
      throw new Error("Input contains invalid characters");
    }

    return true;
  }
}

/**
 * Output sanitizer for data protection
 */
class OutputSanitizer {
  static sanitizeOutput(output) {
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
      sanitized.text = this.sanitizeText(sanitized.text);
    }

    return sanitized;
  }

  static sanitizeText(text) {
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
  }
}

/**
 * Legacy sanitizer for backward compatibility
 */
function sanitizeOutput(obj) {
  const clone = JSON.parse(JSON.stringify(obj));
  const redact = (s) =>
    String(s)
      .replace(/sk-[A-Za-z0-9_-]{10,}/g, "[REDACTED]")
      .replace(/\b[\w.+-]+@[\w-]+\.[\w.-]+\b/g, "[EMAIL_REDACTED]")
      .replace(/\b(?:\d[ -]*?){13,16}\b/g, "[REDACTED]");
  if (typeof clone === "string") return redact(clone);
  if (clone && typeof clone === "object") {
    for (const k of Object.keys(clone)) {
      if (typeof clone[k] === "string") clone[k] = redact(clone[k]);
    }
  }
  return clone;
}

/**
 * Enhanced Plugin Sandbox with comprehensive security controls
 */
class PluginSandbox extends EventEmitter {
  constructor(options = {}) {
    super();

    this.options = {
      memoryLimit: options.memoryLimit || 100 * 1024 * 1024, // 100MB
      timeoutMs: options.timeoutMs || 30000, // 30 seconds
      enableNetworking: options.enableNetworking || false,
      enableFileSystem: options.enableFileSystem || false,
      rateLimit: {
        max: 100,
        windowMs: 60000, // 1 minute
        ...options.rateLimit,
      },
      ...options,
    };

    this.rateLimitStore = new Map();
    this.activeExecutions = new Set();
  }

  /**
   * Execute plugin in secure sandbox
   */
  async run(plugin, prompt, options = {}) {
    const executionId = `exec_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    try {
      this.activeExecutions.add(executionId);

      // Rate limiting
      this._enforceRateLimit(options.rateLimit);

      // Input validation and sanitization
      const sanitizedPrompt = InputSanitizer.sanitizeInput(prompt);
      InputSanitizer.validateInput(sanitizedPrompt);

      // Plugin validation
      this._validatePlugin(plugin);

      // Create isolated execution context
      const result = await this._executeInSandbox(
        plugin,
        sanitizedPrompt,
        executionId,
      );

      // Output sanitization
      const sanitizedResult = this._sanitizeResult(result);

      this.emit("executionCompleted", { executionId, success: true });
      return sanitizedResult;
    } catch (error) {
      this.emit("executionFailed", { executionId, error: error.message });
      throw error;
    } finally {
      this.activeExecutions.delete(executionId);
    }
  }

  /**
   * Enforce rate limiting
   */
  _enforceRateLimit(customRateLimit = {}) {
    const rateLimit = { ...this.options.rateLimit, ...customRateLimit };
    const key = rateLimit.key || "default";
    const now = Date.now();

    const entry = this.rateLimitStore.get(key) || {
      count: 0,
      resetAt: now + rateLimit.windowMs,
    };

    if (now > entry.resetAt) {
      entry.count = 0;
      entry.resetAt = now + rateLimit.windowMs;
    }

    entry.count += 1;
    this.rateLimitStore.set(key, entry);

    if (entry.count > rateLimit.max) {
      throw new Error(
        `Rate limit exceeded: ${entry.count}/${rateLimit.max} requests`,
      );
    }
  }

  /**
   * Validate plugin structure and security
   */
  _validatePlugin(plugin) {
    if (!plugin || typeof plugin !== "object") {
      throw new Error("Invalid plugin: must be an object");
    }

    if (typeof plugin.generate !== "function") {
      throw new Error("Invalid plugin: generate method is required");
    }

    // Check for suspicious properties
    const suspiciousProps = ["__proto__", "constructor", "prototype"];
    for (const prop of suspiciousProps) {
      if (plugin.hasOwnProperty(prop)) {
        throw new Error(
          `Invalid plugin: suspicious property '${prop}' detected`,
        );
      }
    }
  }

  /**
   * Execute plugin in isolated VM context
   */
  async _executeInSandbox(plugin, prompt, executionId) {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(
          new Error(
            `Plugin execution timeout after ${this.options.timeoutMs}ms`,
          ),
        );
      }, this.options.timeoutMs);

      try {
        // Create restricted sandbox environment
        const sandbox = this._createSandboxContext(executionId);
        const ctx = vm.createContext(sandbox, {
          name: `plugin-sandbox-${executionId}`,
          codeGeneration: {
            strings: false, // Disable eval and Function constructor
            wasm: false, // Disable WebAssembly
          },
        });

        // Wrapper function with security controls
        const wrapperCode = `
          (async function executePlugin() {
            try {
              // Memory monitoring
              const startMemory = process.memoryUsage().heapUsed;
              
              // Execute plugin with timeout protection
              const result = await plugin.generate(prompt);
              
              // Check memory usage
              const endMemory = process.memoryUsage().heapUsed;
              const memoryDelta = endMemory - startMemory;
              
              if (memoryDelta > memoryLimit) {
                throw new Error('Memory limit exceeded');
              }
              
              return result;
            } catch (error) {
              throw new Error('Plugin execution failed: ' + error.message);
            }
          })
        `;

        // Inject plugin and prompt into sandbox
        sandbox.plugin = plugin;
        sandbox.prompt = prompt;
        sandbox.memoryLimit = this.options.memoryLimit;

        // Execute in sandbox
        const executorFunction = vm.runInContext(wrapperCode, ctx);

        executorFunction()
          .then((result) => {
            clearTimeout(timeout);
            resolve(result);
          })
          .catch((error) => {
            clearTimeout(timeout);
            reject(error);
          });
      } catch (error) {
        clearTimeout(timeout);
        reject(new Error(`Sandbox creation failed: ${error.message}`));
      }
    });
  }

  /**
   * Create secure sandbox context
   */
  _createSandboxContext(executionId) {
    const sandbox = {
      // Safe console methods
      console: {
        log: () => {}, // Silenced for security
        error: () => {},
        warn: () => {},
        info: () => {},
      },

      // Limited timing functions
      setTimeout: (fn, delay) => {
        if (delay > 5000) throw new Error("Timeout delay too long");
        return setTimeout(fn, delay);
      },
      clearTimeout,
      setImmediate,

      // Restricted process object
      process: {
        env: {}, // Empty environment
        memoryUsage: process.memoryUsage.bind(process),
        hrtime: process.hrtime.bind(process),
      },

      // Safe Buffer access
      Buffer: {
        from: Buffer.from.bind(Buffer),
        alloc: (size) => {
          if (size > 1024 * 1024) throw new Error("Buffer size too large");
          return Buffer.alloc(size);
        },
      },

      // Math and JSON are safe
      Math,
      JSON,
      Date,

      // Block dangerous globals
      require: () => {
        throw new Error("require() is not allowed in sandbox");
      },
      import: () => {
        throw new Error("import() is not allowed in sandbox");
      },
      eval: () => {
        throw new Error("eval() is not allowed in sandbox");
      },
      Function: () => {
        throw new Error("Function() constructor is not allowed in sandbox");
      },

      // Network restrictions
      fetch: this.options.enableNetworking
        ? fetch
        : () => {
            throw new Error("Network access is not allowed in sandbox");
          },

      // File system restrictions
      fs: this.options.enableFileSystem ? require("fs") : undefined,

      // Global object restrictions
      global: undefined,
      globalThis: undefined,
      window: undefined,

      // Execution context identifier
      __SANDBOX_ID__: executionId,
    };

    return sandbox;
  }

  /**
   * Sanitize execution result
   */
  _sanitizeResult(result) {
    try {
      // Use enhanced output sanitizer
      if (typeof result === "object" && result !== null) {
        return OutputSanitizer.sanitizeOutput(result);
      }

      // For string results, use text sanitization
      if (typeof result === "string") {
        return OutputSanitizer.sanitizeText(result);
      }

      // For primitive types, return as-is but ensure no sensitive data
      return sanitizeOutput(result);
    } catch (error) {
      return { error: "Result sanitization failed", message: error.message };
    }
  }

  /**
   * Get sandbox statistics
   */
  getStats() {
    return {
      activeExecutions: this.activeExecutions.size,
      rateLimitEntries: this.rateLimitStore.size,
      options: this.options,
    };
  }

  /**
   * Clean up rate limit entries
   */
  cleanup() {
    const now = Date.now();
    for (const [key, entry] of this.rateLimitStore) {
      if (now > entry.resetAt) {
        this.rateLimitStore.delete(key);
      }
    }
  }
}

module.exports = {
  PluginSandbox,
  sanitizeOutput,
  InputSanitizer,
  OutputSanitizer,
};
