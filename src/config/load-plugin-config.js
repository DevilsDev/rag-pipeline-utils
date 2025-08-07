/**
 * Version: 1.1.1
 * Description: Dynamic plugin loader with direct type:name registry mapping
 * Author: Ali Kahwaji
 */

const fs = require('fs');
const path = require('path');
const { pathToFileURL  } = require('url');
const registry = require('../core/plugin-registry.js');
const { validatePluginSchema  } = require('./validate-schema.js');
const { logger  } = require('../utils/logger.js');

/**
 * Loads plugins from validated config path and registers them.
 * @param {string} configPath
 */
export async function loadPluginsFromJson(configPath) {
  if (!fs.existsSync(configPath)) {
    throw new Error(`Plugin config missing: ${configPath}`);
  }

  const raw = fs.readFileSync(configPath, 'utf-8');
  const config = JSON.parse(raw);

  const validation = validatePluginSchema(config);
  if (!validation.valid) {
    logger.error({ errors: validation.errors }, 'Invalid plugin config');
    throw new Error('Plugin config validation failed');
  }

  for (const [type, namedPlugins] of Object.entries(config)) {
    if (!['loader', 'embedder', 'retriever', 'llm'].includes(type)) continue;

    for (const [name, relPath] of Object.entries(namedPlugins)) {
      const absPath = path.resolve(path.dirname(configPath), relPath);
      const fileUrl = pathToFileURL(absPath).href;

      try {
        const mod = await import(fileUrl);
        const PluginClass = mod?.default;
        if (typeof PluginClass !== 'function') {
          throw new Error(`Invalid export in plugin [${type}:${name}] at ${absPath}`);
        }

        const instance = new PluginClass();
        registry.register(type, name, instance);

        logger.info({ type, name }, `Registered plugin: ${type}:${name}`);
      } catch (err) {
        logger.error({ type, name, err }, `Failed to register plugin [${type}:${name}]`);
        throw err;
      }
    }
  }
}


// Default export

