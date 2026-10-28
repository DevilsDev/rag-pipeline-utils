/**
 * @fileoverview Real Ed25519 verification and content-digest binding for
 * plugin signatures (2.5.0). Uses locally generated keys only.
 */

const crypto = require("crypto");
const fs = require("fs");
const os = require("os");
const path = require("path");
const {
  PluginSignatureVerifier,
  computeContentDigest,
} = require("../../../src/security/plugin-signature-verifier.js");
const { PluginRegistry } = require("../../../src/core/plugin-registry.js");

const noopAudit = () => {};

function makeKeys() {
  const { publicKey, privateKey } = crypto.generateKeyPairSync("ed25519");
  const rawHex = Buffer.from(
    publicKey.export({ format: "jwk" }).x,
    "base64url",
  ).toString("hex");
  return { publicKey, privateKey, rawHex };
}

function sign(verifier, manifest, privateKey) {
  return crypto
    .sign(null, verifier.getSigningPayload(manifest), privateKey)
    .toString("base64");
}

function makePluginDir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "plugin-sig-"));
  fs.writeFileSync(
    path.join(dir, "index.js"),
    "module.exports = class P { load() { return []; } };\n",
  );
  fs.mkdirSync(path.join(dir, "lib"));
  fs.writeFileSync(path.join(dir, "lib", "helper.js"), "module.exports = 1;\n");
  return dir;
}

