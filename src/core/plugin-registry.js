"use strict";

const fs = require("fs");
const path = require("path");
const Ajv = require("ajv");
const {
  createPluginVerifier,
} = require("../security/plugin-signature-verifier.js");

class PluginRegistry {
  constructor(options = {}) {
    this._plugins = new Map();
    this._validTypes = new Set([
      "loader",
      "embedder",
      "retriever",
      "reranker",
      "llm",
      "evaluator",
    ]);
    this._contracts = new Map();
    this._contractWarningsShown = new Set(); // Track warnings to show only once per type
    this._disableContractWarnings = options.disableContractWarnings || false;
    this._validateContractSchema =
      options.validateContractSchema !== undefined
        ? options.validateContractSchema
        : true; // Enable schema validation by default

    // Initialize Ajv for contract schema validation
    this._ajv = new Ajv({
      allErrors: true,
      verbose: true,
      strict: false,
    });

    // Load contract schema
    this._contractSchema = this._loadContractSchema();

    // Compile schema validator once
    this._contractSchemaValidator = null;
    if (this._contractSchema) {
      try {
        this._contractSchemaValidator = this._ajv.compile(this._contractSchema);
      } catch (error) {
        if (
          process.env.NODE_ENV !== "production" &&
          !this._disableContractWarnings
        ) {
          console.warn(
            `[PLUGIN_REGISTRY] Warning: Failed to compile contract schema: ${error.message}`,
          ); // eslint-disable-line no-console
        }
        this._contractSchema = null;
      }
    }

    // Environment-aware signature verification defaults
    const isDevelopment = process.env.NODE_ENV === "development";
    const isProduction = process.env.NODE_ENV === "production";

    this._signatureVerifier = createPluginVerifier({
      enabled:
        options.verifySignatures !== undefined
          ? options.verifySignatures
          : isProduction, // Enabled by default in production, disabled in development
      failClosed:
        options.failClosed !== undefined ? options.failClosed : isProduction, // Fail closed in production, fail open in development
      trustedKeysPath: options.trustedKeysPath,
    });
    this._loadContracts();
  }

  /**
   * Load contract schema for validation
   *
   * @private
   * @returns {Object|null} Contract schema or null if not found
   *
   * @since 2.2.4
   */
  _loadContractSchema() {
    try {
      const schemaPath = path.join(
        __dirname,
        "../../contracts/contract-schema.json",
      );
      if (fs.existsSync(schemaPath)) {
        const schemaContent = fs.readFileSync(schemaPath, "utf8");
        return JSON.parse(schemaContent);
      }
    } catch (error) {
      if (
        process.env.NODE_ENV !== "production" &&
        !this._disableContractWarnings
      ) {
        console.warn(
          `[PLUGIN_REGISTRY] Warning: Failed to load contract schema: ${error.message}`,
        ); // eslint-disable-line no-console
      }
    }
    return null;
  }

  /**
   * Validate contract against schema
   *
   * @private
   * @param {Object} contract - Contract to validate
   * @param {string} type - Contract type
   * @returns {Object} Validation result { valid: boolean, errors: Array }
   *
   * @since 2.2.4
   */
  _validateContractAgainstSchema(contract, type) {
    if (!this._validateContractSchema || !this._contractSchemaValidator) {
      return { valid: true, errors: [] };
    }

    try {
      const valid = this._contractSchemaValidator(contract);

      if (!valid) {
        return {
          valid: false,
          errors: this._contractSchemaValidator.errors || [],
        };
      }

      return { valid: true, errors: [] };
    } catch (error) {
      return {
        valid: false,
        errors: [
          {
            message: `Schema validation error: ${error.message}`,
          },
        ],
      };
    }
  }

  /**
   * Format schema validation errors for display
   *
   * @private
   * @param {Array} errors - Ajv validation errors
   * @returns {string} Formatted error message
   *
   * @since 2.2.4
   */
  _formatSchemaErrors(errors) {
    if (!errors || errors.length === 0) {
      return "Unknown schema validation error";
    }

    const messages = errors.map((err) => {
      const path = err.instancePath || err.dataPath || "/";
      const message = err.message || "validation failed";

      if (err.params) {
        const params = Object.entries(err.params)
          .map(([key, value]) => `${key}=${JSON.stringify(value)}`)
          .join(", ");
        return `  - ${path}: ${message} (${params})`;
      }

      return `  - ${path}: ${message}`;
    });

    return messages.join("\n");
  }

  /**
   * Check if a contract exists for the given plugin type
   *
   * @param {string} type - Plugin type (loader, embedder, etc.)
   * @returns {boolean} True if contract exists, false otherwise
   *
   * @example
   * const hasContract = registry.checkContractExists('loader');
   * if (!hasContract) {
   *   console.warn('No contract for loader plugins');
   * }
   *
   * @since 2.2.4
   */
  checkContractExists(type) {
    return this._contracts.has(type);
  }

