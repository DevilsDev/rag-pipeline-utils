/**
 * Shared CLI utility functions
 */

const pkg = require("../../../package.json");

/**
 * Create a simple progress bar for CLI output
 * @param {number} percentage - Progress percentage (0-100)
 * @param {number} width - Width of progress bar in characters
 * @returns {string} Progress bar string
 */
function createProgressBar(percentage, width = 20) {
  const filled = Math.round((percentage / 100) * width);
  const empty = width - filled;
  const bar = "\u2588".repeat(filled) + "\u2591".repeat(empty);
  return `[${bar}]`;
}

/**
 * Custom parser for positive integers
 */
function parsePositiveInteger(value) {
  const parsed = parseInt(value, 10);
  if (isNaN(parsed) || parsed <= 0) {
    throw new Error(`Invalid value '${value}'. Expected positive integer.`);
  }
  return parsed;
}

/**
 * Generate shell completion script
 */
function generateCompletionScript(shell) {
  switch (shell) {
    case "bash":
      return `# RAG Pipeline bash completion
_rag_pipeline_completions() {
  COMPREPLY=($(compgen -W "init doctor ingest query plugin config info validate completion" -- "\${COMP_WORDS[COMP_CWORD]}"))
}
complete -F _rag_pipeline_completions rag-pipeline`;

    case "zsh":
      return `# RAG Pipeline zsh completion
#compdef rag-pipeline
_rag_pipeline() {
  _arguments \\
    '1:command:(init doctor ingest query plugin config info validate completion)'
}
_rag_pipeline "$@"`;

    case "fish":
      return `# RAG Pipeline fish completion
complete -c rag-pipeline -n '__fish_use_subcommand' -a 'init doctor ingest query plugin config info validate completion'`;

    default:
      return `# Completion not available for ${shell}`;
  }
}

/**
 * Get version information from package.json
 */
function getVersion() {
  return pkg.version;
}

/**
 * Get extended help text
 */
function getExtendedHelp() {
  return `
Examples:
  rag-pipeline init --interactive          Initialize with wizard
  rag-pipeline doctor --auto-fix           Diagnose and fix issues
  rag-pipeline plugin search openai        Search for plugins
  rag-pipeline config show plugins         Show plugin configuration

For more information, visit: https://github.com/DevilsDev/rag-pipeline-utils
`;
}

module.exports = {
  createProgressBar,
  parsePositiveInteger,
  generateCompletionScript,
  getVersion,
  getExtendedHelp,
};
