/**
 * Version: 1.0.0
 * Description: Enhanced CI diagnostics for plugin mock verification
 * Author: Ali Kahwaji
 */

import path from 'path';
import chalk from 'chalk';

/**
 * Pretty prints CI validation errors and guidance
 * @param {Array<{ file: string, missing: string[] }>} failures
 */
export function reportPluginValidationFailures(failures) {
  if (!failures.length) return;

  console.log(`\n${chalk.redBright.bold('❌ Plugin Mock Validation Failed')}`);

  failures.forEach(({ file, missing }) => {
    const fileName = path.basename(file);
    console.log(
      `${chalk.red(`  ✖ ${fileName}`)} ${chalk.gray(`missing: ${missing.join(', ')}`)}`
    );

    // Add method-level fix hints
    missing.forEach(method => {
      const pluginType = fileName.split('.')[0].split('-')[1] || 'unknown';
      console.error(`    → Fix: implement method ${chalk.cyan(`${method}()`)} for plugin type ${chalk.yellow(pluginType)}`);
    });
  });

  console.log(`\n${chalk.yellowBright('Recommended Fixes:')}`);
  console.log('  • Implement all required methods defined in /src/core/plugin-contracts.js');
  console.log(`  • Re-run: ${chalk.cyan('npm run ci')} to confirm validation`);
  console.log(`  • Optionally use: ${chalk.cyan('scripts/repair-fixtures.js')} to auto-repair mocks\n`);
}