  /**
   * Log one-time warning for missing contract
   *
   * Logs a helpful warning message about the benefits of contracts
   * and how to add them. Only logs once per contract type and only
   * in non-production environments.
   *
   * @private
   * @param {string} type - Plugin type
   * @param {string} context - Context where warning is generated (e.g., 'load', 'register')
   *
   * @since 2.2.4
   */
  _warnMissingContract(type, context = "load") {
    // Skip if warnings disabled or in production
    if (
      this._disableContractWarnings ||
      process.env.NODE_ENV === "production"
    ) {
      return;
    }

    // Only warn once per type
    const warningKey = `${type}:${context}`;
    if (this._contractWarningsShown.has(warningKey)) {
      return;
    }

    this._contractWarningsShown.add(warningKey);

    console.warn(
      `
╔════════════════════════════════════════════════════════════════════════════╗
║ [PLUGIN_REGISTRY] Missing Contract for '${type}' plugins                       ║
╠════════════════════════════════════════════════════════════════════════════╣
║ A contract specification was not found for the '${type}' plugin type.         ║
║                                                                            ║
║ Benefits of using contracts:                                              ║
║  • Ensures plugin compatibility across versions                           ║
║  • Validates required methods and properties                              ║
║  • Provides clear interface documentation                                 ║
║  • Catches errors early in development                                    ║
║  • Enables automated testing and validation                               ║
║                                                                            ║
║ To add a contract:                                                        ║
║  1. Create contracts/${type}-contract.json                                   ║
║  2. Define required methods and their signatures                          ║
║  3. Run contract validation tests                                         ║
║                                                                            ║
║ Example contract structure:                                               ║
║  {                                                                         ║
║    "type": "${type}",                                                         ║
║    "version": "1.0.0",                                                     ║
║    "required": ["methodName"],                                            ║
║    "properties": { /* method definitions */ }                             ║
║  }                                                                         ║
║                                                                            ║
║ See: docs/error-context-guide.md and __tests__/contracts/README.md        ║
║                                                                            ║
║ To disable these warnings:                                                ║
║  new PluginRegistry({ disableContractWarnings: true })                    ║
╚════════════════════════════════════════════════════════════════════════════╝
    `.trim(),
    ); // eslint-disable-line no-console
  }

  _loadContracts() {
    const contractsDir = path.join(__dirname, "../../contracts");

    try {
      const contractFiles = {
        loader: "loader-contract.json",
        embedder: "embedder-contract.json",
        retriever: "retriever-contract.json",
        llm: "llm-contract.json",
        reranker: "reranker-contract.json",
      };

      for (const [type, filename] of Object.entries(contractFiles)) {
        try {
          const contractPath = path.join(contractsDir, filename);
          if (fs.existsSync(contractPath)) {
            const contractContent = fs.readFileSync(contractPath, "utf8");
            const contract = JSON.parse(contractContent);

            // Validate contract against schema
            const validation = this._validateContractAgainstSchema(
              contract,
              type,
            );

            if (!validation.valid) {
              const errorMessage = this._formatSchemaErrors(validation.errors);
              const error = new Error(
                `Contract schema validation failed for '${type}':\n${errorMessage}`,
              );
              error.validationErrors = validation.errors;
              error.contractType = type;

              if (process.env.NODE_ENV === "production") {
                // In production, log error but continue (fail open)
                console.error(`[PLUGIN_REGISTRY] ERROR: ${error.message}`); // eslint-disable-line no-console
              } else {
                // In development, throw to fail fast
                throw error;
              }
            }

            this._contracts.set(type, contract);
          } else {
            // Use new warning method for missing contracts
            this._warnMissingContract(type, "load");
          }
        } catch (error) {
          // Re-throw validation errors in development mode
          if (error.validationErrors && process.env.NODE_ENV !== "production") {
            throw error;
          }

          // Contract loading is optional - don't fail if missing
          if (
            process.env.NODE_ENV !== "production" &&
            !this._disableContractWarnings
          ) {
            console.warn(
              `[PLUGIN_REGISTRY] Warning: Failed to load contract for '${type}': ${error.message}`,
            ); // eslint-disable-line no-console
          }
        }
      }
    } catch (error) {
      // Re-throw validation errors in development mode
      if (error.validationErrors && process.env.NODE_ENV !== "production") {
        throw error;
      }

      // Contracts directory may not exist in all environments
      if (
        process.env.NODE_ENV !== "production" &&
        !this._disableContractWarnings
      ) {
        console.warn(
          `[PLUGIN_REGISTRY] Warning: Contracts directory not accessible: ${error.message}`,
        ); // eslint-disable-line no-console
      }
    }
  }

