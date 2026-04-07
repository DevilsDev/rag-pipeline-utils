/**
 * Diagnostics command handlers
 * Handles doctor, validate, and info commands
 */

const fs = require("fs/promises");
const { logger } = require("../../utils/logger.js");

/**
 * Handle doctor command
 * @param {object} globalOptions - Global CLI options from program.opts()
 * @param {object} options - Command-specific options
 * @param {Function} pipelineDoctorFn - Pipeline doctor function
 */
async function handleDoctor(globalOptions, options, pipelineDoctorFn) {
  try {
    const doctorOptions = {
      configPath: globalOptions.config,
      verbose: globalOptions.verbose,
      autoFix: options.autoFix,
      categories: options.category,
    };

    const report = await pipelineDoctorFn(doctorOptions);

    if (options.report) {
      await fs.writeFile(options.report, JSON.stringify(report, null, 2));
      console.log(`📋 Diagnostic report saved to: ${options.report}`);
    }
  } catch (error) {
    logger.error("❌ Doctor command failed:", error.message);
    process.exit(1);
  }
}

/**
 * Handle validate command
 * @param {object} globalOptions - Global CLI options from program.opts()
 * @param {object} options - Command-specific options
 * @param {Function} validateSchemaFn - Schema validation function
 */
async function handleValidate(globalOptions, options, validateSchemaFn) {
  try {
    const configPath = globalOptions.config;

    console.log(`🔍 Validating configuration: ${configPath}`);

    // Load and validate configuration
    const configContent = await fs.readFile(configPath, "utf-8");
    const config = JSON.parse(configContent);

    const validation = validateSchemaFn(config);

    if (validation.valid) {
      console.log("✅ Configuration is valid");

      if (validation.legacy) {
        console.log("⚠️  Using legacy format - consider upgrading");
      }
    } else {
      console.log("❌ Configuration validation failed:");
      validation.errors?.forEach((error) => {
        console.log(`  ${error.instancePath || "root"}: ${error.message}`);
      });
    }
  } catch (error) {
    logger.error("❌ Validation failed:", error.message);
    process.exit(1);
  }
}

/**
 * Handle info command
 * @param {object} globalOptions - Global CLI options from program.opts()
 * @param {object} options - Command-specific options
 */
async function handleInfo(globalOptions, options) {
  try {
    console.log("📊 RAG Pipeline Information\n");

    // System information
    if ((!options.plugins && !options.config) || options.system) {
      console.log("System:");
      console.log(`  Node.js: ${process.version}`);
      console.log(`  Platform: ${process.platform} ${process.arch}`);
      console.log(
        `  Memory: ${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)}MB used`,
      );
      console.log("");
    }

    // Configuration summary
    if ((!options.system && !options.plugins) || options.config) {
      try {
        const config = JSON.parse(
          await fs.readFile(globalOptions.config, "utf-8"),
        );
        console.log("Configuration:");
        console.log(`  File: ${globalOptions.config}`);
        console.log(`  Format: ${config.plugins ? "Enhanced" : "Legacy"}`);
        console.log("");
      } catch (error) {
        console.log("Configuration: Not found or invalid");
        console.log("");
      }
    }
  } catch (error) {
    logger.error("❌ Failed to get system information:", error.message);
    process.exit(1);
  }
}

module.exports = { handleDoctor, handleValidate, handleInfo };
