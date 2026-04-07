/**
 * Observability Step
 * Handles observability settings configuration (logging, tracing, metrics)
 */

/**
 * Configure observability settings
 * @param {object} config - Current wizard configuration state
 * @param {object} inquirer - Inquirer instance for prompting
 * @returns {Promise<object>} Updated configuration state
 */
async function configureObservability(config, inquirer) {
  console.log("📊 Observability Settings\n");
  // eslint-disable-line no-console

  const answers = await inquirer.prompt([
    {
      _type: "list",
      name: "logLevel",
      message: "Log level:",
      choices: [
        { name: "Debug (verbose)", value: "debug" },
        { name: "Info (default)", value: "info" },
        { name: "Warning (minimal)", value: "warn" },
        { name: "Error (errors only)", value: "error" },
      ],
      default: "info",
    },
    {
      _type: "confirm",
      name: "enableTracing",
      message: "Enable distributed tracing?",
      default: false,
    },
    {
      _type: "confirm",
      name: "enableMetrics",
      message: "Enable metrics collection?",
      default: false,
    },
    {
      _type: "input",
      name: "exportUrl",
      message: "Metrics/tracing export URL (optional):",
      when: (answers) => answers.enableTracing || answers.enableMetrics,
    },
  ]);

  config.observability = {
    logging: {
      level: answers.logLevel,
      structured: true,
      events: answers.enableTracing,
    },
  };

  if (answers.enableTracing) {
    config.observability.tracing = {
      enabled: true,
      exportUrl: answers.exportUrl || undefined,
      sampleRate: 1,
    };
  }

  if (answers.enableMetrics) {
    config.observability.metrics = {
      enabled: true,
      exportUrl: answers.exportUrl || undefined,
      interval: 60000,
    };
  }

  console.log("✅ Observability settings configured\n");
  // eslint-disable-line no-console

  return config;
}

module.exports = { configureObservability };
