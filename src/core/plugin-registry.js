'use strict';

const fs = require('fs');
const path = require('path');
const {
  createPluginVerifier,
} = require('../security/plugin-signature-verifier.js');

class PluginRegistry {
  constructor(options = {}) {
    this._plugins = new Map();
    this._validTypes = new Set([
      'loader',
      'embedder',
      'retriever',
      'reranker',
      'llm',
      'evaluator',
    ]);
    this._contracts = new Map();
    this._signatureVerifier = createPluginVerifier({
      enabled: options.verifySignatures !== false,
      failClosed: options.failClosed !== false,
      trustedKeysPath: options.trustedKeysPath,
    });
    this._loadContracts();
  }

  _loadContracts() {
    const contractsDir = path.join(__dirname, '../../contracts');

    try {
      const contractFiles = {
        loader: 'loader-contract.json',
        embedder: 'embedder-contract.json',
        retriever: 'retriever-contract.json',
        llm: 'llm-contract.json',
      };

      for (const [type, filename] of Object.entries(contractFiles)) {
        try {
          const contractPath = path.join(contractsDir, filename);
          if (fs.existsSync(contractPath)) {
            const contractContent = fs.readFileSync(contractPath, 'utf8');
            const contract = JSON.parse(contractContent);
            this._contracts.set(type, contract);
          }
        } catch (error) {
          // Contract loading is optional - don't fail if missing
        }
      }
    } catch (error) {
      // Contracts directory may not exist in all environments
    }
  }

  _validatePluginContract(category, impl) {
    const contract = this._contracts.get(category);
    if (!contract) {
      return; // No contract to validate against
    }

    // Check if plugin has metadata
    if (!impl.metadata) {
      throw new Error('Plugin missing metadata property');
    }

    if (!impl.metadata.name || typeof impl.metadata.name !== 'string') {
      throw new Error('Plugin metadata must have a name property');
    }

    if (!impl.metadata.version || typeof impl.metadata.version !== 'string') {
      throw new Error('Plugin metadata must have a version property');
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

      if (typeof impl[methodName] !== 'function') {
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
        if (methodSpec.type === 'function') {
          methods.push(methodName);
        }
      }
    }

    return methods;
  }

  async register(category, name, impl, manifest = null) {
    if (!category || typeof category !== 'string') {
      throw new Error('Category must be a non-empty string');
    }
    if (!name || typeof name !== 'string') {
      throw new Error('Name must be a non-empty string');
    }
    if (impl == null) {
      throw new Error('Implementation cannot be null or undefined');
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
      this._emitAuditEntry('plugin_verified', {
        pluginName,
        signerId: manifest.signerId,
        version: manifest.version,
        verified: true,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      // Emit audit entry for failed verification
      this._emitAuditEntry('plugin_verification_failed', {
        pluginName,
        signerId: manifest.signerId || 'unknown',
        version: manifest.version || 'unknown',
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
      component: 'plugin_registry',
      ...details,
    };

    // In production, this should go to a secure audit log
    if (process.env.NODE_ENV === 'production') {
      console.warn('[AUDIT]', JSON.stringify(auditEntry)); // eslint-disable-line no-console
    } else {
      console.log('[AUDIT]', auditEntry); // eslint-disable-line no-console
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
  verifySignatures: process.env.NODE_ENV === 'production',
  failClosed: process.env.NODE_ENV === 'production',
});

// CJS+ESM interop pattern
module.exports = registry;
module.exports.PluginRegistry = PluginRegistry;
module.exports.default = module.exports;
