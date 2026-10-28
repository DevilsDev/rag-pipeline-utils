/**
 * @fileoverview Plugin Signature Verifier
 * Verifies Ed25519 digital signatures for plugin manifests to ensure authenticity
 * Enforces fail-closed verification for production security
 *
 * What is signed: the canonical JSON of the manifest (keys sorted
 * recursively, without `signature`, `signerId` and `signedAt`). To bind the
 * plugin's code to the signature, put a `contentDigest` in the manifest
 * before signing (see computeContentDigest). Because `contentDigest` is part
 * of the signed manifest, changing any covered file invalidates it.
 *
 * Defaults (2.5.0):
 * - The trust store starts EMPTY. Nothing verifies until a signer is added
 *   with addTrustedSigner() or a trustedKeysPath file.
 * - If a manifest declares `contentDigest`, the plugin content (files or
 *   contents) MUST be supplied to verifyPluginSignature() and must match;
 *   otherwise verification fails.
 * - A manifest without `contentDigest` still verifies (manifest-only
 *   signatures keep working); pass `requireContentDigest: true` to reject
 *   manifests that do not bind the code.
 *
 * @author DevilsDev Team
 * @since 2.1.8
 */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { logger } = require('../utils/logger');

const DIGEST_PREFIX = 'sha256-';
const HEX_KEY_RE = /^[0-9a-fA-F]{64}$/;
const INVALID_KEY_MESSAGE =
  'Public key must be 64 hex characters (32 bytes), or a PEM/DER-encoded Ed25519 public key';

/**
 * Convert supported public key encodings to an Ed25519 KeyObject.
 *
 * Accepted: a KeyObject; a 64-character hex string or 32-byte Buffer (raw
 * key); a PEM string ("-----BEGIN PUBLIC KEY-----"); a DER (SPKI) Buffer or
 * base64 string.
 *
 * @param {crypto.KeyObject|Buffer|string} publicKey
 * @returns {crypto.KeyObject}
 */
function toEd25519PublicKey(publicKey) {
  let keyObject;
  try {
    if (publicKey instanceof crypto.KeyObject) {
      keyObject =
        publicKey.type === 'private'
          ? crypto.createPublicKey(publicKey)
          : publicKey;
    } else if (Buffer.isBuffer(publicKey) && publicKey.length === 32) {
      keyObject = rawToKeyObject(publicKey);
    } else if (Buffer.isBuffer(publicKey)) {
      keyObject = crypto.createPublicKey({
        key: publicKey,
        format: 'der',
        type: 'spki',
      });
    } else if (typeof publicKey === 'string' && HEX_KEY_RE.test(publicKey)) {
      keyObject = rawToKeyObject(Buffer.from(publicKey, 'hex'));
    } else if (
      typeof publicKey === 'string' &&
      publicKey.includes('-----BEGIN')
    ) {
      keyObject = crypto.createPublicKey({ key: publicKey, format: 'pem' });
    } else if (typeof publicKey === 'string' && publicKey.length > 0) {
      keyObject = crypto.createPublicKey({
        key: Buffer.from(publicKey, 'base64'),
        format: 'der',
        type: 'spki',
      });
    }
  } catch {
    keyObject = undefined;
  }

  if (
    !keyObject ||
    keyObject.type !== 'public' ||
    keyObject.asymmetricKeyType !== 'ed25519'
  ) {
    throw new Error(INVALID_KEY_MESSAGE);
  }
  return keyObject;
}

function rawToKeyObject(raw) {
  return crypto.createPublicKey({
    key: { kty: 'OKP', crv: 'Ed25519', x: raw.toString('base64url') },
    format: 'jwk',
  });
}

/**
 * Compute the content digest of a plugin.
 *
 * The digest is `sha256-<hex>` of the lines `<relativePath>\0<sha256 of
 * file>\n`, sorted by relative path. Paths are relative to `baseDir` and use
 * forward slashes, so the digest is identical on Windows and POSIX.
 *
 * @param {Object} options
 * @param {string[]} [options.files] - File paths (absolute or relative to baseDir)
 * @param {string} [options.baseDir] - Plugin root; files must be inside it
 * @param {Object<string, Buffer|string>} [options.contents] - In-memory
 *   files keyed by relative path (alternative or addition to `files`)
 * @returns {string} `sha256-<hex>`
 */
