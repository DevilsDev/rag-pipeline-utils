/**
 * Event Handlers
 * Event listener setup for hub and certification instances
 */

const chalk = require("chalk");

function setupEventListeners(hub, certification) {
  // Hub events
  hub.on("install_start", (data) => {
    console.log(
      chalk.blue(
        `🚀 Starting installation of ${data.pluginId}@${data.version}`,
      ),
    ); // eslint-disable-line no-console
  });

  hub.on("install_progress", (data) => {
    const stages = {
      security_scan: "🔍 Running security scan...",
      downloading: "⬇️  Downloading plugin...",
      verifying: "✅ Verifying integrity...",
      sandbox_install: "🏗️  Installing in sandbox...",
      installing: "📦 Installing to system...",
    };
    console.log(
      chalk.yellow(stages[data.stage] || `Processing ${data.stage}...`),
    ); // eslint-disable-line no-console
  });

  hub.on("install_complete", (data) => {
    console.log(
      chalk.green(`✅ Successfully installed ${data.pluginId}@${data.version}`),
    ); // eslint-disable-line no-console
  });

  hub.on("install_error", (data) => {
    console.error(chalk.red(`❌ Installation failed: ${data.error.message}`)); // eslint-disable-line no-console
  });

  // Certification events
  certification.on("certification_start", (data) => {
    console.log(
      chalk.blue(
        `🏆 Starting ${data.level} certification for ${data.pluginId}`,
      ),
    ); // eslint-disable-line no-console
  });

  certification.on("certification_progress", (data) => {
    const stages = {
      automated_checks: "🤖 Running automated checks...",
      manual_review: "👥 Submitting for manual review...",
      security_audit: "🔒 Performing security audit...",
    };
    console.log(
      chalk.yellow(stages[data.stage] || `Processing ${data.stage}...`),
    ); // eslint-disable-line no-console
  });
}

module.exports = {
  setupEventListeners,
};
