# Interactive Configuration Wizard

Comprehensive guide for the RAG Pipeline Interactive Configuration Wizard CLI command.

## Overview

The Interactive Configuration Wizard provides a user-friendly way to create and manage RAG pipeline configurations through an intuitive CLI interface. It features:

- **Template-based Configuration**: Start with pre-defined templates for common use cases
- **Interactive Prompts**: Step-by-step guidance through configuration options
- **Real-time Validation**: Instant feedback on configuration validity
- **Plugin Discovery**: Browse and select from available plugins
- **Configuration Preview**: Review before saving
- **Testing Support**: Validate generated configurations

## Quick Start

### Basic Usage

Create a new configuration interactively:

```bash
npm run wizard
```

This launches the wizard with template selection.

### Using a Template

Start with a pre-defined template:

```bash
npm run wizard -- --template minimal
```

Available templates: `minimal`, `production`, `development`, `testing`, `custom`

### List Templates

View all available templates:

```bash
npm run wizard -- --list-templates
```

### Validate Existing Configuration

Validate a configuration file:

```bash
npm run wizard -- --validate .ragrc.json
```

## Templates

### Minimal Template

**Purpose**: Basic RAG pipeline with essential plugins

**Use Case**: Getting started, simple applications

**Features**:

- Essential plugins only (loader, embedder, retriever, llm)
- Basic observability (info level logging)
- No performance optimizations
- Development environment

**Configuration**:

```bash
npm run wizard -- --template minimal
```

### Production Template

**Purpose**: Production-grade configuration with full features

**Use Case**: Production deployments, enterprise applications

**Features**:

- All plugin types including reranker
- Full observability (logging, tracing, metrics)
- Performance optimizations (caching, parallel processing, streaming)
- Retry logic with exponential backoff
- Security features (encryption, authentication)

**Configuration**:

```bash
npm run wizard -- --template production
```

**Includes**:

- Batch processing (100 items/batch)
- Top-K retrieval (10 results, 0.7 threshold)
- Retry attempts (3 max with exponential backoff)
- Caching (1000 entries, 3600s TTL)
- Parallel processing (5 concurrent operations)
- Memory management (512 MB limit)
- Distributed tracing (10% sample rate)
- Metrics collection (60s interval)

### Development Template

**Purpose**: Development environment with verbose logging

**Use Case**: Local development, debugging

**Features**:

- Local models (no API dependencies)
- Debug level logging with console output
- Basic caching with short TTL (600s)
- Local embedder and LLM

**Configuration**:

```bash
npm run wizard -- --template development
```

**Ideal for**:

- Testing without external API calls
- Debugging pipeline behavior
- Rapid iteration
- Offline development

### Testing Template

**Purpose**: Testing configuration with mock plugins

**Use Case**: Automated testing, CI/CD pipelines

**Features**:

- Mock plugins from local files
- Minimal logging (warn level)
- No external dependencies
- Fast execution

**Configuration**:

```bash
npm run wizard -- --template testing
```

**Mock Plugins**:

```json
{
  "loader": "./src/mocks/pdf-loader.js",
  "embedder": "./src/mocks/openai-embedder.js",
  "retriever": "./src/mocks/pinecone-retriever.js",
  "llm": "./src/mocks/openai-llm.js"
}
```

### Custom Template

**Purpose**: Build configuration from scratch

**Use Case**: Unique requirements, full customization

**Features**:

- Interactive wizard for all settings
- Step-by-step configuration
- Plugin discovery and selection
- Custom performance tuning
- Full observability options

**Configuration**:

```bash
npm run wizard -- --template custom
```

Or simply:

```bash
npm run wizard
```

## Command Options

### `--output <path>`

Specify output configuration file path.

**Default**: `.ragrc.json`

**Example**:

```bash
npm run wizard -- --output config/production.ragrc.json
```

### `--template <name>`

Use a specific template without interactive selection.

**Options**: `minimal`, `production`, `development`, `testing`, `custom`

**Example**:

```bash
npm run wizard -- --template production --output prod.ragrc.json
```

### `--list-templates`

List all available templates with descriptions.

**Example**:

```bash
npm run wizard -- --list-templates
```

**Output**:

```
📋 Available Configuration Templates:

  minimal:
    Basic RAG pipeline with essential plugins
    • 4 plugins configured

  production:
    Production-grade configuration with monitoring and optimization
    • 5 plugins configured
    • Features: caching, parallel, tracing

  development:
    Development environment with verbose logging
    • 4 plugins configured
    • Features: caching

  testing:
    Testing configuration with mock plugins
    • 4 plugins configured
```

