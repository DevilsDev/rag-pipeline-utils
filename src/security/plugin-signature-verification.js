/**
 * @fileoverview Plugin signature verification for enhanced security
 * Ensures all plugins are cryptographically signed and verified before execution
 */

const crypto = require('crypto');
const fs = require('fs').promises;
const path = require('path');
const { logger } = require('../utils/logger');

/**
 * Plugin signature verification system
 * Implements Ed25519 signature verification for plugin integrity
 */
class PluginSignatureVerifier {
  constructor(options = {}) {
    this.options = {
      // Trusted public keys for signature verification
      trustedKeys: options.trustedKeys || [],
      // Require signatures by default
      requireSignatures: options.requireSignatures !== false,
      // Fail closed on verification errors
      failOnError: options.failOnError !== false,
      // Maximum manifest size (1MB)
      maxManifestSize: options.maxManifestSize || 1024 * 1024,
      ...options,
    };

    // Initialize audit log
    this.auditLog = [];
  }

  /**
   * Verify plugin signature
   * @param {string} pluginPath - Path to plugin directory
   * @param {object} manifest - Plugin manifest
   * @returns {Promise<boolean>} Verification result
   */
  async verifyPlugin(pluginPath, manifest) {
    const startTime = Date.now();

    try {
      // Validate manifest structure
      this._validateManifest(manifest);

      // Check if signature is required
      if (this.options.requireSignatures && !manifest.signature) {
        this._auditFailure(
          manifest.id,
          'missing_signature',
          'Plugin signature required but not found',
        );
        throw new Error(
          `Plugin ${manifest.id} requires signature but none provided`,
        );
      }

      // Skip verification if signatures not required and not present
      if (!this.options.requireSignatures && !manifest.signature) {
        this._auditSuccess(
          manifest.id,
          'no_signature_required',
          'Plugin loaded without signature verification',
        );
        return true;
      }

      // Verify signature if present
      if (manifest.signature) {
        const verified = await this._verifySignature(pluginPath, manifest);

        if (verified) {
          this._auditSuccess(
            manifest.id,
            'signature_verified',
            `Plugin signature verified with key: ${manifest.signature.keyId}`,
          );
          return true;
        } else {
          this._auditFailure(
            manifest.id,
            'signature_invalid',
            'Plugin signature verification failed',
          );
          if (this.options.failOnError) {
            throw new Error(
              `Plugin ${manifest.id} signature verification failed`,
            );
          }
          return false;
        }
      }

      return true;
    } catch (error) {
      const duration = Date.now() - startTime;
      this._auditFailure(
        manifest.id || 'unknown',
        'verification_error',
        error.message,
        { duration },
      );

      if (this.options.failOnError) {
        throw error;
      }

      logger.error('Plugin verification failed', {
        pluginId: manifest.id,
        error: error.message,
        duration,
      });

      return false;
    }
  }

  /**
   * Verify plugin signature using Ed25519
   * @param {string} pluginPath - Path to plugin directory
   * @param {object} manifest - Plugin manifest
   * @returns {Promise<boolean>} Verification result
   */
  async _verifySignature(pluginPath, manifest) {
    const { signature } = manifest;

    // Validate signature structure
    if (!signature.keyId || !signature.signature || !signature.algorithm) {
      throw new Error('Invalid signature format');
    }

    // Only support Ed25519 for security
    if (signature.algorithm !== 'Ed25519') {
      throw new Error(
        `Unsupported signature algorithm: ${signature.algorithm}`,
      );
    }

    // Find trusted public key
    const publicKey = this._getTrustedKey(signature.keyId);
    if (!publicKey) {
      throw new Error(`Unknown or untrusted key ID: ${signature.keyId}`);
    }

    // Calculate manifest hash for verification
    const manifestHash = await this._calculateManifestHash(
      pluginPath,
      manifest,
    );

    try {
      // Verify signature using crypto.verify
      const verify = crypto.createVerify('sha256');
      verify.update(manifestHash);
      verify.end();

      const publicKeyObject = crypto.createPublicKey({
        key: Buffer.from(publicKey, 'hex'),
        format: 'der',
        type: 'spki',
      });

      const isValid = verify.verify(
        publicKeyObject,
        signature.signature,
        'hex',
      );

      logger.info('Plugin signature verification completed', {
        pluginId: manifest.id,
        keyId: signature.keyId,
        valid: isValid,
      });

      return isValid;
    } catch (error) {
      logger.error('Signature verification failed', {
        pluginId: manifest.id,
        keyId: signature.keyId,
        error: error.message,
      });
      return false;
    }
  }

  /**
   * Calculate manifest hash for verification
   * @param {string} pluginPath - Path to plugin directory
   * @param {object} manifest - Plugin manifest
   * @returns {Promise<string>} Manifest hash
   */
  async _calculateManifestHash(pluginPath, manifest) {
    // Create a copy without the signature for hashing
    const manifestForHashing = { ...manifest };
    delete manifestForHashing.signature;

    // Include file hashes in the manifest hash
    const files = manifest.files || [];
    const fileHashes = [];

    for (const filePath of files) {
      const fullPath = path.join(pluginPath, filePath);
      try {
        const fileContent = await fs.readFile(fullPath);
        const fileHash = crypto
          .createHash('sha256')
          .update(fileContent)
          .digest('hex');
        fileHashes.push({ path: filePath, hash: fileHash });
      } catch (error) {
        throw new Error(`Failed to read plugin file: ${filePath}`);
      }
    }

    // Include file hashes in manifest for integrity verification
    manifestForHashing.fileHashes = fileHashes;

    // Create deterministic hash of the manifest
    const manifestString = JSON.stringify(
      manifestForHashing,
      Object.keys(manifestForHashing).sort(),
    );
    return crypto.createHash('sha256').update(manifestString).digest('hex');
  }

