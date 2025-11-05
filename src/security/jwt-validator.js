"use strict";

/**
 * Secure JWT Validator
 *
 * Provides hardened JWT validation with protection against common attacks:
 * - Algorithm confusion attacks (none algorithm, algorithm switching)
 * - Token substitution attacks
 * - Weak signing algorithms
 * - Missing or invalid claims
 * - Replay attacks (with JTI tracking)
 * - Token expiration and timing issues
 *
 * @module security/jwt-validator
 * @since 2.3.0
 */

const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const { EventEmitter } = require("events");

/**
 * Secure JWT signing and validation algorithms
 * Explicitly disallow 'none' algorithm and weak algorithms
 */
const SECURE_ALGORITHMS = {
  // HMAC-based (symmetric)
  HS256: "HS256",
  HS384: "HS384",
  HS512: "HS512",

  // RSA-based (asymmetric) - preferred for production
  RS256: "RS256",
  RS384: "RS384",
  RS512: "RS512",

  // ECDSA-based (asymmetric) - preferred for performance
  ES256: "ES256",
  ES384: "ES384",
  ES512: "ES512",

  // PSS (asymmetric)
  PS256: "PS256",
  PS384: "PS384",
  PS512: "PS512",
};

/**
 * Minimum key sizes for secure JWT signing
 */
const MIN_KEY_SIZES = {
  HS256: 256, // bits
  HS384: 384,
  HS512: 512,
  RS256: 2048,
  RS384: 2048,
  RS512: 2048,
  ES256: 256,
  ES384: 384,
  ES512: 521,
  PS256: 2048,
  PS384: 2048,
  PS512: 2048,
};

/**
 * Required JWT claims for validation
 */
const REQUIRED_CLAIMS = ["iat", "exp", "iss", "aud"];

/**
 * JWT Validator with hardened security
 */
class JWTValidator extends EventEmitter {
  constructor(options = {}) {
    super();

    this.config = {
      // Algorithm configuration
      algorithm: options.algorithm || "HS256",
      allowedAlgorithms: options.allowedAlgorithms || ["HS256"],

      // Secret/Key configuration
      secret: options.secret,
      publicKey: options.publicKey,
      privateKey: options.privateKey,

      // Issuer and audience validation
      issuer: options.issuer || "rag-pipeline-utils",
      audience: options.audience || "rag-pipeline-api",

      // Timing configuration
      clockTolerance: options.clockTolerance || 30, // seconds
      maxTokenAge: options.maxTokenAge || 3600, // 1 hour in seconds
      notBeforeTolerance: options.notBeforeTolerance || 30, // seconds

      // Security options
      requireJti: options.requireJti !== false, // Require JWT ID by default
      requireSub: options.requireSub !== false, // Require subject by default
      allowNoneAlgorithm: false, // Never allow 'none' algorithm
      strictValidation: options.strictValidation !== false, // Strict by default

      // JTI tracking for replay protection
      enableJtiTracking: options.enableJtiTracking !== false,
      jtiExpirationMs: options.jtiExpirationMs || 7 * 24 * 60 * 60 * 1000, // 7 days

      // Additional validation
      validateClaims: options.validateClaims || {},

      // Audit logging
      enableAuditLog: options.enableAuditLog !== false,
    };

    // Validate configuration
    this._validateConfig();

    // Initialize JTI tracking
    if (this.config.enableJtiTracking) {
      this.usedJtis = new Map(); // jti -> expiration timestamp
      this._startJtiCleanup();
    }

    // Statistics
    this.stats = {
      tokensGenerated: 0,
      tokensValidated: 0,
      validationFailures: 0,
      algorithmMismatch: 0,
      expiredTokens: 0,
      invalidSignature: 0,
      replayAttempts: 0,
    };
  }

