const { Command } = require('commander');
const { EnhancedCLI } = require('./cli/enhanced-cli-commands');
const pkg = require('../package.json');

function buildProgram() {
  const enhancedCLI = new EnhancedCLI();
  // Keep the program name consistent with package.json bin command
  enhancedCLI.program.name('rag-pipeline');
  return enhancedCLI.program;
}

async function run(argv = process.argv) {
  const program = buildProgram();
  await program.parseAsync(argv);
}

module.exports = { buildProgram, run };
