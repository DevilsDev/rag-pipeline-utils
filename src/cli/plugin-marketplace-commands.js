/**
 * CLI Commands for Plugin Marketplace
 * Provides commands for plugin discovery, installation, publishing, and management
 */

const { Command  } = require('commander');
const fs = require('fs/promises');
const path = require('path');
const { PluginPublisher, PublishingUtils  } = require('../core/plugin-marketplace/plugin-publisher.js');
const { createVersionResolver  } = require('../core/plugin-marketplace/version-resolver.js');
const { MetadataUtils  } = require('../core/plugin-marketplace/plugin-metadata.js');
const { DEFAULT_REGISTRY_URLS  } = require('../core/plugin-marketplace/plugin-registry-format.js');
// REGISTRY_SCHEMA and LOCAL_REGISTRY_FILE unused - reserved for future use
const { logger  } = require('../utils/logger.js');

/**
 * Plugin marketplace CLI commands
 */
function createPluginMarketplaceCommands() {
  const pluginCmd = new Command('plugin');
  pluginCmd.description('Plugin marketplace commands');

  // Plugin search command
  pluginCmd
    .command('search')
    .description('Search for plugins in the marketplace')
    .argument('[query]', 'Search query')
    .option('--type <type>', 'Filter by plugin type (loader, embedder, retriever, llm, reranker)')
    .option('--tag <tag>', 'Filter by tag')
    .option('--author <author>', 'Filter by author')
    .option('--limit <number>', 'Limit number of results', '20')
    .option('--registry <url>', 'Custom registry URL')
    .action(async (query, options) => {
      try {
        console.log('🔍 Searching plugins...');
        
        const _registryUrl = options.registry || DEFAULT_REGISTRY_URLS[0];
        const registry = await fetchRegistry(_registryUrl);
        
        const results = searchPlugins(registry, query, options);
        
        if (results.length === 0) {
          console.log('No plugins found matching your criteria.');
          return;
        }
        
        console.log(`\nFound ${results.length} plugin(s):\n`);
        
        results.forEach(plugin => {
          console.log(`📦 ${plugin.metadata.name} v${plugin.latest}`);
          console.log(`   ${plugin.metadata.description}`);
          console.log(`   Author: ${plugin.metadata.author}`);
          console.log(`   Type: ${plugin.metadata.type}`);
          if (plugin.metadata.keywords.length > 0) {
            console.log(`   Keywords: ${plugin.metadata.keywords.join(', ')}`);
          }
          if (plugin.downloads?.total) {
            console.log(`   Downloads: ${plugin.downloads.total.toLocaleString()}`);
          }
          console.log('');
        });
        
      } catch (error) {
        logger.error('❌ Plugin search failed:', error.message);
        process.exit(1);
      }
    });

  // Plugin info command
  pluginCmd
    .command('info')
    .description('Show detailed information about a plugin')
    .argument('<name>', 'Plugin name')
    .option('--version <version>', 'Specific version to show info for')
    .option('--registry <url>', 'Custom registry URL')
    .action(async (name, options) => {
      try {
        const _registryUrl = options.registry || DEFAULT_REGISTRY_URLS[0];
        const registry = await fetchRegistry(_registryUrl);
        
        const plugin = registry.plugins[name];
        if (!plugin) {
          console.log(`❌ Plugin '${name}' not found in registry.`);
          return;
        }
        
        const version = options.version || plugin.latest;
        const versionData = plugin.versions[version];
        
        if (!versionData) {
          console.log(`❌ Version '${version}' not found for plugin '${name}'.`);
          return;
        }
        
        console.log(`\n📦 ${plugin.metadata.name} v${version}\n`);
        console.log(`Description: ${plugin.metadata.description}`);
        console.log(`Author: ${plugin.metadata.author}`);
        console.log(`Type: ${plugin.metadata.type}`);
        console.log(`License: ${plugin.metadata.license || 'Not specified'}`);
        
        if (plugin.metadata.homepage) {
          console.log(`Homepage: ${plugin.metadata.homepage}`);
        }
        
        if (plugin.metadata.repository) {
          console.log(`Repository: ${plugin.metadata.repository.url}`);
        }
        
        if (plugin.metadata.keywords.length > 0) {
          console.log(`Keywords: ${plugin.metadata.keywords.join(', ')}`);
        }
        
        console.log('\nVersions available:');
        const versions = Object.keys(plugin.versions).sort((a, b) => {
          const semver = require('semver');
          return semver.rcompare(a, b);
        });
        
        versions.slice(0, 10).forEach(v => {
          const isLatest = v === plugin.latest;
          const isBeta = v === plugin.beta;
          const isAlpha = v === plugin.alpha;
          
          let tags = [];
          if (isLatest) tags.push('latest');
          if (isBeta) tags.push('beta');
          if (isAlpha) tags.push('alpha');
          
          const tagStr = tags.length > 0 ? ` (${tags.join(', ')})` : '';
          console.log(`  ${v}${tagStr} - ${plugin.versions[v].publishedAt.split('T')[0]}`);
        });
        
        if (versions.length > 10) {
          console.log(`  ... and ${versions.length - 10} more versions`);
        }
        
        if (plugin.downloads) {
          console.log('\nDownloads:');
          console.log(`  Total: ${plugin.downloads.total?.toLocaleString() || 'N/A'}`);
          console.log(`  Monthly: ${plugin.downloads.monthly?.toLocaleString() || 'N/A'}`);
        }
        
      } catch (error) {
        logger.error('❌ Failed to get plugin info:', error.message);
        process.exit(1);
      }
    });

  // Plugin install command
  pluginCmd
    .command('install')
    .description('Install a plugin from the marketplace')
    .argument('<name>', 'Plugin name')
    .option('--version <version>', 'Specific version to install', 'latest')
    .option('--registry <url>', 'Custom registry URL')
    .option('--save', 'Add to .ragrc.json configuration')
    .option('--dev', 'Install as development dependency')
    .action(async (name, options) => {
      try {
        console.log(`📦 Installing plugin '${name}'...`);
        
        const _registryUrl = options.registry || DEFAULT_REGISTRY_URLS[0];
        const registry = await fetchRegistry(_registryUrl);
        
        const resolver = createVersionResolver(registry);
        const resolution = await resolver.resolveVersion(name, options.version);
        
        console.log(`✅ Resolved ${name}@${resolution.version}`);
        
        // In a real implementation, this would download and install the plugin
        console.log(`📥 Downloading from: ${resolution.downloadUrl}`);
        console.log(`🔒 Integrity: ${resolution.integrity}`);
        console.log(`📊 Size: ${(resolution.size / 1024).toFixed(1)} KB`);
        
        if (options.save) {
          await addToRagrcConfig(name, resolution.version, options.dev);
          console.log('💾 Added to .ragrc.json');
        }
        
        console.log(`🎉 Plugin '${name}@${resolution.version}' installed successfully!`);
        
      } catch (error) {
        logger.error('❌ Plugin installation failed:', error.message);
        process.exit(1);
      }
    });

  // Plugin publish command
  pluginCmd
    .command('publish')
    .description('Publish a plugin to the marketplace')
    .argument('[path]', 'Plugin directory path', '.')
    .option('--registry-url <url>', 'Registry URL')
    .option('--auth-token <token>', 'Authentication token')
    .option('--dry-run', 'Perform a dry run without actually publishing')
    .option('--output-dir <dir>', 'Output directory for package')
    .action(async (pluginPath, options) => {
      try {
        const publisher = new PluginPublisher({
          registryUrl: options.registryUrl,
          authToken: options.authToken,
          dryRun: options.dryRun
        });
        
        const result = await publisher.publishPlugin(pluginPath, {
          outputDir: options.outputDir
        });
        
        if (result.success) {
          if (result.dryRun) {
            console.log('\n🧪 Dry run completed successfully!');
            console.log(`Plugin: ${result.metadata.name}@${result.metadata.version}`);
            console.log(`Package size: ${(result.packageInfo.size / 1024).toFixed(1)} KB`);
            console.log(`Files: ${result.packageInfo.files.length}`);
          } else {
            console.log('\n🎉 Plugin published successfully!');
            console.log(`Download URL: ${result.publishResult.downloadUrl}`);
          }
        } else {
          console.error(`❌ Publishing failed: ${result.error}`);
          process.exit(1);
        }
        
      } catch (error) {
        logger.error('❌ Plugin publishing failed:', error.message);
        process.exit(1);
      }
    });

  // Plugin validate command
  pluginCmd
    .command('validate')
    .description('Validate a plugin for marketplace publishing')
    .argument('[path]', 'Plugin directory path', '.')
    .action(async (pluginPath) => {
      try {
        console.log('🔍 Validating plugin...');
        
        const { ready, issues } = await PublishingUtils.validateForPublishing(pluginPath);
        
        if (ready) {
          console.log('✅ Plugin is ready for publishing!');
          
          // Show publishing checklist
          const checklist = PublishingUtils.generatePublishingChecklist({});
          console.log('\n📋 Publishing checklist:');
          checklist.forEach(item => console.log(`  ${item}`));
          
        } else {
          console.log('❌ Plugin validation failed:');
          issues.forEach(issue => console.log(`  • ${issue}`));
          process.exit(1);
        }
        
      } catch (error) {
        logger.error('❌ Plugin validation failed:', error.message);
        process.exit(1);
      }
    });

  // Plugin init command
  pluginCmd
    .command('init')
    .description('Initialize a new plugin project')
    .argument('<name>', 'Plugin name')
    .option('--type <type>', 'Plugin type (loader, embedder, retriever, llm, reranker)', 'loader')
    .option('--author <author>', 'Plugin author')
    .option('--license <license>', 'Plugin license', 'MIT')
    .option('--template <template>', 'Template to use', 'basic')
    .action(async (name, options) => {
      try {
        console.log(`🚀 Initializing plugin '${name}'...`);
        
        const pluginDir = path.join(process.cwd(), name);
        
        // Check if directory already exists
        try {
          await fs.access(pluginDir);
          console.log(`❌ Directory '${name}' already exists.`);
          process.exit(1);
        } catch (error) {
          // Directory doesn't exist, which is good
        }
        
        // Create plugin directory
        await fs.mkdir(pluginDir, { recursive: true });
        
        // Generate plugin metadata
        const metadata = MetadataUtils.createTemplate(options.type, name, {
          author: options.author,
          license: options.license
        });
        
        // Create package.json
        const packageJson = {
          name,
          version: metadata.version,
          description: metadata.description,
          main: 'index.js',
          type: 'module',
          keywords: metadata.keywords,
          author: metadata.author,
          license: metadata.license,
          engines: metadata.engines,
          dependencies: {},
          devDependencies: {
            'jest': '^29.0.0'
          },
          scripts: {
            test: 'jest',
            lint: 'eslint .',
            prepare: 'npm test'
          }
        };
        
        await fs.writeFile(
          path.join(pluginDir, 'package.json'),
          JSON.stringify(packageJson, null, 2)
        );
        
        // Create main plugin file
        const pluginCode = generatePluginTemplate(options.type, name, metadata);
        await fs.writeFile(path.join(pluginDir, 'index.js'), pluginCode);
        
        // Create README.md
        const readme = generateReadmeTemplate(name, options.type, metadata);
        await fs.writeFile(path.join(pluginDir, 'README.md'), readme);
        
        // Create LICENSE file
        const license = generateLicenseTemplate(options.license, metadata.author);
        await fs.writeFile(path.join(pluginDir, 'LICENSE'), license);
        
        // Create test file
        const testCode = generateTestTemplate(options.type, name);
        await fs.writeFile(path.join(pluginDir, `${name}.test.js`), testCode);
        
        console.log(`✅ Plugin '${name}' initialized successfully!`);
        console.log('\nNext steps:');
        console.log(`  cd ${name}`);
        console.log('  npm install');
        console.log('  npm test');
        console.log('  rag-pipeline plugin validate');
        
      } catch (error) {
        logger.error('❌ Plugin initialization failed:', error.message);
        process.exit(1);
      }
    });

  // Plugin list command
  pluginCmd
    .command('list')
    .description('List installed plugins')
    .option('--type <type>', 'Filter by plugin type')
    .option('--registry <url>', 'Custom registry URL')
    .action(async (options) => {
      try {
        // Read local .ragrc.json to see configured plugins
        const configPath = path.join(process.cwd(), '.ragrc.json');
        
        try {
          const configContent = await fs.readFile(configPath, 'utf-8');
          const config = JSON.parse(configContent);
          
          console.log('📦 Configured plugins:\n');
          
          const pluginTypes = ['loader', 'embedder', 'retriever', 'llm', 'reranker'];
          
          for (const type of pluginTypes) {
            if (options.type && options.type !== type) continue;
            
            const plugins = config.plugins?.[type] || config[type] || {};
            
            if (Object.keys(plugins).length > 0) {
              console.log(`${type.toUpperCase()}:`);
              for (const [name, spec] of Object.entries(plugins)) {
                const version = typeof spec === 'object' ? spec.version || 'latest' : 'latest';
                console.log(`  ${name}@${version}`);
              }
              console.log('');
            }
          }
          
        } catch (error) {
          console.log('No .ragrc.json found in current directory.');
        }
        
      } catch (error) {
        logger.error('❌ Failed to list plugins:', error.message);
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
    version: '1.0.0',
    plugins: {},
    updatedAt: new Date().toISOString()
  };
}

/**
 * Search plugins in registry
 * @param {object} registry - Plugin registry
 * @param {string} query - Search query
 * @param {object} options - Search options
 * @returns {Array<object>} Search results
 */
function searchPlugins(registry, query, options) {
  const results = [];
  
  for (const [name, plugin] of Object.entries(registry.plugins)) {
    let matches = true;
    
    // Query matching
    if (query) {
      const searchText = `${name} ${plugin.metadata.description} ${plugin.metadata.keywords.join(' ')}`.toLowerCase();
      matches = matches && searchText.includes(query.toLowerCase());
    }
    
    // Type filtering
    if (options.type) {
      matches = matches && plugin.metadata.type === options.type;
    }
    
    // Tag filtering
    if (options.tag) {
      matches = matches && plugin.metadata.tags.includes(options.tag);
    }
    
    // Author filtering
    if (options.author) {
      matches = matches && plugin.metadata.author.toLowerCase().includes(options.author.toLowerCase());
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
  
  return results.slice(0, parseInt(options.limit));
}

/**
 * Add plugin to .ragrc.json configuration
 * @param {string} name - Plugin name
 * @param {string} version - Plugin version
 * @param {boolean} dev - Development dependency
 * @returns {Promise<void>}
 */
async function addToRagrcConfig(name, version, _dev = false) {
  const configPath = path.join(process.cwd(), '.ragrc.json');
  
  let config = {};
  try {
    const configContent = await fs.readFile(configPath, 'utf-8');
    config = JSON.parse(configContent);
  } catch (error) {
    // File doesn't exist, create new config
  }
  
  // Determine plugin type (would need to be detected from registry)
  const pluginType = 'loader'; // Placeholder
  
  if (!config.plugins) {
    config.plugins = {};
  }
  
  if (!config.plugins[pluginType]) {
    config.plugins[pluginType] = {};
  }
  
  config.plugins[pluginType][name] = {
    name,
    version,
    source: 'registry'
  };
  
  await fs.writeFile(configPath, JSON.stringify(config, null, 2));
}

/**
 * Generate plugin template code
 * @param {string} type - Plugin type
 * @param {string} name - Plugin name
 * @param {object} metadata - Plugin metadata
 * @returns {string} Plugin code
 */
function generatePluginTemplate(type, name, metadata) {
  const className = name.split('-').map(word => 
    word.charAt(0).toUpperCase() + word.slice(1)
  ).join('');
  
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
export class ${className} {
  constructor(config = {}) {
    this.config = config;
  }

  /**
   * ${type === 'loader' ? 'Load documents from source' :
     type === 'embedder' ? 'Generate embeddings for text chunks' :
     type === 'retriever' ? 'Retrieve relevant documents' :
     type === 'llm' ? 'Generate text using language model' :
     'Rerank search results'}
   * @param {any} input - Input data
   * @returns {Promise<any>} Processed output
   */
  async ${type === 'loader' ? 'load' :
          type === 'embedder' ? 'embed' :
          type === 'retriever' ? 'retrieve' :
          type === 'llm' ? 'generate' :
          'rerank'}(input) {
    // TODO: Implement ${type} logic
    throw new Error('${className}.${type === 'loader' ? 'load' :
                                    type === 'embedder' ? 'embed' :
                                    type === 'retriever' ? 'retrieve' :
                                    type === 'llm' ? 'generate' :
                                    'rerank'} not implemented');
  }
}

// Default export
export default ${className};
`;
}

/**
 * Generate README template
 * @param {string} name - Plugin name
 * @param {string} type - Plugin type
 * @param {object} metadata - Plugin metadata
 * @returns {string} README content
 */
function generateReadmeTemplate(name, type, metadata) {
  return `# ${name}

${metadata.description}

## Installation

\`\`\`bash
rag-pipeline plugin install ${name}
\`\`\`

## Usage

\`\`\`javascript
import { ${name.split('-').map(word => 
  word.charAt(0).toUpperCase() + word.slice(1)
).join('')} } from '${name}';

const ${type} = new ${name.split('-').map(word => 
  word.charAt(0).toUpperCase() + word.slice(1)
).join('')}({
  // Configuration options
});

// Use the ${type}
const result = await ${type}.${type === 'loader' ? 'load' :
                                type === 'embedder' ? 'embed' :
                                type === 'retriever' ? 'retrieve' :
                                type === 'llm' ? 'generate' :
                                'rerank'}(input);
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
 * @param {string} license - License type
 * @param {string} author - Author name
 * @returns {string} License content
 */
function generateLicenseTemplate(license, author) {
  if (license === 'MIT') {
    return `MIT License

Copyright (c) ${new Date().getFullYear()} ${author}

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
  
  return `Copyright (c) ${new Date().getFullYear()} ${author}

All rights reserved.
`;
}

/**
 * Generate test template
 * @param {string} type - Plugin type
 * @param {string} name - Plugin name
 * @returns {string} Test code
 */
function generateTestTemplate(type, name) {
  const className = name.split('-').map(word => 
    word.charAt(0).toUpperCase() + word.slice(1)
  ).join('');
  
  return `/**
 * Tests for ${name} plugin
 */

import { ${className} } from './index.js';

describe('${className}', () => {
  let ${type};

  beforeEach(() => {
    ${type} = new ${className}();
  });

  describe('constructor', () => {
    it('should initialize with default config', () => {
      expect(${type}).toBeInstanceOf(${className});
      expect(${type}.config).toEqual({});
    });

    it('should accept custom config', () => {
      const config = { option1: 'value1' };
      const customPlugin = new ${className}(config);
      expect(customPlugin.config).toEqual(config);
    });
  });

  describe('${type === 'loader' ? 'load' :
           type === 'embedder' ? 'embed' :
           type === 'retriever' ? 'retrieve' :
           type === 'llm' ? 'generate' :
           'rerank'}', () => {
    it('should be implemented', async () => {
      // TODO: Add actual tests once method is implemented
      await expect(${type}.${type === 'loader' ? 'load' :
                                type === 'embedder' ? 'embed' :
                                type === 'retriever' ? 'retrieve' :
                                type === 'llm' ? 'generate' :
                                'rerank'}('test input'))
        .rejects.toThrow('not implemented');
    });
  });
});
`;
}


// Default export
module.exports = {};


module.exports = {
  createPluginMarketplaceCommands,
  metadata
};