/**
 * Diagnostics command handlers
 * Handles doctor, validate, and info commands
 */

const fs = require("fs/promises");
const { logger } = require("../../utils/logger.js");

const SEVERITY_ICONS = { error: "❌", warning: "⚠️ ", info: "ℹ️ " };

function printIssues(issues) {
  for (const issue of issues) {
    console.log(
      `${SEVERITY_ICONS[issue.severity] || "-"} [${issue.code}] ${issue.message}`,
    );
    if (issue.fix) console.log(`     Fix: ${issue.fix}`);
  }
}

/**
 * Handle doctor command: run the diagnostic checkers and print the issues.
 * Exits 1 when any error-level issue is found.
 *
 * @param {object} globalOptions - Global CLI options from program.opts()
 * @param {object} options - Command-specific options
 * @param {Function} [pipelineDoctorFn] - Injectable for tests
 */
async function handleDoctor(globalOptions, options, pipelineDoctorFn) {
  try {
    const runDoctor =
      pipelineDoctorFn || require("../doctor-command.js").runPipelineDoctor;
    const report = await runDoctor({
      configPath: globalOptions.config || ".ragrc.json",
      verbose: globalOptions.verbose,
      autoFix: options.autoFix,
      categories: options.category || ["all"],
    });

    console.log("🏥 Pipeline diagnostics\n");
    if (report.issues.length === 0) {
      console.log("✅ No issues found");
    } else {
      printIssues(report.issues);
    }
    const { errors, warnings, info } = report.summary;
    console.log(`\n${errors} error(s), ${warnings} warning(s), ${info} info`);

    if (options.report) {
      await fs.writeFile(options.report, JSON.stringify(report, null, 2));
      console.log(`📋 Diagnostic report saved to: ${options.report}`);
    }
    if (errors > 0) process.exitCode = 1;
  } catch (error) {
    console.error(`❌ Doctor command failed: ${error.message}`);
    process.exitCode = 1;
  }
}

/**
 * Handle validate command: schema validation plus resolving every pipeline
 * component. Exits 1 when the configuration has errors.
 *
 * @param {object} globalOptions - Global CLI options from program.opts()
 */
async function handleValidate(globalOptions) {
  try {
    const configPath = globalOptions.config || ".ragrc.json";
    console.log(`🔍 Validating configuration: ${configPath}`);

    const { checkConfiguration } = require("../diagnostics/config-checker.js");
    const issues = await checkConfiguration({ configPath });
    const errors = issues.filter((issue) => issue.severity === "error");

    if (errors.length === 0) {
      console.log("✅ Configuration is valid");
      printIssues(issues);
    } else {
      console.log("❌ Configuration validation failed:");
      printIssues(issues);
      process.exitCode = 1;
    }
  } catch (error) {
    console.error(`❌ Validation failed: ${error.message}`);
    process.exitCode = 1;
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
        for (const entry of Array.isArray(config.pipeline)
          ? config.pipeline
          : []) {
          console.log(`  ${entry.stage}: ${entry.name}`);
        }
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
