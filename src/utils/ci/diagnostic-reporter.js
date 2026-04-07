/**
 * Version: 1.0.0
 * Description: Enhanced CI diagnostics for plugin mock verification
 * Author: Ali Kahwaji
 */

const path = require('path');
// eslint-disable-line global-require
const chalk = require('chalk');
// eslint-disable-line global-require
const { logger } = require('../logger');

/**
 * Pretty prints CI validation errors and guidance
 * @param {Array<{ file: string, missing: string[] }>} failures
 */
function reportPluginValidationFailures(failures) {
  if (!failures.length) return;

  logger.info(`\n${chalk.redBright.bold('Plugin Mock Validation Failed')}`);

  failures.forEach(({ file, missing }) => {
    const fileName = path.basename(file);
    logger.info(
      `${chalk.red(`  ${fileName}`)} ${chalk.gray(`missing: ${missing.join(', ')}`)}`,
    );

    // Add method-level fix hints
    missing.forEach((method) => {
      const pluginType = fileName.split('.')[0].split('-')[1] || 'unknown';
      logger.error(
        `    Fix: implement method ${chalk.cyan(`${method}()`)} for plugin _type ${chalk.yellow(pluginType)}`,
      );
    });
  });

  logger.info(`\n${chalk.yellowBright('Recommended Fixes:')}`);
  logger.info(
    '  Implement all required methods defined in /src/core/plugin-contracts.js',
  );
  logger.info(`  Re-run: ${chalk.cyan('npm run ci')} to confirm validation`);
  logger.info(
    `  Optionally use: ${chalk.cyan('scripts/repair-fixtures.js')} to auto-repair mocks\n`,
  );
}

// Default export

module.exports = {
  reportPluginValidationFailures,
};
