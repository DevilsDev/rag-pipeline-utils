/**
 * Plugin Selection Step
 * Handles plugin selection, custom plugin configuration, and plugin settings
 */

/**
 * Select plugins for each type
 * @param {object} config - Current wizard configuration state
 * @param {object} inquirer - Inquirer instance for prompting
 * @param {object} context - Wizard context with registry and helper methods
 * @param {object|null} context.registry - Plugin registry data
 * @param {Function} context.getAvailablePlugins - Function to get available plugins for a type
 * @param {Function} context.getPluginInfo - Function to get plugin info
 * @param {Function} context.loadRegistry - Function to load plugin registry
 * @returns {Promise<object>} Updated configuration state
 */
async function selectPlugins(config, inquirer, context) {
  console.log("🔌 Plugin Selection\n");
  // eslint-disable-line no-console

  // Load registry for plugin suggestions
  try {
    context.registry = await context.loadRegistry();
  } catch (error) {
    console.warn(
      "⚠️  Could not load plugin registry. Using built-in _options.",
    );
    // eslint-disable-line no-console
  }

  const pluginTypes = [
    { key: "loader", name: "Document Loader", required: true },
    { key: "embedder", name: "Text Embedder", required: true },
    { key: "retriever", name: "Vector Retriever", required: true },
    { key: "llm", name: "Language Model", required: true },
    { key: "reranker", name: "Result Reranker", required: false },
  ];

  for (const pluginType of pluginTypes) {
    await selectPluginForType(config, inquirer, context, pluginType);
  }

  console.log("✅ Plugin selection complete\n");
  // eslint-disable-line no-console

  return config;
}

/**
 * Select plugin for a specific type
 * @param {object} config - Current wizard configuration state
 * @param {object} inquirer - Inquirer instance for prompting
 * @param {object} context - Wizard context with helper methods
 * @param {object} pluginType - Plugin type configuration
 * @returns {Promise<void>}
 */
async function selectPluginForType(config, inquirer, context, pluginType) {
  const availablePlugins = context.getAvailablePlugins(pluginType.key);

  if (availablePlugins.length === 0 && pluginType.required) {
    console.log(
      `⚠️  No ${pluginType.name} plugins available. You'll need to configure this manually.`,
    );
    // eslint-disable-line no-console
    return;
  }

  const choices = [
    ...availablePlugins.map((plugin) => ({
      name: `${plugin.name} - ${plugin.description}`,
      value: plugin.name,
      short: plugin.name,
    })),
    { name: "Skip (configure later)", value: null },
    { name: "Custom plugin", value: "custom" },
  ];

  const answer = await inquirer.prompt([
    {
      _type: "list",
      name: "plugin",
      message: `Select ${pluginType.name}:`,
      choices,
      when: () => !pluginType.required || availablePlugins.length > 0,
    },
  ]);

  if (!answer.plugin) {
    return; // Skip
  }

  if (answer.plugin === "custom") {
    await configureCustomPlugin(config, inquirer, pluginType.key);
  } else {
    await configureSelectedPlugin(
      config,
      inquirer,
      context,
      pluginType.key,
      answer.plugin,
    );
  }
}

/**
 * Configure a custom plugin
 * @param {object} config - Current wizard configuration state
 * @param {object} inquirer - Inquirer instance for prompting
 * @param {string} pluginType - Plugin type key
 * @returns {Promise<void>}
 */
async function configureCustomPlugin(config, inquirer, pluginType) {
  const answers = await inquirer.prompt([
    {
      _type: "input",
      name: "name",
      message: "Plugin name:",
      validate: (input) => input.length > 0 || "Plugin name is required",
    },
    {
      _type: "list",
      name: "source",
      message: "Plugin source:",
      choices: [
        { name: "Registry", value: "registry" },
        { name: "Local file", value: "local" },
        { name: "Git repository", value: "git" },
        { name: "NPM package", value: "npm" },
      ],
      default: "registry",
    },
    {
      _type: "input",
      name: "version",
      message: "Version:",
      default: "latest",
      when: (answers) =>
        answers.source === "registry" || answers.source === "npm",
    },
    {
      _type: "input",
      name: "path",
      message: "Local path:",
      when: (answers) => answers.source === "local",
    },
    {
      _type: "input",
      name: "url",
      message: "Repository URL:",
      when: (answers) => answers.source === "git",
    },
  ]);

  const pluginSpec = {
    name: answers.name,
    source: answers.source,
  };

  if (answers.version) pluginSpec.version = answers.version;
  if (answers.path) pluginSpec.path = answers.path;
  if (answers.url) pluginSpec.url = answers.url;

  config.plugins[pluginType][answers.name] = pluginSpec;
}

