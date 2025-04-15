/**
 * Version: 0.1.9
 * Description: Enables dynamic plugin configuration from JSON with validation
 * Author: Ali Kahwaji
 */

import fs from 'fs';
import path from 'path';
import registry from '../core/plugin-registry.js';
import { validatePluginSchema } from './validate-plugin-schema.js';
import { logger } from '../utils/logger.js';

/**
 * Loads plugins from a user-defined JSON file and registers them into the registry.
 *
 * @param {string} configPath - Absolute path to the JSON config file.
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
      try {
        const PluginClass = (await import(absPath)).default;
        if (!PluginClass) {
          throw new Error(`Missing default export in: ${absPath}`);
        }
        registry.register(type, name, new PluginClass());
        logger.info({ type, name }, 'Plugin registered from JSON config');
      } catch (err) {
        logger.error({ err, type, name, absPath }, 'Failed to import plugin from path');
        throw err;
      }
    }
  }
}
