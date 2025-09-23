/**
 * @fileoverview Unit tests for Plugin Signature Verification
 * Tests Ed25519 signature verification and fail-closed security model
 *
 * @author DevilsDev Team
 * @since 2.1.8
 */

const {
  PluginSignatureVerifier,
  createPluginVerifier,
} = require("../../../src/security/plugin-signature-verifier.js");
const { PluginRegistry } = require("../../../src/core/plugin-registry.js");

describe("Plugin Signature Verification", () => {
  let verifier;
  let mockAuditLogger;
  let validManifest;

  beforeEach(() => {
    mockAuditLogger = jest.fn();
    verifier = new PluginSignatureVerifier({
      enabled: true,
      failClosed: true,
      auditLogger: mockAuditLogger,
    });

    validManifest = {
      name: "test-plugin",
      version: "1.0.0",
      type: "loader",
      description: "Test plugin",
    };
  });

  describe("PluginSignatureVerifier", () => {
    test("should create verifier with default settings", () => {
      const defaultVerifier = new PluginSignatureVerifier();
      expect(defaultVerifier.enabled).toBe(true);
      expect(defaultVerifier.failClosed).toBe(true);
    });

    test("should load trusted keys from configuration", () => {
      const trustedKeys = verifier.listTrustedSigners();
      expect(trustedKeys).toHaveLength(1);
      expect(trustedKeys[0].signerId).toBe("devilsdev-official");
    });

    describe("addTrustedSigner", () => {
      test("should add valid trusted signer", () => {
        const publicKey = "1234567890abcdef".repeat(4); // 64 hex chars
        verifier.addTrustedSigner("test-signer", publicKey, "Test Signer");

        const signers = verifier.listTrustedSigners();
        expect(signers).toHaveLength(2);

        const testSigner = signers.find((s) => s.signerId === "test-signer");
        expect(testSigner).toBeDefined();
        expect(testSigner.name).toBe("Test Signer");
      });

      test("should reject invalid public key format", () => {
        expect(() => {
          verifier.addTrustedSigner("invalid", "not-hex", "Invalid");
        }).toThrow("Public key must be 64 hex characters");

        expect(() => {
          verifier.addTrustedSigner("short", "1234", "Short");
        }).toThrow("Public key must be 64 hex characters");
      });

      test("should require all parameters", () => {
        expect(() => {
          verifier.addTrustedSigner("", "key", "name");
        }).toThrow("signerId, publicKey, and name are required");

        expect(() => {
          verifier.addTrustedSigner("id", "", "name");
        }).toThrow("signerId, publicKey, and name are required");

        expect(() => {
          verifier.addTrustedSigner("id", "key", "");
        }).toThrow("signerId, publicKey, and name are required");
      });
    });

    describe("removeTrustedSigner", () => {
      test("should remove existing signer", () => {
        const removed = verifier.removeTrustedSigner("devilsdev-official");
        expect(removed).toBe(true);

        const signers = verifier.listTrustedSigners();
        expect(signers).toHaveLength(0);
      });

      test("should return false for non-existent signer", () => {
        const removed = verifier.removeTrustedSigner("non-existent");
        expect(removed).toBe(false);
      });

      test("should require signerId parameter", () => {
        expect(() => {
          verifier.removeTrustedSigner("");
        }).toThrow("signerId is required");
      });
    });

    describe("verifyPluginSignature", () => {
      test("should reject verification when disabled", async () => {
        const disabledVerifier = new PluginSignatureVerifier({
          enabled: false,
          failClosed: true,
        });

        await expect(
          disabledVerifier.verifyPluginSignature(
            validManifest,
            "signature",
            "signer",
          ),
        ).rejects.toThrow(
          "Plugin signature verification is disabled in fail-closed mode",
        );
      });

      test("should validate input parameters", async () => {
        await expect(
          verifier.verifyPluginSignature(null, "sig", "signer"),
        ).rejects.toThrow("Invalid manifest: must be an object");

        await expect(
          verifier.verifyPluginSignature(validManifest, "", "signer"),
        ).rejects.toThrow("Invalid signature: must be a non-empty string");

        await expect(
          verifier.verifyPluginSignature(validManifest, "sig", ""),
        ).rejects.toThrow("Invalid signerId: must be a non-empty string");
      });

      test("should reject untrusted signers", async () => {
        await expect(
          verifier.verifyPluginSignature(
            validManifest,
            "signature",
            "untrusted-signer",
          ),
        ).rejects.toThrow("Untrusted signer: untrusted-signer");
      });

      test("should reject invalid signature encoding", async () => {
        await expect(
          verifier.verifyPluginSignature(
            validManifest,
            "invalid-base64!",
            "devilsdev-official",
          ),
        ).rejects.toThrow("Plugin signature verification failed");
      });

      test("should audit verification attempts", async () => {
        try {
          await verifier.verifyPluginSignature(
            validManifest,
            "dGVzdA==",
            "untrusted-signer",
          );
        } catch (error) {
          // Expected to fail
        }

        expect(mockAuditLogger).toHaveBeenCalledWith(
          expect.objectContaining({
            verified: false,
            error: expect.any(String),
            auditTrail: expect.any(Array),
          }),
          validManifest,
        );
      });
    });

    describe("manifest canonicalization", () => {
      test("should canonicalize manifest consistently", () => {
        const manifest1 = {
          name: "test",
          version: "1.0.0",
          signature: "should-be-removed",
          metadata: { b: 2, a: 1 },
        };

        const manifest2 = {
          version: "1.0.0",
          metadata: { a: 1, b: 2 },
          name: "test",
          signerId: "should-be-removed",
        };

        const canonical1 = verifier._canonicalizeManifest(manifest1);
        const canonical2 = verifier._canonicalizeManifest(manifest2);

        expect(JSON.stringify(canonical1)).toBe(JSON.stringify(canonical2));
        expect(canonical1.signature).toBeUndefined();
        expect(canonical1.signerId).toBeUndefined();
      });

      test("should sort nested objects recursively", () => {
        const manifest = {
          name: "test",
          nested: {
            c: 3,
            a: { z: 1, y: 2 },
            b: [{ d: 4, c: 3 }],
          },
        };

        const canonical = verifier._canonicalizeManifest(manifest);
        const keys = Object.keys(canonical.nested);
        expect(keys).toEqual(["a", "b", "c"]);

        const nestedAKeys = Object.keys(canonical.nested.a);
        expect(nestedAKeys).toEqual(["y", "z"]);
      });
    });

    describe("Ed25519 signature verification", () => {
      test("should handle verification errors gracefully", async () => {
        // Mock crypto methods to simulate errors
        const originalCreateVerify = require("crypto").createVerify;
        const originalCryptoSubtle = crypto.subtle;

        require("crypto").createVerify = jest.fn(() => {
          throw new Error("Crypto error");
        });

        // Also mock crypto.subtle to force fallback error
        Object.defineProperty(crypto, "subtle", {
          value: undefined,
          configurable: true,
        });

        try {
          const data = Buffer.from("test data");
          const signature = Buffer.from("fake signature");
          const publicKey = "1234567890abcdef".repeat(4);

          await expect(
            verifier._verifyEd25519Signature(data, signature, publicKey),
          ).rejects.toThrow("Ed25519 verification failed");
        } finally {
          require("crypto").createVerify = originalCreateVerify;
          Object.defineProperty(crypto, "subtle", {
            value: originalCryptoSubtle,
            configurable: true,
          });
        }
      });
    });

    describe("security features", () => {
      test("should enforce fail-closed mode", async () => {
        const failClosedVerifier = new PluginSignatureVerifier({
          enabled: false,
          failClosed: true,
        });

        await expect(
          failClosedVerifier.verifyPluginSignature(
            validManifest,
            "sig",
            "signer",
          ),
        ).rejects.toThrow("disabled in fail-closed mode");
      });

      test("should allow fail-open mode for development", async () => {
        const failOpenVerifier = new PluginSignatureVerifier({
          enabled: false,
          failClosed: false,
        });

        const result = await failOpenVerifier.verifyPluginSignature(
          validManifest,
          "sig",
          "signer",
        );

        expect(result.verified).toBe(false);
        expect(result.error).toBe("Signature verification disabled");
      });

      test("should generate audit trail", async () => {
        try {
          await verifier.verifyPluginSignature(
            validManifest,
            "dGVzdA==",
            "devilsdev-official",
          );
        } catch (error) {
          // Expected to fail
        }

        expect(mockAuditLogger).toHaveBeenCalledWith(
          expect.objectContaining({
            auditTrail: expect.arrayContaining([
              expect.objectContaining({
                action: "verification_failed",
                timestamp: expect.any(String),
              }),
            ]),
          }),
          validManifest,
        );
      });
    });
  });

  describe("Plugin Registry Integration", () => {
    let registry;

    beforeEach(() => {
      registry = new PluginRegistry({
        verifySignatures: true,
        failClosed: true,
      });
    });

    const mockPlugin = {
      metadata: {
        name: "test-plugin",
        version: "1.0.0",
        type: "loader",
      },
      load: jest.fn(),
    };

    test("should register plugin without manifest (backward compatibility)", async () => {
      await expect(
        registry.register("loader", "test", mockPlugin),
      ).resolves.toBe(registry);
    });

    test("should require signature for plugins with manifest", async () => {
      const manifest = {
        name: "test-plugin",
        version: "1.0.0",
        type: "loader",
      };

      await expect(
        registry.register("loader", "test", mockPlugin, manifest),
      ).rejects.toThrow("missing required signature or signerId");
    });

    test("should verify valid signed plugins", async () => {
      const manifest = {
        name: "test-plugin",
        version: "1.0.0",
        type: "loader",
        signature: "dGVzdFNpZ25hdHVyZQ==", // base64 encoded
        signerId: "devilsdev-official",
      };

      // Mock the signature verification to succeed
      const mockVerifier = {
        verifyPluginSignature: jest.fn().mockResolvedValue({
          verified: true,
          auditTrail: [],
        }),
      };
      registry._signatureVerifier = mockVerifier;

      await expect(
        registry.register("loader", "test", mockPlugin, manifest),
      ).resolves.toBe(registry);

      expect(mockVerifier.verifyPluginSignature).toHaveBeenCalledWith(
        manifest,
        "dGVzdFNpZ25hdHVyZQ==",
        "devilsdev-official",
      );
    });

    test("should reject plugins with invalid signatures", async () => {
      const manifest = {
        name: "test-plugin",
        version: "1.0.0",
        type: "loader",
        signature: "aW52YWxpZA==", // base64 encoded "invalid"
        signerId: "devilsdev-official",
      };

      // Mock the signature verification to fail
      const mockVerifier = {
        verifyPluginSignature: jest.fn().mockResolvedValue({
          verified: false,
          error: "Signature verification failed",
        }),
      };
      registry._signatureVerifier = mockVerifier;

      await expect(
        registry.register("loader", "test", mockPlugin, manifest),
      ).rejects.toThrow("signature verification failed");
    });

    test("should emit audit entries for plugin registration", async () => {
      const consoleSpy = jest
        .spyOn(console, "log")
        .mockImplementation(() => {});

      const manifest = {
        name: "test-plugin",
        version: "1.0.0",
        type: "loader",
        signature: "dGVzdA==",
        signerId: "devilsdev-official",
      };

      const mockVerifier = {
        verifyPluginSignature: jest.fn().mockResolvedValue({
          verified: true,
          auditTrail: [],
        }),
      };
      registry._signatureVerifier = mockVerifier;

      await registry.register("loader", "test", mockPlugin, manifest);

      expect(consoleSpy).toHaveBeenCalledWith(
        "[AUDIT]",
        expect.objectContaining({
          action: "plugin_verified",
          pluginName: "test",
          verified: true,
        }),
      );

      consoleSpy.mockRestore();
    });
  });

  describe("createPluginVerifier factory", () => {
    test("should create verifier instance", () => {
      const verifier = createPluginVerifier({ enabled: false });
      expect(verifier).toBeInstanceOf(PluginSignatureVerifier);
      expect(verifier.enabled).toBe(false);
    });
  });

  describe("Production security scenarios", () => {
    test("should enforce strict verification in production", () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = "production";

      try {
        const prodRegistry = new PluginRegistry();

        // Should have signature verification enabled in production
        expect(prodRegistry._signatureVerifier.enabled).toBe(true);
        expect(prodRegistry._signatureVerifier.failClosed).toBe(true);
      } finally {
        process.env.NODE_ENV = originalEnv;
      }
    });

    test("should allow bypassing verification in development", () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = "development";

      try {
        const devRegistry = new PluginRegistry();

        // Should have signature verification disabled in development
        expect(devRegistry._signatureVerifier.enabled).toBe(false);
        expect(devRegistry._signatureVerifier.failClosed).toBe(false);
      } finally {
        process.env.NODE_ENV = originalEnv;
      }
    });
  });
});