  /**
   * Validate configuration on initialization
   * @private
   */
  _validateConfig() {
    const { algorithm, allowedAlgorithms, secret, publicKey, privateKey } =
      this.config;

    // Validate algorithm
    if (!SECURE_ALGORITHMS[algorithm]) {
      throw new Error(
        `Unsupported algorithm: ${algorithm}. Use one of: ${Object.keys(SECURE_ALGORITHMS).join(", ")}`,
      );
    }

    // Validate allowed algorithms
    if (!Array.isArray(allowedAlgorithms) || allowedAlgorithms.length === 0) {
      throw new Error("allowedAlgorithms must be a non-empty array");
    }

    for (const alg of allowedAlgorithms) {
      if (!SECURE_ALGORITHMS[alg]) {
        throw new Error(`Invalid algorithm in allowedAlgorithms: ${alg}`);
      }
      if (alg === "none") {
        throw new Error('Algorithm "none" is not allowed for security reasons');
      }
    }

    // Validate secret/key configuration
    const isSymmetric = algorithm.startsWith("HS");
    const isAsymmetric =
      algorithm.startsWith("RS") ||
      algorithm.startsWith("ES") ||
      algorithm.startsWith("PS");

    if (isSymmetric && !secret) {
      throw new Error(
        "secret is required for HMAC algorithms (HS256, HS384, HS512)",
      );
    }

    if (isAsymmetric) {
      if (!publicKey) {
        throw new Error("publicKey is required for asymmetric algorithms");
      }
      if (!privateKey) {
        console.warn(
          "[JWT_VALIDATOR] Warning: privateKey not provided. Token signing will not be available.",
        );
      }
    }

    // Validate secret strength for HMAC
    if (isSymmetric && secret) {
      const minBits = MIN_KEY_SIZES[algorithm];
      const secretBits = Buffer.byteLength(secret, "utf8") * 8;

      if (secretBits < minBits) {
        throw new Error(
          `Secret is too weak for ${algorithm}. Minimum ${minBits} bits required, got ${secretBits} bits. ` +
            `Use a secret of at least ${Math.ceil(minBits / 8)} bytes.`,
        );
      }
    }

    // Validate issuer and audience
    if (!this.config.issuer) {
      throw new Error("issuer is required");
    }

    if (!this.config.audience) {
      throw new Error("audience is required");
    }
  }

  /**
   * Generate a secure JWT token
   *
   * @param {Object} payload - Token payload
   * @param {Object} options - Additional signing options
   * @returns {string} Signed JWT token
   *
   * @example
   * const token = validator.sign({
   *   sub: 'user-123',
   *   roles: ['admin'],
   *   tenant: 'acme-corp'
   * });
   */
  sign(payload, options = {}) {
    try {
      // Validate payload
      if (!payload || typeof payload !== "object") {
        throw new Error("Payload must be an object");
      }

      // Prevent algorithm override in payload
      if (payload.alg) {
        throw new Error(
          "Algorithm cannot be specified in payload (security risk)",
        );
      }

      // Generate JTI if required
      const jti = this.config.requireJti
        ? options.jti || crypto.randomUUID()
        : options.jti;

      // Build complete payload with required claims
      const now = Math.floor(Date.now() / 1000);
      const expiresIn = options.expiresIn || this.config.maxTokenAge;

      const completePayload = {
        ...payload,
        iss: this.config.issuer,
        aud: this.config.audience,
        iat: now,
        exp: now + expiresIn,
        nbf: options.notBefore || now,
      };

      // Add JTI if required
      if (jti) {
        completePayload.jti = jti;
      }

      // Add subject if required
      if (this.config.requireSub && !completePayload.sub) {
        throw new Error("Subject (sub) claim is required but not provided");
      }

      // Determine signing key
      const signingKey = this.config.algorithm.startsWith("HS")
        ? this.config.secret
        : this.config.privateKey;

      if (!signingKey) {
        throw new Error(
          "No signing key available. Ensure secret or privateKey is configured.",
        );
      }

      // Sign token with explicit algorithm
      const token = jwt.sign(completePayload, signingKey, {
        algorithm: this.config.algorithm,
        // Do not allow algorithm to be overridden
        header: {
          alg: this.config.algorithm,
          typ: "JWT",
        },
      });

      // Track JTI for replay protection
      if (this.config.enableJtiTracking && jti) {
        const expirationTime = Date.now() + expiresIn * 1000;
        this.usedJtis.set(jti, expirationTime);
      }

      // Update statistics
      this.stats.tokensGenerated++;

      // Emit audit event
      if (this.config.enableAuditLog) {
        this.emit("token_generated", {
          jti,
          sub: completePayload.sub,
          iss: completePayload.iss,
          exp: completePayload.exp,
          timestamp: new Date().toISOString(),
        });
      }

      return token;
    } catch (error) {
      this.emit("signing_error", {
        error: error.message,
        timestamp: new Date().toISOString(),
      });
      throw new Error(`JWT signing failed: ${error.message}`);
    }
  }

