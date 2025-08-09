/**
 * CLI utility for parsing arguments and handling dry-run mode
 * Version: 1.0.0
 * Author: Ali Kahwaji
 */

import { createLogger } from './logger.js';

const logger = createLogger('cli');

/**
 * Parse command line arguments
 * @param {string[]} argv - Process arguments
 * @returns {Object} - Parsed arguments
 */
export function parseArgs(argv = process.argv) {
  const args = {
    _: [], // Positional arguments
    dryRun: false,
    verbose: false,
    help: false,
    logLevel: null
  };

  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    
    if (arg === '--dry-run' || arg === '-d') {
      args.dryRun = true;
    } else if (arg === '--verbose' || arg === '-v') {
      args.verbose = true;
    } else if (arg === '--help' || arg === '-h') {
      args.help = true;
    } else if (arg === '--log-level') {
      args.logLevel = argv[++i];
    } else if (arg.startsWith('--log-level=')) {
      args.logLevel = arg.split('=')[1];
    } else if (arg.startsWith('--')) {
      // Handle other flags
      const key = arg.slice(2).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
      const nextArg = argv[i + 1];
      
      if (nextArg && !nextArg.startsWith('--')) {
        args[key] = nextArg;
        i++;
      } else {
        args[key] = true;
      }
    } else if (arg.startsWith('-')) {
      // Handle short flags
      const flags = arg.slice(1);
      for (const flag of flags) {
        switch (flag) {
          case 'd': args.dryRun = true; break;
          case 'v': args.verbose = true; break;
          case 'h': args.help = true; break;
          default:
            logger.warn(`Unknown flag: -${flag}`);
        }
      }
    } else {
      // Positional argument
      args._.push(arg);
    }
  }

  return args;
}

/**
 * Display help message
 * @param {string} _scriptName - Name of the script
 * @param {string} _description - Script description
 * @param {Object} options - Available options
 */
export function showHelp(_scriptName, _description, options = {}) {
  console.log(`\n${_scriptName} - ${_description}\n`); // eslint-disable-line no-console
  
  console.log('Usage:'); // eslint-disable-line no-console
  console.log(`  node ${_scriptName} [_options] [arguments]\n`); // eslint-disable-line no-console
  
  console.log('Global Options:'); // eslint-disable-line no-console
  console.log('  -d, --dry-run     Show what would be done without executing'); // eslint-disable-line no-console
  console.log('  -v, --verbose     Enable verbose output'); // eslint-disable-line no-console
  console.log('  -h, --help        Show this help message'); // eslint-disable-line no-console
  console.log('  --log-level       Set log level (debug, info, warn, error)'); // eslint-disable-line no-console
  
  if (Object.keys(options).length > 0) {
    console.log('\nScript Options:'); // eslint-disable-line no-console
    for (const [flag, desc] of Object.entries(options)) {
      console.log(`  ${flag.padEnd(18)} ${desc}`); // eslint-disable-line no-console
    }
  }
  
  console.log(''); // eslint-disable-line no-console
}

/**
 * Dry-run wrapper for operations
 * @param {boolean} isDryRun - Whether in dry-run mode
 * @param {string} operation - Description of operation
 * @param {Function} _fn - Function to execute (if not dry-run)
 * @returns {Promise} - Result or dry-run message
 */
export async function dryRunWrapper(_isDryRun, _operation, _fn) {
  if (_isDryRun) {
    logger.dryRun(_operation);
    return { dryRun: true, operation: _operation };
  }
  
  logger.info(_operation);
  return await _fn();
}

/**
 * Validate required arguments
 * @param {Object} args - Parsed arguments
 * @param {string[]} required - Required argument names
 * @param {string} scriptName - Script name for error messages
 */
export function validateArgs(_args, required = [], scriptName = 'script') {
  const missing = [];
  
  for (const arg of required) {
    if (_args[arg] === undefined || _args[arg] === null) {
      missing.push(arg);
    }
  }
  
  if (missing.length > 0) {
    logger.error(`Missing required arguments: ${missing.join(', ')}`);
    logger.info(`Run 'node ${scriptName} --help' for usage information`);
    process.exit(1);
  }
}

/**
 * Handle common CLI setup
 * @param {string} scriptName - Name of the script
 * @param {string} description - Script description
 * @param {Object} _options - Help _options
 * @returns {Object} - Parsed arguments and logger
 */
export function setupCLI(_scriptName, _description, options = {}) {
  const args = parseArgs();
  
  if (args.help) {
    showHelp(_scriptName, _description, options);
    process.exit(0);
  }
  
  // Set log level if specified
  const logLevel = args.logLevel || (args.verbose ? 'debug' : null);
  const scriptLogger = createLogger(_scriptName, logLevel);
  
  if (args.dryRun) {
    scriptLogger.info('🏃‍♂️ Running in dry-run mode - no changes will be made');
  }
  
  return { args, logger: scriptLogger };
}

export default { parseArgs, showHelp, dryRunWrapper, validateArgs, setupCLI };
