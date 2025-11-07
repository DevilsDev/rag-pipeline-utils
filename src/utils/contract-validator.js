/**
 * @fileoverview Contract Validation Utilities
 *
 * Provides utilities for validating plugin implementations against their
 * contract specifications. Ensures plugins conform to required interfaces,
 * method signatures, and metadata requirements.
 *
 * @module utils/contract-validator
 * @author Ali Kahwaji
 * @since 2.2.4
 * @version 1.0.0
 */

'use strict';

const fs = require('fs');
const path = require('path');

/**
 * ContractValidator class for validating plugin implementations
 *
 * Provides comprehensive validation of:
 * - Plugin metadata (name, version, type)
 * - Required methods existence
 * - Method signatures and parameter counts
 * - Method return types
 * - Contract compliance reporting
 *
 * @class
 * @since 2.2.4
 *
 * @example
 * const validator = new ContractValidator();
 * const contract = validator.loadContract('loader');
 * const result = validator.validatePlugin(myPlugin, contract);
 * if (!result.valid) {
 *   console.error('Validation errors:', result.errors);
 * }
 */
class ContractValidator {
  /**
   * Create a ContractValidator instance
   *
   * @param {Object} [options={}] - Validator configuration
   * @param {string} [options.contractsDir='./contracts'] - Contracts directory path
   */
  constructor(options = {}) {
    this.contractsDir =
      options.contractsDir || path.join(process.cwd(), 'contracts');
  }

  /**
   * Load a contract from the contracts directory
   *
   * @param {string} type - Plugin type (loader, embedder, retriever, llm, reranker)
   * @returns {Object} Contract specification
   * @throws {Error} If contract file not found or invalid
   *
   * @example
   * const contract = validator.loadContract('loader');
   * console.log(contract.type); // 'loader'
   * console.log(contract.version); // '1.0.0'
   *
   * @since 2.2.4
   */
  loadContract(type) {
    const contractPath = path.join(this.contractsDir, `${type}-contract.json`);

    if (!fs.existsSync(contractPath)) {
      throw new Error(
        `Contract not found for type: ${type} at ${contractPath}`,
      );
    }

    try {
      const contractData = fs.readFileSync(contractPath, 'utf8');
      return JSON.parse(contractData);
    } catch (error) {
      throw new Error(`Failed to load contract for ${type}: ${error.message}`);
    }
  }

  /**
   * Load all contracts from the contracts directory
   *
   * @returns {Object} Map of plugin type to contract
   *
   * @example
   * const contracts = validator.loadAllContracts();
   * // { loader: {...}, embedder: {...}, ... }
   *
   * @since 2.2.4
   */
  loadAllContracts() {
    const contracts = {};

    if (!fs.existsSync(this.contractsDir)) {
      return contracts;
    }

    const files = fs.readdirSync(this.contractsDir);

    for (const file of files) {
      if (file.endsWith('-contract.json')) {
        const type = file.replace('-contract.json', '');
        try {
          contracts[type] = this.loadContract(type);
        } catch (error) {
          // Skip invalid contracts
          console.warn(`Skipping invalid contract: ${file}`);
        }
      }
    }

    return contracts;
  }

