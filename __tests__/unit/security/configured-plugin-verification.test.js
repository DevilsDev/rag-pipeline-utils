/**
 * Plugins named under `plugins.<stage>.<name>` in .ragrc.json are checked
 * against their signed manifest before their code is loaded, whenever the
 * shared plugin registry has signature verification enabled.
 */

const crypto = require("crypto");
const fs = require("fs");
const os = require("os");
const path = require("path");

const PLUGIN_SOURCE = (marker) =>
  `require("fs").writeFileSync(${JSON.stringify(marker)}, "loaded");\n` +
  "module.exports = class { async generate(q) { return q; } };\n";

function setup({
  enabled = true,
  requireSigned = false,
  requireDigest = false,
} = {}) {
  const registry = require("../../../src/core/plugin-registry.js");
  const {
    PluginSignatureVerifier,
  } = require("../../../src/security/plugin-signature-verifier.js");
  const verifier = new PluginSignatureVerifier({
    enabled,
    failClosed: true,
    requireContentDigest: requireDigest,
    auditLogger: () => {},
  });
  const { publicKey, privateKey } = crypto.generateKeyPairSync("ed25519");
  const rawHex = Buffer.from(
    publicKey.export({ format: "jwk" }).x,
    "base64url",
  ).toString("hex");
  verifier.addTrustedSigner("me", rawHex, "Me");
  registry._signatureVerifier = verifier;
  registry._requireSignedPlugins = requireSigned;
  return { verifier, privateKey };
}

