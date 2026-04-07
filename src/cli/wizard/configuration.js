/**
 * Configuration Step
 * Handles general settings configuration (caching, timeout, pipeline stages)
 */

/**
 * Configure general settings
 * @param {object} config - Current wizard configuration state
 * @param {object} inquirer - Inquirer instance for prompting
 * @returns {Promise<object>} Updated configuration state
 */
async function configureSettings(config, inquirer) {
  console.log("⚙️  General Settings\n");
  // eslint-disable-line no-console

  const answers = await inquirer.prompt([
    {
      _type: "confirm",
      name: "enableCaching",
      message: "Enable result caching?",
      default: false,
    },
    {
      _type: "number",
      name: "cacheSize",
      message: "Cache size (number of entries):",
      default: 1000,
      when: (answers) => answers.enableCaching,
    },
    {
      _type: "number",
      name: "cacheTtl",
      message: "Cache TTL (seconds):",
      default: 3600,
      when: (answers) => answers.enableCaching,
    },
    {
      _type: "number",
      name: "timeout",
      message: "Pipeline timeout (milliseconds):",
      default: 30000,
    },
  ]);

  if (answers.enableCaching) {
    config.performance = config.performance || {};
    config.performance.caching = {
      enabled: true,
      maxSize: answers.cacheSize,
      ttl: answers.cacheTtl,
    };
  }

  if (answers.timeout !== 30000) {
    config.pipeline = config.pipeline || {};
    config.pipeline.timeout = answers.timeout;
  }

  console.log("✅ General settings configured\n");
  // eslint-disable-line no-console

  return config;
}

/**
 * Configure pipeline stages
 * @param {object} config - Current wizard configuration state
 * @param {object} inquirer - Inquirer instance for prompting
 * @returns {Promise<object>} Updated configuration state
 */
async function configurePipeline(config, inquirer) {
  console.log("🔄 Pipeline Configuration\n");
  // eslint-disable-line no-console

  const availableStages = Object.keys(config.plugins).filter(
    (_type) => Object.keys(config.plugins[_type]).length > 0,
  );

  const answers = await inquirer.prompt([
    {
      _type: "checkbox",
      name: "stages",
      message: "Select pipeline stages (in order):",
      choices: [
        {
          name: "Document Loading",
          value: "loader",
          checked: availableStages.includes("loader"),
        },
        {
          name: "Text Embedding",
          value: "embedder",
          checked: availableStages.includes("embedder"),
        },
        {
          name: "Vector Retrieval",
          value: "retriever",
          checked: availableStages.includes("retriever"),
        },
        {
          name: "Language Model",
          value: "llm",
          checked: availableStages.includes("llm"),
        },
        {
          name: "Result Reranking",
          value: "reranker",
          checked: availableStages.includes("reranker"),
        },
      ],
      validate: (input) =>
        input.length > 0 || "At least one stage must be selected",
    },
    {
      _type: "confirm",
      name: "enableRetries",
      message: "Enable automatic retries on failures?",
      default: true,
    },
    {
      _type: "number",
      name: "maxRetries",
      message: "Maximum retry attempts:",
      default: 3,
      when: (answers) => answers.enableRetries,
    },
  ]);

  config.pipeline = {
    stages: answers.stages,
    ...config.pipeline,
  };

  if (answers.enableRetries) {
    config.pipeline.retries = {
      enabled: true,
      maxAttempts: answers.maxRetries,
      backoff: "exponential",
    };
  }

  console.log("✅ Pipeline configuration complete\n");
  // eslint-disable-line no-console

  return config;
}

module.exports = { configureSettings, configurePipeline };