  _validatePluginContract(category, impl) {
    const contract = this._contracts.get(category);
    if (!contract) {
      // Use new warning method when registering a plugin without a contract
      this._warnMissingContract(category, "register");
      return; // No contract to validate against
    }

    // Check if plugin has metadata
    if (!impl.metadata) {
      throw new Error("Plugin missing metadata property");
    }

    if (!impl.metadata.name || typeof impl.metadata.name !== "string") {
      throw new Error("Plugin metadata must have a name property");
    }

    if (!impl.metadata.version || typeof impl.metadata.version !== "string") {
      throw new Error("Plugin metadata must have a version property");
    }

    if (!impl.metadata.type || impl.metadata.type !== category) {
      throw new Error(`Plugin metadata type must be '${category}'`);
    }

    // Validate required methods based on contract
    const requiredMethods = this._getRequiredMethodsFromContract(contract);

    for (const methodName of requiredMethods) {
      if (!impl[methodName]) {
        throw new Error(`Plugin missing required method: ${methodName}`);
      }

      if (typeof impl[methodName] !== "function") {
        throw new Error(`Plugin method '${methodName}' must be a function`);
      }
    }
  }

  _getRequiredMethodsFromContract(contract) {
    const methods = [];

    if (contract.required && Array.isArray(contract.required)) {
      methods.push(...contract.required);
    }

    if (contract.properties) {
      for (const [methodName, methodSpec] of Object.entries(
        contract.properties,
      )) {
        if (methodSpec.type === "function") {
          methods.push(methodName);
        }
      }
    }

    return methods;
  }

  async register(category, name, impl, manifest = null) {
    if (!category || typeof category !== "string") {
      throw new Error("Category must be a non-empty string");
    }
    if (!name || typeof name !== "string") {
      throw new Error("Name must be a non-empty string");
    }
    if (impl == null) {
      throw new Error("Implementation cannot be null or undefined");
    }
    if (!this._validTypes.has(category)) {
      throw new Error(`Unknown plugin type: ${category}`);
    }

    // Verify plugin signature if manifest provided
    if (manifest) {
      await this._verifyPluginSignature(manifest, name);
    }

    // Validate plugin against contract
    this._validatePluginContract(category, impl);

    const key = `${category}:${name}`;
    this._plugins.set(key, impl);
    return this;
  }

  /**
   * Verify plugin signature
   * @param {object} manifest - Plugin manifest
   * @param {string} pluginName - Plugin name
   */
  async _verifyPluginSignature(manifest, pluginName) {
    try {
      // Extract signature information from manifest
      if (!manifest.signature || !manifest.signerId) {
        throw new Error(
          `Plugin ${pluginName} missing required signature or signerId`,
        );
      }

      const verificationResult =
        await this._signatureVerifier.verifyPluginSignature(
          manifest,
          manifest.signature,
          manifest.signerId,
        );

      if (!verificationResult.verified) {
        throw new Error(
          `Plugin ${pluginName} signature verification failed: ${verificationResult.error}`,
        );
      }

      // Emit audit entry for successful verification
      this._emitAuditEntry("plugin_verified", {
        pluginName,
        signerId: manifest.signerId,
        version: manifest.version,
        verified: true,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      // Emit audit entry for failed verification
      this._emitAuditEntry("plugin_verification_failed", {
        pluginName,
        signerId: manifest.signerId || "unknown",
        version: manifest.version || "unknown",
        verified: false,
        error: error.message,
        timestamp: new Date().toISOString(),
      });

      throw error;
    }
  }

  /**
   * Emit audit entry
   * @param {string} action - Audit action
   * @param {object} details - Audit details
   */
  _emitAuditEntry(action, details) {
    const auditEntry = {
      timestamp: new Date().toISOString(),
      action,
      component: "plugin_registry",
      ...details,
    };

    // In production, this should go to a secure audit log
    if (process.env.NODE_ENV === "production") {
      console.warn("[AUDIT]", JSON.stringify(auditEntry)); // eslint-disable-line no-console
    } else {
      console.log("[AUDIT]", auditEntry); // eslint-disable-line no-console
    }
  }

  get(category, name) {
    const key = `${category}:${name}`;
    const impl = this._plugins.get(key);
    if (impl === undefined) {
      throw new Error(`Plugin not found: ${category}/${name}`);
    }
    return impl;
  }

  resolve(category, name) {
    return this.get(category, name);
  }

  list(category) {
    if (!this._validTypes.has(category)) {
      throw new Error(`Unknown plugin type: ${category}`);
    }

    const names = [];
    const prefix = `${category}:`;

    for (const key of this._plugins.keys()) {
      if (key.startsWith(prefix)) {
        names.push(key.substring(prefix.length));
      }
    }

    return names;
  }

  clear() {
    this._plugins.clear();
  }
}

// Create singleton instance with default security settings
const registry = new PluginRegistry({
  verifySignatures: process.env.NODE_ENV === "production",
  failClosed: process.env.NODE_ENV === "production",
});

// CJS+ESM interop pattern
module.exports = registry;
module.exports.PluginRegistry = PluginRegistry;
module.exports.default = module.exports;
