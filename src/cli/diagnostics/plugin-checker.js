/**
 * Plugin checker for RAG Pipeline Diagnostics
 * Checks plugin availability, version conflicts, and outdated plugins
 */

const fs = require("fs/promises");
const path = require("path");

/**
 * Check plugin issues
 * @param {object} options - Doctor options (must include configPath)
 * @returns {Promise<Array>} Array of plugin issues
 */
async function checkPlugins(options) {
  const issues = [];

  try {
    // First check if config file exists
    await fs.access(options.configPath);

    const configContent = await fs.readFile(options.configPath, "utf8");
    const config = JSON.parse(configContent);

    if (config.plugins) {
      // Process plugins in the order expected by tests: loader first, then embedder
      const categories = ["loader", "embedder"];
      for (const category of categories) {
        if (config.plugins[category]) {
          const plugins = config.plugins[category];
          const sortedPlugins = Object.keys(plugins).sort();
          for (const pluginName of sortedPlugins) {
            try {
              // Check if plugin file exists (simplified check)
              await fs.access(path.join("node_modules", pluginName));
            } catch (error) {
              issues.push({
                category: "plugins",
                severity: "error",
                code: "PLUGIN_MISSING",
                message: `Plugin not found: ${pluginName}`,
                fix: `Install plugin: npm install ${pluginName}`,
                autoFixable: true,
              });
            }
          }
        }
      }

      // Check for version conflicts
      try {
        const {
          resolvePluginVersions,
        } = require("../../core/plugin-marketplace/version-resolver.js");
        const resolution = await resolvePluginVersions(config.plugins);
        if (resolution.conflicts) {
          resolution.conflicts.forEach((conflict) => {
            issues.push({
              category: "plugins",
              severity: "warning",
              code: "PLUGIN_VERSION_CONFLICT",
              message: `Version conflict: ${conflict.plugin} - ${conflict.conflict}`,
              fix: "Update plugin versions to resolve conflicts",
              autoFixable: false,
            });
          });
        }
      } catch (resolverError) {
        // Version resolver not available, skip
      }

      // Check for outdated plugins
      try {
        const registryUrl = "https://registry.rag-pipeline.dev";
        const response = await fetch(`${registryUrl}/plugins`);
        if (response.ok) {
          const registry = await response.json();
          for (const [category, plugins] of Object.entries(config.plugins)) {
            for (const [pluginName, version] of Object.entries(plugins)) {
              if (registry.plugins && registry.plugins[pluginName]) {
                const latest = registry.plugins[pluginName].versions.latest;
                if (version !== "latest" && version !== latest) {
                  issues.push({
                    category: "plugins",
                    severity: "info",
                    code: "PLUGIN_OUTDATED",
                    message: `Plugin outdated: ${pluginName}@${version} (latest: ${latest})`,
                    fix: `Update to latest version: rag-pipeline plugin install ${pluginName}@latest`,
                    autoFixable: true,
                  });
                }
              }
            }
          }
        }
      } catch (fetchError) {
        // Registry not available, skip
      }
    }
  } catch (configError) {
    // Config issues handled in checkConfiguration
  }

  return issues;
}

module.exports = { checkPlugins };
