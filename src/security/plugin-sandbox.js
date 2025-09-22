/**
 * @fileoverview Plugin sandboxing system for secure execution of third-party plugins.
 * Implements isolated-vm based isolation with resource limits, permission controls, and audit trails.
 *
 * @author DevilsDev Team
 * @since 2.1.0
 * @version 2.1.1
 */

const ivm = require("isolated-vm");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { EventEmitter } = require("events");
const logger = require("../utils/structured-logger");
const PluginSignatureVerifier = require("./plugin-signature-verifier");

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
 * Secure plugin sandbox for executing third-party plugins with strict isolation.
 *
 * Features:
 * - VM-based execution isolation
 * - Resource limits (memory, CPU time, I/O)
 * - Permission-based access control
 * - Audit logging for security compliance
 * - Plugin signature verification
 * - Fail-closed security model
 *
 * @class PluginSandbox
 * @extends EventEmitter
 */
class PluginSandbox extends EventEmitter {
  constructor(options = {}) {
    super();

    this.config = {
      // VM Configuration
      timeout: options.timeout || 30000, // 30 seconds max execution
      memoryLimit: options.memoryLimit || 128 * 1024 * 1024, // 128MB

      // Security Configuration
      allowEval: false, // Never allow eval in sandbox
      allowWasm: false, // Block WebAssembly
      allowAsync: options.allowAsync || true,

      // Permission System
      permissions: {
        filesystem: options.permissions?.filesystem || "none", // none, read, write
        network: options.permissions?.network || "none", // none, limited, full
        process: options.permissions?.process || "none", // none, limited
        crypto: options.permissions?.crypto || "limited", // none, limited, full
        ...options.permissions,
      },

      // Resource Limits
      maxFileSize: options.maxFileSize || 10 * 1024 * 1024, // 10MB
      maxNetworkRequests: options.maxNetworkRequests || 10,
      maxCpuTime: options.maxCpuTime || 5000, // 5 seconds CPU time

      // Audit Configuration
      auditEnabled: options.auditEnabled !== false,
      logLevel: options.logLevel || "info",

      ...options,
    };

    this.signatureVerifier = new PluginSignatureVerifier();
    this.activeSandboxes = new Map();
    this.executionMetrics = new Map();
  }

