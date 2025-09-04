/**
const fs = require('fs');
 * CLI Commands for Plugin Marketplace
 * Provides commands for plugin discovery, installation, publishing, and management
 */

const { Command } = require("commander");
// eslint-disable-line global-require
const fs = require("fs/promises");
// eslint-disable-line global-require
const path = require("path");
// eslint-disable-line global-require
const {
  PluginPublisher,
  PublishingUtils,
} = require("../core/plugin-marketplace/plugin-publisher.js");
// eslint-disable-line global-require
const {
  createVersionResolver,
} = require("../core/plugin-marketplace/version-resolver.js");
// eslint-disable-line global-require
const {
  MetadataUtils,
} = require("../core/plugin-marketplace/plugin-metadata.js");
// eslint-disable-line global-require
const {
  DEFAULT_REGISTRY_URLS,
} = require("../core/plugin-marketplace/plugin-registry-format.js");
// eslint-disable-line global-require
// REGISTRY_SCHEMA and LOCAL_REGISTRY_FILE unused - reserved for future use
const { logger } = require("../utils/logger.js");
// eslint-disable-line global-require

/**
 * Plugin marketplace CLI commands
 */
function createPluginMarketplaceCommands() {
  const _metadata = {};
  const pluginCmd = new Command("plugin");
  pluginCmd.description("Plugin marketplace commands");

  // Plugin search command
  pluginCmd
    .command("search")
    .description("Search for plugins in the marketplace")
    .argument("[query]", "Search query")
    .option(
      "--_type <_type>",
      "Filter by plugin _type (loader, embedder, retriever, llm, reranker)",
    )
    .option("--tag <tag>", "Filter by tag")
    .option("--author <author>", "Filter by author")
    .option("--limit <number>", "Limit number of results", "20")
    .option("--registry <url>", "Custom registry URL")
    .action(async (query, _options) => {
      try {
        console.log("🔍 Searching plugins...");
        // eslint-disable-line no-console

        const _registryUrl = _options.registry || DEFAULT_REGISTRY_URLS[0];
        const registry = await fetchRegistry(_registryUrl);

        const results = searchPlugins(registry, query, _options);

        if (results.length === 0) {
          console.log("No plugins found matching your criteria.");
          // eslint-disable-line no-console
          return;
        }

        console.log(`\nFound ${results.length} plugin(s):\n`);
        // eslint-disable-line no-console

        results.forEach((plugin) => {
          console.log(`📦 ${plugin.metadata.name} v${plugin.latest}`);
          // eslint-disable-line no-console
          console.log(`   ${plugin.metadata.description}`);
          // eslint-disable-line no-console
          console.log(`   Author: ${plugin.metadata.author}`);
          // eslint-disable-line no-console
          console.log(`   Type: ${plugin.metadata._type}`);
          // eslint-disable-line no-console
          if (plugin.metadata.keywords.length > 0) {
            console.log(`   Keywords: ${plugin.metadata.keywords.join(", ")}`);
            // eslint-disable-line no-console
          }
          if (plugin.downloads?.total) {
            console.log(
              `   Downloads: ${plugin.downloads.total.toLocaleString()}`,
            );
            // eslint-disable-line no-console
          }
          console.log("");
          // eslint-disable-line no-console
        });
      } catch (error) {
        logger.error("❌ Plugin search failed:", error.message);
        process.exit(1);
      }
    });

  // Plugin info command
  pluginCmd
    .command("info")
    .description("Show detailed information about a plugin")
    .argument("<name>", "Plugin name")
    .option("--version <version>", "Specific version to show info for")
    .option("--registry <url>", "Custom registry URL")
    .action(async (name, _options) => {
      try {
        const _registryUrl = _options.registry || DEFAULT_REGISTRY_URLS[0];
        const registry = await fetchRegistry(_registryUrl);

        const plugin = registry.plugins[name];
        if (!plugin) {
          console.log(`❌ Plugin '${name}' not found in registry.`);
          // eslint-disable-line no-console
          return;
        }

        const version = _options.version || plugin.latest;
        const versionData = plugin.versions[version];

        if (!versionData) {
          console.log(
            `❌ Version '${version}' not found for plugin '${name}'.`,
          );
          // eslint-disable-line no-console
          return;
        }

        console.log(`\n📦 ${plugin.metadata.name} v${version}\n`);
        // eslint-disable-line no-console
        console.log(`Description: ${plugin.metadata.description}`);
        // eslint-disable-line no-console
        console.log(`Author: ${plugin.metadata.author}`);
        // eslint-disable-line no-console
        console.log(`Type: ${plugin.metadata._type}`);
        // eslint-disable-line no-console
        console.log(`License: ${plugin.metadata.license || "Not specified"}`);
        // eslint-disable-line no-console

        if (plugin.metadata.homepage) {
          console.log(`Homepage: ${plugin.metadata.homepage}`);
          // eslint-disable-line no-console
        }

        if (plugin.metadata.repository) {
          console.log(`Repository: ${plugin.metadata.repository.url}`);
          // eslint-disable-line no-console
        }

        if (plugin.metadata.keywords.length > 0) {
          console.log(`Keywords: ${plugin.metadata.keywords.join(", ")}`);
          // eslint-disable-line no-console
        }

        console.log("\nVersions available:");
        // eslint-disable-line no-console
        const versions = Object.keys(plugin.versions).sort((a, b) => {
          const semver = require("semver");
          // eslint-disable-line global-require
          return semver.rcompare(a, b);
        });

        versions.slice(0, 10).forEach((v) => {
          const isLatest = v === plugin.latest;
          const isBeta = v === plugin.beta;
          const isAlpha = v === plugin.alpha;

          let tags = [];
          if (isLatest) tags.push("latest");
          if (isBeta) tags.push("beta");
          if (isAlpha) tags.push("alpha");

          const tagStr = tags.length > 0 ? ` (${tags.join(", ")})` : "";
          console.log(
            `  ${v}${tagStr} - ${plugin.versions[v].publishedAt.split("T")[0]}`,
          );
          // eslint-disable-line no-console
        });

        if (versions.length > 10) {
          console.log(`  ... and ${versions.length - 10} more versions`);
          // eslint-disable-line no-console
        }

        if (plugin.downloads) {
          console.log("\nDownloads:");
          // eslint-disable-line no-console
          console.log(
            `  Total: ${plugin.downloads.total?.toLocaleString() || "N/A"}`,
          );
          // eslint-disable-line no-console
          console.log(
            `  Monthly: ${plugin.downloads.monthly?.toLocaleString() || "N/A"}`,
          );
          // eslint-disable-line no-console
        }
      } catch (error) {
        logger.error("❌ Failed to get plugin info:", error.message);
        process.exit(1);
      }
    });

  // Plugin install command
  pluginCmd
    .command("install")
    .description("Install a plugin from the marketplace")
    .argument("<name>", "Plugin name")
    .option("--version <version>", "Specific version to install", "latest")
    .option("--registry <url>", "Custom registry URL")
    .option("--save", "Add to .ragrc.json configuration")
    .option("--dev", "Install as development dependency")
    .action(async (name, _options) => {
      try {
        console.log(`📦 Installing plugin '${name}'...`);
        // eslint-disable-line no-console

        const _registryUrl = _options.registry || DEFAULT_REGISTRY_URLS[0];
        const registry = await fetchRegistry(_registryUrl);

        const resolver = createVersionResolver(registry);
        const resolution = await resolver.resolveVersion(
          name,
          _options.version,
        );

        console.log(`✅ Resolved ${name}@${resolution.version}`);
        // eslint-disable-line no-console

        // In a real implementation, this would download and install the plugin
        console.log(`📥 Downloading from: ${resolution.downloadUrl}`);
        // eslint-disable-line no-console
        console.log(`🔒 Integrity: ${resolution.integrity}`);
        // eslint-disable-line no-console
        console.log(`📊 Size: ${(resolution.size / 1024).toFixed(1)} KB`);
        // eslint-disable-line no-console

        if (_options.save) {
          await addToRagrcConfig(name, resolution.version, _options.dev);
          console.log("💾 Added to .ragrc.json");
          // eslint-disable-line no-console
        }

        console.log(
          `🎉 Plugin '${name}@${resolution.version}' installed successfully!`,
        );
        // eslint-disable-line no-console
      } catch (error) {
        logger.error("❌ Plugin installation failed:", error.message);
        process.exit(1);
      }
    });

  // Plugin publish command
  pluginCmd
    .command("publish")
    .description("Publish a plugin to the marketplace")
    .argument("[path]", "Plugin directory path", ".")
    .option("--registry-url <url>", "Registry URL")
    .option("--auth-token <token>", "Authentication token")
    .option("--dry-run", "Perform a dry run without actually publishing")
    .option("--output-dir <dir>", "Output directory for package")
    .action(async (pluginPath, _options) => {
      try {
        const publisher = new PluginPublisher({
          registryUrl: _options.registryUrl,
          authToken: _options.authToken,
          dryRun: _options.dryRun,
        });

        const result = await publisher.publishPlugin(pluginPath, {
          outputDir: _options.outputDir,
        });

        if (result.success) {
          if (result.dryRun) {
            console.log("\n🧪 Dry run completed successfully!");
            // eslint-disable-line no-console
            console.log(
              `Plugin: ${result.metadata.name}@${result.metadata.version}`,
            );
            // eslint-disable-line no-console
            console.log(
              `Package size: ${(result.packageInfo.size / 1024).toFixed(1)} KB`,
            );
            // eslint-disable-line no-console
            console.log(`Files: ${result.packageInfo.files.length}`);
            // eslint-disable-line no-console
          } else {
            console.log("\n🎉 Plugin published successfully!");
            // eslint-disable-line no-console
            console.log(`Download URL: ${result.publishResult.downloadUrl}`);
            // eslint-disable-line no-console
          }
        } else {
          console.error(`❌ Publishing failed: ${result.error}`);
          // eslint-disable-line no-console
          process.exit(1);
        }
      } catch (error) {
        logger.error("❌ Plugin publishing failed:", error.message);
        process.exit(1);
      }
    });

  // Plugin validate command
  pluginCmd
    .command("validate")
    .description("Validate a plugin for marketplace publishing")
    .argument("[path]", "Plugin directory path", ".")
    .action(async (pluginPath) => {
      try {
        console.log("🔍 Validating plugin...");
        // eslint-disable-line no-console

        const { ready, issues } =
          await PublishingUtils.validateForPublishing(pluginPath);

        if (ready) {
          console.log("✅ Plugin is ready for publishing!");
          // eslint-disable-line no-console

          // Show publishing checklist
          const checklist = PublishingUtils.generatePublishingChecklist({});
          console.log("\n📋 Publishing checklist:");
          // eslint-disable-line no-console
          checklist.forEach((item) => console.log(`  ${item}`));
          // eslint-disable-line no-console
        } else {
          console.log("❌ Plugin validation failed:");
          // eslint-disable-line no-console
          issues.forEach((issue) => console.log(`  • ${issue}`));
          // eslint-disable-line no-console
          process.exit(1);
        }
      } catch (error) {
        logger.error("❌ Plugin validation failed:", error.message);
        process.exit(1);
      }
    });

  // Plugin init command
  pluginCmd
    .command("init")
    .description("Initialize a new plugin project")
    .argument("<name>", "Plugin name")
    .option(
      "--_type <_type>",
      "Plugin _type (loader, embedder, retriever, llm, reranker)",
      "loader",
    )
    .option("--author <author>", "Plugin author")
    .option("--license <license>", "Plugin license", "MIT")
    .option("--template <template>", "Template to use", "basic")
    .action(async (name, _options) => {
      try {
        console.log(`🚀 Initializing plugin '${name}'...`);
        // eslint-disable-line no-console

        const pluginDir = path.join(process.cwd(), name);

        // Check if directory already exists
        try {
          await fs.access(pluginDir);
          console.log(`❌ Directory '${name}' already exists.`);
          // eslint-disable-line no-console
          process.exit(1);
        } catch (error) {
          // Directory doesn't exist, which is good
        }

        // Create plugin directory
        await fs.mkdir(pluginDir, { recursive: true });

        // Generate plugin metadata
        const metadata = MetadataUtils.createTemplate(_options._type, name, {
          author: _options.author,
          license: _options.license,
        });

        // Create package.json
        const packageJson = {
          name,
          version: metadata.version,
          description: metadata.description,
          main: "index.js",
          _type: "module",
          keywords: metadata.keywords,
          author: metadata.author,
          license: metadata.license,
          engines: metadata.engines,
          dependencies: {},
          devDependencies: {
            jest: "^29.0.0",
          },
          scripts: {
            test: "jest",
            lint: "eslint .",
            prepare: "npm test",
          },
        };

        await fs.writeFile(
          path.join(pluginDir, "package.json"),
          JSON.stringify(packageJson, null, 2),
        );

        // Create main plugin file
        const pluginCode = generatePluginTemplate(
          _options._type,
          name,
          metadata,
        );
        await fs.writeFile(path.join(pluginDir, "index.js"), pluginCode);

        // Create README.md
        const readme = generateReadmeTemplate(name, _options._type, metadata);
        await fs.writeFile(path.join(pluginDir, "README.md"), readme);

        // Create LICENSE file
        const license = generateLicenseTemplate(
          _options.license,
          metadata.author,
        );
        await fs.writeFile(path.join(pluginDir, "LICENSE"), license);

        // Create test file
        const testCode = generateTestTemplate(_options._type, name);
        await fs.writeFile(path.join(pluginDir, `${name}.test.js`), testCode);

        console.log(`✅ Plugin '${name}' initialized successfully!`);
        // eslint-disable-line no-console
        console.log("\nNext steps:");
        // eslint-disable-line no-console
        console.log(`  cd ${name}`);
        // eslint-disable-line no-console
        console.log("  npm install");
        // eslint-disable-line no-console
        console.log("  npm test");
        // eslint-disable-line no-console
        console.log("  rag-pipeline plugin validate");
        // eslint-disable-line no-console
      } catch (error) {
        logger.error("❌ Plugin initialization failed:", error.message);
        process.exit(1);
      }
    });

  // Plugin list command
  pluginCmd
    .command("list")
    .description("List installed plugins")
    .option("--_type <_type>", "Filter by plugin _type")
    .option("--registry <url>", "Custom registry URL")
    .action(async (_options) => {
      try {
        // Read local .ragrc.json to see configured plugins
        const configPath = path.join(process.cwd(), ".ragrc.json");

        try {
          const configContent = await fs.readFile(configPath, "utf-8");
          const _config = JSON.parse(configContent);

          console.log("📦 Configured plugins:\n");
          // eslint-disable-line no-console

          const pluginTypes = [
            "loader",
            "embedder",
            "retriever",
            "llm",
            "reranker",
          ];

          for (const _type of pluginTypes) {
            if (_options._type && _options._type !== _type) continue;

            const plugins = _config.plugins?.[_type] || _config[_type] || {};

            if (Object.keys(plugins).length > 0) {
              console.log(`${_type.toUpperCase()}:`);
              // eslint-disable-line no-console
              for (const [name, spec] of Object.entries(plugins)) {
                const version =
                  typeof spec === "object"
                    ? spec.version || "latest"
                    : "latest";
                console.log(`  ${name}@${version}`);
                // eslint-disable-line no-console
              }
              console.log("");
              // eslint-disable-line no-console
            }
          }
        } catch (error) {
          console.log("No .ragrc.json found in current directory.");
          // eslint-disable-line no-console
        }
      } catch (error) {
        logger.error("❌ Failed to list plugins:", error.message);
        process.exit(1);
      }
    });

  return pluginCmd;
}