describe("PluginSignatureVerifier with real Ed25519 keys", () => {
  let keys;
  let verifier;
  const manifest = { name: "p", version: "1.0.0", type: "loader" };

  beforeEach(() => {
    keys = makeKeys();
    verifier = new PluginSignatureVerifier({ auditLogger: noopAudit });
    verifier.addTrustedSigner("me", keys.rawHex, "Me");
  });

  test("accepts a valid signature (raw hex key)", async () => {
    const result = await verifier.verifyPluginSignature(
      manifest,
      sign(verifier, manifest, keys.privateKey),
      "me",
    );
    expect(result.verified).toBe(true);
    // Manifest without contentDigest: signature ok, code not bound
    expect(result.contentVerified).toBe(false);
  });

  test("uses crypto.verify with a KeyObject (not createVerify)", async () => {
    const verifySpy = jest.spyOn(crypto, "verify");
    const createVerifySpy = jest.spyOn(crypto, "createVerify");
    await verifier.verifyPluginSignature(
      manifest,
      sign(verifier, manifest, keys.privateKey),
      "me",
    );
    expect(verifySpy).toHaveBeenCalledWith(
      null,
      expect.any(Buffer),
      expect.any(crypto.KeyObject),
      expect.any(Buffer),
    );
    expect(createVerifySpy).not.toHaveBeenCalled();
    verifySpy.mockRestore();
    createVerifySpy.mockRestore();
  });

  test.each([
    ["PEM", (k) => k.publicKey.export({ format: "pem", type: "spki" })],
    ["DER Buffer", (k) => k.publicKey.export({ format: "der", type: "spki" })],
    [
      "DER base64",
      (k) =>
        k.publicKey.export({ format: "der", type: "spki" }).toString("base64"),
    ],
    ["KeyObject", (k) => k.publicKey],
    ["raw 32-byte Buffer", (k) => Buffer.from(k.rawHex, "hex")],
  ])("accepts a %s public key", async (_label, toKey) => {
    const v = new PluginSignatureVerifier({ auditLogger: noopAudit });
    v.addTrustedSigner("k", toKey(keys), "Key");
    const result = await v.verifyPluginSignature(
      manifest,
      sign(v, manifest, keys.privateKey),
      "k",
    );
    expect(result.verified).toBe(true);
  });

  test("rejects non-Ed25519 keys", () => {
    const { publicKey } = crypto.generateKeyPairSync("ec", {
      namedCurve: "P-256",
    });
    expect(() =>
      verifier.addTrustedSigner(
        "ec",
        publicKey.export({ format: "pem", type: "spki" }),
        "EC",
      ),
    ).toThrow("Public key must be 64 hex characters");
  });

  test("rejects a signature from another key", async () => {
    const other = makeKeys();
    await expect(
      verifier.verifyPluginSignature(
        manifest,
        sign(verifier, manifest, other.privateKey),
        "me",
      ),
    ).rejects.toThrow("Signature verification failed");
  });

  test("rejects a tampered manifest", async () => {
    const signature = sign(verifier, manifest, keys.privateKey);
    await expect(
      verifier.verifyPluginSignature(
        { ...manifest, version: "6.6.6" },
        signature,
        "me",
      ),
    ).rejects.toThrow("Signature verification failed");
  });

  test("rejects a malformed signature", async () => {
    await expect(
      verifier.verifyPluginSignature(manifest, "dGVzdA==", "me"),
    ).rejects.toThrow("Signature verification failed");
  });

  test("an empty trust store verifies nothing", async () => {
    const empty = new PluginSignatureVerifier({ auditLogger: noopAudit });
    expect(empty.listTrustedSigners()).toEqual([]);
    await expect(
      empty.verifyPluginSignature(
        manifest,
        sign(empty, manifest, keys.privateKey),
        "devilsdev-official",
      ),
    ).rejects.toThrow("Untrusted signer: devilsdev-official");
  });

  test("fails closed (returns verified: false) when failClosed is off", async () => {
    const open = new PluginSignatureVerifier({
      auditLogger: noopAudit,
      failClosed: false,
    });
    open.addTrustedSigner("me", keys.rawHex, "Me");
    const result = await open.verifyPluginSignature(
      { ...manifest, version: "2" },
      sign(open, manifest, keys.privateKey),
      "me",
    );
    expect(result.verified).toBe(false);
  });

  test("loads PEM keys from a trusted keys file and rejects bad ones", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "trust-"));
    try {
      const good = path.join(dir, "good.json");
      fs.writeFileSync(
        good,
        JSON.stringify({
          team: {
            name: "Team",
            publicKey: keys.publicKey.export({ format: "pem", type: "spki" }),
          },
        }),
      );
      const v = new PluginSignatureVerifier({
        auditLogger: noopAudit,
        trustedKeysPath: good,
      });
      expect(v.listTrustedSigners().map((s) => s.signerId)).toEqual(["team"]);

      const bad = path.join(dir, "bad.json");
      fs.writeFileSync(
        bad,
        JSON.stringify({
          x: { name: "X", publicKey: "your-ed25519-public-key-here" },
        }),
      );
      expect(
        () =>
          new PluginSignatureVerifier({
            auditLogger: noopAudit,
            trustedKeysPath: bad,
          }),
      ).toThrow("Failed to load trusted keys");
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  describe("content digest", () => {
    let dir;
    let files;

    beforeEach(() => {
      dir = makePluginDir();
      files = [path.join(dir, "index.js"), path.join(dir, "lib", "helper.js")];
    });

    afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

    function signedManifest() {
      const m = {
        ...manifest,
        contentDigest: computeContentDigest({ files, baseDir: dir }),
      };
      return { ...m, signature: sign(verifier, m, keys.privateKey) };
    }

    test("digest is order-independent and uses forward slashes", () => {
      const a = computeContentDigest({ files, baseDir: dir });
      const b = computeContentDigest({
        files: [...files].reverse(),
        baseDir: dir,
      });
      const c = computeContentDigest({
        contents: {
          "lib/helper.js": fs.readFileSync(files[1]),
          "index.js": fs.readFileSync(files[0]),
        },
      });
      expect(a).toMatch(/^sha256-[0-9a-f]{64}$/);
      expect(b).toBe(a);
      expect(c).toBe(a);
    });

    test("accepts matching plugin code", async () => {
      const m = signedManifest();
      const result = await verifier.verifyPluginSignature(
        m,
        m.signature,
        "me",
        { files, baseDir: dir },
      );
      expect(result.verified).toBe(true);
      expect(result.contentVerified).toBe(true);
    });

    test("rejects tampered plugin code", async () => {
      const m = signedManifest();
      fs.appendFileSync(files[1], "process.exit(1);\n");
      await expect(
        verifier.verifyPluginSignature(m, m.signature, "me", {
          files,
          baseDir: dir,
        }),
      ).rejects.toThrow("Plugin content digest mismatch");
    });

    test("rejects an added file", async () => {
      const m = signedManifest();
      fs.writeFileSync(path.join(dir, "extra.js"), "1");
      await expect(
        verifier.verifyPluginSignature(m, m.signature, "me", {
          files: [...files, path.join(dir, "extra.js")],
          baseDir: dir,
        }),
      ).rejects.toThrow("Plugin content digest mismatch");
    });

    test("rejects a declared digest when no content is supplied", async () => {
      const m = signedManifest();
      await expect(
        verifier.verifyPluginSignature(m, m.signature, "me"),
      ).rejects.toThrow("no plugin content was supplied");
    });

    test("rejects a forged contentDigest (signature covers it)", async () => {
      const m = signedManifest();
      fs.appendFileSync(files[0], "// evil\n");
      const forged = {
        ...m,
        contentDigest: computeContentDigest({ files, baseDir: dir }),
      };
      await expect(
        verifier.verifyPluginSignature(forged, m.signature, "me", {
          files,
          baseDir: dir,
        }),
      ).rejects.toThrow("Signature verification failed");
    });

    test("requireContentDigest rejects manifests that do not bind code", async () => {
      const strict = new PluginSignatureVerifier({
        auditLogger: noopAudit,
        requireContentDigest: true,
      });
      strict.addTrustedSigner("me", keys.rawHex, "Me");
      await expect(
        strict.verifyPluginSignature(
          manifest,
          sign(strict, manifest, keys.privateKey),
          "me",
          { files, baseDir: dir },
        ),
      ).rejects.toThrow("Manifest has no contentDigest");
    });

    test("rejects files outside the plugin directory", () => {
      expect(() =>
        computeContentDigest({
          files: [path.join(dir, "..", "outside.js")],
          baseDir: dir,
        }),
      ).toThrow("outside the plugin directory");
      expect(() =>
        computeContentDigest({ contents: { "../x.js": "1" } }),
      ).toThrow("not relative");
    });
  });
});