### `--validate <file>`

Validate an existing configuration file.

**Example**:

```bash
npm run wizard -- --validate .ragrc.json
```

**Output** (success):

```
🔍 Validating configuration: .ragrc.json

✅ Configuration is valid!

📋 Configuration Summary:
  Project:
    Name: my-rag-pipeline
    Environment: production

  Plugins:
    loader: file-loader
    embedder: openai-embedder
    retriever: vector-retriever
    llm: openai-llm
```

**Output** (failure):

```
❌ Configuration is invalid:

  • /plugins/loader: should be object
  • /pipeline/stages: is required
```

### `--no-save`

Don't save configuration (preview only).

**Example**:

```bash
npm run wizard -- --template minimal --no-save
```

This generates the configuration but doesn't write to file, useful for:

- Previewing templates
- Testing configuration generation
- Comparing different templates

### `--quiet`

Minimal output.

**Example**:

```bash
npm run wizard -- --template minimal --quiet
```

Reduces console output to essential information only.

## Interactive Wizard Steps

When using the full interactive wizard (`--template custom` or no template), you'll go through these steps:

### 1. Project Setup

Configure basic project metadata:

- **Project name**: Identifier for your pipeline
- **Description**: Brief description
- **Author**: Your name or organization
- **Environment**: Development, production, or testing

### 2. Plugin Selection

Choose plugins for each type:

- **Loader**: Document loading (file, URL, database)
- **Embedder**: Text embedding (OpenAI, local, custom)
- **Retriever**: Vector retrieval (similarity search)
- **LLM**: Language model (OpenAI, local, custom)
- **Reranker** (optional): Result reranking

For each plugin:

- Select from registry or use custom
- Choose version
- Configure settings (if applicable)

### 3. General Settings

Configure pipeline-wide settings:

- **Caching**: Enable result caching
- **Cache size**: Number of cached entries
- **Cache TTL**: Time-to-live in seconds
- **Timeout**: Pipeline execution timeout

### 4. Pipeline Configuration

Define pipeline execution:

- **Stages**: Select and order pipeline stages
- **Retries**: Enable automatic retries
- **Max retries**: Maximum retry attempts
- **Backoff strategy**: Exponential or linear

### 5. Performance Settings

Optimize for performance:

- **Parallel processing**: Enable concurrent operations
- **Max concurrency**: Number of parallel operations
- **Batch size**: Items per batch
- **Streaming**: Enable for large documents
- **Memory limit**: Maximum memory usage (MB)

### 6. Observability Settings

Configure monitoring and logging:

- **Log level**: Debug, info, warn, error
- **Tracing**: Enable distributed tracing
- **Metrics**: Enable metrics collection
- **Export URL**: OpenTelemetry collector endpoint

### 7. Preview and Save

Review and save configuration:

- View configuration summary
- Choose filename
- Optionally run validation test
- Save to file

## Configuration Customization

### Customizing Templates

Start with a template and customize:

```bash
npm run wizard -- --template minimal
```

When prompted:

```
Would you like to customize this template? (Y/n)
```

Choose `Y` to customize:

- Project name and description
- Individual plugin settings
- Performance parameters
- Observability options

### Manual Customization

After generation, edit `.ragrc.json` directly:

```json
{
  "metadata": {
    "name": "my-pipeline",
    "version": "1.0.0"
  },
  "plugins": {
    "loader": {
      "file-loader": {
        "name": "file-loader",
        "version": "latest",
        "config": {
          "basePath": "./documents",
          "extensions": [".pdf", ".txt", ".md"]
        }
      }
    }
  },
  "pipeline": {
    "stages": ["loader", "embedder", "retriever", "llm"]
  }
}
```

Then validate:

```bash
npm run wizard -- --validate .ragrc.json
```

## Real-time Validation

The wizard validates inputs in real-time:

### Plugin Names

```
Plugin name: my-plugin
✓ Valid plugin name
```

```
Plugin name:
✗ Plugin name is required
```

### Configuration Values

```
Batch size: 100
✓ Valid batch size
```

```
Batch size: -10
✗ Batch size must be positive
```

### File Paths

```
Local path: ./src/plugins/my-plugin.js
✓ Valid path
```

```
Local path: ./nonexistent.js
✗ File does not exist
```

## Best Practices

### 1. Start with Templates

Use templates as a foundation:

- **Minimal** for quick starts
- **Development** for local work
- **Production** for deployments
- **Testing** for CI/CD

### 2. Customize Incrementally

Make incremental changes:

1. Start with template
2. Customize metadata
3. Add/remove plugins
4. Tune performance
5. Configure observability

