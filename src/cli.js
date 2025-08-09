#!/usr/bin/env node

/**
 * Main CLI Entry Point for RAG Pipeline Utils
 * Provides command-line interface for all RAG pipeline operations
 */

const { EnhancedCLI } = require('./cli/enhanced-cli-commands.js');

// Create and run the CLI
const cli = new EnhancedCLI();

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  process.exit(1);
});

// Run the CLI
if (require.main === module) {
  cli.run(process.argv).catch((error) => {
    console.error('CLI Error:', error.message);
    process.exit(1);
  });
}

module.exports = { EnhancedCLI };