  /**
   * Execute a plugin within the secure sandbox environment.
   *
   * @param {Object} plugin - Plugin configuration and code
   * @param {Object} context - Execution context and input data
   * @param {Object} options - Override options for this execution
   * @returns {Promise<any>} Plugin execution result
   * @throws {SecurityError} On security policy violations
   * @throws {ResourceError} On resource limit exceeded
   * @throws {ValidationError} On plugin validation failure
   */
  async execute(plugin, context = {}, options = {}) {
    const executionId = crypto.randomUUID();
    const startTime = Date.now();

    return logger.withCorrelation(executionId, async () => {
      this.auditLog("sandbox.execution.start", {
        executionId,
        pluginId: plugin.id,
        permissions: this.config.permissions,
        resourceLimits: {
          timeout: this.config.timeout,
          memoryLimit: this.config.memoryLimit,
          maxCpuTime: this.config.maxCpuTime,
        },
      });

      try {
        // 1. Validate and verify plugin
        await this.validatePlugin(plugin);

        // 2. Create isolated execution environment
        const sandbox = this.createSandbox(plugin, context, executionId);

        // 3. Execute with monitoring
        const result = await this.executeInSandbox(
          sandbox,
          plugin,
          context,
          options,
        );

        // 4. Record success metrics
        this.recordMetrics(executionId, startTime, "success", result);

        this.auditLog("sandbox.execution.success", {
          executionId,
          pluginId: plugin.id,
          duration: Date.now() - startTime,
          resultSize: JSON.stringify(result).length,
        });

        return result;
      } catch (error) {
        this.recordMetrics(executionId, startTime, "error", null, error);

        this.auditLog("sandbox.execution.error", {
          executionId,
          pluginId: plugin.id,
          error: error.message,
          errorType: error.constructor.name,
          duration: Date.now() - startTime,
        });

        // Clean up any resources
        this.cleanupSandbox(executionId);

        throw error;
      }
    });
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
   * Execute plugin in isolated VM context using isolated-vm
   */
  async _executeInSandbox(plugin, prompt, executionId) {
    let isolate;
    let context;

    try {
      // Create new isolate with memory limit
      isolate = new ivm.Isolate({
        memoryLimit: Math.floor(this.options.memoryLimit / (1024 * 1024)), // Convert to MB
      });

      // Create context
      context = await isolate.createContext();

      // Set up global environment
      const jail = context.global;
      await jail.set("global", jail.derefInto());

      // Create secure execution environment
      const secureGlobals = this._createSecureGlobals(executionId);
      for (const [key, value] of Object.entries(secureGlobals)) {
        if (typeof value === "function") {
          await jail.set(key, new ivm.Reference(value));
        } else {
          await jail.set(key, value);
        }
      }

      // Inject plugin and prompt safely
      await jail.set(
        "pluginCode",
        new ivm.ExternalCopy(plugin.generate.toString()).copyInto(),
      );
      await jail.set("promptData", new ivm.ExternalCopy(prompt).copyInto());
      await jail.set("memoryLimit", this.options.memoryLimit);

      // Create wrapper function for secure execution
      const wrapperCode = `
        (async function executePlugin() {
          try {
            // Reconstruct plugin function
            const pluginFunc = eval('(' + pluginCode + ')');

            // Execute with timeout protection
            const result = await pluginFunc(promptData);

            return result;
          } catch (error) {
            throw new Error('Plugin execution failed: ' + error.message);
          }
        })();
      `;

      // Execute with timeout
      const result = await context.eval(wrapperCode, {
        timeout: this.options.timeoutMs,
        promise: true,
      });

      return result;
    } catch (error) {
      throw new Error(`Isolated VM execution failed: ${error.message}`);
    } finally {
      // Clean up resources
      if (context) {
        context.release();
      }
      if (isolate) {
        isolate.dispose();
      }
    }
  }

  /**
   * Create secure globals for isolated-vm
   */
  _createSecureGlobals(executionId) {
    return {
      // Safe console methods (silenced for security)
      console: {
        log: () => {},
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

      // Safe utilities
      Math,
      JSON,
      Date,

      // Execution context identifier
      __SANDBOX_ID__: executionId,
    };
  }

  /**
   * Create secure sandbox context (legacy method for compatibility)
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

/**
 * Simple sandbox runner with timeout and abort support
 * @param {Function} fn - Function to execute
 * @param {Object} options - Options object
 * @param {number} options.timeoutMs - Timeout in milliseconds (default: 5000)
 * @param {AbortSignal} options.signal - AbortSignal for cancellation
 * @returns {Promise<Object>} Result object with success/error
 */
async function run(fn, { timeoutMs = 5000, signal } = {}) {
  return new Promise((resolve) => {
    let isResolved = false;

    const resolveOnce = (result) => {
      if (!isResolved) {
        isResolved = true;
        resolve(result);
      }
    };

    // Handle abort signal
    if (signal && signal.aborted) {
      return resolveOnce({ success: false, error: "aborted" });
    }

    let abortListener;
    if (signal) {
      abortListener = () => {
        resolveOnce({ success: false, error: "aborted" });
      };
      signal.addEventListener("abort", abortListener);
    }

    // Set up timeout
    const timeoutId = setTimeout(() => {
      resolveOnce({ success: false, error: "timeout" });
    }, timeoutMs);

    // Execute function
    Promise.resolve()
      .then(() => fn())
      .then((result) => {
        clearTimeout(timeoutId);
        if (signal && abortListener) {
          signal.removeEventListener("abort", abortListener);
        }
        resolveOnce({ success: true, result });
      })
      .catch((error) => {
        clearTimeout(timeoutId);
        if (signal && abortListener) {
          signal.removeEventListener("abort", abortListener);
        }
        const errorMessage = String(error.message || error);
        resolveOnce({ success: false, error: errorMessage });
      });
  });
}

module.exports = {
  PluginSandbox,
  sanitizeOutput,
  InputSanitizer,
  OutputSanitizer,
  run,
};

// CommonJS default export compatibility
module.exports.default = module.exports;
