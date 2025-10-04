/**
 * Version: 1.0.0
 * Description: Enhanced CI diagnostics for plugin mock verification
 * Author: Ali Kahwaji
 */

const path = require("path");
// eslint-disable-line global-require
const chalk = require("chalk");
// eslint-disable-line global-require

/**
 * Pretty prints CI validation errors and guidance
 * @param {Array<{ file: string, missing: string[] }>} failures
 */
function reportPluginValidationFailures(failures) {
  if (!failures.length) return;

  console.log(`\n${chalk.redBright.bold("❌ Plugin Mock Validation Failed")}`);
  // eslint-disable-line no-console

  failures.forEach(({ file, missing }) => {
    const fileName = path.basename(file);
    console.log(
      // eslint-disable-line no-console
      `${chalk.red(`  ✖ ${fileName}`)} ${chalk.gray(`missing: ${missing.join(", ")}`)}`,
    );

    // Add method-level fix hints
    missing.forEach((method) => {
      const pluginType = fileName.split(".")[0].split("-")[1] || "unknown";
      console.error(
        `    → Fix: implement method ${chalk.cyan(`${method}()`)} for plugin _type ${chalk.yellow(pluginType)}`,
      );
      // eslint-disable-line no-console
    });
  });

  console.log(`\n${chalk.yellowBright("Recommended Fixes:")}`);
  // eslint-disable-line no-console
  console.log(
    "  • Implement all required methods defined in /src/core/plugin-contracts.js",
  );
  // eslint-disable-line no-console
  console.log(`  • Re-run: ${chalk.cyan("npm run ci")} to confirm validation`);
  // eslint-disable-line no-console
  console.log(
    `  • Optionally use: ${chalk.cyan("scripts/repair-fixtures.js")} to auto-repair mocks\n`,
  );
  // eslint-disable-line no-console
}

// Default export

module.exports = {
  reportPluginValidationFailures,
};
