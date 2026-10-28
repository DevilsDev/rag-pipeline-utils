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
// eslint-disable-line global-require

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
  if (
    typeof registry.isSignatureVerificationEnabled !== "function" ||
    !registry.isSignatureVerificationEnabled()
  ) {
    return;
  }

  const manifestPath = `${absPath}.manifest.json`;
  if (!fs.existsSync(manifestPath)) {
    if (registry.requiresSignedPlugins()) {
      throw new Error(
        `Plugin ${name} has no signed manifest (${manifestPath}) and requireSignedPlugins is enabled`,
      );
    }
    return;
  }

  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));
  const baseDir = path.dirname(absPath);
  const extraFiles = Array.isArray(manifest.files) ? manifest.files : [];
  await registry.verifyPluginContent(name, manifest, {
    baseDir,
    files: [absPath, ...extraFiles.map((f) => path.resolve(baseDir, f))],
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

module.exports = { loadPluginsFromJson, verifyPluginBeforeImport };
