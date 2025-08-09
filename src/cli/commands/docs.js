/**
 * Documentation Automation CLI Commands
 * Comprehensive CLI interface for JSDoc automation, example synchronization, and interactive documentation
 */

const { Command } = require('commander'); // eslint-disable-line global-require
const { JSDocAutomation } = require('../../docs/jsdoc-automation.js'); // eslint-disable-line global-require
const { ExampleSynchronization } = require('../../docs/example-synchronization.js'); // eslint-disable-line global-require
const { InteractiveDocumentation } = require('../../docs/interactive-documentation.js'); // eslint-disable-line global-require
const { logger } = require('../../utils/logger.js'); // eslint-disable-line global-require

/**
 * Create documentation automation commands
 */
function createDocsCommands() {
  const docs = new Command('docs');
  docs.description('Documentation automation and generation commands');

  // Generate API documentation
  docs
    .command('generate')
    .description('Generate comprehensive API documentation')
    .option('-s, --source <dir>', 'Source directory to scan', 'src')
    .option('-o, --output <dir>', 'Output directory for documentation', 'docs/api')
    .option('-c, --_config <file>', 'JSDoc configuration file', 'jsdoc._config.json')
    .option('--no-interactive', 'Skip interactive documentation generation')
    .option('--no-examples', 'Skip example synchronization')
    .option('--include-private', 'Include private APIs in documentation')
    .action(async (_options) => {
      try {
        logger.info('Starting API documentation generation...');

        const automation = new JSDocAutomation({
          sourceDir: _options.source,
          outputDir: _options.output,
          configFile: _options._config,
          generateInteractive: _options.interactive,
          syncExamples: _options.examples,
          includePrivate: _options.includePrivate
        });

        const result = await automation.generateAPIDocumentation();

        logger.info('API documentation generation completed successfully');
        // eslint-disable-next-line no-console
        console.log('\n📚 Documentation Generation Results:'); // eslint-disable-line no-console
        // eslint-disable-next-line no-console
        console.log(`✅ Output Directory: ${result.outputDir}`); // eslint-disable-line no-console
        // eslint-disable-next-line no-console
        console.log(`📄 Generated Files: ${result.generatedFiles.length}`); // eslint-disable-line no-console
        // eslint-disable-next-line no-console
        console.log(`🏗️ API Structures: ${result.apiStructure.length}`); // eslint-disable-line no-console
        // eslint-disable-next-line no-console
        console.log(`💡 Examples: ${result.examples.length}`); // eslint-disable-line no-console

        if (result.generatedFiles.length > 0) {
          // eslint-disable-next-line no-console
          console.log('\n📁 Generated Files:'); // eslint-disable-line no-console
          result.generatedFiles.forEach(file => {
            // eslint-disable-next-line no-console
            console.log(`   ${file}`); // eslint-disable-line no-console
          });
        }
      } catch (error) {
        logger.error('API documentation generation failed:', error);
        process.exit(1);
      }
    });

  // Synchronize examples from tests
  docs
    .command('sync-examples')
    .description('Synchronize examples from passing tests')
    .option('-t, --test-dir <dir>', 'Test directory to scan', '__tests__')
    .option('-o, --output <dir>', 'Output directory for examples', 'docs/examples')
    .option('--no-passing-only', 'Include all tests, not just passing ones')
    .option('--no-runnable', 'Skip generating runnable example files')
    .option('--include-output', 'Include test output in examples')
    .action(async (_options) => {
      try {
        logger.info('Starting example synchronization...');

        const sync = new ExampleSynchronization({
          testDir: _options.testDir,
          outputDir: _options.output,
          syncOnlyPassing: _options.passingOnly,
          generateRunnable: _options.runnable,
          includeTestOutput: _options.includeOutput
        });

        const result = await sync.synchronizeExamples();

        logger.info('Example synchronization completed successfully');
        // eslint-disable-next-line no-console
        console.log('\n💡 Example Synchronization Results:'); // eslint-disable-line no-console
        // eslint-disable-next-line no-console
        console.log(`✅ Output Directory: ${result.outputDir}`); // eslint-disable-line no-console
        // eslint-disable-next-line no-console
        console.log(`📝 Synchronized Examples: ${result.syncedExamples}`); // eslint-disable-line no-console
        // eslint-disable-next-line no-console
        console.log(`🧪 Test Files Processed: ${result.processedTests}`); // eslint-disable-line no-console

        if (result.examples.length > 0) {
          // eslint-disable-next-line no-console
          console.log('\n📊 Examples by Category:'); // eslint-disable-line no-console
          result.examples.forEach(([category, examples]) => {
            // eslint-disable-next-line no-console
            console.log(`   ${category}: ${examples.length} examples`); // eslint-disable-line no-console
          });
        }
      } catch (error) {
        logger.error('Example synchronization failed:', error);
        process.exit(1);
      }
    });

  // Start interactive documentation server
  docs
    .command('serve')
    .description('Start interactive documentation server')
    .option('-p, --port <number>', 'Server port', '3000')
    .option('-h, --host <host>', 'Server host', 'localhost')
    .option('-d, --docs-dir <dir>', 'Documentation directory', 'docs/api')
    .option('--no-live-reload', 'Disable live reload functionality')
    .option('--enable-code-execution', 'Enable code execution (security risk)')
    .action(async (_options) => {
      try {
        logger.info('Starting interactive documentation server...');

        const server = new InteractiveDocumentation({
          port: parseInt(_options.port),
          host: _options.host,
          docsDir: _options.docsDir,
          enableLiveReload: _options.liveReload,
          enableCodeExecution: _options.enableCodeExecution
        });

        const result = await server.startServer();

        // eslint-disable-next-line no-console
        console.log('\n🚀 Interactive Documentation Server Started!'); // eslint-disable-line no-console
        // eslint-disable-next-line no-console
        console.log(`📍 URL: ${result.url}`); // eslint-disable-line no-console
        // eslint-disable-next-line no-console
        console.log(`🔧 Port: ${result.port}`); // eslint-disable-line no-console
        // eslint-disable-next-line no-console
        console.log(`🏠 Host: ${result.host}`); // eslint-disable-line no-console
        // eslint-disable-next-line no-console
        console.log(`🔄 Live Reload: ${_options.liveReload ? 'Enabled' : 'Disabled'}`); // eslint-disable-line no-console
        // eslint-disable-next-line no-console
        console.log(`⚡ Code Execution: ${_options.enableCodeExecution ? 'Enabled' : 'Disabled'}`); // eslint-disable-line no-console
        // eslint-disable-next-line no-console
        console.log('\nPress Ctrl+C to stop the server'); // eslint-disable-line no-console

        // Handle graceful shutdown
        process.on('SIGINT', async () => {
          // eslint-disable-next-line no-console
          console.log('\n🛑 Shutting down server...'); // eslint-disable-line no-console
          await server.stopServer();
          process.exit(0);
        });

        process.on('SIGTERM', async () => {
          // eslint-disable-next-line no-console
          console.log('\n🛑 Shutting down server...'); // eslint-disable-line no-console
          await server.stopServer();
          process.exit(0);
        });

      } catch (error) {
        logger.error('Failed to start interactive documentation server:', error);
        process.exit(1);
      }
    });

  return docs;
}

module.exports = { createDocsCommands };
