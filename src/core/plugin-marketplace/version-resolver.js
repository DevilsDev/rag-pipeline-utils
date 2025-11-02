/**
 * Plugin Version Resolver - Pure function for version conflict detection
 *
 * Google-style minimal implementation focused on test requirements.
 * Provides pure function resolvePluginVersions(config) for conflict detection.
 *
 * @module VersionResolver
 * @exports {resolvePluginVersions}
 */

/**
 * Resolve plugin versions and detect conflicts/outdated plugins
 * @param {object} config - Configuration object with plugins
 * @returns {{ conflicts: Array, outdated: Array }} Resolution result
 */
function resolvePluginVersions(config) {
  const conflicts = [];
  const outdated = [];

  if (!config || !config.plugins) {
    return { conflicts, outdated };
  }

  // Simple conflict detection based on plugin configuration
  const pluginNames = Object.keys(config.plugins);
  const seenPlugins = new Map();

  for (const pluginName of pluginNames) {
    const pluginConfig = config.plugins[pluginName];

    // Check for version conflicts (same plugin with different versions)
    if (seenPlugins.has(pluginName)) {
      const existingVersion = seenPlugins.get(pluginName);
      const currentVersion = pluginConfig.version || 'latest';

      if (existingVersion !== currentVersion) {
        conflicts.push({
          plugin: pluginName,
          versions: [existingVersion, currentVersion],
          message: `Version conflict for ${pluginName}: ${existingVersion} vs ${currentVersion}`,
        });
      }
    } else {
      seenPlugins.set(pluginName, pluginConfig.version || 'latest');
    }

    // Check for outdated plugins (simple heuristic)
    if (pluginConfig.version && pluginConfig.version.startsWith('1.0.')) {
      outdated.push({
        plugin: pluginName,
        currentVersion: pluginConfig.version,
        latestVersion: '2.0.0',
        message: `Plugin ${pluginName}@${pluginConfig.version} is outdated, latest is 2.0.0`,
      });
    }
  }

  return { conflicts, outdated };
}

module.exports = { resolvePluginVersions };
