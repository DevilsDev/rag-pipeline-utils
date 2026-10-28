/**
 * Environment diagnostics: API keys the configured providers need, ${VAR}
 * references in the config, and whether the file-store index exists yet.
 */

const fs = require("fs");
const path = require("path");

const PROVIDER_KEYS = {
  openai: "OPENAI_API_KEY",
  anthropic: "ANTHROPIC_API_KEY",
  cohere: "COHERE_API_KEY",
};

function missingVar(envVar, reason) {
  return {
    category: "environment",
    severity: "error",
    code: "ENV_VAR_MISSING",
    message: `Required environment variable missing: ${envVar}${reason ? ` (${reason})` : ""}`,
    fix: `Set environment variable: export ${envVar}=your_key`,
    autoFixable: false,
  };
}

async function checkEnvironment(options) {
  const configPath = path.resolve(options.configPath);
  let config;
  try {
    config = JSON.parse(fs.readFileSync(configPath, "utf8"));
  } catch {
    return []; // reported by the configuration checker
  }

  const issues = [];
  const seen = new Set();
  for (const entry of Array.isArray(config.pipeline) ? config.pipeline : []) {
    const envVar = PROVIDER_KEYS[entry?.name];
    if (
      envVar &&
      !entry.config?.apiKey &&
      !process.env[envVar] &&
      !seen.has(envVar)
    ) {
      seen.add(envVar);
      issues.push(missingVar(envVar, `used by ${entry.stage} "${entry.name}"`));
    }
    if (entry?.stage === "retriever" && entry.name === "file-store") {
      const indexPath = path.resolve(
        path.dirname(configPath),
        entry.config?.path || ".rag/index.json",
      );
      if (!fs.existsSync(indexPath)) {
        issues.push({
          category: "environment",
          severity: "info",
          code: "INDEX_MISSING",
          message: `No index yet at ${path.relative(process.cwd(), indexPath)}`,
          fix: "Run: rag-pipeline ingest <file-or-directory>",
          autoFixable: false,
        });
      }
    }
  }

  for (const match of JSON.stringify(config).match(/\$\{([^}]+)\}/g) || []) {
    const envVar = match.slice(2, -1);
    if (!process.env[envVar] && !seen.has(envVar)) {
      seen.add(envVar);
      issues.push(missingVar(envVar, "referenced in the config"));
    }
  }
  return issues;
}

module.exports = { checkEnvironment };
