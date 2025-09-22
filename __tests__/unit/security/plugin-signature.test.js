/**
 * @fileoverview Tests for plugin signature verification
 * Ensures plugins can only be loaded with valid signatures
 */

const {
  PluginSignatureVerifier,
  createSignatureVerifier,
} = require("../../../src/security/plugin-signature-verification.js");
const fs = require("fs").promises;
const path = require("path");
const crypto = require("crypto");

describe("PluginSignatureVerifier", () => {
  let verifier;
  let tempDir;

  beforeEach(() => {
    verifier = new PluginSignatureVerifier({
      requireSignatures: true,
      failOnError: true,
      trustedKeys: [
        {
          id: "test-key-1",
          publicKey:
            "308012300506032b657004010a032011001234567890abcdef1234567890abcdef12345678",
        },
      ],
    });

    tempDir = "/tmp/plugin-test-" + Date.now();
  });

  afterEach(() => {
    verifier.clearAuditLogs();
  });

  describe("Manifest validation", () => {
    test("should validate required manifest fields", async () => {
      const invalidManifest = { name: "test" };

      await expect(
        verifier.verifyPlugin("/test/path", invalidManifest),
      ).rejects.toThrow("missing required field");
    });

    test("should validate plugin ID format", async () => {
      const invalidManifest = {
        id: "Invalid_ID!",
        version: "1.0.0",
        name: "Test Plugin",
        type: "loader",
      };

      await expect(
        verifier.verifyPlugin("/test/path", invalidManifest),
      ).rejects.toThrow(
        "plugin ID must be lowercase alphanumeric with hyphens",
      );
    });

    test("should validate version format", async () => {
      const invalidManifest = {
        id: "test-plugin",
        version: "invalid",
        name: "Test Plugin",
        type: "loader",
      };

      await expect(
        verifier.verifyPlugin("/test/path", invalidManifest),
      ).rejects.toThrow("version must follow semantic versioning");
    });

    test("should validate signature structure", async () => {
      const invalidManifest = {
        id: "test-plugin",
        version: "1.0.0",
        name: "Test Plugin",
        type: "loader",
        signature: {
          keyId: "test-key",
          // Missing signature and algorithm
        },
      };

      await expect(
        verifier.verifyPlugin("/test/path", invalidManifest),
      ).rejects.toThrow("signature.signature must be a string");
    });
  });

  describe("Signature requirements", () => {
    test("should require signatures when configured", async () => {
      const manifest = {
        id: "test-plugin",
        version: "1.0.0",
        name: "Test Plugin",
        type: "loader",
        // No signature
      };

      await expect(
        verifier.verifyPlugin("/test/path", manifest),
      ).rejects.toThrow(
        "Plugin test-plugin requires signature but none provided",
      );
    });

    test("should allow unsigned plugins when not required", async () => {
      const permissiveVerifier = new PluginSignatureVerifier({
        requireSignatures: false,
      });

      const manifest = {
        id: "test-plugin",
        version: "1.0.0",
        name: "Test Plugin",
        type: "loader",
      };

      const result = await permissiveVerifier.verifyPlugin(
        "/test/path",
        manifest,
      );
      expect(result).toBe(true);
    });
  });

  describe("Signature verification", () => {
    test("should reject unknown key IDs", async () => {
      const manifest = {
        id: "test-plugin",
        version: "1.0.0",
        name: "Test Plugin",
        type: "loader",
        signature: {
          keyId: "unknown-key",
          signature: "abcdef123456",
          algorithm: "Ed25519",
        },
      };

      await expect(
        verifier.verifyPlugin("/test/path", manifest),
      ).rejects.toThrow("Unknown or untrusted key ID: unknown-key");
    });

    test("should reject unsupported algorithms", async () => {
      const manifest = {
        id: "test-plugin",
        version: "1.0.0",
        name: "Test Plugin",
        type: "loader",
        signature: {
          keyId: "test-key-1",
          signature: "abcdef123456",
          algorithm: "RSA-SHA256",
        },
      };

      await expect(
        verifier.verifyPlugin("/test/path", manifest),
      ).rejects.toThrow("Unsupported signature algorithm: RSA-SHA256");
    });

    test("should validate signature hex format", async () => {
      const manifest = {
        id: "test-plugin",
        version: "1.0.0",
        name: "Test Plugin",
        type: "loader",
        signature: {
          keyId: "test-key-1",
          signature: "invalid-hex!",
          algorithm: "Ed25519",
        },
      };

      await expect(
        verifier.verifyPlugin("/test/path", manifest),
      ).rejects.toThrow("signature must be in hex format");
    });

    test("should handle file reading errors gracefully", async () => {
      const manifest = {
        id: "test-plugin",
        version: "1.0.0",
        name: "Test Plugin",
        type: "loader",
        files: ["nonexistent.js"],
        signature: {
          keyId: "test-key-1",
          signature:
            "abcdef123456789012345678901234567890abcdef123456789012345678901234",
          algorithm: "Ed25519",
        },
      };

      // Mock fs.readFile to simulate missing files
      const originalReadFile = fs.readFile;
      fs.readFile = jest.fn().mockRejectedValue(new Error("File not found"));

      try {
        await expect(
          verifier.verifyPlugin("/test/path", manifest),
        ).rejects.toThrow("Failed to read plugin file: nonexistent.js");
      } finally {
        fs.readFile = originalReadFile;
      }
    });
  });

  describe("Key management", () => {
    test("should add trusted keys", () => {
      verifier.addTrustedKey(
        "new-key",
        "abcdef123456789012345678901234567890abcdef",
      );

      const key = verifier._getTrustedKey("new-key");
      expect(key).toBe("abcdef123456789012345678901234567890abcdef");
    });

    test("should validate key ID format", () => {
      expect(() => {
        verifier.addTrustedKey("invalid key!", "abcdef123456");
      }).toThrow(
        "Invalid key ID: must be alphanumeric with hyphens/underscores",
      );
    });

    test("should validate public key hex format", () => {
      expect(() => {
        verifier.addTrustedKey("valid-key", "invalid-hex!");
      }).toThrow("Invalid public key: must be in hex format");
    });

    test("should remove trusted keys", () => {
      verifier.addTrustedKey("temp-key", "abcdef123456");
      expect(verifier._getTrustedKey("temp-key")).toBe("abcdef123456");

      verifier.removeTrustedKey("temp-key");
      expect(verifier._getTrustedKey("temp-key")).toBeNull();
    });

    test("should replace existing keys with same ID", () => {
      verifier.addTrustedKey("same-key", "original123456");
      expect(verifier._getTrustedKey("same-key")).toBe("original123456");

      verifier.addTrustedKey("same-key", "updated789012");
      expect(verifier._getTrustedKey("same-key")).toBe("updated789012");

      // Should only have one key with this ID
      const allKeys = verifier.options.trustedKeys.filter(
        (k) => k.id === "same-key",
      );
      expect(allKeys.length).toBe(1);
    });
  });

  describe("Audit logging", () => {
    test("should log successful verifications", async () => {
      const permissiveVerifier = new PluginSignatureVerifier({
        requireSignatures: false,
      });

      const manifest = {
        id: "test-plugin",
        version: "1.0.0",
        name: "Test Plugin",
        type: "loader",
      };

      await permissiveVerifier.verifyPlugin("/test/path", manifest);

      const logs = permissiveVerifier.getAuditLogs();
      expect(logs.length).toBe(1);
      expect(logs[0].result).toBe("success");
      expect(logs[0].pluginId).toBe("test-plugin");
    });

    test("should log verification failures", async () => {
      const failSafeVerifier = new PluginSignatureVerifier({
        requireSignatures: true,
        failOnError: false,
      });

      const manifest = {
        id: "test-plugin",
        version: "1.0.0",
        name: "Test Plugin",
        type: "loader",
        // No signature
      };

      await failSafeVerifier.verifyPlugin("/test/path", manifest);

      const logs = failSafeVerifier.getAuditLogs();
      expect(logs.length).toBe(1);
      expect(logs[0].result).toBe("failure");
      expect(logs[0].action).toBe("missing_signature");
    });

    test("should filter audit logs by plugin ID", async () => {
      const permissiveVerifier = new PluginSignatureVerifier({
        requireSignatures: false,
      });

      // Add logs for different plugins
      await permissiveVerifier.verifyPlugin("/test/path1", {
        id: "plugin-1",
        version: "1.0.0",
        name: "Plugin 1",
        type: "loader",
      });

      await permissiveVerifier.verifyPlugin("/test/path2", {
        id: "plugin-2",
        version: "1.0.0",
        name: "Plugin 2",
        type: "loader",
      });

      const plugin1Logs = permissiveVerifier.getAuditLogs({
        pluginId: "plugin-1",
      });
      expect(plugin1Logs.length).toBe(1);
      expect(plugin1Logs[0].pluginId).toBe("plugin-1");
    });

    test("should limit audit log results", async () => {
      const permissiveVerifier = new PluginSignatureVerifier({
        requireSignatures: false,
      });

      // Add multiple logs
      for (let i = 0; i < 5; i++) {
        await permissiveVerifier.verifyPlugin(`/test/path${i}`, {
          id: `plugin-${i}`,
          version: "1.0.0",
          name: `Plugin ${i}`,
          type: "loader",
        });
      }

      const limitedLogs = permissiveVerifier.getAuditLogs({ limit: 3 });
      expect(limitedLogs.length).toBe(3);
    });

    test("should clear audit logs", async () => {
      const permissiveVerifier = new PluginSignatureVerifier({
        requireSignatures: false,
      });

      await permissiveVerifier.verifyPlugin("/test/path", {
        id: "test-plugin",
        version: "1.0.0",
        name: "Test Plugin",
        type: "loader",
      });

      expect(permissiveVerifier.getAuditLogs().length).toBe(1);

      permissiveVerifier.clearAuditLogs();
      expect(permissiveVerifier.getAuditLogs().length).toBe(0);
    });
  });

  describe("Factory function", () => {
    test("should create verifier with default configuration", () => {
      const verifier = createSignatureVerifier();
      expect(verifier).toBeInstanceOf(PluginSignatureVerifier);
    });

    test("should create verifier with custom options", () => {
      const verifier = createSignatureVerifier({
        requireSignatures: false,
        trustedKeys: [{ id: "custom", publicKey: "abcdef" }],
      });

      expect(verifier.options.requireSignatures).toBe(false);
      expect(verifier.options.trustedKeys.length).toBe(1);
    });
  });

  describe("Error handling and resilience", () => {
    test("should handle malformed manifests gracefully", async () => {
      await expect(verifier.verifyPlugin("/test/path", null)).rejects.toThrow(
        "Invalid manifest: must be an object",
      );

      await expect(
        verifier.verifyPlugin("/test/path", "not an object"),
      ).rejects.toThrow("Invalid manifest: must be an object");
    });

    test("should fail closed by default", async () => {
      const manifest = {
        id: "test-plugin",
        version: "1.0.0",
        name: "Test Plugin",
        type: "loader",
        // No signature, should fail
      };

      await expect(
        verifier.verifyPlugin("/test/path", manifest),
      ).rejects.toThrow("requires signature but none provided");
    });

    test("should continue on error when configured", async () => {
      const resilientVerifier = new PluginSignatureVerifier({
        requireSignatures: true,
        failOnError: false,
      });

      const manifest = {
        id: "test-plugin",
        version: "1.0.0",
        name: "Test Plugin",
        type: "loader",
        // No signature
      };

      const result = await resilientVerifier.verifyPlugin(
        "/test/path",
        manifest,
      );
      expect(result).toBe(false);
    });
  });
});
