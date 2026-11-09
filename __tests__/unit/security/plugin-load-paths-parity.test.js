/**
 * The synchronous (require) and asynchronous (import) pre-load checks apply
 * the same policy: same outcome, same reason, same warning codes.
 */

const crypto = require("crypto");
const fs = require("fs");
const os = require("os");
const path = require("path");

const {
  PluginSignatureVerifier,
  computeContentDigest,
} = require("../../../src/security/plugin-signature-verifier.js");
const registry = require("../../../src/core/plugin-registry.js");
const {
  verifyPluginBeforeLoad,
  verifyPluginBeforeImport,
} = require("../../../src/config/load-plugin-config.js");

const SOURCE = "module.exports = class {};\n";

const CASES = [
  { name: "valid signed with digest", accepted: true, codes: [] },
  {
    name: "valid signed without digest",
    manifest: { noDigest: true },
    accepted: true,
    codes: ["RAG_PLUGIN_NO_CONTENT_DIGEST"],
  },
  {
    name: "contentDigest null",
    manifest: { digest: null },
    accepted: true,
    codes: ["RAG_PLUGIN_NO_CONTENT_DIGEST"],
  },
  {
    name: "contentDigest null with requireContentDigest",
    manifest: { digest: null },
    requireDigest: true,
    accepted: false,
    reason: /no contentDigest/i,
  },
  {
    name: "missing contentDigest with requireContentDigest",
    manifest: { noDigest: true },
    requireDigest: true,
    accepted: false,
    reason: /no contentDigest/i,
  },
  {
    name: "bad signature",
    manifest: { badSignature: true },
    accepted: false,
    reason: /signature verification failed/i,
  },
  {
    name: "untrusted signer",
    manifest: { signerId: "stranger" },
    accepted: false,
    reason: /untrusted signer/i,
  },
  {
    name: "tampered content",
    tamper: true,
    accepted: false,
    reason: /digest mismatch/i,
  },
  {
    name: "bad digest prefix",
    manifest: { digest: "md5-abc" },
    accepted: false,
    reason: /Invalid contentDigest/i,
  },
  {
    name: "missing signature",
    manifest: { noSignature: true },
    accepted: false,
    reason: /signature/i,
  },
  {
    name: "unsigned plugin",
    unsigned: true,
    accepted: true,
    codes: ["RAG_PLUGIN_UNSIGNED"],
  },
  {
    name: "unsigned plugin with requireSignedPlugins",
    unsigned: true,
    requireSigned: true,
    accepted: false,
    reason: /no signed manifest/i,
  },
];

describe("sync and async pre-load checks agree", () => {
  const dirs = [];
  let warn;

  beforeEach(() => {
    warn = jest.spyOn(process, "emitWarning").mockImplementation(() => {});
  });
  afterEach(() => {
    warn.mockRestore();
    while (dirs.length) {
      fs.rmSync(dirs.pop(), { recursive: true, force: true });
    }
  });

  function install(testCase) {
    const verifier = new PluginSignatureVerifier({
      enabled: true,
      failClosed: true,
      auditLogger: () => {},
      requireContentDigest: testCase.requireDigest === true,
    });
    const { publicKey, privateKey } = crypto.generateKeyPairSync("ed25519");
    verifier.addTrustedSigner(
      "me",
      Buffer.from(publicKey.export({ format: "jwk" }).x, "base64url").toString(
        "hex",
      ),
      "Me",
    );
    registry._signatureVerifier = verifier;
    registry._requireSignedPlugins = testCase.requireSigned === true;
    return { verifier, privateKey };
  }

  // Each path gets its own plugin file: warnings are once per file.
  function writePlugin(testCase, keys) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "plugin-parity-"));
    dirs.push(dir);
    const file = path.join(dir, "plugin.js");
    fs.writeFileSync(file, SOURCE);
    if (testCase.unsigned) return file;

    const opts = testCase.manifest || {};
    const manifest = { name: "p", version: "1.0.0", type: "llm" };
    if (!opts.noDigest) {
      manifest.contentDigest =
        "digest" in opts
          ? opts.digest
          : computeContentDigest({ files: [file], baseDir: dir });
    }
    let signature = crypto
      .sign(null, keys.verifier.getSigningPayload(manifest), keys.privateKey)
      .toString("base64");
    if (opts.badSignature) signature = Buffer.alloc(64, 1).toString("base64");
    if (!opts.noSignature) manifest.signature = signature;
    manifest.signerId = opts.signerId || "me";
    fs.writeFileSync(`${file}.manifest.json`, JSON.stringify(manifest));
    if (testCase.tamper) fs.appendFileSync(file, "// edited\n");
    return file;
  }

  async function run(testCase, mode) {
    warn.mockClear();
    const keys = install(testCase);
    const file = writePlugin(testCase, keys);
    let error = null;
    try {
      if (mode === "sync") verifyPluginBeforeLoad("mine", file);
      else await verifyPluginBeforeImport("mine", file);
    } catch (err) {
      error = err;
    }
    const codes = warn.mock.calls
      .map((call) => call[1] && call[1].code)
      .filter(Boolean);
    return { error, codes };
  }

  test.each(CASES)("$name", async (testCase) => {
    const sync = await run(testCase, "sync");
    const async_ = await run(testCase, "async");

    for (const result of [sync, async_]) {
      if (testCase.accepted) {
        expect(result.error).toBeNull();
        expect(result.codes).toEqual(testCase.codes);
      } else {
        expect(result.error).not.toBeNull();
        expect(result.error.message).toMatch(testCase.reason);
        expect(result.codes).toEqual([]);
      }
    }
    expect(sync.codes).toEqual(async_.codes);
  });
});
