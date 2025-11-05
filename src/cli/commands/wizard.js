"use strict";

/**
 * Interactive Configuration Wizard CLI Command
 *
 * Provides an interactive CLI wizard for creating and managing
 * RAG pipeline configurations with:
 * - Template-based configuration
 * - Real-time validation
 * - Plugin discovery and selection
 * - Configuration preview and testing
 *
 * @module cli/commands/wizard
 * @since 2.4.0
 */

const { Command } = require("commander");
const chalk = require("chalk");
const inquirer = require("inquirer");
const fs = require("fs/promises");
const path = require("path");
const {
  InteractiveWizard,
  runInteractiveWizard,
} = require("../interactive-wizard");
const { validateRagrc } = require("../../config/enhanced-ragrc-schema");

/**
 * Configuration Templates
 *
 * Pre-defined templates for common use cases
 */
const TEMPLATES = {
  minimal: {
    name: "Minimal Setup",
    description: "Basic RAG pipeline with essential plugins",
    config: {
      metadata: {
        name: "minimal-rag-pipeline",
        version: "1.0.0",
        description: "Minimal RAG pipeline configuration",
        environment: "development",
      },
      plugins: {
        loader: {
          "file-loader": "latest",
        },
        embedder: {
          "openai-embedder": "latest",
        },
        retriever: {
          "vector-retriever": "latest",
        },
        llm: {
          "openai-llm": "latest",
        },
      },
      pipeline: {
        stages: ["loader", "embedder", "retriever", "llm"],
      },
      observability: {
        logging: {
          level: "info",
          structured: true,
        },
      },
    },
  },

  production: {
    name: "Production Ready",
    description:
      "Production-grade configuration with monitoring and optimization",
    config: {
      metadata: {
        name: "production-rag-pipeline",
        version: "1.0.0",
        description: "Production RAG pipeline with full observability",
        environment: "production",
      },
      plugins: {
        loader: {
          "file-loader": "latest",
        },
        embedder: {
          "openai-embedder": {
            name: "openai-embedder",
            version: "latest",
            config: {
              batchSize: 100,
              timeout: 30000,
            },
          },
        },
        retriever: {
          "vector-retriever": {
            name: "vector-retriever",
            version: "latest",
            config: {
              topK: 10,
              threshold: 0.7,
            },
          },
        },
        llm: {
          "openai-llm": "latest",
        },
        reranker: {
          "similarity-reranker": "latest",
        },
      },
      pipeline: {
        stages: ["loader", "embedder", "retriever", "reranker", "llm"],
        retries: {
          enabled: true,
          maxAttempts: 3,
          backoff: "exponential",
        },
        timeout: 60000,
      },
      performance: {
        caching: {
          enabled: true,
          maxSize: 1000,
          ttl: 3600,
        },
        parallel: {
          enabled: true,
          maxConcurrency: 5,
          batchSize: 10,
        },
        streaming: {
          enabled: true,
          maxMemoryMB: 512,
          bufferSize: 100,
        },
      },
      observability: {
        logging: {
          level: "info",
          structured: true,
          events: true,
        },
        tracing: {
          enabled: true,
          sampleRate: 0.1,
        },
        metrics: {
          enabled: true,
          interval: 60000,
        },
      },
    },
  },

  development: {
    name: "Development",
    description: "Development environment with verbose logging",
    config: {
      metadata: {
        name: "dev-rag-pipeline",
        version: "1.0.0",
        description: "Development RAG pipeline",
        environment: "development",
      },
      plugins: {
        loader: {
          "file-loader": "latest",
        },
        embedder: {
          "local-embedder": "latest",
        },
        retriever: {
          "vector-retriever": "latest",
        },
        llm: {
          "local-llm": "latest",
        },
      },
      pipeline: {
        stages: ["loader", "embedder", "retriever", "llm"],
        timeout: 30000,
      },
      observability: {
        logging: {
          level: "debug",
          structured: true,
          events: true,
        },
      },
    },
  },

  testing: {
    name: "Testing",
    description: "Testing configuration with mock plugins",
    config: {
      metadata: {
        name: "test-rag-pipeline",
        version: "1.0.0",
        description: "Testing RAG pipeline",
        environment: "testing",
      },
      plugins: {
        loader: {
          "mock-loader": "./src/mocks/pdf-loader.js",
        },
        embedder: {
          "mock-embedder": "./src/mocks/openai-embedder.js",
        },
        retriever: {
          "mock-retriever": "./src/mocks/pinecone-retriever.js",
        },
        llm: {
          "mock-llm": "./src/mocks/openai-llm.js",
        },
      },
      pipeline: {
        stages: ["loader", "embedder", "retriever", "llm"],
      },
      observability: {
        logging: {
          level: "warn",
          structured: true,
        },
      },
    },
  },

  custom: {
    name: "Custom (Interactive)",
    description: "Build your configuration from scratch",
    config: null, // Will use interactive wizard
  },
};

/**
 * Create wizard command
 *
 * @returns {Command} Wizard command
 */