  /**
   * Validate manifest structure
   * @param {object} manifest - Plugin manifest to validate
   */
  _validateManifest(manifest) {
    if (!manifest || typeof manifest !== 'object') {
      throw new Error('Invalid manifest: must be an object');
    }

    const requiredFields = ['id', 'version', 'name', 'type'];
    for (const field of requiredFields) {
      if (!manifest[field]) {
        throw new Error(`Invalid manifest: missing required field '${field}'`);
      }
    }

    // Validate plugin ID format (alphanumeric with hyphens)
    if (!/^[a-z0-9-]+$/.test(manifest.id)) {
      throw new Error(
        'Invalid manifest: plugin ID must be lowercase alphanumeric with hyphens',
      );
    }

    // Validate version format (semver)
    if (!/^\d+\.\d+\.\d+/.test(manifest.version)) {
      throw new Error(
        'Invalid manifest: version must follow semantic versioning',
      );
    }

    // Validate signature structure if present
    if (manifest.signature) {
      const { keyId, signature, algorithm } = manifest.signature;

      if (!keyId || typeof keyId !== 'string') {
        throw new Error('Invalid manifest: signature.keyId must be a string');
      }

      if (!signature || typeof signature !== 'string') {
        throw new Error(
          'Invalid manifest: signature.signature must be a string',
        );
      }

      if (!algorithm || typeof algorithm !== 'string') {
        throw new Error(
          'Invalid manifest: signature.algorithm must be a string',
        );
      }

      // Validate hex format for signature
      if (!/^[a-fA-F0-9]+$/.test(signature)) {
        throw new Error('Invalid manifest: signature must be in hex format');
      }
    }
  }

  /**
   * Get trusted public key by ID
   * @param {string} keyId - Key identifier
   * @returns {string|null} Public key in hex format
   */
  _getTrustedKey(keyId) {
    const key = this.options.trustedKeys.find((k) => k.id === keyId);
    return key ? key.publicKey : null;
  }

  /**
   * Add trusted public key
   * @param {string} keyId - Key identifier
   * @param {string} publicKey - Public key in hex format
   */
  addTrustedKey(keyId, publicKey) {
    // Validate key ID format
    if (!/^[a-zA-Z0-9-_]+$/.test(keyId)) {
      throw new Error(
        'Invalid key ID: must be alphanumeric with hyphens/underscores',
      );
    }

    // Validate public key format
    if (!/^[a-fA-F0-9]+$/.test(publicKey)) {
      throw new Error('Invalid public key: must be in hex format');
    }

    // Remove existing key with same ID
    this.options.trustedKeys = this.options.trustedKeys.filter(
      (k) => k.id !== keyId,
    );

    // Add new key
    this.options.trustedKeys.push({ id: keyId, publicKey });

    logger.info('Trusted public key added', { keyId });
  }

  /**
   * Remove trusted public key
   * @param {string} keyId - Key identifier
   */
  removeTrustedKey(keyId) {
    const initialLength = this.options.trustedKeys.length;
    this.options.trustedKeys = this.options.trustedKeys.filter(
      (k) => k.id !== keyId,
    );

    if (this.options.trustedKeys.length < initialLength) {
      logger.info('Trusted public key removed', { keyId });
    }
  }

  /**
   * Record audit success
   */
  _auditSuccess(pluginId, action, message, metadata = {}) {
    const entry = {
      timestamp: new Date().toISOString(),
      pluginId,
      action,
      result: 'success',
      message,
      metadata,
      level: 'info',
    };

    this.auditLog.push(entry);
    logger.audit(`Plugin signature verification: ${message}`, {
      pluginId,
      action,
      result: 'success',
      ...metadata,
    });
  }

  /**
   * Record audit failure
   */
  _auditFailure(pluginId, action, message, metadata = {}) {
    const entry = {
      timestamp: new Date().toISOString(),
      pluginId,
      action,
      result: 'failure',
      message,
      metadata,
      level: 'error',
    };

    this.auditLog.push(entry);
    logger.audit(`Plugin signature verification: ${message}`, {
      pluginId,
      action,
      result: 'failure',
      severity: 'high',
      ...metadata,
    });
  }

  /**
   * Get audit logs
   * @param {object} options - Filter options
   * @returns {Array} Filtered audit logs
   */
  getAuditLogs(options = {}) {
    let logs = [...this.auditLog];

    if (options.pluginId) {
      logs = logs.filter((log) => log.pluginId === options.pluginId);
    }

    if (options.level) {
      logs = logs.filter((log) => log.level === options.level);
    }

    if (options.limit) {
      logs = logs.slice(-options.limit);
    }

    return logs;
  }

  /**
   * Clear audit logs
   */
  clearAuditLogs() {
    this.auditLog = [];
    logger.info('Plugin signature verification audit logs cleared');
  }
}

/**
 * Create signature verifier with default trusted keys
 * @param {object} options - Configuration options
 * @returns {PluginSignatureVerifier} Verifier instance
 */
function createSignatureVerifier(options = {}) {
  return new PluginSignatureVerifier(options);
}

module.exports = {
  PluginSignatureVerifier,
  createSignatureVerifier,
};

// CommonJS/ESM interop
module.exports.default = module.exports;