describe("configured plugins are verified before loading", () => {
  let dir;
  let marker;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "cfg-plugin-verify-"));
    marker = path.join(dir, "marker.txt");
  });
  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

  function writePlugin({
    signed,
    verifier,
    privateKey,
    extra = {},
    noDigest = false,
  }) {
    const {
      computeContentDigest,
    } = require("../../../src/security/plugin-signature-verifier.js");
    const file = path.join(dir, "plugin.js");
    fs.writeFileSync(file, PLUGIN_SOURCE(marker));
    if (signed) {
      const manifest = {
        name: "p",
        version: "1.0.0",
        type: "llm",
        contentDigest: computeContentDigest({ files: [file], baseDir: dir }),
        ...extra,
      };
      if (noDigest) delete manifest.contentDigest;
      manifest.signature = crypto
        .sign(null, verifier.getSigningPayload(manifest), privateKey)
        .toString("base64");
      manifest.signerId = "me";
      fs.writeFileSync(`${file}.manifest.json`, JSON.stringify(manifest));
    }
    return file;
  }

  const build = (modulePath = "./plugin.js") =>
    require("../../../src/config/component-factory.js").buildComponents(
      {
        pipeline: [{ stage: "llm", name: "mine" }],
        plugins: { llm: { mine: modulePath } },
      },
      { configDir: dir },
    );

  test("loads a plugin whose manifest and content verify", () => {
    const keys = setup();
    writePlugin({ signed: true, ...keys });

    const components = build();

    expect(typeof components.llm.generate).toBe("function");
    expect(fs.existsSync(marker)).toBe(true);
  });

  function signWithHelper(keys) {
    const {
      computeContentDigest,
    } = require("../../../src/security/plugin-signature-verifier.js");
    const file = writePlugin({ signed: false });
    const helper = path.join(dir, "helper.txt");
    fs.writeFileSync(helper, "data");
    const manifest = {
      name: "p",
      version: "1.0.0",
      type: "llm",
      files: ["helper.txt"],
      contentDigest: computeContentDigest({
        files: [file, helper],
        baseDir: dir,
      }),
    };
    manifest.signature = crypto
      .sign(null, keys.verifier.getSigningPayload(manifest), keys.privateKey)
      .toString("base64");
    manifest.signerId = "me";
    fs.writeFileSync(`${file}.manifest.json`, JSON.stringify(manifest));
    return helper;
  }

  test("covers files listed in the manifest", () => {
    signWithHelper(setup());

    expect(() => build()).not.toThrow();
    expect(fs.existsSync(marker)).toBe(true);
  });

  test("refuses a changed file listed in the manifest", () => {
    const helper = signWithHelper(setup());
    fs.writeFileSync(helper, "changed");

    expect(() => build()).toThrow(/mine/);
    expect(fs.existsSync(marker)).toBe(false);
  });

  test("refuses changed plugin code and names the plugin, without running it", () => {
    const keys = setup();
    const file = writePlugin({ signed: true, ...keys });
    fs.appendFileSync(file, "// edited after signing\n");

    expect(() => build()).toThrow(/mine/);
    expect(() => build()).toThrow(/digest|verif/i);
    expect(fs.existsSync(marker)).toBe(false);
  });

  test("refuses a manifest signed by an unknown signer", () => {
    const keys = setup();
    const file = writePlugin({ signed: true, ...keys });
    const manifest = JSON.parse(fs.readFileSync(`${file}.manifest.json`));
    manifest.signerId = "someone-else";
    fs.writeFileSync(`${file}.manifest.json`, JSON.stringify(manifest));

    expect(() => build()).toThrow(/mine/);
    expect(fs.existsSync(marker)).toBe(false);
  });

  test("verifies the file that is actually loaded for an extension-less path", () => {
    const keys = setup();
    const file = writePlugin({ signed: true, ...keys });
    fs.appendFileSync(file, "// edited after signing\n");

    expect(() => build("./plugin")).toThrow(/mine/);
    expect(fs.existsSync(marker)).toBe(false);
  });

  test("loads an unsigned plugin and warns once with a stable code", () => {
    setup();
    writePlugin({ signed: false });
    const warn = jest
      .spyOn(process, "emitWarning")
      .mockImplementation(() => {});

    build();
    build();

    expect(fs.existsSync(marker)).toBe(true);
    const unsigned = warn.mock.calls.filter(
      (call) => call[1] && call[1].code === "RAG_PLUGIN_UNSIGNED",
    );
    expect(unsigned).toHaveLength(1);
    expect(unsigned[0][0]).toMatch(/mine/);
    warn.mockRestore();
  });

  test("accepts a signed manifest without contentDigest and warns once", () => {
    const keys = setup();
    writePlugin({ signed: true, noDigest: true, ...keys });
    const warn = jest
      .spyOn(process, "emitWarning")
      .mockImplementation(() => {});

    build();
    build();

    expect(fs.existsSync(marker)).toBe(true);
    const calls = warn.mock.calls.filter(
      (call) => call[1] && call[1].code === "RAG_PLUGIN_NO_CONTENT_DIGEST",
    );
    expect(calls).toHaveLength(1);
    expect(calls[0][0]).toMatch(/mine.*does not cover the plugin code/);
    warn.mockRestore();
  });

  test("refuses a manifest without contentDigest when a digest is required", () => {
    const keys = setup({ requireDigest: true });
    writePlugin({ signed: true, noDigest: true, ...keys });

    expect(() => build()).toThrow(/mine.*contentDigest/);
    expect(fs.existsSync(marker)).toBe(false);
  });

  test("does not warn about contentDigest when the manifest has one", () => {
    const keys = setup();
    writePlugin({ signed: true, ...keys });
    const warn = jest
      .spyOn(process, "emitWarning")
      .mockImplementation(() => {});

    build();

    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  test("refuses an unsigned plugin when signed plugins are required", () => {
    setup({ requireSigned: true });
    writePlugin({ signed: false });

    expect(() => build()).toThrow(/mine.*signed|signed.*mine/i);
    expect(fs.existsSync(marker)).toBe(false);
  });

  test("changes nothing when signature verification is disabled", () => {
    setup({ enabled: false });
    const file = writePlugin({ signed: false });
    fs.writeFileSync(`${file}.manifest.json`, "not json");

    expect(() => build()).not.toThrow();
    expect(fs.existsSync(marker)).toBe(true);
  });
});
