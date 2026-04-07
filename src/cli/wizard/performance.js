/**
 * Performance Step
 * Handles performance settings configuration (parallel processing, streaming)
 */

/**
 * Configure performance settings
 * @param {object} config - Current wizard configuration state
 * @param {object} inquirer - Inquirer instance for prompting
 * @returns {Promise<object>} Updated configuration state
 */
async function configurePerformance(config, inquirer) {
  console.log("⚡ Performance Settings\n");
  // eslint-disable-line no-console

  const answers = await inquirer.prompt([
    {
      _type: "confirm",
      name: "enableParallel",
      message: "Enable parallel processing?",
      default: false,
    },
    {
      _type: "number",
      name: "maxConcurrency",
      message: "Maximum concurrent operations:",
      default: 3,
      when: (answers) => answers.enableParallel,
    },
    {
      _type: "number",
      name: "batchSize",
      message: "Batch size for parallel processing:",
      default: 10,
      when: (answers) => answers.enableParallel,
    },
    {
      _type: "confirm",
      name: "enableStreaming",
      message: "Enable streaming for large documents?",
      default: false,
    },
    {
      _type: "number",
      name: "maxMemoryMB",
      message: "Maximum memory usage (MB):",
      default: 512,
      when: (answers) => answers.enableStreaming,
    },
  ]);

  config.performance = config.performance || {};

  if (answers.enableParallel) {
    config.performance.parallel = {
      enabled: true,
      maxConcurrency: answers.maxConcurrency,
      batchSize: answers.batchSize,
    };
  }

  if (answers.enableStreaming) {
    config.performance.streaming = {
      enabled: true,
      maxMemoryMB: answers.maxMemoryMB,
      bufferSize: 100,
    };
  }

  console.log("✅ Performance settings configured\n");
  // eslint-disable-line no-console

  return config;
}

module.exports = { configurePerformance };