  /**
   * Verify and decode a JWT token with hardened validation
   *
   * @param {string} token - JWT token to verify
   * @param {Object} options - Verification options
   * @returns {Object} Decoded and validated payload
   *
   * @example
   * try {
   *   const payload = validator.verify(token);
   *   console.log('Valid token for user:', payload.sub);
   * } catch (error) {
   *   console.error('Invalid token:', error.message);
   * }
   */
  verify(token, options = {}) {
    try {
      // Basic validation
      if (!token || typeof token !== "string") {
        throw new Error("Token must be a non-empty string");
      }

      // Prevent header manipulation - decode header first to check algorithm
      const header = this._decodeTokenHeader(token);

      // CRITICAL: Verify algorithm matches expected algorithm
      if (!this.config.allowedAlgorithms.includes(header.alg)) {
        this.stats.algorithmMismatch++;
        this.emit("algorithm_mismatch", {
          expected: this.config.allowedAlgorithms,
          received: header.alg,
          timestamp: new Date().toISOString(),
        });
        throw new Error(
          `Algorithm mismatch: expected one of [${this.config.allowedAlgorithms.join(", ")}], got ${header.alg}`,
        );
      }

      // CRITICAL: Explicitly reject 'none' algorithm
      if (header.alg === "none" || header.alg.toLowerCase() === "none") {
        this.stats.validationFailures++;
        this.emit("none_algorithm_rejected", {
          timestamp: new Date().toISOString(),
        });
        throw new Error('Algorithm "none" is not allowed');
      }

      // Determine verification key
      const verificationKey = header.alg.startsWith("HS")
        ? this.config.secret
        : this.config.publicKey;

      if (!verificationKey) {
        throw new Error("No verification key available");
      }

      // Verify token with strict options
      const verifyOptions = {
        algorithms: this.config.allowedAlgorithms,
        issuer: this.config.issuer,
        audience: this.config.audience,
        clockTolerance: this.config.clockTolerance,
        maxAge: options.maxAge || `${this.config.maxTokenAge}s`,
        // Complete validation checks
        complete: false, // We want payload only after validation
      };

      const payload = jwt.verify(token, verificationKey, verifyOptions);

      // Additional claim validation
      this._validateRequiredClaims(payload);

      // Check for replay attacks using JTI
      if (this.config.enableJtiTracking && payload.jti) {
        if (this.usedJtis.has(payload.jti)) {
          this.stats.replayAttempts++;
          this.emit("replay_detected", {
            jti: payload.jti,
            sub: payload.sub,
            timestamp: new Date().toISOString(),
          });
          throw new Error("Token replay detected: JTI has already been used");
        }

        // Track this JTI
        const expirationTime = payload.exp * 1000;
        this.usedJtis.set(payload.jti, expirationTime);
      }

      // Validate custom claims if specified
      if (
        this.config.validateClaims &&
        Object.keys(this.config.validateClaims).length > 0
      ) {
        this._validateCustomClaims(payload, this.config.validateClaims);
      }

      // Update statistics
      this.stats.tokensValidated++;

      // Emit audit event
      if (this.config.enableAuditLog) {
        this.emit("token_validated", {
          jti: payload.jti,
          sub: payload.sub,
          iss: payload.iss,
          exp: payload.exp,
          timestamp: new Date().toISOString(),
        });
      }

      return payload;
    } catch (error) {
      // Update statistics based on error type
      if (error.name === "TokenExpiredError") {
        this.stats.expiredTokens++;
      } else if (error.name === "JsonWebTokenError") {
        this.stats.invalidSignature++;
      } else {
        this.stats.validationFailures++;
      }

      // Emit audit event for validation failure
      if (this.config.enableAuditLog) {
        this.emit("validation_failed", {
          error: error.message,
          errorType: error.name,
          timestamp: new Date().toISOString(),
        });
      }

      // Re-throw with context
      if (error.name === "TokenExpiredError") {
        throw new Error("JWT token has expired");
      } else if (error.name === "JsonWebTokenError") {
        throw new Error("Invalid JWT token signature or structure");
      } else if (error.name === "NotBeforeError") {
        throw new Error("JWT token not yet valid (nbf claim)");
      }

      throw new Error(`JWT verification failed: ${error.message}`);
    }
  }