/**
 * Configure a selected plugin from registry
 * @param {object} config - Current wizard configuration state
 * @param {object} inquirer - Inquirer instance for prompting
 * @param {object} context - Wizard context with helper methods
 * @param {string} pluginType - Plugin type key
 * @param {string} pluginName - Plugin name
 * @returns {Promise<void>}
 */
async function configureSelectedPlugin(
  config,
  inquirer,
  context,
  pluginType,
  pluginName,
) {
  const plugin = context.getPluginInfo(pluginType, pluginName);

  if (!plugin) {
    config.plugins[pluginType][pluginName] = "latest";
    return;
  }

  const versions = Object.keys(plugin.versions || {}).slice(0, 5);
  const versionChoices = [
    { name: "Latest stable", value: "latest" },
    { name: "Latest beta", value: "beta" },
    ...versions.map((v) => ({ name: v, value: v })),
    { name: "Custom version", value: "custom" },
  ];

  const versionAnswer = await inquirer.prompt([
    {
      _type: "list",
      name: "version",
      message: `Select version for ${pluginName}:`,
      choices: versionChoices,
      default: "latest",
    },
    {
      _type: "input",
      name: "customVersion",
      message: "Enter version:",
      when: (answers) => answers.version === "custom",
    },
  ]);

  const version = versionAnswer.customVersion || versionAnswer.version;

  // Check if plugin needs configuration
  const needsConfig =
    plugin.metadata?._config &&
    Object.keys(plugin.metadata._config.properties || {}).length > 0;

  if (needsConfig) {
    const configAnswer = await inquirer.prompt([
      {
        _type: "confirm",
        name: "configure",
        message: `Configure ${pluginName} settings?`,
        default: false,
      },
    ]);

    if (configAnswer.configure) {
      const pluginConfig = await configurePluginSettings(plugin, inquirer);
      config.plugins[pluginType][pluginName] = {
        name: pluginName,
        version,
        _config: pluginConfig,
      };
    } else {
      config.plugins[pluginType][pluginName] = {
        name: pluginName,
        version,
      };
    }
  } else {
    config.plugins[pluginType][pluginName] = version;
  }
}

/**
 * Configure plugin-specific settings
 * @param {object} plugin - Plugin information
 * @param {object} inquirer - Inquirer instance for prompting
 * @returns {Promise<object>} Plugin configuration
 */
async function configurePluginSettings(plugin, inquirer) {
  const _config = {};
  const schema = plugin.metadata?._config?.properties || {};

  console.log(`\n⚙️  Configuring ${plugin.metadata.name}...\n`);
  // eslint-disable-line no-console

  for (const [key, property] of Object.entries(schema)) {
    const question = {
      name: key,
      message: `${key}${property.description ? ` (${property.description})` : ""}:`,
    };

    if (property._type === "boolean") {
      question._type = "confirm";
      question.default = property.default || false;
    } else if (property.enum) {
      question._type = "list";
      question.choices = property.enum;
      question.default = property.default;
    } else if (property._type === "number") {
      question._type = "number";
      question.default = property.default;
    } else {
      question._type = "input";
      question.default = property.default || "";
    }

    const answer = await inquirer.prompt([question]);
    if (answer[key] !== "" && answer[key] !== undefined) {
      _config[key] = answer[key];
    }
  }

  return _config;
}

module.exports = {
  selectPlugins,
  selectPluginForType,
  configureCustomPlugin,
  configureSelectedPlugin,
  configurePluginSettings,
};
