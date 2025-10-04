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
        const mod = await import(fileUrl);
        const PluginClass = mod?.default;
        if (typeof PluginClass !== "function") {
          throw new Error(
            `Invalid export in plugin [${_type}:${name}] at ${absPath}`,
          );
        }

        const _instance = new PluginClass();
        registry.register(_type, name, _instance);

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

module.exports = { loadPluginsFromJson };
