/**
 * Plugin diagnostics: every custom plugin path under `plugins` exists and
 * loads. Checked locally; no registry is contacted.
 */

const fs = require("fs");
const path = require("path");

async function checkPlugins(options) {
  const configPath = path.resolve(options.configPath);
  let config;
  try {
    config = JSON.parse(fs.readFileSync(configPath, "utf8"));
  } catch {
    return []; // reported by the configuration checker
  }

  const issues = [];
  const configDir = path.dirname(configPath);
  for (const [stage, plugins] of Object.entries(config.plugins || {})) {
    if (!plugins || typeof plugins !== "object") continue;
    for (const [name, modulePath] of Object.entries(plugins)) {
      if (typeof modulePath !== "string") continue;
      const resolved = path.resolve(configDir, modulePath);
      if (!fs.existsSync(resolved)) {
        issues.push({
          category: "plugins",
          severity: "error",
          code: "PLUGIN_MISSING",
          message: `Plugin ${stage}/${name} not found at ${modulePath}`,
          fix: `Create ${modulePath} or fix the path in plugins.${stage}.${name}`,
          autoFixable: false,
        });
        continue;
      }
      try {
        require(resolved);
      } catch (error) {
        issues.push({
          category: "plugins",
          severity: "error",
          code: "PLUGIN_LOAD_FAILED",
          message: `Plugin ${stage}/${name} failed to load: ${error.message}`,
          fix: `Fix the error in ${modulePath}`,
          autoFixable: false,
        });
      }
    }
  }
  return issues;
}

module.exports = { checkPlugins };
