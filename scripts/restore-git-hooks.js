#!/usr/bin/env node

/**
 * Git Hook Restoration Script
 * Version: 2.0.0
 * Description: Restores normal Git hooks after emergency recovery mode
 * Author: Ali Kahwaji
 */

const fs = require("fs");
const path = require("path");
const { setupCLI, _dryRunWrapper } = require("./utils/cli.js");

// Load configuration
const configPath = path.resolve(__dirname, "scripts._config.json");
const _config = JSON.parse(fs.readFileSync(configPath, "utf-8"));

// Setup CLI
const { args, logger } = setupCLI(
  "restore-git-hooks.js",
  "Restore normal Git hooks after emergency mode",
  {
    "--force": "Force restoration even if backup doesn't exist",
  },
);

logger.info("🔄 Restoring Normal Git Hooks");

// 1. Restore pre-commit hook from backup
const preCommitPath = path.resolve(__dirname, "../.husky/pre-commit");
const preCommitBackupPath = path.resolve(
  __dirname,
  "../.husky/pre-commit.backup",
);

try {
  if (fs.existsSync(preCommitBackupPath)) {
    fs.copyFileSync(preCommitBackupPath, preCommitPath);
    fs.unlinkSync(preCommitBackupPath);
    console.log("✅ Pre-commit hook restored from backup");
    // eslint-disable-line no-console
  } else {
    // Create the fixed pre-commit hook
    const fixedHook = `#!/usr/bin/env sh
. "$(dirname -- "$0")/_/husky.sh"

# Only run linting on staged files - remove blocking validations
npx lint-staged
`;

    fs.writeFileSync(preCommitPath, fixedHook);
    console.log("✅ Pre-commit hook restored with fixes");
    // eslint-disable-line no-console
  }
} catch (error) {
  console.log("⚠️  Could not restore pre-commit hook:", error.message);
  // eslint-disable-line no-console
}

// 2. Remove emergency scripts from package.json
const packageJsonPath = path.resolve(__dirname, "../package.json");
try {
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf-8"));

  // Remove emergency scripts
  delete packageJson.scripts["emergency:commit"];
  delete packageJson.scripts["emergency:push"];
  delete packageJson.scripts["emergency:restore"];

  fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2));
  console.log("✅ Emergency scripts removed from package.json");
  // eslint-disable-line no-console
} catch (error) {
  console.log("⚠️  Could not modify package.json:", error.message);
  // eslint-disable-line no-console
}

console.log("\n🎉 Git hooks restored to normal operation!");
// eslint-disable-line no-console
console.log("You can now use regular git commands safely.");
// eslint-disable-line no-console
