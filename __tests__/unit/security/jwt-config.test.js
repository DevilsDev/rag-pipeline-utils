"use strict";

/**
 * JWT Configuration Tests
 *
 * Tests for JWT configuration loading and validation
 *
 * @since 2.3.0
 */

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const {
  loadJWTConfig,
  createJWTConfig,
  validateJWTConfig,
  getEnvironmentPreset,
  generateJWTSecret,
  generateRSAKeyPair,
  generateECDSAKeyPair,
} = require("../../../src/security/jwt-config");

describe("JWT Configuration", () => {
  let originalEnv;

  beforeEach(() => {
    // Save original environment
    originalEnv = { ...process.env };
  });

  afterEach(() => {
    // Restore original environment
    process.env = originalEnv;
  });

  describe("loadJWTConfig", () => {
    it("should load default configuration for development", () => {
      process.env.NODE_ENV = "development";
      delete process.env.JWT_SECRET;

      const config = loadJWTConfig();

      expect(config.algorithm).toBe("HS256");
      expect(config.issuer).toBe("rag-pipeline-utils");
      expect(config.audience).toBe("rag-pipeline-api");
      expect(config.secret).toBeDefined();
      expect(config.clockTolerance).toBe(30);
      expect(config.maxTokenAge).toBe(3600);
    });

    it("should load secret from environment variable", () => {
      const testSecret = crypto.randomBytes(64).toString("hex");
      process.env.JWT_SECRET = testSecret;
      process.env.NODE_ENV = "production";

      const config = loadJWTConfig();

      expect(config.secret).toBe(testSecret);
    });

    it("should throw error in production without JWT_SECRET", () => {
      process.env.NODE_ENV = "production";
      delete process.env.JWT_SECRET;

      expect(() => {
        loadJWTConfig();
      }).toThrow("JWT_SECRET environment variable is required in production");
    });

    it("should validate secret strength", () => {
      process.env.JWT_SECRET = "weak-secret"; // Too weak for HS256
      process.env.NODE_ENV = "production";

      expect(() => {
        loadJWTConfig();
      }).toThrow("JWT_SECRET is too weak");
    });

    it("should load custom algorithm from environment", () => {
      process.env.JWT_ALGORITHM = "HS512";
      process.env.JWT_SECRET = crypto.randomBytes(64).toString("hex");
      process.env.NODE_ENV = "production";

      const config = loadJWTConfig();

      expect(config.algorithm).toBe("HS512");
    });

    it("should load allowed algorithms from environment", () => {
      process.env.JWT_ALLOWED_ALGORITHMS = "HS256,HS384,HS512";
      process.env.JWT_SECRET = crypto.randomBytes(64).toString("hex");
      process.env.NODE_ENV = "production";

      const config = loadJWTConfig();

      expect(config.allowedAlgorithms).toEqual(["HS256", "HS384", "HS512"]);
    });

    it("should load custom issuer and audience", () => {
      process.env.JWT_ISSUER = "custom-issuer";
      process.env.JWT_AUDIENCE = "custom-audience";
      process.env.JWT_SECRET = crypto.randomBytes(64).toString("hex");

      const config = loadJWTConfig();

      expect(config.issuer).toBe("custom-issuer");
      expect(config.audience).toBe("custom-audience");
    });

    it("should load timing configuration from environment", () => {
      process.env.JWT_CLOCK_TOLERANCE = "60";
      process.env.JWT_EXPIRY = "7200";
      process.env.JWT_SECRET = crypto.randomBytes(64).toString("hex");

      const config = loadJWTConfig();

      expect(config.clockTolerance).toBe(60);
      expect(config.maxTokenAge).toBe(7200);
    });

    it("should load security options from environment", () => {
      process.env.JWT_REQUIRE_JTI = "false";
      process.env.JWT_REQUIRE_SUB = "false";
      process.env.JWT_ENABLE_JTI_TRACKING = "false";
      process.env.JWT_SECRET = crypto.randomBytes(64).toString("hex");

      const config = loadJWTConfig();

      expect(config.requireJti).toBe(false);
      expect(config.requireSub).toBe(false);
      expect(config.enableJtiTracking).toBe(false);
    });
  });

  describe("validateJWTConfig", () => {
    it("should validate valid configuration", () => {
      const validConfig = {
        algorithm: "HS256",
        allowedAlgorithms: ["HS256"],
        secret: crypto.randomBytes(64).toString("hex"),
        issuer: "test-issuer",
        audience: "test-audience",
        clockTolerance: 30,
        maxTokenAge: 3600,
      };

      expect(() => {
        validateJWTConfig(validConfig);
      }).not.toThrow();
    });

    it("should reject invalid algorithm", () => {
      const invalidConfig = {
        algorithm: "INVALID",
        allowedAlgorithms: ["HS256"],
        secret: crypto.randomBytes(64).toString("hex"),
        issuer: "test",
        audience: "test",
        clockTolerance: 30,
        maxTokenAge: 3600,
      };

      expect(() => {
        validateJWTConfig(invalidConfig);
      }).toThrow("Invalid JWT algorithm");
    });

    it('should reject "none" in allowed algorithms', () => {
      const invalidConfig = {
        algorithm: "HS256",
        allowedAlgorithms: ["HS256", "none"],
        secret: crypto.randomBytes(64).toString("hex"),
        issuer: "test",
        audience: "test",
        clockTolerance: 30,
        maxTokenAge: 3600,
      };

      expect(() => {
        validateJWTConfig(invalidConfig);
      }).toThrow('Algorithm "none" is not allowed');
    });

    it("should reject empty allowed algorithms", () => {
      const invalidConfig = {
        algorithm: "HS256",
        allowedAlgorithms: [],
        secret: crypto.randomBytes(64).toString("hex"),
        issuer: "test",
        audience: "test",
        clockTolerance: 30,
        maxTokenAge: 3600,
      };

      expect(() => {
        validateJWTConfig(invalidConfig);
      }).toThrow("allowedAlgorithms must be a non-empty array");
    });

    it("should reject missing secret for HMAC algorithms", () => {
      const invalidConfig = {
        algorithm: "HS256",
        allowedAlgorithms: ["HS256"],
        issuer: "test",
        audience: "test",
        clockTolerance: 30,
        maxTokenAge: 3600,
      };

      expect(() => {
        validateJWTConfig(invalidConfig);
      }).toThrow("secret is required for HMAC algorithms");
    });

    it("should reject missing issuer", () => {
      const invalidConfig = {
        algorithm: "HS256",
        allowedAlgorithms: ["HS256"],
        secret: crypto.randomBytes(64).toString("hex"),
        audience: "test",
        clockTolerance: 30,
        maxTokenAge: 3600,
      };

      expect(() => {
        validateJWTConfig(invalidConfig);
      }).toThrow("issuer must be a non-empty string");
    });

    it("should reject missing audience", () => {
      const invalidConfig = {
        algorithm: "HS256",
        allowedAlgorithms: ["HS256"],
        secret: crypto.randomBytes(64).toString("hex"),
        issuer: "test",
        clockTolerance: 30,
        maxTokenAge: 3600,
      };

      expect(() => {
        validateJWTConfig(invalidConfig);
      }).toThrow("audience must be a non-empty string");
    });

    it("should reject invalid clock tolerance", () => {
      const invalidConfig = {
        algorithm: "HS256",
        allowedAlgorithms: ["HS256"],
        secret: crypto.randomBytes(64).toString("hex"),
        issuer: "test",
        audience: "test",
        clockTolerance: 500, // Too high
        maxTokenAge: 3600,
      };

      expect(() => {
        validateJWTConfig(invalidConfig);
      }).toThrow("clockTolerance must be between 0 and 300 seconds");
    });

    it("should reject invalid max token age", () => {
      const invalidConfig = {
        algorithm: "HS256",
        allowedAlgorithms: ["HS256"],
        secret: crypto.randomBytes(64).toString("hex"),
        issuer: "test",
        audience: "test",
        clockTolerance: 30,
        maxTokenAge: 30, // Too short
      };

      expect(() => {
        validateJWTConfig(invalidConfig);
      }).toThrow("maxTokenAge must be between 60 seconds");
    });
  });

  describe("createJWTConfig", () => {
    it("should create configuration with overrides", () => {
      process.env.NODE_ENV = "development";
      process.env.JWT_SECRET = crypto.randomBytes(64).toString("hex");

      const config = createJWTConfig({
        maxTokenAge: 7200,
        clockTolerance: 60,
      });

      expect(config.maxTokenAge).toBe(7200);
      expect(config.clockTolerance).toBe(60);
    });

    it("should merge with environment preset", () => {
      process.env.NODE_ENV = "production";
      process.env.JWT_SECRET = crypto.randomBytes(64).toString("hex");

      const config = createJWTConfig();

      // Production preset should be applied
      expect(config.strictValidation).toBe(true);
      expect(config.enableAuditLog).toBe(true);
      expect(config.requireJti).toBe(true);
    });

    it("should validate merged configuration", () => {
      process.env.NODE_ENV = "development";
      process.env.JWT_SECRET = crypto.randomBytes(64).toString("hex");

      expect(() => {
        createJWTConfig({
          algorithm: "INVALID",
        });
      }).toThrow("Invalid JWT algorithm");
    });
  });

  describe("getEnvironmentPreset", () => {
    it("should return development preset", () => {
      const preset = getEnvironmentPreset("development");

      expect(preset.clockTolerance).toBe(60);
      expect(preset.strictValidation).toBe(false);
      expect(preset.enableAuditLog).toBe(false);
      expect(preset.requireJti).toBe(false);
    });

    it("should return production preset", () => {
      const preset = getEnvironmentPreset("production");

      expect(preset.clockTolerance).toBe(30);
      expect(preset.strictValidation).toBe(true);
      expect(preset.enableAuditLog).toBe(true);
      expect(preset.requireJti).toBe(true);
      expect(preset.enableJtiTracking).toBe(true);
    });

    it("should return test preset", () => {
      const preset = getEnvironmentPreset("test");

      expect(preset.maxTokenAge).toBe(300); // 5 minutes for tests
      expect(preset.strictValidation).toBe(true);
      expect(preset.enableAuditLog).toBe(false);
      expect(preset.enableJtiTracking).toBe(false);
    });

    it("should return development preset for unknown environment", () => {
      const preset = getEnvironmentPreset("unknown");

      expect(preset).toEqual(getEnvironmentPreset("development"));
    });
  });

  describe("generateJWTSecret", () => {
    it("should generate hex-encoded secret", () => {
      const secret = generateJWTSecret();

      expect(secret).toBeDefined();
      expect(typeof secret).toBe("string");
      expect(secret.length).toBe(128); // 64 bytes * 2 (hex)
      expect(/^[0-9a-f]+$/.test(secret)).toBe(true);
    });

    it("should generate secret with custom length", () => {
      const secret = generateJWTSecret(32);

      expect(secret.length).toBe(64); // 32 bytes * 2 (hex)
    });

    it("should generate unique secrets", () => {
      const secret1 = generateJWTSecret();
      const secret2 = generateJWTSecret();

      expect(secret1).not.toBe(secret2);
    });
  });

  describe("generateRSAKeyPair", () => {
    it("should generate RSA key pair", async () => {
      const { publicKey, privateKey } = await generateRSAKeyPair(2048);

      expect(publicKey).toBeDefined();
      expect(privateKey).toBeDefined();
      expect(publicKey).toContain("BEGIN PUBLIC KEY");
      expect(privateKey).toContain("BEGIN PRIVATE KEY");
    });

    it("should generate keys with specified modulus length", async () => {
      const { publicKey, privateKey } = await generateRSAKeyPair(4096);

      expect(publicKey).toBeDefined();
      expect(privateKey).toBeDefined();
    });

    it("should generate different key pairs", async () => {
      const pair1 = await generateRSAKeyPair(2048);
      const pair2 = await generateRSAKeyPair(2048);

      expect(pair1.publicKey).not.toBe(pair2.publicKey);
      expect(pair1.privateKey).not.toBe(pair2.privateKey);
    });
  }, 10000); // Increase timeout for key generation

  describe("generateECDSAKeyPair", () => {
    it("should generate ECDSA key pair (ES256)", async () => {
      const { publicKey, privateKey } =
        await generateECDSAKeyPair("prime256v1");

      expect(publicKey).toBeDefined();
      expect(privateKey).toBeDefined();
      expect(publicKey).toContain("BEGIN PUBLIC KEY");
      expect(privateKey).toContain("BEGIN PRIVATE KEY");
    });

    it("should generate ECDSA key pair (ES384)", async () => {
      const { publicKey, privateKey } = await generateECDSAKeyPair("secp384r1");

      expect(publicKey).toBeDefined();
      expect(privateKey).toBeDefined();
    });

    it("should generate ECDSA key pair (ES512)", async () => {
      const { publicKey, privateKey } = await generateECDSAKeyPair("secp521r1");

      expect(publicKey).toBeDefined();
      expect(privateKey).toBeDefined();
    });

    it("should generate different key pairs", async () => {
      const pair1 = await generateECDSAKeyPair("prime256v1");
      const pair2 = await generateECDSAKeyPair("prime256v1");

      expect(pair1.publicKey).not.toBe(pair2.publicKey);
      expect(pair1.privateKey).not.toBe(pair2.privateKey);
    });
  }, 10000); // Increase timeout for key generation

  describe("Environment Integration", () => {
    it("should handle missing environment variables gracefully in development", () => {
      process.env.NODE_ENV = "development";
      delete process.env.JWT_SECRET;

      const config = loadJWTConfig();

      expect(config.secret).toBeDefined(); // Should generate one
    });

    it("should handle complete environment configuration", () => {
      process.env.NODE_ENV = "production";
      process.env.JWT_SECRET = crypto.randomBytes(64).toString("hex");
      process.env.JWT_ALGORITHM = "HS512";
      process.env.JWT_ISSUER = "prod-issuer";
      process.env.JWT_AUDIENCE = "prod-api";
      process.env.JWT_EXPIRY = "7200";
      process.env.JWT_CLOCK_TOLERANCE = "15";

      const config = loadJWTConfig();

      expect(config.algorithm).toBe("HS512");
      expect(config.issuer).toBe("prod-issuer");
      expect(config.audience).toBe("prod-api");
      expect(config.maxTokenAge).toBe(7200);
      expect(config.clockTolerance).toBe(15);
    });
  });
});