function createWizardCommand() {
  const wizardCmd = new Command("wizard");

  wizardCmd
    .description("Interactive configuration wizard for RAG pipeline setup")
    .option(
      "-o, --output <path>",
      "Output configuration file path",
      ".ragrc.json",
    )
    .option(
      "-t, --template <name>",
      "Use a configuration template (minimal|production|development|testing|custom)",
    )
    .option("--list-templates", "List available templates")
    .option("--validate <file>", "Validate an existing configuration file")
    .option("--no-save", "Don't save configuration (preview only)")
    .option("--quiet", "Minimal output")
    .action(async (options) => {
      try {
        // List templates
        if (options.listTemplates) {
          await listTemplates();
          return;
        }

        // Validate existing configuration
        if (options.validate) {
          await validateConfiguration(options.validate);
          return;
        }

        // Run interactive wizard
        if (!options.quiet) {
          console.log(
            chalk.cyan("╔════════════════════════════════════════════╗"),
          );
          console.log(
            chalk.cyan("║   RAG Pipeline Configuration Wizard       ║"),
          );
          console.log(
            chalk.cyan("╚════════════════════════════════════════════╝\n"),
          );
        }

        // Template selection or custom
        let config;
        if (options.template) {
          config = await useTemplate(options.template, options);
        } else {
          // Ask user to select template or custom
          const templateChoice = await inquirer.prompt([
            {
              type: "list",
              name: "template",
              message: "Choose a starting point:",
              choices: Object.entries(TEMPLATES).map(([key, template]) => ({
                name: `${template.name} - ${template.description}`,
                value: key,
                short: template.name,
              })),
              default: "custom",
            },
          ]);

          if (templateChoice.template === "custom") {
            config = await runCustomWizard(options);
          } else {
            config = await useTemplate(templateChoice.template, options);
          }
        }

        // Display success message
        if (!options.quiet && config) {
          console.log(
            chalk.green("\n✅ Configuration wizard completed successfully!"),
          );
          console.log(
            chalk.gray(`   Configuration saved to: ${options.output}`),
          );
          console.log(chalk.gray("\n   Next steps:"));
          console.log(
            chalk.gray(
              "   1. Review your configuration: cat " + options.output,
            ),
          );
          console.log(
            chalk.gray("   2. Test your pipeline: npm run pipeline:test"),
          );
          console.log(chalk.gray("   3. Start your pipeline: npm start"));
        }
      } catch (error) {
        console.error(chalk.red("\n❌ Wizard failed:"), error.message);
        if (error.stack && !options.quiet) {
          console.error(chalk.gray(error.stack));
        }
        process.exit(1);
      }
    });

  return wizardCmd;
}

/**
 * List available templates
 */
async function listTemplates() {
  console.log(chalk.cyan("\n📋 Available Configuration Templates:\n"));

  for (const [key, template] of Object.entries(TEMPLATES)) {
    console.log(chalk.bold(`  ${key}:`));
    console.log(`    ${template.description}`);

    if (template.config) {
      const pluginCount = Object.values(template.config.plugins || {}).reduce(
        (sum, plugins) => sum + Object.keys(plugins).length,
        0,
      );
      const features = [];

      if (template.config.performance?.caching?.enabled)
        features.push("caching");
      if (template.config.performance?.parallel?.enabled)
        features.push("parallel");
      if (template.config.observability?.tracing?.enabled)
        features.push("tracing");

      console.log(chalk.gray(`    • ${pluginCount} plugins configured`));
      if (features.length > 0) {
        console.log(chalk.gray(`    • Features: ${features.join(", ")}`));
      }
    }
    console.log();
  }

  console.log(chalk.gray("Usage: npm run wizard -- --template <name>"));
  console.log(
    chalk.gray("   or: npm run wizard (for interactive selection)\n"),
  );
}

/**
 * Use configuration template
 *
 * @param {string} templateName - Template name
 * @param {object} options - Command options
 * @returns {Promise<object>} Configuration
 */
async function useTemplate(templateName, options) {
  const template = TEMPLATES[templateName];

  if (!template) {
    throw new Error(
      `Unknown template: ${templateName}. Use --list-templates to see available options.`,
    );
  }

  if (templateName === "custom") {
    return await runCustomWizard(options);
  }

  console.log(chalk.blue(`\n🎯 Using template: ${template.name}\n`));
  console.log(chalk.gray(`   ${template.description}\n`));

  // Clone template configuration
  const config = JSON.parse(JSON.stringify(template.config));

  // Allow customization
  const customizeAnswer = await inquirer.prompt([
    {
      type: "confirm",
      name: "customize",
      message: "Would you like to customize this template?",
      default: false,
    },
  ]);

  if (customizeAnswer.customize) {
    // Customize project metadata
    const metadata = await inquirer.prompt([
      {
        type: "input",
        name: "name",
        message: "Project name:",
        default: config.metadata.name,
        validate: (input) => input.length > 0 || "Project name is required",
      },
      {
        type: "input",
        name: "description",
        message: "Project description:",
        default: config.metadata.description,
      },
    ]);

    config.metadata.name = metadata.name;
    config.metadata.description = metadata.description;
    config.metadata.createdAt = new Date().toISOString();
  }

  // Validate configuration
  const validation = validateRagrc(config);
  if (!validation.valid) {
    console.error(chalk.red("\n❌ Template configuration is invalid:"));
    validation.errors?.forEach((error) => {
      console.error(chalk.red(`  ${error.instancePath}: ${error.message}`));
    });
    throw new Error("Invalid template configuration");
  }

  // Use normalized configuration
  const finalConfig = validation.normalized;

  // Save configuration if not disabled
  if (options.save !== false) {
    await fs.writeFile(
      options.output,
      JSON.stringify(finalConfig, null, 2),
      "utf-8",
    );
  }

  // Display configuration summary
  displayConfigSummary(finalConfig);

  return finalConfig;
}

