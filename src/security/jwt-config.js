'use strict';

/**
 * JWT Security Configuration
 *
 * Centralized configuration for JWT validation and signing
 * with environment-specific settings and security best practices.
 *
 * @module security/jwt-config
 * @since 2.3.0
 */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

/**
 * Load JWT configuration from environment or defaults
 *
 * Environment variables:
 * - JWT_SECRET: Secret for HMAC algorithms (min 32 bytes)
 * - JWT_ALGORITHM: Algorithm to use (default: HS256)
 * - JWT_ISSUER: Token issuer (default: rag-pipeline-utils)
 * - JWT_AUDIENCE: Token audience (default: rag-pipeline-api)
 * - JWT_EXPIRY: Token expiration in seconds (default: 3600)
 * - JWT_CLOCK_TOLERANCE: Clock skew tolerance in seconds (default: 30)
 * - JWT_PUBLIC_KEY_PATH: Path to public key file (for asymmetric algorithms)
 * - JWT_PRIVATE_KEY_PATH: Path to private key file (for asymmetric algorithms)
 * - JWT_ENABLE_JTI_TRACKING: Enable JTI replay protection (default: true)
 *
 * @returns {Object} JWT configuration
 */
function loadJWTConfig() {
  const isProduction = process.env.NODE_ENV === 'production';
  const isDevelopment = process.env.NODE_ENV === 'development';
  const isTest = process.env.NODE_ENV === 'test';
  const isUndefined = !process.env.NODE_ENV; // Treat undefined as development

  // Load algorithm
  const algorithm = process.env.JWT_ALGORITHM || 'HS256';
  const isSymmetric = algorithm.startsWith('HS');
  const isAsymmetric =
    algorithm.startsWith('RS') ||
    algorithm.startsWith('ES') ||
    algorithm.startsWith('PS');

  // Load secret for symmetric algorithms
  let secret = null;
  if (isSymmetric) {
    secret = process.env.JWT_SECRET;

    if (!secret) {
      if (isProduction) {
        throw new Error(
          'JWT_SECRET environment variable is required in production. ' +
            'Generate a secure secret with: node -e "console.log(require(\'crypto\').randomBytes(64).toString(\'hex\'))"',
        );
      } else if (isDevelopment || isTest || isUndefined) {
        // Generate a random secret for development/test/undefined environments
        secret = crypto.randomBytes(64).toString('hex');
        if (!isUndefined) {
          console.warn(
            '[JWT_CONFIG] Warning: Using generated JWT_SECRET for development. ' +
              'Set JWT_SECRET environment variable for consistent tokens.',
          );
        }
      }
    }

    // Validate secret strength
    if (secret) {
      const secretBits = Buffer.byteLength(secret, 'utf8') * 8;
      const minBits =
        algorithm === 'HS256' ? 256 : algorithm === 'HS384' ? 384 : 512;

      if (secretBits < minBits) {
        throw new Error(
          `JWT_SECRET is too weak for ${algorithm}. ` +
            `Minimum ${minBits} bits (${Math.ceil(minBits / 8)} bytes) required, got ${secretBits} bits. ` +
            `Generate a stronger secret with: node -e "console.log(require('crypto').randomBytes(${Math.ceil(minBits / 8)}).toString('hex'))"`,
        );
      }
    }
  }

  // Load keys for asymmetric algorithms
  let publicKey = null;
  let privateKey = null;

  if (isAsymmetric) {
    const publicKeyPath = process.env.JWT_PUBLIC_KEY_PATH;
    const privateKeyPath = process.env.JWT_PRIVATE_KEY_PATH;

    if (!publicKeyPath) {
      if (isProduction) {
        throw new Error(
          'JWT_PUBLIC_KEY_PATH environment variable is required for asymmetric algorithms in production',
        );
      } else {
        console.warn(
          '[JWT_CONFIG] Warning: No JWT_PUBLIC_KEY_PATH set. Token verification will not be available.',
        );
      }
    } else {
      try {
        publicKey = fs.readFileSync(path.resolve(publicKeyPath), 'utf8');
      } catch (error) {
        throw new Error(
          `Failed to read public key from ${publicKeyPath}: ${error.message}`,
        );
      }
    }

    if (!privateKeyPath) {
      console.warn(
        '[JWT_CONFIG] Warning: No JWT_PRIVATE_KEY_PATH set. Token signing will not be available.',
      );
    } else {
      try {
        privateKey = fs.readFileSync(path.resolve(privateKeyPath), 'utf8');
      } catch (error) {
        throw new Error(
          `Failed to read private key from ${privateKeyPath}: ${error.message}`,
        );
      }
    }
  }

  // Build configuration
  const config = {
    // Algorithm configuration
    algorithm,
    allowedAlgorithms: process.env.JWT_ALLOWED_ALGORITHMS
      ? process.env.JWT_ALLOWED_ALGORITHMS.split(',').map((a) => a.trim())
      : [algorithm],

    // Secret/Key configuration
    secret,
    publicKey,
    privateKey,

    // Issuer and audience
    issuer: process.env.JWT_ISSUER || 'rag-pipeline-utils',
    audience: process.env.JWT_AUDIENCE || 'rag-pipeline-api',

    // Timing configuration
    clockTolerance: parseInt(process.env.JWT_CLOCK_TOLERANCE, 10) || 30,
    maxTokenAge: parseInt(process.env.JWT_EXPIRY, 10) || 3600, // 1 hour
    notBeforeTolerance: parseInt(process.env.JWT_NBF_TOLERANCE, 10) || 30,

    // Security options
    requireJti: process.env.JWT_REQUIRE_JTI !== 'false',
    requireSub: process.env.JWT_REQUIRE_SUB !== 'false',
    strictValidation: process.env.JWT_STRICT_VALIDATION !== 'false',

    // JTI tracking for replay protection
    enableJtiTracking: process.env.JWT_ENABLE_JTI_TRACKING !== 'false',
    jtiExpirationMs:
      parseInt(process.env.JWT_JTI_EXPIRATION_MS, 10) ||
      7 * 24 * 60 * 60 * 1000,

    // Audit logging
    enableAuditLog: process.env.JWT_ENABLE_AUDIT_LOG !== 'false',

    // Environment-specific defaults
    environment: process.env.NODE_ENV || 'development',
  };

  // Validate configuration
  validateJWTConfig(config);

  return config;
}

