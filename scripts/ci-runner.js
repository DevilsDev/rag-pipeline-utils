#!/usr/bin/env node

/**
const path = require('path');
 * CI Pipeline Runner
 * Version: 2.0.0
 * Description: Orchestrates linting, mock validation, and testing with enhanced logging and dry-run support
 * Author: Ali Kahwaji
 */

import path from "path";
import { fileURLToPath } from "url";
import { setupCLI, dryRunWrapper } from "./utils/cli.js";
import { withRetry } from "./utils/retry.js";
import { sh } from "./lib/sh.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..");

// Setup CLI
const { args, logger } = setupCLI(
  "ci-runner.js",
  "Run CI pipeline with linting, validation, and testing",
  {
    "--skip-lint": "Skip ESLint checks",
    "--skip-tests": "Skip Jest tests",
    "--skip-validation": "Skip mock validation",
    "--coverage": "Run tests with coverage reporting",
  },
);

const resolveScript = (scriptPath) => path.resolve(__dirname, scriptPath);

const run = async (label, command) => {
  return await dryRunWrapper(args.dryRun, `Execute: ${label}`, async () => {
    return await withRetry(
      () => {
        logger.progress(`Running: ${label}`);
        // Parse npm commands to use sh() properly
        if (command.startsWith("npm ")) {
          const npmArgs = command.split(" ").slice(1);
          sh("npm", npmArgs, { cwd: ROOT });
        } else {
          // For other commands, split by space
          const [cmd, ...cmdArgs] = command.split(" ");
          sh(cmd, cmdArgs, { cwd: ROOT });
        }
        logger.success(`${label} passed`);
      },
      {
        maxAttempts: 1, // CI tasks shouldn't retry by default
        operation: label,
      },
    );
  });
};

const runDynamicModule = async (label, modulePath) => {
  return await dryRunWrapper(args.dryRun, `Validate: ${label}`, async () => {
    return await withRetry(
      async () => {
        logger.progress(`Validating: ${label}`);
        const mod = await import(resolveScript(modulePath));
        if (typeof mod.default === "function") {
          await mod.default();
        }
        logger.success(`${label} passed`);
      },
      {
        maxAttempts: 1,
        operation: label,
      },
    );
  });
};

/**
 * Main CI pipeline execution
 */
async function main() {
  try {
    logger.info("🚀 Starting CI Pipeline");
    logger.info("====================");

    const tasks = [];

    // 1. Lint (unless skipped)
    if (!args.skipLint) {
      tasks.push(["ESLint", "npm run lint"]);
    } else {
      logger.info("⏭️ Skipping ESLint (--skip-lint flag)");
    }

    // 2. Mock validation (unless skipped)
    if (!args.skipValidation) {
      tasks.push([
        "Mock Interface Validation",
        null,
        "verify-fixture-mocks.js",
      ]);
    } else {
      logger.info("⏭️ Skipping mock validation (--skip-validation flag)");
    }

    // 3. Tests (unless skipped)
    if (!args.skipTests) {
      const testCommand =
        args.coverage || process.env.CI_COVERAGE === "true"
          ? "npm run test:coverage"
          : "npm test";
      tasks.push(["Jest Tests", testCommand]);
    } else {
      logger.info("⏭️ Skipping tests (--skip-tests flag)");
    }

    // Execute tasks
    for (const [label, command, modulePath] of tasks) {
      if (modulePath) {
        await runDynamicModule(label, modulePath);
      } else {
        await run(label, command);
      }
    }

    logger.success("🎉 CI Pipeline completed successfully!");
    logger.success("All checks passed ✅");
  } catch (error) {
    logger.error(`CI Pipeline failed: ${error.message}`);
    if (args.verbose) {
      logger.error(error.stack);
    }
    process.exit(1);
  }
}

// Execute if run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
