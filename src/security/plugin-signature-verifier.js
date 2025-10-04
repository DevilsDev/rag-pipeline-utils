/**
 * @fileoverview Plugin Signature Verifier
 * Verifies Ed25519 digital signatures for plugin manifests to ensure authenticity
 * Enforces fail-closed verification for production security
 *
 * @author DevilsDev Team
 * @since 2.1.8
 */

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

/**
 * Plugin signature verification with Ed25519
 */
class PluginSignatureVerifier {
  constructor(options = {}) {
    this.enabled = options.enabled !== false;
    this.trustStore = options.trustStore || new Map();
    this.auditLogger =
      options.auditLogger || this._defaultAuditLogger.bind(this);
    this.failClosed = options.failClosed !== false; // Default to fail-closed

    // Load trusted public keys
    this._loadTrustedKeys(options.trustedKeysPath);
  }

  /**
   * Load trusted public keys from configuration
   * @param {string} keysPath - Path to trusted keys file
   */
  _loadTrustedKeys(keysPath) {
    if (!keysPath) {
      // Default trusted keys for the DevilsDev organization
      this.trustStore.set("devilsdev-official", {
        publicKey: "your-ed25519-public-key-here",
        name: "DevilsDev Official Plugins",
        verified: true,
      });
      return;
    }

    try {
      if (fs.existsSync(keysPath)) {
        const keysData = fs.readFileSync(keysPath, "utf8");
        const trustedKeys = JSON.parse(keysData);

        for (const [keyId, keyInfo] of Object.entries(trustedKeys)) {
          if (keyInfo.publicKey && keyInfo.name) {
            this.trustStore.set(keyId, keyInfo);
          }
        }
      }
    } catch (error) {
      if (this.failClosed) {
        throw new Error(`Failed to load trusted keys: ${error.message}`);
      }
    }
  }

  /**
   * Verify plugin signature
   * @param {object} manifest - Plugin manifest
   * @param {string} signature - Base64 encoded signature
   * @param {string} signerId - Signer identifier
   * @returns {Promise<object>} Verification result
   */
  async verifyPluginSignature(manifest, signature, signerId) {
    const verificationResult = {
      verified: false,
      signerId,
      timestamp: new Date().toISOString(),
      error: null,
      auditTrail: [],
    };

    try {
      if (!this.enabled) {
        verificationResult.error = "Signature verification disabled";
        this._auditVerification(verificationResult, manifest);

        if (this.failClosed) {
          throw new Error(
            "Plugin signature verification is disabled in fail-closed mode",
          );
        }
        return verificationResult;
      }

      // Validate inputs
      if (!manifest || typeof manifest !== "object") {
        throw new Error("Invalid manifest: must be an object");
      }

      if (!signature || typeof signature !== "string") {
        throw new Error("Invalid signature: must be a non-empty string");
      }

      if (!signerId || typeof signerId !== "string") {
        throw new Error("Invalid signerId: must be a non-empty string");
      }

      // Check if signer is trusted
      const trustedKey = this.trustStore.get(signerId);
      if (!trustedKey) {
        throw new Error(`Untrusted signer: ${signerId}`);
      }

      // Canonicalize manifest for verification
      const canonicalManifest = this._canonicalizeManifest(manifest);
      const manifestData = Buffer.from(
        JSON.stringify(canonicalManifest),
        "utf8",
      );

      // Decode signature
      let signatureBuffer;
      try {
        signatureBuffer = Buffer.from(signature, "base64");
      } catch (error) {
        throw new Error(`Invalid signature encoding: ${error.message}`);
      }

      // Verify signature using Web Crypto API or Node.js crypto
      const isValid = await this._verifyEd25519Signature(
        manifestData,
        signatureBuffer,
        trustedKey.publicKey,
      );

      if (!isValid) {
        throw new Error("Signature verification failed");
      }

      verificationResult.verified = true;
      verificationResult.auditTrail.push({
        action: "signature_verified",
        signerId,
        timestamp: new Date().toISOString(),
        manifestHash: this._hashManifest(canonicalManifest),
      });
    } catch (error) {
      verificationResult.error = error.message;
      verificationResult.auditTrail.push({
        action: "verification_failed",
        signerId,
        timestamp: new Date().toISOString(),
        error: error.message,
      });

      if (this.failClosed) {
        this._auditVerification(verificationResult, manifest);
        throw new Error(
          `Plugin signature verification failed: ${error.message}`,
        );
      }
    }

    this._auditVerification(verificationResult, manifest);
    return verificationResult;
  }

  /**
   * Verify Ed25519 signature
   * @param {Buffer} data - Data that was signed
   * @param {Buffer} signature - Signature bytes
   * @param {string} publicKeyHex - Public key in hex format
   * @returns {Promise<boolean>} Verification result
   */
  async _verifyEd25519Signature(data, signature, publicKeyHex) {
    try {
      // Convert hex public key to buffer
      const publicKeyBuffer = Buffer.from(publicKeyHex, "hex");

      // Use Node.js crypto for Ed25519 verification
      const verify = crypto.createVerify("Ed25519");
      verify.update(data);

      // Create public key object
      const publicKeyObject = crypto.createPublicKey({
        key: publicKeyBuffer,
        format: "der",
        type: "spki",
      });

      return verify.verify(publicKeyObject, signature);
    } catch (error) {
      // Fallback to Web Crypto API if available
      if (typeof crypto.subtle !== "undefined") {
        try {
          const publicKeyBuffer = Buffer.from(publicKeyHex, "hex");
          const publicKey = await crypto.subtle.importKey(
            "raw",
            publicKeyBuffer,
            {
              name: "Ed25519",
              namedCurve: "Ed25519",
            },
            false,
            ["verify"],
          );

          return await crypto.subtle.verify(
            "Ed25519",
            publicKey,
            signature,
            data,
          );
        } catch (webCryptoError) {
          throw new Error(`Ed25519 verification failed: ${error.message}`);
        }
      }

      throw new Error(`Ed25519 verification failed: ${error.message}`);
    }
  }

