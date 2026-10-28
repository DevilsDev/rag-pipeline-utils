/**
 * `hub install` and `hub certify submit|check`: real plugin installation and
 * automated certification checks (see src/ecosystem/plugin-installer.js and
 * plugin-checks.js).
 */

const fs = require("fs/promises");
const { resolveConfigPath } = require("../../../config/load-config.js");

const ICONS = { high: "❌", medium: "⚠️ ", low: "ℹ️ " };

function printFindings(findings) {
  for (const f of findings) {
    const where = f.line ? `${f.file}:${f.line}` : f.file;
    console.log(
      `  ${ICONS[f.severity] || "-"} ${f.severity}: ${f.message} (${where})`,
    );
  }
}

/**
 * @param {string} source - Registry id, path, .tgz, .js or npm:<spec>
 * @param {object} options - { stage, name, force, allowRisky, version }
 * @param {object} globals - Includes the root --config option
 * @param {Function} getHub - Returns a PluginHub, or null when no registry is set
 */
async function installFromSource(source, options, globals, getHub) {
  try {
    const { installPlugin } = require("../../../ecosystem/plugin-installer.js");
    const result = await installPlugin({
      source,
      configPath: resolveConfigPath(globals.config || ".ragrc.json"),
      stage: options.stage,
      name: options.name,
      force: options.force,
      allowRisky: options.allowRisky,
      version: options.version,
      hub: getHub(),
      onProgress: (step) => console.log(`… ${step}`),
    });

    if (result.scan.findings.length > 0) {
      console.log("Security scan findings:");
      printFindings(result.scan.findings);
    }
    console.log(
      `✅ Installed ${result.stage} plugin "${result.name}"` +
        `${result.version ? ` ${result.version}` : ""} (${result.source}) at ${result.entry}`,
    );
    console.log(`   Methods: ${result.methods.join(", ")}`);
    if (!result.inPipeline) {
      console.log(
        `   To use it, add { "stage": "${result.stage}", "name": "${result.name}" } to "pipeline" in your config.`,
      );
    }
  } catch (error) {
    console.error(`❌ Install failed: ${error.message}`);
    if (error.scan) printFindings(error.scan.findings);
    process.exitCode = 1;
  }
}

/**
 * @param {string} pluginPath - Local plugin directory or .js file
 * @param {object} options - { stage, json, output }
 */
async function certifyLocal(pluginPath, options) {
  try {
    const { runPluginChecks } = require("../../../ecosystem/plugin-checks.js");
    const report = await runPluginChecks(pluginPath, { stage: options.stage });

    if (options.output) {
      await fs.writeFile(options.output, JSON.stringify(report, null, 2));
    }
    if (options.json) {
      console.log(JSON.stringify(report, null, 2));
    } else {
      console.log(`Certification checks: ${report.plugin} (${report.stage})\n`);
      for (const check of report.checks) {
        console.log(
          `${check.label}: ${check.score}/100 (weight ${check.weight})`,
        );
        check.details.forEach((d) => console.log(`  - ${d}`));
      }
      console.log(`\nScore: ${report.score}/100`);
      if (report.level) {
        console.log(
          `Meets the automated threshold for ${report.level}` +
            (report.pendingReview
              ? ` (also requires ${report.pendingReview})`
              : ""),
        );
      } else {
        console.log(
          "Does not meet the BASIC threshold (60, with a passing contract).",
        );
      }
      if (report.nextLevel) {
        console.log(
          `Next level: ${report.nextLevel.level} at ${report.nextLevel.score}`,
        );
      }
      if (options.output) console.log(`Report saved to ${options.output}`);
    }
    if (!report.level) process.exitCode = 1;
  } catch (error) {
    console.error(`❌ Certification checks failed: ${error.message}`);
    process.exitCode = 1;
  }
}

/**
 * @param {object} globals - Includes the root --config option
 * @param {object} options - { json }
 */
function listPlugins(globals, options) {
  const {
    listInstalledPlugins,
  } = require("../../../ecosystem/plugin-installer.js");
  const plugins = listInstalledPlugins(
    resolveConfigPath(globals.config || ".ragrc.json"),
  );
  if (options.json) {
    console.log(JSON.stringify(plugins, null, 2));
    return;
  }
  if (plugins.length === 0) {
    console.log('No plugins registered under "plugins" in the config.');
    return;
  }
  for (const p of plugins) {
    const flags = [
      p.installed
        ? `installed${p.version ? ` ${p.version}` : ""}`
        : "local path",
      p.inPipeline ? "in pipeline" : "not in pipeline",
      p.exists ? null : "FILE MISSING",
    ].filter(Boolean);
    console.log(`${p.stage}/${p.name}  ${p.entry}  (${flags.join(", ")})`);
  }
}

module.exports = { installFromSource, certifyLocal, listPlugins };
