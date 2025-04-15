/**
 * Version: 1.0.0
 * Description: Enables dynamic plugin configuration from JSON with validation
 * Author: Ali Kahwaji
 */

import fs from 'fs';
import path from 'path';
import { pathToFileURL } from 'url';
import registry from '../core/plugin-registry.js';
import { validatePluginSchema } from './validate-plugin-schema.js';
import { logger } from '../utils/logger.js';

/**
 * Dynamically loads plugins from JSON and registers them in the registry.
 * @param {string} configPath - Absolute path to JSON config
 */
export async function loadPluginsFromJson(configPath) {
  if (!fs.existsSync(configPath)) {
    logger.warn({ configPath }, 'Plugin config file not found');
    return;
  }

  const content = fs.readFileSync(configPath, 'utf-8');
  let pluginConfig;

  try {
    pluginConfig = JSON.parse(content);
  } catch (err) {
    logger.error({ err }, 'Invalid JSON in plugin config');
    throw new Error('Failed to parse plugin config JSON');
  }

  const validation = validatePluginSchema(pluginConfig);
  if (!validation.valid) {
    logger.error({ errors: validation.errors }, 'Invalid plugin config schema');
    throw new Error('Plugin config validation failed');
  }

  for (const [type, plugins] of Object.entries(pluginConfig)) {
    for (const [name, modulePath] of Object.entries(plugins)) {
      const absPath = path.resolve(modulePath);
      const fileUrl = pathToFileURL(absPath).href;

      try {
        const module = await import(fileUrl);
        const PluginClass = module?.default;

        if (typeof PluginClass !== 'function') {
          throw new TypeError(`Plugin ${name} must export a class as default`);
        }

        const instance = new PluginClass();
        console.log(`[DEBUG] Loading plugin: ${type}:${name} from ${absPath}`);
        registry.register(type, name, instance);
        console.log(`[DEBUG] Successfully registered: ${type}:${name}`);
        logger.info({ type, name }, 'Plugin registered from JSON config');
      } catch (err) {
        logger.error({ err, type, name, absPath }, 'Failed to import plugin from path');
        throw err;
      }
    }
  }
}