  /**
   * Decode token header without verification (for algorithm checking)
   * @private
   */
  _decodeTokenHeader(token) {
    try {
      const parts = token.split(".");
      if (parts.length !== 3) {
        throw new Error("Invalid token structure");
      }

      const header = JSON.parse(
        Buffer.from(parts[0], "base64url").toString("utf8"),
      );
      return header;
    } catch (error) {
      throw new Error(`Failed to decode token header: ${error.message}`);
    }
  }

  /**
   * Validate required claims are present
   * @private
   */
  _validateRequiredClaims(payload) {
    const missingClaims = [];

    for (const claim of REQUIRED_CLAIMS) {
      if (!payload[claim]) {
        missingClaims.push(claim);
      }
    }

    if (this.config.requireJti && !payload.jti) {
      missingClaims.push("jti");
    }

    if (this.config.requireSub && !payload.sub) {
      missingClaims.push("sub");
    }

    if (missingClaims.length > 0) {
      throw new Error(`Missing required claims: ${missingClaims.join(", ")}`);
    }
  }

  /**
   * Validate custom claims
   * @private
   */
  _validateCustomClaims(payload, expectedClaims) {
    for (const [claim, expectedValue] of Object.entries(expectedClaims)) {
      if (typeof expectedValue === "function") {
        // Custom validation function
        if (!expectedValue(payload[claim], payload)) {
          throw new Error(`Custom claim validation failed for: ${claim}`);
        }
      } else if (Array.isArray(expectedValue)) {
        // Value must be in array
        if (!expectedValue.includes(payload[claim])) {
          throw new Error(
            `Claim ${claim} must be one of: ${expectedValue.join(", ")}`,
          );
        }
      } else {
        // Exact match
        if (payload[claim] !== expectedValue) {
          throw new Error(
            `Claim ${claim} mismatch: expected ${expectedValue}, got ${payload[claim]}`,
          );
        }
      }
    }
  }

  /**
   * Start periodic cleanup of expired JTIs
   * @private
   */
  _startJtiCleanup() {
    this.jtiCleanupInterval = setInterval(
      () => {
        const now = Date.now();
        let cleanedCount = 0;

        for (const [jti, expirationTime] of this.usedJtis.entries()) {
          if (expirationTime < now) {
            this.usedJtis.delete(jti);
            cleanedCount++;
          }
        }

        if (cleanedCount > 0 && this.config.enableAuditLog) {
          this.emit("jti_cleanup", {
            cleanedCount,
            remainingCount: this.usedJtis.size,
            timestamp: new Date().toISOString(),
          });
        }
      },
      60 * 60 * 1000,
    ); // Run every hour

    // Don't block process exit
    if (this.jtiCleanupInterval.unref) {
      this.jtiCleanupInterval.unref();
    }
  }

  /**
   * Decode token without verification (use with caution)
   *
   * @param {string} token - JWT token to decode
   * @returns {Object} Decoded payload (unverified)
   */
  decode(token) {
    try {
      return jwt.decode(token, { complete: false });
    } catch (error) {
      throw new Error(`Failed to decode token: ${error.message}`);
    }
  }

  /**
   * Get validator statistics
   *
   * @returns {Object} Statistics object
   */
  getStats() {
    return {
      ...this.stats,
      trackedJtis: this.config.enableJtiTracking ? this.usedJtis.size : 0,
    };
  }

  /**
   * Reset statistics
   */
  resetStats() {
    this.stats = {
      tokensGenerated: 0,
      tokensValidated: 0,
      validationFailures: 0,
      algorithmMismatch: 0,
      expiredTokens: 0,
      invalidSignature: 0,
      replayAttempts: 0,
    };
  }

  /**
   * Clear JTI tracking
   */
  clearJtiTracking() {
    if (this.config.enableJtiTracking) {
      this.usedJtis.clear();
    }
  }

  /**
   * Destroy validator and cleanup resources
   */
  destroy() {
    if (this.jtiCleanupInterval) {
      clearInterval(this.jtiCleanupInterval);
      this.jtiCleanupInterval = null;
    }

    if (this.usedJtis) {
      this.usedJtis.clear();
    }

    this.removeAllListeners();
  }
}

module.exports = {
  JWTValidator,
  SECURE_ALGORITHMS,
  MIN_KEY_SIZES,
  REQUIRED_CLAIMS,
};
