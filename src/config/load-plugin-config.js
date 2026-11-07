/**
 * Version: 1.1.1
 * Description: Dynamic plugin loader with direct _type:name registry mapping
 * Author: Ali Kahwaji
 */

const fs = require("fs");
// eslint-disable-line global-require
const path = require("path");
// eslint-disable-line global-require
const { pathToFileURL } = require("url");
// eslint-disable-line global-require
const registry = require("../core/plugin-registry.js");
// eslint-disable-line global-require
const { validatePluginSchema } = require("./validate-schema.js");
// eslint-disable-line global-require
const { logger } = require("../utils/logger.js");
const {
  hasContentDigest,
} = require("../security/plugin-signature-verifier.js");
// eslint-disable-line global-require

/**
 * Decide what verification a plugin file needs. Returns null when nothing is
 * to be checked (verification disabled, or no manifest and unsigned plugins
 * are allowed), otherwise the parsed manifest and the files its
 * contentDigest covers. Throws when a manifest is required but missing.
 */
function describePluginCheck(name, absPath) {
  if (
    typeof registry.isSignatureVerificationEnabled !== "function" ||
    !registry.isSignatureVerificationEnabled()
  ) {
    return null;
  }

  const manifestPath = `${absPath}.manifest.json`;
  if (!fs.existsSync(manifestPath)) {
    if (registry.requiresSignedPlugins()) {
      throw new Error(
        `Plugin ${name} has no signed manifest (${manifestPath}) and requireSignedPlugins is enabled`,
      );
    }
    return { unsigned: true };
  }

  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));
  const baseDir = path.dirname(absPath);
  const extraFiles = Array.isArray(manifest.files) ? manifest.files : [];
  return {
    manifest,
    content: {
      baseDir,
      files: [absPath, ...extraFiles.map((f) => path.resolve(baseDir, f))],
    },
  };
}

/**
 * Verify a plugin file against its signed manifest BEFORE it is imported
 * (importing runs the plugin's code).
 *
 * The manifest is read from `<plugin file>.manifest.json`. Its
 * `contentDigest` (if any) must cover the plugin file plus any extra files
 * listed in `manifest.files` (paths relative to the plugin file's
 * directory). Nothing is checked when the registry's signature verification
 * is disabled; when it is enabled and the registry was created with
 * `requireSignedPlugins: true`, a missing manifest is an error.
 *
 * @param {string} name - Plugin name
 * @param {string} absPath - Absolute path of the plugin entry file
 * @returns {Promise<void>}
 */
async function verifyPluginBeforeImport(name, absPath) {
  const check = describePluginCheck(name, absPath);
  if (!check) return;
  if (check.unsigned) {
    warnUnsigned(name, absPath);
    return;
  }
  await registry.verifyPluginContent(name, check.manifest, check.content);
  if (!hasContentDigest(check.manifest)) {
    warnNoContentDigest(name, absPath);
  }
}

const warned = new Set();

/** Emit a process warning once per process for each plugin file and code. */
function warnOnce(code, absPath, message) {
  const key = `${code}:${absPath}`;
  if (warned.has(key)) return;
  warned.add(key);
  process.emitWarning(message, { code });
}

function warnUnsigned(name, absPath) {
  warnOnce(
    "RAG_PLUGIN_UNSIGNED",
    absPath,
    `Plugin "${name}" has no signed manifest; loading it unverified (${absPath})`,
  );
}

function warnNoContentDigest(name, absPath) {
  warnOnce(
    "RAG_PLUGIN_NO_CONTENT_DIGEST",
    absPath,
    `Plugin "${name}" has a signed manifest without a contentDigest, so the signature does not cover the plugin code (${absPath}). Add a contentDigest to the manifest and sign it again.`,
  );
}

/**
 * Synchronous form of verifyPluginBeforeImport for loaders that `require`
 * the plugin. Same policy: nothing happens while the registry's signature
 * verification is disabled; otherwise a plugin with a manifest must have a
 * valid signature from a trusted signer and matching content, and a plugin
 * without one loads with a one-time warning unless the registry requires
 * signed plugins. Every check completes before any plugin code runs.
 *
 * @param {string} name - Plugin name
 * @param {string} absPath - Absolute path of the file that will be loaded
 * @returns {void}
 * @throws {Error} When the plugin must not be loaded
 */
function verifyPluginBeforeLoad(name, absPath) {
  let check;
  try {
    check = describePluginCheck(name, absPath);
    if (!check) return;
    if (check.unsigned) {
      warnUnsigned(name, absPath);
      return;
    }
    registry
      .getSignatureVerifier()
      .verifyManifestSync(
        check.manifest,
        check.manifest.signature,
        check.manifest.signerId,
        check.content,
      );
    if (!hasContentDigest(check.manifest)) {
      warnNoContentDigest(name, absPath);
    }
  } catch (err) {
    emitAudit(
      "plugin_verification_failed",
      name,
      check && check.manifest,
      false,
      err.message,
    );
    throw new Error(
      `Plugin "${name}" was not loaded: ${err.message} (${absPath})`,
    );
  }
  emitAudit("plugin_verified", name, check.manifest, true);
}

function emitAudit(action, name, manifest, verified, error) {
  registry.recordAuditEntry(action, {
    pluginName: name,
    signerId: (manifest && manifest.signerId) || "unknown",
    version: (manifest && manifest.version) || "unknown",
    verified,
    ...(error && { error }),
    timestamp: new Date().toISOString(),
  });
}

/**
 * Loads plugins from validated _config path and registers them.
 * @param {string} configPath
 */
async function loadPluginsFromJson(configPath) {
  if (!fs.existsSync(configPath)) {
    throw new Error(`Plugin _config missing: ${configPath}`);
  }

  const raw = fs.readFileSync(configPath, "utf-8");
  const _config = JSON.parse(raw);

  const validation = validatePluginSchema(_config);
  if (!validation.valid) {
    logger.error({ errors: validation.errors }, "Invalid plugin _config");
    throw new Error("Plugin _config validation failed");
  }

  for (const [_type, namedPlugins] of Object.entries(_config)) {
    if (!["loader", "embedder", "retriever", "llm"].includes(_type)) continue;

    for (const [name, relPath] of Object.entries(namedPlugins)) {
      const absPath = path.resolve(path.dirname(configPath), relPath);
      const fileUrl = pathToFileURL(absPath).href;

      try {
        await verifyPluginBeforeImport(name, absPath);
        const mod = await import(fileUrl);
        const PluginClass = mod?.default;
        if (typeof PluginClass !== "function") {
          throw new Error(
            `Invalid export in plugin [${_type}:${name}] at ${absPath}`,
          );
        }

        const _instance = new PluginClass();
        // register() is async; await it so failures are not unhandled
        await registry.register(_type, name, _instance);

        logger.info({ _type, name }, `Registered plugin: ${_type}:${name}`);
      } catch (err) {
        logger.error(
          { _type, name, err },
          `Failed to register plugin [${_type}:${name}]`,
        );
        throw err;
      }
    }
  }
}

module.exports = {
  loadPluginsFromJson,
  verifyPluginBeforeImport,
  verifyPluginBeforeLoad,
};
