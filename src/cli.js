const { Command } = require("commander");
const pkg = require("../package.json");

function buildProgram() {
  const program = new Command();
  program
    .name("enhanced-rag")
    .description("Plugin-based RAG pipeline utilities")
    .version(pkg.version)
    .showHelpAfterError();

  // define subcommands here...
  // program.command('run')...

  return program;
}

async function run(argv = process.argv) {
  const program = buildProgram();
  await program.parseAsync(argv);
}

module.exports = { buildProgram, run };