/**
 * Validate JWT configuration
 *
 * @param {Object} config - JWT configuration to validate
 * @throws {Error} If configuration is invalid
 */
function validateJWTConfig(config) {
  // Check algorithm
  const validAlgorithms = [
    'HS256',
    'HS384',
    'HS512',
    'RS256',
    'RS384',
    'RS512',
    'ES256',
    'ES384',
    'ES512',
    'PS256',
    'PS384',
    'PS512',
  ];

  if (!validAlgorithms.includes(config.algorithm)) {
    throw new Error(
      `Invalid JWT algorithm: ${config.algorithm}. ` +
        `Must be one of: ${validAlgorithms.join(', ')}`,
    );
  }

  // Check allowed algorithms
  if (
    !Array.isArray(config.allowedAlgorithms) ||
    config.allowedAlgorithms.length === 0
  ) {
    throw new Error('allowedAlgorithms must be a non-empty array');
  }

  for (const alg of config.allowedAlgorithms) {
    // Check for "none" algorithm first (security critical)
    if (
      alg === 'none' ||
      (typeof alg === 'string' && alg.toLowerCase() === 'none')
    ) {
      throw new Error('Algorithm "none" is not allowed');
    }
    if (!validAlgorithms.includes(alg)) {
      throw new Error(`Invalid algorithm in allowedAlgorithms: ${alg}`);
    }
  }

  // Check issuer and audience
  if (!config.issuer || typeof config.issuer !== 'string') {
    throw new Error('issuer must be a non-empty string');
  }

  if (!config.audience || typeof config.audience !== 'string') {
    throw new Error('audience must be a non-empty string');
  }

  // Check timing values
  if (config.clockTolerance < 0 || config.clockTolerance > 300) {
    throw new Error('clockTolerance must be between 0 and 300 seconds');
  }

  if (config.maxTokenAge < 60 || config.maxTokenAge > 86400) {
    throw new Error(
      'maxTokenAge must be between 60 seconds (1 minute) and 86400 seconds (24 hours)',
    );
  }

  // Check secret/key availability
  const isSymmetric = config.algorithm.startsWith('HS');
  const isAsymmetric =
    config.algorithm.startsWith('RS') ||
    config.algorithm.startsWith('ES') ||
    config.algorithm.startsWith('PS');

  if (isSymmetric && !config.secret) {
    throw new Error('secret is required for HMAC algorithms');
  }

  if (
    isAsymmetric &&
    !config.publicKey &&
    process.env.NODE_ENV === 'production'
  ) {
    throw new Error(
      'publicKey is required for asymmetric algorithms in production',
    );
  }
}

