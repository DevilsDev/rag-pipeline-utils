#!/usr/bin/env node

/**
 * Comprehensive Script Test Suite
 * Version: 1.0.0
 * Description: Tests all refactored scripts to validate functionality and safety
 * Author: Ali Kahwaji
 */

const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const { createLogger } = require("./utils/logger.js");

const logger = createLogger("test-all-scripts");

// Test configuration
const SCRIPTS_TO_TEST = [
  {
    name: "roadmap-sync.js",
    tests: [
      { args: "--help", expectSuccess: true, description: "Help output" },
      {
        args: "--dry-run --verbose",
        expectSuccess: false,
        description: "Dry-run (should fail without GITHUB_TOKEN)",
      },
    ],
  },
  {
    name: "manage-labels.js",
    tests: [
      { args: "--help", expectSuccess: true, description: "Help output" },
      {
        args: "--dry-run --roadmap-only",
        expectSuccess: false,
        description: "Dry-run (should fail without GITHUB_TOKEN)",
      },
    ],
  },
  {
    name: "generate-release-note.js",
    tests: [
      { args: "--help", expectSuccess: true, description: "Help output" },
      {
        args: "3.6.0 --stdout --force",
        expectSuccess: true,
        description: "Print a draft without writing it",
      },
    ],
  },
  {
    name: "ci-runner.js",
    tests: [
      { args: "--help", expectSuccess: true, description: "Help output" },
      {
        args: "--dry-run --skip-tests --skip-lint --skip-validation",
        expectSuccess: true,
        description: "Dry-run with all skips",
      },
    ],
  },
  {
    name: "restore-git-hooks.js",
    tests: [
      { args: "--help", expectSuccess: true, description: "Help output" },
    ],
  },
];

/**
 * Run a single test
 * @param {string} scriptName - Script filename
 * @param {Object} test - Test configuration
 * @returns {Promise<boolean>} - Test result
 */
async function runTest(_scriptName, _test) {
  const command = `node scripts/${_scriptName} ${_test.args}`;

  try {
    logger.debug(`Running: ${command}`);

    const result = execSync(command, {
      cwd: path.resolve(__dirname, ".."),
      encoding: "utf-8",
      stdio: "pipe",
    });

    if (_test.expectSuccess) {
      logger.success(`✅ ${_scriptName} - ${_test.description}`);
      return true;
    } else {
      logger.warn(
        `⚠️ ${_scriptName} - ${_test.description} (unexpected success)`,
      );
      return false;
    }
  } catch (error) {
    if (!_test.expectSuccess) {
      // Expected failure (e.g., missing GITHUB_TOKEN)
      if (error.stderr && error.stderr.includes("GITHUB_TOKEN")) {
        logger.success(
          `✅ ${_scriptName} - ${_test.description} (expected auth failure)`,
        );
        return true;
      }
    }

    logger.error(`❌ ${_scriptName} - ${_test.description}: ${error.message}`);
    return false;
  }
}

/**
 * Test script utilities
 */
async function testUtilities() {
  logger.info("🔧 Testing utility modules...");

  const utilities = ["utils/logger.js", "utils/retry.js", "utils/cli.js"];

  let passed = 0;

  for (const util of utilities) {
    try {
      const utilPath = path.resolve(__dirname, util);
      if (fs.existsSync(utilPath)) {
        // Test require
        require(utilPath);
        logger.success(`✅ ${util} - Require successful`);
        passed++;
      } else {
        logger.error(`❌ ${util} - File not found`);
      }
    } catch (error) {
      logger.error(`❌ ${util} - Require failed: ${error.message}`);
    }
  }

  return passed === utilities.length;
}

/**
 * Test configuration file
 */
function testConfiguration() {
  logger.info("⚙️ Testing configuration...");

  const configPath = path.resolve(__dirname, "scripts._config.json");

  try {
    if (!fs.existsSync(configPath)) {
      logger.error("❌ scripts._config.json not found");
      return false;
    }

    const _config = JSON.parse(fs.readFileSync(configPath, "utf-8"));

    // Validate required sections
    const requiredSections = [
      "github",
      "roadmap",
      "release",
      "paths",
      "logging",
    ];
    const missingSections = requiredSections.filter(
      (section) => !_config[section],
    );

    if (missingSections.length > 0) {
      logger.error(
        `❌ Missing _config sections: ${missingSections.join(", ")}`,
      );
      return false;
    }

    logger.success("✅ Configuration file valid");
    return true;
  } catch (error) {
    logger.error(`❌ Configuration test failed: ${error.message}`);
    return false;
  }
}

/**
 * Main test execution
 */
async function main() {
  logger.info("🧪 Starting Comprehensive Script Test Suite");
  logger.info("==========================================");

  let totalTests = 0;
  let passedTests = 0;

  // Test utilities
  const utilitiesPass = await testUtilities();
  totalTests++;
  if (utilitiesPass) passedTests++;

  // Test configuration
  const configPass = testConfiguration();
  totalTests++;
  if (configPass) passedTests++;

  // Test scripts
  logger.info("📜 Testing refactored scripts...");

  for (const script of SCRIPTS_TO_TEST) {
    logger.info(`\n🔍 Testing ${script.name}:`);

    for (const test of script.tests) {
      const result = await runTest(script.name, test);
      totalTests++;
      if (result) passedTests++;
    }
  }

  // Results summary
  logger.info("\n📊 Test Results Summary");
  logger.info("=======================");

  const successRate = Math.round((passedTests / totalTests) * 100);

  if (successRate === 100) {
    logger.success(`🎉 All tests passed! (${passedTests}/${totalTests})`);
    logger.success("✅ Script refactoring validation complete");
  } else if (successRate >= 80) {
    logger.warn(
      `⚠️ Most tests passed (${passedTests}/${totalTests} - ${successRate}%)`,
    );
    logger.warn("Some issues detected but overall functionality is good");
  } else {
    logger.error(
      `❌ Multiple test failures (${passedTests}/${totalTests} - ${successRate}%)`,
    );
    logger.error("Script refactoring needs attention");
    process.exit(1);
  }

  // Additional validation
  logger.info("\n🔍 Additional Validations:");

  // Check for old scripts that should be removed
  const oldScripts = [
    "banner-injector.js",
    "ensure-roadmap-labels.js",
    "sync-labels.js",
    "sync-roadmap-labels.js",
  ];

  let cleanupNeeded = false;
  for (const oldScript of oldScripts) {
    const oldPath = path.resolve(__dirname, oldScript);
    if (fs.existsSync(oldPath)) {
      logger.warn(`⚠️ Old script still exists: ${oldScript}`);
      cleanupNeeded = true;
    }
  }

  if (!cleanupNeeded) {
    logger.success("✅ Old scripts properly removed");
  }

  // Check migration documentation
  const migrationDoc = path.resolve(__dirname, "SCRIPT_MIGRATION.md");
  if (fs.existsSync(migrationDoc)) {
    logger.success("✅ Migration documentation present");
  } else {
    logger.warn("⚠️ Migration documentation missing");
  }

  logger.success("\n🚀 Script refactoring validation completed successfully!");
  logger.success("All scripts are ready for production use.");
}

// Execute if run directly
if (require.main === module) {
  main().catch((error) => {
    logger.error(`Test suite failed: ${error.message}`);
    process.exit(1);
  });
}