### 3. Validate Frequently

Validate after changes:

```bash
npm run wizard -- --validate .ragrc.json
```

### 4. Version Control

Track configuration changes:

```bash
git add .ragrc.json
git commit -m "feat: update pipeline configuration"
```

### 5. Environment-Specific Configs

Maintain separate configurations:

```
.ragrc.development.json
.ragrc.staging.json
.ragrc.production.json
```

Generate with different templates:

```bash
npm run wizard -- --template development --output .ragrc.development.json
npm run wizard -- --template production --output .ragrc.production.json
```

### 6. Document Customizations

Add comments (in external docs) explaining:

- Why specific plugins were chosen
- Performance tuning rationale
- Custom configuration values

### 7. Test Configurations

Always test generated configurations:

```bash
npm run wizard -- --validate .ragrc.json
npm run pipeline:test
```

## Troubleshooting

### Wizard Fails to Start

**Problem**: `inquirer` not found

**Solution**:

```bash
npm install
```

### Configuration Invalid

**Problem**: Generated configuration fails validation

**Solution**:

1. Check error messages
2. Review required fields
3. Verify plugin names
4. Validate JSON syntax

### Template Not Found

**Problem**: `Unknown template: xyz`

**Solution**:

```bash
npm run wizard -- --list-templates
```

Use a valid template name.

### Save Permission Denied

**Problem**: Cannot write configuration file

**Solution**:

- Check file permissions
- Verify output directory exists
- Use `--output` to specify different location

### Plugin Not Available

**Problem**: Selected plugin not in registry

**Solution**:

- Use custom plugin option
- Specify local path or Git URL
- Check registry URL configuration

## Examples

### Example 1: Quick Start

Create minimal configuration:

```bash
npm run wizard -- --template minimal
```

### Example 2: Production Deployment

Create production configuration with customization:

```bash
npm run wizard -- --template production --output prod.ragrc.json
```

Follow prompts to customize project name and description.

### Example 3: Development Setup

Create development configuration:

```bash
npm run wizard -- --template development
```

### Example 4: Testing Pipeline

Create testing configuration for CI/CD:

```bash
npm run wizard -- --template testing --output .ragrc.test.json
```

### Example 5: Custom Configuration

Build from scratch:

```bash
npm run wizard
```

Select "Custom (Interactive)" and follow all steps.

### Example 6: Validate and Fix

Validate existing configuration:

```bash
npm run wizard -- --validate .ragrc.json
```

Fix errors and re-validate.

## Integration

### CLI Integration

The wizard integrates with the existing CLI:

```bash
# Generate configuration
npm run wizard

# Use configuration
npm run pipeline:start

# Test pipeline
npm run pipeline:test
```

### CI/CD Integration

Use in automated pipelines:

```yaml
# GitHub Actions
- name: Generate Test Config
  run: npm run wizard -- --template testing --output .ragrc.test.json --quiet

- name: Validate Config
  run: npm run wizard -- --validate .ragrc.test.json
```

### Programmatic Usage

Use in Node.js scripts:

```javascript
const { useTemplate } = require("./src/cli/commands/wizard");

async function generateConfig() {
  const config = await useTemplate("production", {
    output: "config.json",
    save: true,
  });

  console.log("Configuration generated:", config.metadata.name);
}
```

## Advanced Features

### Template Inheritance

Templates can be extended:

```javascript
const baseTemplate = TEMPLATES.minimal;
const customTemplate = {
  ...baseTemplate,
  config: {
    ...baseTemplate.config,
    performance: {
      caching: { enabled: true },
    },
  },
};
```

### Custom Validators

Add custom validation:

```javascript
const validation = validateRagrc(config);

if (validation.valid) {
  // Additional custom validation
  if (config.plugins.llm["openai-llm"]) {
    if (!process.env.OPENAI_API_KEY) {
      console.warn("OpenAI API key not configured");
    }
  }
}
```

### Configuration Migrations

Migrate old configurations:

```bash
npm run wizard -- --validate old-config.json
# Review errors
# Generate new config with wizard
npm run wizard -- --template production
# Manually port settings
```

## Support

For issues or questions:

- **Documentation**: [docs/](../docs/)
- **Issues**: [GitHub Issues](https://github.com/devilsdev/rag-pipeline-utils/issues)
- **Examples**: [examples/](../examples/)

## Related Documentation

- [Interactive Wizard Implementation](../src/cli/interactive-wizard.js)
- [Configuration Schema](../src/config/enhanced-ragrc-schema.js)
- [Plugin Marketplace](./plugin-marketplace.md)
- [CLI Commands](./cli-commands.md)
