/**
 * Shared CLI utility functions
 */

const { InvalidArgumentError } = require("commander");
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
    throw new InvalidArgumentError("Expected a positive integer.");
  }
  return parsed;
}

/**
 * Collector for repeatable --min metric=value (rag-pipeline eval). The
 * metric list loads only when the option is used.
 */
function collectMin(value, previous = {}) {
  const match = /^([A-Za-z]+)=(\d*\.?\d+)$/.exec(String(value).trim());
  if (!match) {
    throw new InvalidArgumentError("Use metric=value, e.g. faithfulness=0.8.");
  }
  const [, metric, number] = match;
  // eslint-disable-next-line global-require
  const { EVALUATION_METRICS } = require("../../evaluate/compare.js");
  if (!EVALUATION_METRICS.includes(metric)) {
    throw new InvalidArgumentError(
      `Unknown metric "${metric}"; use one of ${EVALUATION_METRICS.join(", ")}.`,
    );
  }
  const min = Number(number);
  if (min > 1)
    throw new InvalidArgumentError("The value must be between 0 and 1.");
  return { ...previous, [metric]: min };
}

/**
 * Parser for a non-negative number (eval --tolerance, --case-tolerance)
 */
function parseTolerance(value) {
  const n = Number(value);
  if (value === "" || !Number.isFinite(n) || n < 0) {
    throw new InvalidArgumentError("Expected a number of 0 or more.");
  }
  return n;
}

// Top-level commands offered by shell completion
const COMMANDS = [
  "init",
  "ingest",
  "query",
  "eval",
  "run",
  "serve",
  "doctor",
  "validate",
  "hub",
  "ai",
  "plugin",
  "config",
  "info",
  "completion",
].join(" ");

/**
 * Generate shell completion script
 */
function generateCompletionScript(shell) {
  switch (shell) {
    case "bash":
      return `# RAG Pipeline bash completion
_rag_pipeline_completions() {
  COMPREPLY=($(compgen -W "${COMMANDS}" -- "\${COMP_WORDS[COMP_CWORD]}"))
}
complete -F _rag_pipeline_completions rag-pipeline`;

    case "zsh":
      return `# RAG Pipeline zsh completion
#compdef rag-pipeline
_rag_pipeline() {
  _arguments \\
    '1:command:(${COMMANDS})'
}
_rag_pipeline "$@"`;

    case "fish":
      return `# RAG Pipeline fish completion
complete -c rag-pipeline -n '__fish_use_subcommand' -a '${COMMANDS}'`;

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
  rag-pipeline init                        Create .ragrc.json (prompts in a terminal)
  rag-pipeline ingest ./docs               Index a file or directory
  rag-pipeline query "What is X?"          Ask a question about the indexed documents
  rag-pipeline config show                 Show the current configuration

For more information, visit: https://github.com/DevilsDev/rag-pipeline-utils
`;
}

module.exports = {
  createProgressBar,
  parsePositiveInteger,
  collectMin,
  parseTolerance,
  generateCompletionScript,
  getVersion,
  getExtendedHelp,
};
