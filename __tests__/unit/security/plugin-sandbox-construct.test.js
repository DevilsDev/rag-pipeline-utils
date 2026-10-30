"use strict";

const { PluginSandbox } = require("../../../src/security/plugin-sandbox");
const {
  PluginSignatureVerifier,
} = require("../../../src/security/plugin-signature-verifier");

describe("PluginSandbox", () => {
  test("constructs (3.0.0 threw 'PluginSignatureVerifier is not a constructor')", () => {
    const sandbox = new PluginSandbox();
    expect(sandbox.signatureVerifier).toBeInstanceOf(PluginSignatureVerifier);
  });
});
