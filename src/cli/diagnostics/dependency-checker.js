/**
 * Dependency checker for RAG Pipeline Diagnostics
 * Checks Node.js version, package.json, and npm dependencies
 */

const fs = require("fs/promises");
const path = require("path");

/**
 * Check dependency issues
 * @param {object} _options - Doctor options (unused but kept for consistent interface)
 * @returns {Promise<Array>} Array of dependency issues
 */
async function checkDependencies(_options) {
  const issues = [];

  // Check Node.js version
  const nodeVersion = process.version;
  const majorVersion = parseInt(nodeVersion.slice(1).split(".")[0]);
  if (majorVersion < 18) {
    issues.push({
      category: "dependencies",
      severity: "error",
      code: "NODE_VERSION_INCOMPATIBLE",
      message: `Node.js version ${nodeVersion} is not supported (required: >=18.0.0)`,
      fix: "Upgrade Node.js to version 18.0.0 or higher",
      autoFixable: false,
    });
  }

  // Check package.json
  try {
    await fs.access("package.json");
    const packageContent = await fs.readFile("package.json", "utf8");
    const packageJson = JSON.parse(packageContent);

    if (packageJson.dependencies) {
      for (const [depName, version] of Object.entries(
        packageJson.dependencies,
      )) {
        try {
          await fs.access(path.join("node_modules", depName));
        } catch (error) {
          issues.push({
            category: "dependencies",
            severity: "error",
            code: "NPM_DEPENDENCY_MISSING",
            message: `NPM dependency missing: ${depName}`,
            fix: "Install missing dependencies: npm install",
            autoFixable: true,
          });
        }
      }
    }
  } catch (error) {
    issues.push({
      category: "dependencies",
      severity: "warning",
      code: "PACKAGE_JSON_MISSING",
      message: "package.json not found in current directory",
      fix: "Initialize npm project: npm init",
      autoFixable: false,
    });
  }

  return issues;
}

module.exports = { checkDependencies };