/**
 * Run custom wizard
 *
 * @param {object} options - Command options
 * @returns {Promise<object>} Configuration
 */
async function runCustomWizard(options) {
  console.log(
    chalk.blue("\n🧙 Starting interactive configuration wizard...\n"),
  );

  const wizard = new InteractiveWizard({
    outputPath: options.output,
  });

  const config = await wizard.run();

  return config;
}

/**
 * Validate configuration file
 *
 * @param {string} filePath - Configuration file path
 */
async function validateConfiguration(filePath) {
  console.log(chalk.blue(`\n🔍 Validating configuration: ${filePath}\n`));

  try {
    // Read configuration file
    const content = await fs.readFile(filePath, "utf-8");
    const config = JSON.parse(content);

    // Validate against schema
    const validation = validateRagrc(config);

    if (validation.valid) {
      console.log(chalk.green("✅ Configuration is valid!\n"));

      // Display summary
      displayConfigSummary(config);

      // Display warnings if any
      if (validation.warnings && validation.warnings.length > 0) {
        console.log(chalk.yellow("\n⚠️  Warnings:"));
        validation.warnings.forEach((warning) => {
          console.log(chalk.yellow(`  • ${warning}`));
        });
      }
    } else {
      console.log(chalk.red("❌ Configuration is invalid:\n"));

      validation.errors?.forEach((error) => {
        console.log(chalk.red(`  • ${error.instancePath}: ${error.message}`));
      });

      process.exit(1);
    }
  } catch (error) {
    if (error.code === "ENOENT") {
      console.error(chalk.red(`❌ File not found: ${filePath}`));
    } else if (error instanceof SyntaxError) {
      console.error(chalk.red(`❌ Invalid JSON: ${error.message}`));
    } else {
      console.error(chalk.red(`❌ Validation failed: ${error.message}`));
    }
    process.exit(1);
  }
}

/**
 * Display configuration summary
 *
 * @param {object} config - Configuration object
 */
function displayConfigSummary(config) {
  console.log(chalk.cyan("\n📋 Configuration Summary:\n"));

  // Project metadata
  if (config.metadata) {
    console.log(chalk.bold("  Project:"));
    console.log(`    Name: ${config.metadata.name || "Unnamed"}`);
    console.log(
      `    Environment: ${config.metadata.environment || "development"}`,
    );
    if (config.metadata.description) {
      console.log(`    Description: ${config.metadata.description}`);
    }
    console.log();
  }

  // Plugins
  if (config.plugins) {
    console.log(chalk.bold("  Plugins:"));
    for (const [type, plugins] of Object.entries(config.plugins)) {
      const pluginNames = Object.keys(plugins);
      if (pluginNames.length > 0) {
        console.log(`    ${type}: ${pluginNames.join(", ")}`);
      }
    }
    console.log();
  }

  // Pipeline
  if (config.pipeline) {
    console.log(chalk.bold("  Pipeline:"));
    if (config.pipeline.stages) {
      console.log(`    Stages: ${config.pipeline.stages.join(" → ")}`);
    }
    if (config.pipeline.retries?.enabled) {
      console.log(
        `    Retries: ${config.pipeline.retries.maxAttempts} attempts (${config.pipeline.retries.backoff})`,
      );
    }
    console.log();
  }

  // Performance
  if (config.performance) {
    const features = [];
    if (config.performance.caching?.enabled) features.push("caching");
    if (config.performance.parallel?.enabled)
      features.push("parallel processing");
    if (config.performance.streaming?.enabled) features.push("streaming");

    if (features.length > 0) {
      console.log(chalk.bold("  Performance:"));
      features.forEach((feature) => console.log(`    • ${feature}`));
      console.log();
    }
  }

  // Observability
  if (config.observability) {
    const features = [];
    if (config.observability.logging)
      features.push(`logging (${config.observability.logging.level})`);
    if (config.observability.tracing?.enabled) features.push("tracing");
    if (config.observability.metrics?.enabled) features.push("metrics");

    if (features.length > 0) {
      console.log(chalk.bold("  Observability:"));
      features.forEach((feature) => console.log(`    • ${feature}`));
      console.log();
    }
  }
}

/**
 * Export command and utilities
 */
module.exports = {
  createWizardCommand,
  TEMPLATES,
  useTemplate,
  validateConfiguration,
  displayConfigSummary,
};