  /**
   * Validate plugin metadata structure
   *
   * Validates that plugin has required metadata properties:
   * - name (string)
   * - version (string)
   * - type (string matching contract type)
   *
   * @param {Object} plugin - Plugin instance to validate
   * @param {Object} contract - Contract specification
   * @returns {Object} Validation result { valid: boolean, errors: string[] }
   *
   * @example
   * const result = validator.validateMetadata(myPlugin, contract);
   * if (!result.valid) {
   *   console.error('Metadata errors:', result.errors);
   * }
   *
   * @since 2.2.4
   */
  validateMetadata(plugin, contract) {
    const errors = [];

    if (!plugin) {
      errors.push('Plugin is null or undefined');
      return { valid: false, errors };
    }

    // Check name
    if (typeof plugin.name !== 'string' || plugin.name.trim() === '') {
      errors.push(
        'Plugin must have a valid "name" property (non-empty string)',
      );
    }

    // Check version
    if (typeof plugin.version !== 'string' || plugin.version.trim() === '') {
      errors.push(
        'Plugin must have a valid "version" property (non-empty string)',
      );
    }

    // Check type matches contract
    if (plugin.type !== contract.type) {
      errors.push(
        `Plugin type "${plugin.type}" does not match contract type "${contract.type}"`,
      );
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * Validate required methods exist and are functions
   *
   * Ensures all methods listed in contract.required are present
   * on the plugin and are callable functions.
   *
   * @param {Object} plugin - Plugin instance to validate
   * @param {Object} contract - Contract specification
   * @returns {Object} Validation result { valid: boolean, errors: string[] }
   *
   * @example
   * const result = validator.validateRequiredMethods(myPlugin, contract);
   * // Check all required methods exist
   *
   * @since 2.2.4
   */
  validateRequiredMethods(plugin, contract) {
    const errors = [];

    if (!contract.required || !Array.isArray(contract.required)) {
      return { valid: true, errors: [] };
    }

    for (const methodName of contract.required) {
      if (!(methodName in plugin)) {
        errors.push(`Required method "${methodName}" is missing`);
        continue;
      }

      if (typeof plugin[methodName] !== 'function') {
        errors.push(`Required property "${methodName}" must be a function`);
      }
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * Validate method signatures match contract specifications
   *
   * Checks that method parameter counts align with contract specifications.
   * Note: JavaScript does not enforce parameter types, so this validates
   * parameter count and naming conventions.
   *
   * @param {Object} plugin - Plugin instance to validate
   * @param {Object} contract - Contract specification
   * @returns {Object} Validation result { valid: boolean, errors: string[], warnings: string[] }
   *
   * @example
   * const result = validator.validateMethodSignatures(myPlugin, contract);
   * if (result.warnings.length) {
   *   console.warn('Signature warnings:', result.warnings);
   * }
   *
   * @since 2.2.4
   */
  validateMethodSignatures(plugin, contract) {
    const errors = [];
    const warnings = [];

    if (!contract.methods || !Array.isArray(contract.methods)) {
      return { valid: true, errors: [], warnings: [] };
    }

    for (const methodSpec of contract.methods) {
      const methodName = methodSpec.name;

      if (!(methodName in plugin)) {
        continue; // Already caught by validateRequiredMethods
      }

      const method = plugin[methodName];
      if (typeof method !== 'function') {
        continue; // Already caught by validateRequiredMethods
      }

      // Check parameter count
      const expectedParams = methodSpec.parameters || [];
      const methodLength = method.length;

      // JavaScript functions can accept more parameters than defined,
      // but we check if they accept at least the required ones
      if (methodLength < expectedParams.length) {
        warnings.push(
          `Method "${methodName}" expects ${expectedParams.length} parameters ` +
            `but function signature shows ${methodLength}`,
        );
      }

      // Extract parameter names from function signature
      const paramNames = this._extractParameterNames(method);

      // Check if parameter names match (case-insensitive suggestion)
      for (let i = 0; i < expectedParams.length && i < paramNames.length; i++) {
        if (paramNames[i] !== expectedParams[i]) {
          warnings.push(
            `Method "${methodName}" parameter ${i + 1} is named "${paramNames[i]}" ` +
              `but contract suggests "${expectedParams[i]}"`,
          );
        }
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }

  /**
   * Extract parameter names from a function
   *
   * Uses Function.toString() to parse parameter names. This is a best-effort
   * approach and may not work for all function types (arrow functions, etc.).
   *
   * @private
   * @param {Function} func - Function to extract parameters from
   * @returns {string[]} Array of parameter names
   *
   * @since 2.2.4
   */
  _extractParameterNames(func) {
    try {
      const funcStr = func.toString();

      // Match function parameters
      let match = funcStr.match(/\(([^)]*)\)/);
      if (!match) return [];

      const params = match[1]
        .split(',')
        .map((p) => p.trim())
        .filter((p) => p && p !== '');

      // Extract just the parameter name (before '=' for defaults)
      return params.map((p) => p.split('=')[0].trim());
    } catch (error) {
      return [];
    }
  }

  /**
   * Validate complete plugin implementation against contract
   *
   * Runs all validation checks:
   * - Metadata validation
   * - Required methods validation
   * - Method signature validation
   *
   * Returns comprehensive validation result with all errors and warnings.
   *
   * @param {Object} plugin - Plugin instance to validate
   * @param {Object} contract - Contract specification
   * @returns {Object} Validation result
   * @returns {boolean} result.valid - Overall validation status
   * @returns {string[]} result.errors - Critical errors
   * @returns {string[]} result.warnings - Non-critical warnings
   * @returns {Object} result.details - Detailed validation results
   *
   * @example
   * const result = validator.validatePlugin(myPlugin, contract);
   * if (!result.valid) {
   *   console.error('Validation failed:');
   *   result.errors.forEach(err => console.error(`  - ${err}`));
   * }
   * if (result.warnings.length) {
   *   console.warn('Warnings:');
   *   result.warnings.forEach(warn => console.warn(`  - ${warn}`));
   * }
   *
   * @since 2.2.4
   */
  validatePlugin(plugin, contract) {
    const metadataResult = this.validateMetadata(plugin, contract);
    const methodsResult = this.validateRequiredMethods(plugin, contract);
    const signaturesResult = this.validateMethodSignatures(plugin, contract);

    const errors = [
      ...metadataResult.errors,
      ...methodsResult.errors,
      ...signaturesResult.errors,
    ];

    const warnings = [...(signaturesResult.warnings || [])];

    return {
      valid: errors.length === 0,
      errors,
      warnings,
      details: {
        metadata: metadataResult,
        requiredMethods: methodsResult,
        signatures: signaturesResult,
      },
    };
  }

  /**
   * Format validation result for console output
   *
   * Creates a human-readable report of validation results.
   *
   * @param {Object} result - Validation result from validatePlugin
   * @param {string} pluginName - Name of plugin being validated
   * @returns {string} Formatted validation report
   *
   * @example
   * const result = validator.validatePlugin(plugin, contract);
   * const report = validator.formatValidationReport(result, 'MyPlugin');
   * console.log(report);
   *
   * @since 2.2.4
   */
  formatValidationReport(result, pluginName = 'Plugin') {
    const lines = [];

    lines.push(`Validation Report for: ${pluginName}`);
    lines.push('='.repeat(50));
    lines.push(`Status: ${result.valid ? '✓ PASS' : '✗ FAIL'}`);
    lines.push('');

    if (result.errors.length > 0) {
      lines.push('Errors:');
      result.errors.forEach((err) => lines.push(`  ✗ ${err}`));
      lines.push('');
    }

    if (result.warnings.length > 0) {
      lines.push('Warnings:');
      result.warnings.forEach((warn) => lines.push(`  ⚠ ${warn}`));
      lines.push('');
    }

    if (result.valid && result.warnings.length === 0) {
      lines.push('All validation checks passed!');
    }

    return lines.join('\n');
  }

  /**
   * Validate multiple plugins against their contracts
   *
   * Batch validation of multiple plugins, useful for testing entire
   * plugin ecosystems.
   *
   * @param {Object[]} plugins - Array of plugin instances
   * @param {Object} contracts - Map of contract types to contracts
   * @returns {Object[]} Array of validation results
   *
   * @example
   * const plugins = [loaderPlugin, embedderPlugin, retrieverPlugin];
   * const contracts = validator.loadAllContracts();
   * const results = validator.validatePlugins(plugins, contracts);
   * const failedPlugins = results.filter(r => !r.valid);
   *
   * @since 2.2.4
   */
  validatePlugins(plugins, contracts) {
    return plugins.map((plugin) => {
      const contract = contracts[plugin.type];
      if (!contract) {
        return {
          plugin: plugin.name || 'Unknown',
          valid: false,
          errors: [`No contract found for plugin type: ${plugin.type}`],
          warnings: [],
        };
      }

      const result = this.validatePlugin(plugin, contract);
      return {
        plugin: plugin.name || 'Unknown',
        type: plugin.type,
        ...result,
      };
    });
  }
}

module.exports = ContractValidator;

// Default export for convenience
module.exports.default = ContractValidator;
