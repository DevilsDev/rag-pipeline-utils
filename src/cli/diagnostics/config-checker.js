/**
 * Configuration diagnostics: the file exists, parses, validates, and every
 * pipeline entry resolves to a component.
 */

const fs = require("fs");
const path = require("path");

function issue(severity, code, message, fix) {
  return {
    category: "configuration",
    severity,
    code,
    message,
    fix,
    autoFixable: false,
  };
}

async function checkConfiguration(options) {
  const { loadRagConfig } = require("../../config/load-config.js");
  const { buildComponents } = require("../../config/component-factory.js");
  const configPath = path.resolve(options.configPath);

  if (!fs.existsSync(configPath)) {
    return [
      issue(
        "error",
        "CONFIG_MISSING",
        `Configuration file not found: ${options.configPath}`,
        'Run "rag-pipeline init" to create a configuration file',
      ),
    ];
  }

  let config;
  try {
    config = loadRagConfig(configPath);
  } catch (error) {
    const invalidJson = /Invalid JSON/.test(error.message);
    return [
      issue(
        "error",
        invalidJson ? "CONFIG_INVALID_JSON" : "CONFIG_SCHEMA_ERROR",
        error.message,
        invalidJson
          ? `Fix JSON syntax errors in ${options.configPath}`
          : "Fix the reported configuration errors",
      ),
    ];
  }

  const issues = [];
  const stages = new Set(config.pipeline.map((entry) => entry.stage));
  for (const stage of ["embedder", "retriever"]) {
    if (!stages.has(stage)) {
      issues.push(
        issue(
          "error",
          "CONFIG_STAGE_MISSING",
          `Pipeline has no ${stage} stage`,
          `Add { "stage": "${stage}", "name": ... } to the pipeline (see rag-pipeline init)`,
        ),
      );
    }
  }
  if (!stages.has("llm")) {
    issues.push(
      issue(
        "info",
        "CONFIG_NO_LLM",
        "Pipeline has no llm stage; query prints retrieved passages only",
        'Add { "stage": "llm", "name": "openai" } (or anthropic, ollama) to generate answers',
      ),
    );
  }

  try {
    buildComponents(config, { configDir: path.dirname(configPath) });
  } catch (error) {
    issues.push(
      issue(
        "error",
        "CONFIG_COMPONENT_UNKNOWN",
        error.message,
        'Use a built-in name or register the plugin under "plugins"',
      ),
    );
  }

  return issues;
}

module.exports = { checkConfiguration };