/**
 * Get environment-specific JWT configuration presets
 *
 * @param {string} environment - Environment name (development, production, test)
 * @returns {Object} Environment-specific configuration
 */
function getEnvironmentPreset(environment) {
  const presets = {
    development: {
      clockTolerance: 60, // More lenient in dev
      maxTokenAge: 3600, // 1 hour
      strictValidation: false,
      enableAuditLog: false,
      requireJti: false,
      requireSub: false,
    },
    production: {
      clockTolerance: 30,
      maxTokenAge: 3600, // 1 hour
      strictValidation: true,
      enableAuditLog: true,
      requireJti: true,
      requireSub: true,
      enableJtiTracking: true,
    },
    test: {
      clockTolerance: 30,
      maxTokenAge: 300, // 5 minutes for tests
      strictValidation: true,
      enableAuditLog: false,
      requireJti: false,
      requireSub: false,
      enableJtiTracking: false,
    },
  };

  return presets[environment] || presets.development;
}

/**
 * Create JWT configuration with overrides
 *
 * @param {Object} overrides - Configuration overrides
 * @returns {Object} Merged configuration
 *
 * @example
 * const config = createJWTConfig({
 *   algorithm: 'RS256',
 *   publicKey: fs.readFileSync('public.pem'),
 *   privateKey: fs.readFileSync('private.pem'),
 * });
 */
function createJWTConfig(overrides = {}) {
  const baseConfig = loadJWTConfig();
  const environmentPreset = getEnvironmentPreset(baseConfig.environment);

  const config = {
    ...baseConfig,
    ...environmentPreset,
    ...overrides,
  };

  validateJWTConfig(config);

  return config;
}

/**
 * Generate a secure JWT secret
 *
 * @param {number} bytes - Number of bytes (default: 64)
 * @returns {string} Hex-encoded secret
 *
 * @example
 * const secret = generateJWTSecret();
 * console.log('Add to .env: JWT_SECRET=' + secret);
 */
function generateJWTSecret(bytes = 64) {
  return crypto.randomBytes(bytes).toString('hex');
}

/**
 * Generate RSA key pair for JWT signing
 *
 * @param {number} modulusLength - Key size in bits (default: 2048)
 * @returns {Promise<Object>} Key pair { publicKey, privateKey }
 *
 * @example
 * const { publicKey, privateKey } = await generateRSAKeyPair();
 * fs.writeFileSync('jwt-public.pem', publicKey);
 * fs.writeFileSync('jwt-private.pem', privateKey);
 */
async function generateRSAKeyPair(modulusLength = 2048) {
  return new Promise((resolve, reject) => {
    crypto.generateKeyPair(
      'rsa',
      {
        modulusLength,
        publicKeyEncoding: {
          type: 'spki',
          format: 'pem',
        },
        privateKeyEncoding: {
          type: 'pkcs8',
          format: 'pem',
        },
      },
      (err, publicKey, privateKey) => {
        if (err) {
          reject(err);
        } else {
          resolve({ publicKey, privateKey });
        }
      },
    );
  });
}

/**
 * Generate ECDSA key pair for JWT signing
 *
 * @param {string} namedCurve - Curve name (default: 'prime256v1' for ES256)
 * @returns {Promise<Object>} Key pair { publicKey, privateKey }
 *
 * @example
 * const { publicKey, privateKey } = await generateECDSAKeyPair('prime256v1');
 * fs.writeFileSync('jwt-public-ec.pem', publicKey);
 * fs.writeFileSync('jwt-private-ec.pem', privateKey);
 */
async function generateECDSAKeyPair(namedCurve = 'prime256v1') {
  return new Promise((resolve, reject) => {
    crypto.generateKeyPair(
      'ec',
      {
        namedCurve, // prime256v1 (ES256), secp384r1 (ES384), secp521r1 (ES512)
        publicKeyEncoding: {
          type: 'spki',
          format: 'pem',
        },
        privateKeyEncoding: {
          type: 'pkcs8',
          format: 'pem',
        },
      },
      (err, publicKey, privateKey) => {
        if (err) {
          reject(err);
        } else {
          resolve({ publicKey, privateKey });
        }
      },
    );
  });
}

module.exports = {
  loadJWTConfig,
  createJWTConfig,
  validateJWTConfig,
  getEnvironmentPreset,
  generateJWTSecret,
  generateRSAKeyPair,
  generateECDSAKeyPair,
};