function computeContentDigest({ files = [], baseDir, contents = {} } = {}) {
  const root = path.resolve(baseDir || process.cwd());
  const entries = new Map();

  for (const file of files) {
    const abs = path.resolve(root, file);
    const rel = path.relative(root, abs);
    if (
      !rel ||
      rel === '..' ||
      rel.startsWith(`..${path.sep}`) ||
      path.isAbsolute(rel)
    ) {
      throw new Error(`Plugin file is outside the plugin directory: ${file}`);
    }
    entries.set(rel.split(path.sep).join('/'), fs.readFileSync(abs));
  }

  for (const [name, value] of Object.entries(contents)) {
    const rel = path.posix.normalize(String(name).split('\\').join('/'));
    if (
      rel === '..' ||
      rel.startsWith('../') ||
      rel === '.' ||
      path.posix.isAbsolute(rel)
    ) {
      throw new Error(`Plugin content path is not relative: ${name}`);
    }
    entries.set(rel, Buffer.isBuffer(value) ? value : Buffer.from(value));
  }

  if (entries.size === 0) {
    throw new Error('No plugin content supplied for digest');
  }

  const hash = crypto.createHash('sha256');
  for (const rel of [...entries.keys()].sort()) {
    const fileHash = crypto
      .createHash('sha256')
      .update(entries.get(rel))
      .digest('hex');
    hash.update(`${rel}\0${fileHash}\n`, 'utf8');
  }
  return DIGEST_PREFIX + hash.digest('hex');
}

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
    // Opt-in: reject manifests that do not bind the plugin code
    this.requireContentDigest = options.requireContentDigest === true;

    // Load trusted public keys
    this._loadTrustedKeys(options.trustedKeysPath);
  }

  /**
   * Load trusted public keys from configuration.
   * Without a keys file the trust store stays empty (no built-in keys).
   * @param {string} keysPath - Path to trusted keys file
   */
  _loadTrustedKeys(keysPath) {
    if (!keysPath) {
      return;
    }

    try {
      if (fs.existsSync(keysPath)) {
        const keysData = fs.readFileSync(keysPath, 'utf8');
        const trustedKeys = JSON.parse(keysData);

        for (const [keyId, keyInfo] of Object.entries(trustedKeys)) {
          if (keyInfo.publicKey && keyInfo.name) {
            // Reject unusable keys up front instead of at verification time
            toEd25519PublicKey(keyInfo.publicKey);
            this.trustStore.set(keyId, keyInfo);
          }
        }
      }
    } catch (error) {
      if (this.failClosed) {
        throw new Error(`Failed to load trusted keys: ${error.message}`);
      }
      logger.warn(
        `[PLUGIN_SIGNATURE] Failed to load trusted keys: ${error.message}`,
      );
    }
  }

  /**
   * Verify plugin signature
   * @param {object} manifest - Plugin manifest
   * @param {string} signature - Base64 encoded signature
   * @param {string} signerId - Signer identifier
   * @param {object} [content] - Plugin content to check against
   *   manifest.contentDigest: `{ files, baseDir, contents }` (see
   *   computeContentDigest)
   * @returns {Promise<object>} Verification result
   */
  async verifyPluginSignature(manifest, signature, signerId, content = null) {
    const verificationResult = {
      verified: false,
      contentVerified: false,
      signerId,
      timestamp: new Date().toISOString(),
      error: null,
      auditTrail: [],
    };

    try {
      if (!this.enabled) {
        verificationResult.error = 'Signature verification disabled';
        this._auditVerification(verificationResult, manifest);

        if (this.failClosed) {
          throw new Error(
            'Plugin signature verification is disabled in fail-closed mode',
          );
        }
        return verificationResult;
      }

      // Validate inputs
      if (!manifest || typeof manifest !== 'object') {
        throw new Error('Invalid manifest: must be an object');
      }

      if (!signature || typeof signature !== 'string') {
        throw new Error('Invalid signature: must be a non-empty string');
      }

      if (!signerId || typeof signerId !== 'string') {
        throw new Error('Invalid signerId: must be a non-empty string');
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
        'utf8',
      );

      const signatureBuffer = Buffer.from(signature, 'base64');

      const isValid = await this._verifyEd25519Signature(
        manifestData,
        signatureBuffer,
        trustedKey.publicKey,
      );

      if (!isValid) {
        throw new Error('Signature verification failed');
      }

      // The signature covers contentDigest; now check the code matches it.
      verificationResult.contentVerified = this._verifyContentDigest(
        canonicalManifest,
        content,
      );

      verificationResult.verified = true;
      verificationResult.auditTrail.push({
        action: 'signature_verified',
        signerId,
        timestamp: new Date().toISOString(),
        manifestHash: this._hashManifest(canonicalManifest),
        contentVerified: verificationResult.contentVerified,
      });
    } catch (error) {
      verificationResult.verified = false;
      verificationResult.error = error.message;
      verificationResult.auditTrail.push({
        action: 'verification_failed',
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
   * Check the supplied plugin content against the signed contentDigest.
   * @param {object} canonicalManifest - Signed manifest
   * @param {object|null} content - `{ files, baseDir, contents }`
   * @returns {boolean} true when the content digest was checked and matched
   * @private
   */
  _verifyContentDigest(canonicalManifest, content) {
    const declared = canonicalManifest.contentDigest;
    const hasContent =
      content &&
      ((Array.isArray(content.files) && content.files.length > 0) ||
        (content.contents && Object.keys(content.contents).length > 0));

    if (declared === undefined || declared === null) {
      if (this.requireContentDigest) {
        throw new Error(
          'Manifest has no contentDigest; the signature does not cover the plugin code',
        );
      }
      return false;
    }

    if (typeof declared !== 'string' || !declared.startsWith(DIGEST_PREFIX)) {
      throw new Error('Invalid contentDigest: expected "sha256-<hex>"');
    }

    if (!hasContent) {
      throw new Error(
        'Manifest declares a contentDigest but no plugin content was supplied to verify it',
      );
    }

    const actual = Buffer.from(computeContentDigest(content), 'utf8');
    const expected = Buffer.from(declared.toLowerCase(), 'utf8');
    if (
      actual.length !== expected.length ||
      !crypto.timingSafeEqual(actual, expected)
    ) {
      throw new Error(
        'Plugin content digest mismatch: plugin code does not match the signed manifest',
      );
    }
    return true;
  }

  /**
   * Verify Ed25519 signature
   * @param {Buffer} data - Data that was signed
   * @param {Buffer} signature - Signature bytes
   * @param {crypto.KeyObject|Buffer|string} publicKey - Ed25519 public key
   *   (raw hex, PEM, DER or KeyObject)
   * @returns {Promise<boolean>} Verification result
   */
  async _verifyEd25519Signature(data, signature, publicKey) {
    const keyObject = toEd25519PublicKey(publicKey);
    if (!Buffer.isBuffer(signature) || signature.length !== 64) {
      return false;
    }
    // Ed25519 takes no digest algorithm: pass null.
    return crypto.verify(null, data, keyObject, signature);
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
   * Bytes that a signer must sign for a manifest (canonical JSON).
   * @param {object} manifest - Plugin manifest
   * @returns {Buffer}
   */
  getSigningPayload(manifest) {
    return Buffer.from(
      JSON.stringify(this._canonicalizeManifest(manifest)),
      'utf8',
    );
  }

  /**
   * Sort object keys recursively
   * @param {any} obj - Object to sort
   * @returns {any} Object with sorted keys
   */
  _sortObjectKeys(obj) {
    if (obj === null || typeof obj !== 'object') {
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
    return crypto.createHash('sha256').update(manifestData).digest('hex');
  }

  /**
   * Default audit logger
   * @param {object} result - Verification result
   * @param {object} manifest - Plugin manifest
   */
  _defaultAuditLogger(result, manifest) {
    const auditEntry = {
      timestamp: result.timestamp,
      action: 'plugin_signature_verification',
      pluginId: (manifest && manifest.name) || 'unknown',
      pluginVersion: (manifest && manifest.version) || 'unknown',
      signerId: result.signerId,
      verified: result.verified,
      contentVerified: result.contentVerified,
      error: result.error,
      auditTrail: result.auditTrail,
    };

    // In production, this should write to secure audit log
    if (process.env.NODE_ENV === 'production') {
      logger.warn('[AUDIT]', JSON.stringify(auditEntry));
    } else {
      logger.info('[AUDIT]', auditEntry);
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
      logger.error('Audit logging failed:', error.message);
    }
  }

  /**
   * Add trusted signer
   * @param {string} signerId - Signer identifier
   * @param {string|Buffer|crypto.KeyObject} publicKey - Ed25519 public key:
   *   64 hex characters (raw 32 bytes), PEM, DER (SPKI) or a KeyObject
   * @param {string} name - Human-readable name
   * @param {object} metadata - Additional metadata
   */
  addTrustedSigner(signerId, publicKey, name, metadata = {}) {
    if (!signerId || !publicKey || !name) {
      throw new Error('signerId, publicKey, and name are required');
    }

    // Validate the key is a usable Ed25519 public key
    const keyObject = toEd25519PublicKey(publicKey);
    const storedKey =
      typeof publicKey === 'string' && HEX_KEY_RE.test(publicKey)
        ? publicKey.toLowerCase()
        : keyObject.export({ format: 'pem', type: 'spki' });

    this.trustStore.set(signerId, {
      publicKey: storedKey,
      name,
      verified: metadata.verified || false,
      addedAt: new Date().toISOString(),
      ...metadata,
    });

    this.auditLogger(
      {
        timestamp: new Date().toISOString(),
        action: 'trusted_signer_added',
        signerId,
        name,
        verified: true,
        auditTrail: [
          {
            action: 'signer_added',
            signerId,
            timestamp: new Date().toISOString(),
          },
        ],
      },
      { name: 'trust_store_update' },
    );
  }

  /**
   * Remove trusted signer
   * @param {string} signerId - Signer identifier
   */
  removeTrustedSigner(signerId) {
    if (!signerId) {
      throw new Error('signerId is required');
    }

    const removed = this.trustStore.delete(signerId);

    if (removed) {
      this.auditLogger(
        {
          timestamp: new Date().toISOString(),
          action: 'trusted_signer_removed',
          signerId,
          verified: true,
          auditTrail: [
            {
              action: 'signer_removed',
              signerId,
              timestamp: new Date().toISOString(),
            },
          ],
        },
        { name: 'trust_store_update' },
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
  computeContentDigest,
  toEd25519PublicKey,
};