describe("PluginRegistry signature integration (real verifier)", () => {
  let keys;
  let dir;
  let files;
  const impl = {
    metadata: { name: "p", version: "1.0.0", type: "loader" },
    load: () => [],
  };

  beforeEach(() => {
    keys = makeKeys();
    dir = makePluginDir();
    files = [path.join(dir, "index.js")];
  });

  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

  function registry(options = {}) {
    const r = new PluginRegistry({
      verifySignatures: true,
      failClosed: true,
      disableContractWarnings: true,
      ...options,
    });
    r._signatureVerifier.auditLogger = noopAudit;
    r._signatureVerifier.addTrustedSigner("me", keys.rawHex, "Me");
    return r;
  }

  function signed(r) {
    const m = {
      name: "p",
      version: "1.0.0",
      contentDigest: computeContentDigest({ files, baseDir: dir }),
      signerId: "me",
    };
    m.signature = sign(r._signatureVerifier, m, keys.privateKey);
    return m;
  }

  test("registers a plugin whose code matches the signed digest", async () => {
    const r = registry();
    await expect(
      r.register("loader", "p", impl, signed(r), {
        content: { files, baseDir: dir },
      }),
    ).resolves.toBe(r);
  });

  test("refuses a plugin whose code was modified", async () => {
    const r = registry();
    const m = signed(r);
    fs.appendFileSync(files[0], "// changed\n");
    await expect(
      r.register("loader", "p", impl, m, { content: { files, baseDir: dir } }),
    ).rejects.toThrow("Plugin content digest mismatch");
  });

  test("still registers unsigned plugins by default", async () => {
    const r = registry();
    await expect(r.register("loader", "p", impl)).resolves.toBe(r);
  });

  test("requireSignedPlugins rejects plugins without a manifest", async () => {
    const r = registry({ requireSignedPlugins: true });
    await expect(r.register("loader", "p", impl)).rejects.toThrow(
      "has no signed manifest",
    );
  });

  test("requireSignedPlugins has no effect when verification is disabled", async () => {
    const r = new PluginRegistry({
      verifySignatures: false,
      failClosed: false,
      requireSignedPlugins: true,
    });
    await expect(r.register("loader", "p", impl)).resolves.toBe(r);
  });
});

describe("load-plugin-config verifies before import", () => {
  const registry = require("../../../src/core/plugin-registry.js");
  const {
    verifyPluginBeforeImport,
  } = require("../../../src/config/load-plugin-config.js");

  let keys;
  let dir;
  let entry;
  let savedVerifier;
  let savedRequire;

  beforeEach(() => {
    keys = makeKeys();
    dir = makePluginDir();
    entry = path.join(dir, "index.js");
    savedVerifier = registry._signatureVerifier;
    savedRequire = registry._requireSignedPlugins;
    const v = new PluginSignatureVerifier({ auditLogger: noopAudit });
    v.addTrustedSigner("me", keys.rawHex, "Me");
    registry._signatureVerifier = v;
  });

  afterEach(() => {
    registry._signatureVerifier = savedVerifier;
    registry._requireSignedPlugins = savedRequire;
    fs.rmSync(dir, { recursive: true, force: true });
  });

  function writeManifest() {
    const m = {
      name: "p",
      version: "1.0.0",
      files: ["lib/helper.js"],
      contentDigest: computeContentDigest({
        files: [entry, path.join(dir, "lib", "helper.js")],
        baseDir: dir,
      }),
      signerId: "me",
    };
    m.signature = sign(registry._signatureVerifier, m, keys.privateKey);
    fs.writeFileSync(`${entry}.manifest.json`, JSON.stringify(m));
  }

  test("accepts an untampered plugin with a signed manifest", async () => {
    writeManifest();
    await expect(verifyPluginBeforeImport("p", entry)).resolves.toBeUndefined();
  });

  test("rejects a plugin whose extra file was tampered with", async () => {
    writeManifest();
    fs.appendFileSync(path.join(dir, "lib", "helper.js"), "// x\n");
    await expect(verifyPluginBeforeImport("p", entry)).rejects.toThrow(
      "Plugin content digest mismatch",
    );
  });

  test("a missing manifest is only an error with requireSignedPlugins", async () => {
    await expect(verifyPluginBeforeImport("p", entry)).resolves.toBeUndefined();
    registry._requireSignedPlugins = true;
    await expect(verifyPluginBeforeImport("p", entry)).rejects.toThrow(
      "has no signed manifest",
    );
  });

  test("does nothing when verification is disabled", async () => {
    registry._signatureVerifier = new PluginSignatureVerifier({
      enabled: false,
      failClosed: false,
      auditLogger: noopAudit,
    });
    fs.writeFileSync(`${entry}.manifest.json`, "{}");
    await expect(verifyPluginBeforeImport("p", entry)).resolves.toBeUndefined();
  });
});
