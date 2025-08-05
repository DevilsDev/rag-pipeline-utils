#!/usr/bin/env node

/**
 * Enhanced RAG Pipeline CLI with comprehensive UX improvements
 * Integrates observability, plugin marketplace, interactive wizard, and diagnostics
 */

import { runEnhancedCLI } from '../src/cli/enhanced-cli-commands.js';

// Run the enhanced CLI
runEnhancedCLI().catch(error => {
  console.error('❌ CLI error:', error.message);
  process.exit(1);
});