/**
 * Fetch plugin registry from URL
 * @param {string} registryUrl - Registry URL
 * @returns {Promise<object>} Registry data
 */
async function fetchRegistry(_registryUrl) {
  // In a real implementation, this would make an HTTP request
  // For now, return a mock registry
  return {
    version: "1.0.0",
    plugins: {},
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Search plugins in registry
 * @param {object} registry - Plugin registry
 * @param {string} query - Search query
 * @param {object} _options - Search _options
 * @returns {Array<object>} Search results
 */
function searchPlugins(_registry, _query, _options) {
  const results = [];

  for (const [name, plugin] of Object.entries(_registry.plugins)) {
    let matches = true;

    // Query matching
    if (_query) {
      const searchText =
        `${name} ${plugin.metadata.description} ${plugin.metadata.keywords.join(" ")}`.toLowerCase();
      matches = matches && searchText.includes(_query.toLowerCase());
    }

    // Type filtering
    if (_options._type) {
      matches = matches && plugin.metadata._type === _options._type;
    }

    // Tag filtering
    if (_options.tag) {
      matches = matches && plugin.metadata.tags.includes(_options.tag);
    }

    // Author filtering
    if (_options.author) {
      matches =
        matches &&
        plugin.metadata.author
          .toLowerCase()
          .includes(_options.author.toLowerCase());
    }

    if (matches) {
      results.push(plugin);
    }
  }

  // Sort by relevance (downloads, then name)
  results.sort((a, b) => {
    const aDownloads = a.downloads?.total || 0;
    const bDownloads = b.downloads?.total || 0;

    if (aDownloads !== bDownloads) {
      return bDownloads - aDownloads;
    }

    return a.metadata.name.localeCompare(b.metadata.name);
  });

  return results.slice(0, parseInt(_options.limit));
}

/**
 * Add plugin to .ragrc.json configuration
 * @param {string} name - Plugin name
 * @param {string} version - Plugin version
 * @param {boolean} dev - Development dependency
 * @returns {Promise<void>}
 */
async function addToRagrcConfig(_name, _version, _dev = false) {
  const configPath = path.join(process.cwd(), ".ragrc.json");

  let _config = {};
  try {
    const configContent = await fs.readFile(configPath, "utf-8");
    _config = JSON.parse(configContent);
  } catch (error) {
    // File doesn't exist, create new config
  }

  // Determine plugin type (would need to be detected from registry)
  const pluginType = "loader"; // Placeholder

  if (!_config.plugins) {
    _config.plugins = {};
  }

  if (!_config.plugins[pluginType]) {
    _config.plugins[pluginType] = {};
  }

  _config.plugins[pluginType][_name] = {
    name: _name,
    version: _version,
    source: "registry",
  };

  await fs.writeFile(configPath, JSON.stringify(_config, null, 2));
}

/**
 * Generate plugin template code
 * @param {string} _type - Plugin _type
 * @param {string} name - Plugin name
 * @param {object} metadata - Plugin metadata
 * @returns {string} Plugin code
 */
function generatePluginTemplate(_type, _name, _metadata) {
  const className = name
    .split("-")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join("");

  return `/**
 * ${metadata.description}
 * @author ${metadata.author}
 * @version ${metadata.version}
 */

/**
 * Plugin metadata - required for marketplace
 */
const metadata = ${JSON.stringify(metadata, null, 2)};

/**
 * ${className} plugin implementation
 */
class ${className} {
  constructor(_config = {}) {
    this._config = _config;
  }

  /**
   * ${
     _type === "loader"
       ? "Load documents from source"
       : _type === "embedder"
         ? "Generate embeddings for text chunks"
         : _type === "retriever"
           ? "Retrieve relevant documents"
           : _type === "llm"
             ? "Generate text using language model"
             : "Rerank search results"
   }
   * @param {any} input - Input data
   * @returns {Promise<any>} Processed output
   */
  async ${
    _type === "loader"
      ? "load"
      : _type === "embedder"
        ? "embed"
        : _type === "retriever"
          ? "retrieve"
          : _type === "llm"
            ? "generate"
            : "rerank"
  }(input) {
    // TODO: Implement ${_type} logic
    throw new Error('${className}.${
      _type === "loader"
        ? "load"
        : _type === "embedder"
          ? "embed"
          : _type === "retriever"
            ? "retrieve"
            : _type === "llm"
              ? "generate"
              : "rerank"
    } not implemented');
  }
}

module.exports = ${className};
`;
}

/**
 * Generate README template
 * @param {string} name - Plugin name
 * @param {string} _type - Plugin _type
 * @param {object} metadata - Plugin metadata
 * @returns {string} README content
 */
function generateReadmeTemplate(_name, _type, _metadata) {
  return `# ${name}

${metadata.description}

## Installation

\`\`\`bash
rag-pipeline plugin install ${name}
\`\`\`

## Usage

\`\`\`javascript
import { ${name
    .split("-")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join("")} } from '${name}';

const ${_type} = new ${name
    .split("-")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join("")}({
  // Configuration options
});

// Use the ${_type}
const result = await ${_type}.${
    _type === "loader"
      ? "load"
      : _type === "embedder"
        ? "embed"
        : _type === "retriever"
          ? "retrieve"
          : _type === "llm"
            ? "generate"
            : "rerank"
  }(input);
\`\`\`

## Configuration

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| \`option1\` | \`string\` | \`"default"\` | Description of option1 |

## License

${metadata.license}
`;
}

/**
 * Generate LICENSE template
 * @param {string} license - License _type
 * @param {string} author - Author name
 * @returns {string} License content
 */
function generateLicenseTemplate(_license, _author) {
  if (_license === "MIT") {
    return `MIT License

Copyright (c) ${new Date().getFullYear()} ${_author}

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
`;
  }

  return `Copyright (c) ${new Date().getFullYear()} ${_author}

All rights reserved.
`;
}

/**
 * Generate test template
 * @param {string} _type - Plugin _type
 * @param {string} name - Plugin name
 * @returns {string} Test code
 */
function generateTestTemplate(_type, _name) {
  const className = _name
    .split("-")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join("");

  return `/**
 * Tests for ${_name} plugin
 */

import { ${className} } from './index.js';

describe('${className}', () => {
  let ${_type};

  beforeEach(() => {
    ${_type} = new ${className}();
  });

  describe('constructor', () => {
    it('should initialize with default _config', () => {
      expect(${_type}).toBeInstanceOf(${className});
      expect(${_type}._config).toEqual({});
    });

    it('should accept custom _config', () => {
      const _config = { option1: 'value1' };
      const customPlugin = new ${className}(_config);
      expect(customPlugin._config).toEqual(_config);
    });
  });

  describe('${
    _type === "loader"
      ? "load"
      : _type === "embedder"
        ? "embed"
        : _type === "retriever"
          ? "retrieve"
          : _type === "llm"
            ? "generate"
            : "rerank"
  }', () => {
    it('should be implemented', async () => {
      // TODO: Add actual tests once method is implemented
      await expect(${_type}.${
        _type === "loader"
          ? "load"
          : _type === "embedder"
            ? "embed"
            : _type === "retriever"
              ? "retrieve"
              : _type === "llm"
                ? "generate"
                : "rerank"
      }('test input'))
        .rejects.toThrow('not implemented');
    });
  });
});
`;
}

const metadata = {}; // Initialize metadata object

module.exports = {
  createPluginMarketplaceCommands,
  metadata,
};