  /**
   * Canonicalize manifest for consistent signing
   * @param {object} manifest - Plugin manifest
   * @returns {object} Canonicalized manifest
   */
  _canonicalizeManifest(manifest) {
    // Remove signature-related fields and sort keys
    const canonical = JSON.parse(JSON.stringify(manifest));
    delete canonical.signature;
    delete canonical.signerId;
    delete canonical.signedAt;

    // Sort object keys recursively for deterministic serialization
    return this._sortObjectKeys(canonical);
  }

  /**
   * Sort object keys recursively
   * @param {any} obj - Object to sort
   * @returns {any} Object with sorted keys
   */
  _sortObjectKeys(obj) {
    if (obj === null || typeof obj !== "object") {
      return obj;
    }

    if (Array.isArray(obj)) {
      return obj.map((item) => this._sortObjectKeys(item));
    }

    const sorted = {};
    const keys = Object.keys(obj).sort();

    for (const key of keys) {
      sorted[key] = this._sortObjectKeys(obj[key]);
    }

    return sorted;
  }

  /**
   * Hash manifest for audit trail
   * @param {object} manifest - Canonicalized manifest
   * @returns {string} SHA-256 hash
   */
  _hashManifest(manifest) {
    const manifestData = JSON.stringify(manifest);
    return crypto.createHash("sha256").update(manifestData).digest("hex");
  }

  /**
   * Default audit logger
   * @param {object} result - Verification result
   * @param {object} manifest - Plugin manifest
   */
  _defaultAuditLogger(result, manifest) {
    const auditEntry = {
      timestamp: result.timestamp,
      action: "plugin_signature_verification",
      pluginId: manifest.name || "unknown",
      pluginVersion: manifest.version || "unknown",
      signerId: result.signerId,
      verified: result.verified,
      error: result.error,
      auditTrail: result.auditTrail,
    };

    // In production, this should write to secure audit log
    if (process.env.NODE_ENV === "production") {
      console.warn("[AUDIT]", JSON.stringify(auditEntry));
    } else {
      console.log("[AUDIT]", auditEntry);
    }
  }

  /**
   * Audit verification attempt
   * @param {object} result - Verification result
   * @param {object} manifest - Plugin manifest
   */
  _auditVerification(result, manifest) {
    try {
      this.auditLogger(result, manifest);
    } catch (error) {
      // Audit logging failure should not break verification
      console.error("Audit logging failed:", error.message);
    }
  }

  /**
   * Add trusted signer
   * @param {string} signerId - Signer identifier
   * @param {string} publicKey - Ed25519 public key in hex
   * @param {string} name - Human-readable name
   * @param {object} metadata - Additional metadata
   */
  addTrustedSigner(signerId, publicKey, name, metadata = {}) {
    if (!signerId || !publicKey || !name) {
      throw new Error("signerId, publicKey, and name are required");
    }

    // Validate public key format
    if (!/^[0-9a-fA-F]{64}$/.test(publicKey)) {
      throw new Error("Public key must be 64 hex characters (32 bytes)");
    }

    this.trustStore.set(signerId, {
      publicKey: publicKey.toLowerCase(),
      name,
      verified: metadata.verified || false,
      addedAt: new Date().toISOString(),
      ...metadata,
    });

    this.auditLogger(
      {
        timestamp: new Date().toISOString(),
        action: "trusted_signer_added",
        signerId,
        name,
        verified: true,
        auditTrail: [
          {
            action: "signer_added",
            signerId,
            timestamp: new Date().toISOString(),
          },
        ],
      },
      { name: "trust_store_update" },
    );
  }

  /**
   * Remove trusted signer
   * @param {string} signerId - Signer identifier
   */
  removeTrustedSigner(signerId) {
    if (!signerId) {
      throw new Error("signerId is required");
    }

    const removed = this.trustStore.delete(signerId);

    if (removed) {
      this.auditLogger(
        {
          timestamp: new Date().toISOString(),
          action: "trusted_signer_removed",
          signerId,
          verified: true,
          auditTrail: [
            {
              action: "signer_removed",
              signerId,
              timestamp: new Date().toISOString(),
            },
          ],
        },
        { name: "trust_store_update" },
      );
    }

    return removed;
  }

  /**
   * List trusted signers
   * @returns {Array} List of trusted signers
   */
  listTrustedSigners() {
    return Array.from(this.trustStore.entries()).map(([signerId, info]) => ({
      signerId,
      name: info.name,
      verified: info.verified,
      addedAt: info.addedAt,
    }));
  }
}

/**
 * Create plugin signature verifier instance
 * @param {object} options - Configuration options
 * @returns {PluginSignatureVerifier} Verifier instance
 */
function createPluginVerifier(options = {}) {
  return new PluginSignatureVerifier(options);
}

module.exports = {
  PluginSignatureVerifier,
  createPluginVerifier,
};

// CommonJS/ESM interop
module.exports.default = module.exports;
