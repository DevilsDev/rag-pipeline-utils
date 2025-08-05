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
 * @param {string} scriptName - Name of the script
 * @param {string} description - Script description
 * @param {Object} options - Available options
 */
export function showHelp(scriptName, description, options = {}) {
  console.log(`\n${scriptName} - ${description}\n`);
  
  console.log('Usage:');
  console.log(`  node ${scriptName} [options] [arguments]\n`);
  
  console.log('Global Options:');
  console.log('  -d, --dry-run     Show what would be done without executing');
  console.log('  -v, --verbose     Enable verbose output');
  console.log('  -h, --help        Show this help message');
  console.log('  --log-level       Set log level (debug, info, warn, error)');
  
  if (Object.keys(options).length > 0) {
    console.log('\nScript Options:');
    for (const [flag, desc] of Object.entries(options)) {
      console.log(`  ${flag.padEnd(18)} ${desc}`);
    }
  }
  
  console.log('');
}

/**
 * Dry-run wrapper for operations
 * @param {boolean} isDryRun - Whether in dry-run mode
 * @param {string} operation - Description of operation
 * @param {Function} fn - Function to execute (if not dry-run)
 * @returns {Promise} - Result or dry-run message
 */
export async function dryRunWrapper(isDryRun, operation, fn) {
  if (isDryRun) {
    logger.dryRun(operation);
    return { dryRun: true, operation };
  }
  
  logger.info(operation);
  return await fn();
}

/**
 * Validate required arguments
 * @param {Object} args - Parsed arguments
 * @param {string[]} required - Required argument names
 * @param {string} scriptName - Script name for error messages
 */
export function validateArgs(args, required = [], scriptName = 'script') {
  const missing = [];
  
  for (const arg of required) {
    if (args[arg] === undefined || args[arg] === null) {
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
 * @param {Object} options - Help options
 * @returns {Object} - Parsed arguments and logger
 */
export function setupCLI(scriptName, description, options = {}) {
  const args = parseArgs();
  
  if (args.help) {
    showHelp(scriptName, description, options);
    process.exit(0);
  }
  
  // Set log level if specified
  const logLevel = args.logLevel || (args.verbose ? 'debug' : null);
  const scriptLogger = createLogger(scriptName, logLevel);
  
  if (args.dryRun) {
    scriptLogger.info('🏃‍♂️ Running in dry-run mode - no changes will be made');
  }
  
  return { args, logger: scriptLogger };
}

export default { parseArgs, showHelp, dryRunWrapper, validateArgs, setupCLI };
